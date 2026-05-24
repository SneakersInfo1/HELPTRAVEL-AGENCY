// POST /api/booking/book — the critical endpoint. Finalizes the reservation
// AFTER the Payment SDK has charged the card. NON-NEGOTIABLE RULE 6: a failure
// here is post-payment — never claim success, persist a recovery record, log
// [CRITICAL] (the facade already does), return a non-success message.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isBookingLive } from "@/lib/config/featureFlags";
import {
  BookingError,
  LiteApiGuestSchema,
  LiteApiHolderSchema,
  bookHotel,
  listBookingsByClientReference,
} from "@/lib/liteapi";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  deleteSession,
  getIdempotent,
  getSession,
  isSessionExpired,
  saveCompleted,
  saveFailed,
  setIdempotent,
} from "@/lib/booking/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// LiteAPI POST /rates/book has been observed taking up to 9.777s in production
// (real LiteAPI dashboard log, 2026-05-24). Our `book.ts` client uses an
// AbortController timeout of 60s, but Vercel's PLATFORM-level function timeout
// defaults to 10s on Node.js — which means the function gets killed at the
// 10s mark regardless of what our AbortController says. That's the exact
// failure mode we kept hitting: LiteAPI finished the booking at ~9.8s with
// HTTP 200, but Vercel killed our handler at 10s before we could read the
// response, persist `completed`, and return success — so the error path ran
// instead and the user saw the recovery screen. Bump to 60s so we always
// have headroom over LiteAPI's slow tail.
export const maxDuration = 60;

// holder/guests are optional in the body: the Phase 3 redirect return page
// only has `sid`, so guest data is read from the session (stored at prebook).
// Phase 2 callers may still pass them in the body — body wins if present.
// `paymentIntentId` is the Stripe PaymentIntent forwarded by the return page
// from `?payment_intent=…` in the redirect URL. When the Redis session has
// already expired (24h TTL exceeded, Upstash flap, etc.) and we therefore
// cannot finalize `/rates/book`, presence of this field tells us a charge MAY
// already exist on Stripe — we then persist a recovery record + emit a
// [CRITICAL] log so support can reconcile manually instead of silently
// dropping the user with a generic "session expired" page.
const BodySchema = z.object({
  sessionId: z.string().min(8),
  holder: LiteApiHolderSchema.optional(),
  guests: z.array(LiteApiGuestSchema).min(1).optional(),
  paymentIntentId: z.string().optional(),
});
const GuestsSchema = z.array(LiteApiGuestSchema).min(1);

const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
  process.env.EMAIL_REPLY_TO?.trim() ||
  "pomoc@helptravel.pl";

export async function POST(request: NextRequest) {
  if (!isBookingLive()) {
    return NextResponse.json(
      { error: "booking_disabled", message: "Wkrótce dostępne" },
      { status: 503 },
    );
  }

  const limited = await enforceRateLimit(request, "booking-book");
  if (limited) return limited;

  const idemKey = request.headers.get("idempotency-key")?.trim() || null;
  if (idemKey) {
    const cached = await getIdempotent(idemKey);
    if (cached) return NextResponse.json(cached.body, { status: cached.status });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { sessionId, paymentIntentId } = parsed.data;

  let session;
  try {
    session = await getSession(sessionId);
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json(
        { error: err.code, message: err.userMessagePl },
        { status: err.httpStatus },
      );
    }
    throw err;
  }
  if (!session || isSessionExpired(session)) {
    // Two distinct cases collapse onto HTTP 410:
    //   (a) Stripe return-page POST with `payment_intent` in the URL → user
    //       paid but our session is gone. NON-NEGOTIABLE RULE 6: never silently
    //       drop a paid user. Persist a recovery record and emit [CRITICAL] so
    //       ops can reconcile via Stripe + the LiteAPI dashboard. Surface the
    //       recovery-style message, not the "choose offer again" message.
    //   (b) Stale session without payment evidence (user refreshed an old tab,
    //       robot, etc.) → benign session expiry, original behavior preserved.
    if (paymentIntentId) {
      const message = `Płatność została zarejestrowana, ale rezerwacja wymaga ręcznego potwierdzenia. Skontaktuj się z nami: ${SUPPORT_EMAIL}.`;
      try {
        await saveFailed({
          sessionId,
          // Session is gone → we cannot fill prebookId/transactionId/holder/guests.
          // The recovery record holds only what survives the redirect: the Stripe
          // PaymentIntent ID (support looks it up to confirm the charge state).
          paymentIntentId,
          errorCode: "BOOK_FAILED_AFTER_PAYMENT",
          message: "session_expired_after_payment",
          createdAt: Date.now(),
        });
      } catch (persistErr) {
        console.error(
          `[liteapi][booking][CRITICAL] recovery_record_persist_failed sessionId=${sessionId} paymentIntentId=${paymentIntentId} — manual recovery required (persist error: ${persistErr instanceof Error ? persistErr.message : String(persistErr)})`,
        );
      }
      console.error(
        `[liteapi][booking][CRITICAL] session_expired_after_payment sessionId=${sessionId} paymentIntentId=${paymentIntentId} ip=${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"} — manual recovery required (Stripe charge may have been captured; LiteAPI /rates/book never called)`,
      );
      const body = {
        error: "book_failed",
        message,
        recoveryId: sessionId,
      };
      if (idemKey) await setIdempotent(idemKey, 410, body);
      return NextResponse.json(body, { status: 410 });
    }
    return NextResponse.json(
      { error: "session_expired", message: "Sesja rezerwacji wygasła. Wybierz ofertę ponownie." },
      { status: 410 },
    );
  }

  // Resolve guest data: prefer the body (Phase 2 contract), else the session
  // (Phase 3 redirect flow). Re-validate session-sourced data defensively.
  const holderResult = LiteApiHolderSchema.safeParse(parsed.data.holder ?? session.holder);
  const guestsResult = GuestsSchema.safeParse(parsed.data.guests ?? session.guests);
  if (!holderResult.success || !guestsResult.success) {
    return NextResponse.json(
      { error: "invalid_body", message: "Brak lub nieprawidłowe dane gości." },
      { status: 400 },
    );
  }
  const holder = holderResult.data;
  const guests = guestsResult.data;

  // Ops/audit metadata (Vercel headers). Logged WITHOUT PII.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const country = request.headers.get("x-vercel-ip-country") || "PL";
  const userAgent = request.headers.get("user-agent") || "unknown";

  // Pre-flight reconciliation against LiteAPI's authoritative state. If a
  // previous attempt for this sessionId already committed a booking on
  // LiteAPI's side (e.g. Vercel killed our function before we could read the
  // /rates/book response — observed 2026-05-24 with 9.777s LiteAPI latency
  // against a 10s default function timeout), this returns the existing
  // booking without ever calling /rates/book again. `clientReference` is
  // LiteAPI's documented idempotency key — confirmed by their support
  // 2026-05-24. Failure to reconcile is non-fatal: we fall through to the
  // normal book path. Worst case is a duplicate call that LiteAPI itself
  // dedupes by clientReference.
  try {
    const existing = await listBookingsByClientReference(sessionId);
    if (existing.length > 0) {
      const booking = existing[0]!;
      console.log(
        `[booking][book] reconciled existing bookingId=${booking.bookingId} status=${booking.status} for clientReference=${sessionId} (no /rates/book call needed)`,
      );
      await saveCompleted({
        bookingId: booking.bookingId,
        confirmationCode: booking.hotelConfirmationCode,
        // booking.status is now `string | undefined` after the schema relaxation
        // (LiteAPI sometimes omits it or returns values outside our prior enum).
        // Default to "CONFIRMED" — bookHotel only reaches here on LiteAPI 200,
        // which per their docs means the booking is committed.
        status: booking.status ?? "CONFIRMED",
        hotelSummary: session.hotelSummary,
        rateSummary: session.rateSummary,
        price: session.price,
        currency: session.currency,
        createdAt: Date.now(),
      });
      await deleteSession(sessionId);
      const body = {
        bookingId: booking.bookingId,
        confirmationCode: booking.hotelConfirmationCode ?? null,
        hotelSummary: session.hotelSummary,
        status: "confirmed" as const,
      };
      if (idemKey) await setIdempotent(idemKey, 200, body);
      return NextResponse.json(body, { status: 200 });
    }
  } catch (reconcileErr) {
    // Reconciliation lookup failed — fall through to normal book path.
    // bookHotel itself handles the post-failure reconciliation in its
    // catch block (below) as a second safety net.
    console.warn(
      `[booking][book] pre-flight reconcile failed for sessionId=${sessionId}, falling through: ${reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr)}`,
    );
  }

  try {
    const booking = await bookHotel({
      prebookId: session.prebookId,
      transactionId: session.transactionId,
      clientReference: sessionId,
      guests,
      holder,
    });

    await saveCompleted({
      bookingId: booking.bookingId,
      confirmationCode: booking.hotelConfirmationCode,
      // booking.status is `string | undefined` after schema relaxation.
      // Reaching this branch means LiteAPI returned 200, which per their
      // docs means the booking is committed — default to "CONFIRMED".
      status: booking.status ?? "CONFIRMED",
      hotelSummary: session.hotelSummary,
      rateSummary: session.rateSummary,
      price: session.price,
      currency: session.currency,
      createdAt: Date.now(),
    });
    await deleteSession(sessionId);

    const body = {
      bookingId: booking.bookingId,
      confirmationCode: booking.hotelConfirmationCode ?? null,
      hotelSummary: session.hotelSummary,
      status: "confirmed" as const,
    };
    if (idemKey) await setIdempotent(idemKey, 200, body);
    console.log(
      `[booking][book] confirmed bookingId=${booking.bookingId} ip=${ip} country=${country} ua_len=${userAgent.length}`,
    );
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    // SECOND safety net: bookHotel threw — but the call MAY have committed
    // on LiteAPI's side (response dropped mid-read). Query their state by
    // clientReference one more time before declaring failure. If it exists,
    // recover into the success path.
    try {
      const recovered = await listBookingsByClientReference(sessionId);
      if (recovered.length > 0) {
        const booking = recovered[0]!;
        console.log(
          `[booking][book] post-failure reconcile RECOVERED bookingId=${booking.bookingId} status=${booking.status} for clientReference=${sessionId} (book() threw but LiteAPI has the booking)`,
        );
        await saveCompleted({
          bookingId: booking.bookingId,
          confirmationCode: booking.hotelConfirmationCode,
          // booking.status is now `string | undefined` after the schema relaxation
        // (LiteAPI sometimes omits it or returns values outside our prior enum).
        // Default to "CONFIRMED" — bookHotel only reaches here on LiteAPI 200,
        // which per their docs means the booking is committed.
        status: booking.status ?? "CONFIRMED",
          hotelSummary: session.hotelSummary,
          rateSummary: session.rateSummary,
          price: session.price,
          currency: session.currency,
          createdAt: Date.now(),
        });
        await deleteSession(sessionId);
        const body = {
          bookingId: booking.bookingId,
          confirmationCode: booking.hotelConfirmationCode ?? null,
          hotelSummary: session.hotelSummary,
          status: "confirmed" as const,
        };
        if (idemKey) await setIdempotent(idemKey, 200, body);
        return NextResponse.json(body, { status: 200 });
      }
    } catch (recoverErr) {
      console.warn(
        `[booking][book] post-failure reconcile lookup also failed for sessionId=${sessionId}: ${recoverErr instanceof Error ? recoverErr.message : String(recoverErr)}`,
      );
    }
    // Reconciliation also confirms no booking exists — fall through to the
    // normal failure path below (save recovery record, return 502).

    // Pattern A: the charge already succeeded. bookHotel() throws
    // BookFailedAfterPaymentError on ANY failure and already logged [CRITICAL].
    const code = err instanceof BookingError ? err.code : "BOOK_FAILED_AFTER_PAYMENT";
    try {
      await saveFailed({
        sessionId,
        prebookId: session.prebookId,
        transactionId: session.transactionId,
        holder,
        guests,
        errorCode: code,
        message: err instanceof Error ? err.message : String(err),
        createdAt: Date.now(),
      });
    } catch (persistErr) {
      console.error(
        `[liteapi][booking][CRITICAL] recovery_record_persist_failed sessionId=${sessionId} transactionId=${session.transactionId} — manual recovery required (persist error: ${persistErr instanceof Error ? persistErr.message : String(persistErr)})`,
      );
    }
    const body = {
      error: "book_failed",
      message: `Płatność została zarejestrowana, ale rezerwacja wymaga ręcznego potwierdzenia. Skontaktuj się z nami: ${SUPPORT_EMAIL}.`,
      recoveryId: sessionId,
    };
    // Cache the terminal failure too: a double-submit must NOT re-call LiteAPI
    // book with the same transaction.
    if (idemKey) await setIdempotent(idemKey, 502, body);
    return NextResponse.json(body, { status: 502 });
  }
}
