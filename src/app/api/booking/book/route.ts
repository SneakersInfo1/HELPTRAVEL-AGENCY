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
import { notifyCritical } from "@/lib/alerting/notify";
import { sendBookingConfirmation } from "@/lib/email/send-booking-confirmation";
import {
  deleteSession,
  getIdempotent,
  getSession,
  isSessionExpired,
  saveCompleted,
  saveFailed,
  setIdempotent,
  type SessionRecord,
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

// All three success paths (pre-flight reconcile, fresh book, post-failure
// reconcile) converge here: persist the completed record, drop the session,
// send the confirmation email, and return the SAME enriched body the
// confirmation page renders. Centralised so the three paths can never drift.
//
// Ordering is load-bearing for NON-NEGOTIABLE RULE 6: `saveCompleted` is
// awaited BEFORE the email, so a slow or failing email can never turn a
// confirmed, persisted booking into a lost one. We `await` the email (rather
// than fire-and-forget) ONLY so we can honestly report `emailSent` to the
// page — `sendBookingConfirmation` never throws and self-bounds at 5s, well
// within this route's 60s maxDuration.
async function finalizeAndRespond(args: {
  booking: { bookingId: string; hotelConfirmationCode?: string; status?: string };
  session: SessionRecord;
  sessionId: string;
  holder: { firstName: string; lastName: string; email: string };
  guestCount: number;
  idemKey: string | null;
}): Promise<NextResponse> {
  const { booking, session, sessionId, holder, guestCount, idemKey } = args;

  await saveCompleted({
    bookingId: booking.bookingId,
    confirmationCode: booking.hotelConfirmationCode,
    // LiteAPI sometimes omits status or returns a value outside our prior enum;
    // reaching here means a LiteAPI 200, i.e. the booking is committed.
    status: booking.status ?? "CONFIRMED",
    hotelSummary: session.hotelSummary,
    rateSummary: session.rateSummary,
    price: session.price,
    currency: session.currency,
    createdAt: Date.now(),
  });
  await deleteSession(sessionId);

  // Courtesy confirmation email. The booking is ALREADY persisted above
  // (RULE 6); `ok` is the only signal we surface. Skips silently (returns
  // ok:false) when RESEND_API_KEY is unset — we then never claim a mail went
  // out.
  const emailResult = await sendBookingConfirmation({
    bookingId: booking.bookingId,
    confirmationCode: booking.hotelConfirmationCode,
    hotelSummary: session.hotelSummary,
    rateSummary: session.rateSummary,
    price: session.price,
    currency: session.currency,
    holder,
    guestCount,
  });
  const emailSent = emailResult.ok === true;

  const body = {
    bookingId: booking.bookingId,
    confirmationCode: booking.hotelConfirmationCode ?? null,
    hotelSummary: session.hotelSummary,
    // Surfaced so the confirmation page can render real post-payment details
    // (dates, board, price, guests) instead of just an ID — looks credible.
    rateSummary: session.rateSummary,
    price: session.price,
    currency: session.currency,
    guestCount,
    status: "confirmed" as const,
    emailSent,
    // The holder's own address, echoed back to them on their own noindex
    // confirmation page so we can show "wysłaliśmy potwierdzenie na …". Only
    // when the send actually succeeded — never a false claim.
    emailTo: emailSent ? holder.email : null,
  };
  if (idemKey) await setIdempotent(idemKey, 200, body);
  return NextResponse.json(body, { status: 200 });
}

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
    // Idempotent replay: short-circuit and return the original outcome.
    // Note: this path deliberately does NOT re-send the confirmation email —
    // the customer's first booking attempt already triggered it (or skipped
    // it for a documented reason). Replays here are typically double-submits
    // from the browser, not new bookings.
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
      // Fire-and-forget Slack/Discord alert. Don't await — banner UX already shows.
      notifyCritical({
        source: "booking",
        title: "Session expired after payment",
        body: "Customer's Stripe charge may have been captured, but our session expired before /rates/book was called. Manual recovery required.",
        fields: { sessionId, paymentIntentId, errorCode: "BOOK_FAILED_AFTER_PAYMENT" },
      }).catch(() => {});
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
  //
  // GATED: the reconciliation call adds 400-1500ms of LiteAPI latency, so we
  // only run it when the request looks like a retry. Signal: either the
  // `X-Booking-Retry: 1` header is set by the return page on its second hit,
  // OR a `paymentIntentId` arrived in the body (the return page only smuggles
  // that field when bouncing back from Stripe SCA — i.e. a recovery flow).
  // First-attempt calls skip the pre-flight entirely and go straight to
  // bookHotel; the post-failure catch block below acts as the second safety
  // net for the rare server-killed case.
  const isRetry =
    request.headers.get("x-booking-retry") === "1" || Boolean(paymentIntentId);
  if (isRetry) {
    try {
    const existing = await listBookingsByClientReference(sessionId);
    if (existing.length > 0) {
      const booking = existing[0]!;
      console.log(
        `[booking][book] reconciled existing bookingId=${booking.bookingId} status=${booking.status} for clientReference=${sessionId} (no /rates/book call needed)`,
      );
      return finalizeAndRespond({
        booking,
        session,
        sessionId,
        holder,
        guestCount: guests.length,
        idemKey,
      });
    }
    } catch (reconcileErr) {
      // Reconciliation lookup failed — fall through to normal book path.
      // bookHotel itself handles the post-failure reconciliation in its
      // catch block (below) as a second safety net.
      console.warn(
        `[booking][book] pre-flight reconcile failed for sessionId=${sessionId}, falling through: ${reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr)}`,
      );
    }
  }

  try {
    const booking = await bookHotel({
      prebookId: session.prebookId,
      transactionId: session.transactionId,
      clientReference: sessionId,
      guests,
      holder,
    });

    console.log(
      `[booking][book] confirmed bookingId=${booking.bookingId} ip=${ip} country=${country} ua_len=${userAgent.length}`,
    );
    return finalizeAndRespond({
      booking,
      session,
      sessionId,
      holder,
      guestCount: guests.length,
      idemKey,
    });
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
        return finalizeAndRespond({
          booking,
          session,
          sessionId,
          holder,
          guestCount: guests.length,
          idemKey,
        });
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
      notifyCritical({
        source: "booking",
        title: "Recovery record persist FAILED",
        body: "bookHotel() failed AND we couldn't even save the recovery record. Booking state is now invisible to admin. Reconcile via LiteAPI dashboard.",
        fields: { sessionId, transactionId: session.transactionId, prebookId: session.prebookId },
      }).catch(() => {});
    }
    notifyCritical({
      source: "booking",
      title: "Booking failed after payment",
      body: "bookHotel() threw post-payment. Recovery record persisted; user shown recovery UI. Reconcile required.",
      fields: {
        sessionId,
        prebookId: session.prebookId,
        transactionId: session.transactionId,
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
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
