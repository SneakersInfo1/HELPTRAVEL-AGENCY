// Thin server-side booking facade.
//
// This does NOT reimplement HTTP. It delegates to the existing, already-tested
// wrappers prebook() (./prebook.ts) and book() (./book.ts), which route through
// the shared liteApiRequest client (private key → book.liteapi.travel, retry,
// timeout, PII redaction). Per BOOKING_AUDIT.md §3 + decision #1, the server
// layer is reused as-is — this facade adds ONLY:
//   • structured booking logging (prefix [liteapi][booking], matching house style)
//   • booking-domain error translation (./booking-errors.ts)
//   • the critical post-payment-failure guarantee
//
// Pattern A (LiteAPI User Payment SDK): /rates/book is invoked ONLY after the
// Payment SDK has confirmed the charge. Therefore ANY failure of bookHotel() is
// a post-payment failure → BookFailedAfterPaymentError + a [CRITICAL] log line
// (NON-NEGOTIABLE RULE 6 — never claim success, never silently swallow).

import { book } from "./book";
import { BookFailedAfterPaymentError, BookingError, toBookingError } from "./booking-errors";
import { prebook } from "./prebook";
import type { LiteApiBooking, LiteApiGuest, LiteApiHolder } from "./types";

export interface PrebookHotelInput {
  // LiteAPI's getRates returns this under `rateId`; POST /rates/prebook expects
  // it as `offerId`. prebook() renames at the boundary — we keep `rateId`.
  rateId: string;
  clientReference?: string;
}

export interface PrebookResult {
  prebookId: string;
  transactionId?: string;
  secretKey?: string;
  price?: number;
  currency?: string;
  // NOTE: LiteAPI's real prebook response does NOT include expiresAt
  // (verified live, BOOKING_AUDIT.md §8 / Q2). Kept optional for forward-compat;
  // session TTL is a fixed 1800s (decision #3) until LiteAPI confirms.
  expiresAt?: string;
  hotelId?: string;
  rateId?: string;
}

export interface BookHotelInput {
  prebookId: string;
  transactionId: string;
  clientReference: string;
  guests: LiteApiGuest[];
  holder: LiteApiHolder;
}

export type BookResult = LiteApiBooking;

function logLine(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

export async function prebookHotel(input: PrebookHotelInput): Promise<PrebookResult> {
  const startedAt = Date.now();
  try {
    const res = await prebook({
      rateId: input.rateId,
      clientReference: input.clientReference,
    });
    const d = res.data;
    console.log(
      `[liteapi][booking][prebook] ${logLine({
        rateId: input.rateId,
        prebookId: d.prebookId,
        elapsed_ms: Date.now() - startedAt,
        status: "success",
      })}`,
    );
    return {
      prebookId: d.prebookId,
      transactionId: d.transactionId,
      secretKey: d.secretKey,
      price: d.price,
      currency: d.currency,
      expiresAt: d.expiresAt,
      hotelId: d.hotelId,
      rateId: d.rateId,
    };
  } catch (err) {
    // Pre-payment: safe to translate normally. Never BOOK_FAILED_AFTER_PAYMENT.
    const mapped = toBookingError(err);
    console.error(
      `[liteapi][booking][prebook] ${logLine({
        rateId: input.rateId,
        elapsed_ms: Date.now() - startedAt,
        status: "error",
        code: mapped.code,
      })}`,
    );
    throw mapped;
  }
}

export async function bookHotel(input: BookHotelInput): Promise<BookResult> {
  const startedAt = Date.now();
  try {
    const res = await book({
      prebookId: input.prebookId,
      transactionId: input.transactionId,
      clientReference: input.clientReference,
      guests: input.guests,
      holder: input.holder,
    });
    const d = res.data;
    console.log(
      `[liteapi][booking][book] ${logLine({
        prebookId: input.prebookId,
        bookingId: d.bookingId,
        bookingStatus: d.status,
        elapsed_ms: Date.now() - startedAt,
        status: "success",
      })}`,
    );
    return d;
  } catch (err) {
    // Pattern A: the charge already succeeded before this call. ANY failure
    // here is post-payment — log loudly and surface a non-success error.
    const underlying = err instanceof BookingError ? err : toBookingError(err);
    console.error(
      `[liteapi][booking][CRITICAL] book_failed_after_payment ${logLine({
        prebookId: input.prebookId,
        transactionId: input.transactionId,
        underlying_code: underlying.code,
        elapsed_ms: Date.now() - startedAt,
      })} — manual recovery required`,
    );
    throw new BookFailedAfterPaymentError(
      `book() failed after payment (prebookId=${input.prebookId})`,
      { cause: err },
    );
  }
}
