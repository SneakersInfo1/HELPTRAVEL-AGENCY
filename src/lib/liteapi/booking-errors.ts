// Booking-domain error mapping.
//
// This module deliberately does NOT redefine the LiteAPI HTTP→error taxonomy —
// that lives in ./errors.ts and is reused as-is (see BOOKING_AUDIT.md §3, Q5).
// It only TRANSLATES a thrown LiteApiError into a booking-domain code + Polish
// user message that the Phase 2 API routes surface, plus the one genuinely new
// concept that no HTTP status alone expresses:
//
//   BOOK_FAILED_AFTER_PAYMENT — the /rates/book call failed AFTER the user
//   already paid via the LiteAPI Payment SDK. This must NEVER be presented to
//   the user as a normal retryable error (see NON-NEGOTIABLE RULE 6).

import { LiteApiError } from "./errors";

export type BookingErrorCode =
  | "PREBOOK_EXPIRED"
  | "RATE_UNAVAILABLE"
  | "INVALID_GUEST_DATA"
  | "PAYMENT_FAILED"
  | "BOOK_FAILED_AFTER_PAYMENT"
  | "RATE_LIMIT_EXCEEDED"
  | "LITEAPI_DOWN"
  | "UNKNOWN";

const USER_MESSAGE_PL: Record<BookingErrorCode, string> = {
  PREBOOK_EXPIRED:
    "Cena tej oferty wygasła. Wybierz ofertę ponownie, aby pobrać aktualną stawkę.",
  RATE_UNAVAILABLE: "Ten pokój nie jest już dostępny. Wybierz inną ofertę.",
  INVALID_GUEST_DATA: "Sprawdź poprawność danych gości i spróbuj ponownie.",
  PAYMENT_FAILED: "Płatność nie powiodła się. Sprawdź dane karty lub spróbuj ponownie.",
  BOOK_FAILED_AFTER_PAYMENT:
    "Płatność została zarejestrowana, ale rezerwacja wymaga ręcznego potwierdzenia. Skontaktuj się z nami.",
  RATE_LIMIT_EXCEEDED: "Zbyt wiele prób w krótkim czasie. Spróbuj ponownie za chwilę.",
  LITEAPI_DOWN: "Chwilowy problem po stronie dostawcy. Spróbuj ponownie za moment.",
  UNKNOWN: "Coś poszło nie tak. Spróbuj ponownie lub napisz do nas.",
};

// Suggested HTTP status for the Phase 2 API routes to return per code.
const HTTP_STATUS: Record<BookingErrorCode, number> = {
  PREBOOK_EXPIRED: 409,
  RATE_UNAVAILABLE: 410,
  INVALID_GUEST_DATA: 400,
  PAYMENT_FAILED: 402,
  BOOK_FAILED_AFTER_PAYMENT: 502,
  RATE_LIMIT_EXCEEDED: 429,
  LITEAPI_DOWN: 503,
  UNKNOWN: 500,
};

export class BookingError extends Error {
  readonly code: BookingErrorCode;
  readonly userMessagePl: string;
  readonly httpStatus: number;

  constructor(code: BookingErrorCode, message: string, opts: { cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "BookingError";
    this.code = code;
    this.userMessagePl = USER_MESSAGE_PL[code];
    this.httpStatus = HTTP_STATUS[code];
  }
}

export class BookFailedAfterPaymentError extends BookingError {
  constructor(message: string, opts: { cause?: unknown } = {}) {
    super("BOOK_FAILED_AFTER_PAYMENT", message, opts);
    this.name = "BookFailedAfterPaymentError";
  }
}

// Pre-payment translation (prebook + input validation paths). By construction
// this NEVER returns BOOK_FAILED_AFTER_PAYMENT — that state is produced only by
// bookHotel() in ./booking.ts, which knows payment already happened.
export function toBookingError(err: unknown): BookingError {
  if (err instanceof BookingError) return err;
  if (err instanceof LiteApiError) {
    switch (err.internalCode) {
      case "LITEAPI_RATE_EXPIRED":
        return new BookingError("PREBOOK_EXPIRED", err.message, { cause: err });
      case "LITEAPI_SOLD_OUT":
        return new BookingError("RATE_UNAVAILABLE", err.message, { cause: err });
      case "LITEAPI_VALIDATION":
        return new BookingError("INVALID_GUEST_DATA", err.message, { cause: err });
      case "LITEAPI_PAYMENT_DECLINED":
        return new BookingError("PAYMENT_FAILED", err.message, { cause: err });
      case "LITEAPI_RATE_LIMITED":
        return new BookingError("RATE_LIMIT_EXCEEDED", err.message, { cause: err });
      case "LITEAPI_TIMEOUT":
      case "LITEAPI_NETWORK":
      case "LITEAPI_AUTH":
      case "LITEAPI_WEBHOOK_SIGNATURE":
      case "LITEAPI_UNKNOWN":
        return new BookingError("LITEAPI_DOWN", err.message, { cause: err });
    }
  }
  return new BookingError("UNKNOWN", err instanceof Error ? err.message : String(err), {
    cause: err,
  });
}
