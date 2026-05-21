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

// holder/guests are optional in the body: the Phase 3 redirect return page
// only has `sid`, so guest data is read from the session (stored at prebook).
// Phase 2 callers may still pass them in the body — body wins if present.
const BodySchema = z.object({
  sessionId: z.string().min(8),
  holder: LiteApiHolderSchema.optional(),
  guests: z.array(LiteApiGuestSchema).min(1).optional(),
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
  const { sessionId } = parsed.data;

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
      status: booking.status,
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
