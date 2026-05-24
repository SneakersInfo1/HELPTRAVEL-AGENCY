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
import { getEnv } from "./client";
import { LiteApiError } from "./errors";
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
  // LiteAPI's env flag for this prebook's Stripe PaymentIntent (B6).
  // true = test/sandbox, false = live/production, undefined = not reported.
  sandbox?: boolean;
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

// Pull a short, log-safe snippet from a LiteAPI error body. The body is
// already PII-redacted by client.ts. We prefer common shapes (`{error:{...}}`,
// `{message:""}`, plain strings) and cap to 400 chars so log lines stay
// readable while still surfacing LiteAPI's detailed field-level diagnostics
// (their `description` is the operational gold — e.g.
// "Key: 'BookRequest.X' Error: Field validation for 'X' failed on the 'required' tag"
// — which previously got dropped because we only read `error.message`).
function summarizeLiteApiBody(body: unknown): string | undefined {
  if (body === null || body === undefined) return undefined;
  const clamp = (s: string) => (s.length > 400 ? `${s.slice(0, 400)}…` : s);
  if (typeof body === "string") return clamp(body);
  if (typeof body === "object") {
    const obj = body as {
      error?: { message?: string; code?: string | number; description?: string } | string;
      message?: string;
      description?: string;
    };
    if (typeof obj.error === "object") {
      // LiteAPI uses `description` for the detailed field-level diagnostic
      // and `message` for the human-friendly summary — prefer description
      // since that's what tells operators which field is bad. Fall back to
      // message when description is absent.
      const detail = obj.error.description ?? obj.error.message;
      const parts = [obj.error.code, detail].filter(Boolean).join(": ");
      if (parts) return clamp(parts);
    }
    if (typeof obj.error === "string") return clamp(obj.error);
    if (typeof obj.description === "string") return clamp(obj.description);
    if (typeof obj.message === "string") return clamp(obj.message);
    try {
      return clamp(JSON.stringify(body));
    } catch {
      return "[unserializable]";
    }
  }
  return clamp(String(body));
}

// Pre-formatted diagnostic fields for booking error logs — extracts the
// underlying LiteAPI HTTP status, internal code, and short body snippet so
// operators can see in Vercel logs WHY a prebook/book failed (e.g. 401 ⇒
// LITEAPI_ENV/key misconfig vs 5xx ⇒ provider downtime vs 422 ⇒ data shape).
function liteApiDiag(err: unknown): {
  liteApiStatus?: number;
  liteApiCode?: string;
  liteApiBody?: string;
} {
  if (!(err instanceof LiteApiError)) return {};
  return {
    liteApiStatus: err.status,
    liteApiCode: err.internalCode,
    liteApiBody: summarizeLiteApiBody(err.body),
  };
}

// Type-agnostic diagnostic — captures class / name / message / cause chain for
// ANY thrown value, even plain Errors. Complements liteApiDiag(), which only
// fires when the error is one of our typed LiteApiError subclasses. Caused a
// real production failure on 2026-05-24 (sid d9eaa09e) where the [CRITICAL]
// log line had `underlying_code=UNKNOWN` and no liteApi* fields — we had
// nothing to grep in Vercel logs to identify the failure class. Now even
// non-LiteApiError throws leave a class+message trail.
function errorDiag(err: unknown): {
  errClass?: string;
  errName?: string;
  errMessage?: string;
  errCauseClass?: string;
  errCauseMessage?: string;
} {
  if (err === null || err === undefined) return { errClass: "null" };
  if (!(err instanceof Error)) {
    return { errClass: typeof err, errMessage: String(err).slice(0, 200) };
  }
  const cause = (err as { cause?: unknown }).cause;
  return {
    errClass: err.constructor.name,
    // `Error.name` can differ from `constructor.name` (AbortError is `Error`
    // with name === "AbortError" in some Node 22 / undici configurations).
    errName: err.name !== err.constructor.name ? err.name : undefined,
    errMessage: err.message ? err.message.slice(0, 200) : undefined,
    errCauseClass: cause instanceof Error ? cause.constructor.name : undefined,
    errCauseMessage:
      cause instanceof Error && cause.message ? cause.message.slice(0, 200) : undefined,
  };
}

export async function prebookHotel(input: PrebookHotelInput): Promise<PrebookResult> {
  const startedAt = Date.now();
  try {
    const res = await prebook({
      rateId: input.rateId,
      clientReference: input.clientReference,
    });
    const d = res.data;
    const sandbox = d.sandbox ?? res.sandbox;
    // Diagnostic (B6): surface the env that ACTUALLY created the Stripe
    // PaymentIntent vs the key mode we resolved. A mismatch (e.g.
    // keyMode=production but sandbox=true) is the Stripe /v1/elements 400.
    console.log(
      `[liteapi][booking][prebook] ${logLine({
        rateId: input.rateId,
        prebookId: d.prebookId,
        keyMode: getEnv().mode,
        sandbox: sandbox === undefined ? "unreported" : String(sandbox),
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
      sandbox,
    };
  } catch (err) {
    // Pre-payment: safe to translate normally. Never BOOK_FAILED_AFTER_PAYMENT.
    const mapped = toBookingError(err);
    const diag = liteApiDiag(err);
    // Auth failures are almost always env misconfiguration (LITEAPI_ENV /
    // wrong key prefix) — flag them so they stand out in Vercel logs.
    const critical = diag.liteApiCode === "LITEAPI_AUTH";
    console.error(
      `[liteapi][booking][prebook]${critical ? " [CRITICAL]" : ""} ${logLine({
        rateId: input.rateId,
        keyMode: getEnv().mode,
        elapsed_ms: Date.now() - startedAt,
        status: "error",
        code: mapped.code,
        ...diag,
        ...errorDiag(err),
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
        keyMode: getEnv().mode,
        underlying_code: underlying.code,
        elapsed_ms: Date.now() - startedAt,
        ...liteApiDiag(err),
        ...errorDiag(err),
      })} — manual recovery required`,
    );
    throw new BookFailedAfterPaymentError(
      `book() failed after payment (prebookId=${input.prebookId})`,
      { cause: err },
    );
  }
}
