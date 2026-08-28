// Decision logic for the manual "resend a confirmation email" recovery path
// (scripts/resend-booking-confirmation.ts).
//
// Lives here rather than inside the script so it is unit-testable without
// importing a module that runs a CLI on load. The script keeps the I/O
// (Upstash read, LiteAPI read, Resend send); this file holds the RULES that
// decide whether a resend is allowed at all.
//
// The rules exist because this path is operated by hand on production data:
// it must refuse loudly for anything it cannot prove, rather than mailing a
// stranger about a booking that may not exist.

import type { CompletedRecord } from "@/lib/booking/session";

/** Statuses we accept as "this booking exists and is confirmed". */
export const CONFIRMED_STATUSES = new Set([
  "CONFIRMED",
  "COMPLETED",
  "COMPLETE",
  "OK",
  "SUCCESS",
]);

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ResendGuardInput {
  bookingId: string;
  /** The persisted booking, or null when the store has no such record. */
  completed: CompletedRecord | null;
  /** Recipient: --to override, else the holder address read back from LiteAPI. */
  recipient: string;
  /** Result of getDefaultFrom() — null means no usable sender is configured. */
  from: string | null;
}

export type ResendGuardResult =
  | { allowed: false; reason: string }
  | { allowed: true; booking: CompletedRecord; recipient: string; from: string };

/**
 * Decides whether a confirmation email may be re-sent for an existing booking.
 *
 * Refuses unless ALL of these hold:
 *   1. the booking exists in our durable store,
 *   2. its status is CONFIRMED/COMPLETED,
 *   3. we have a syntactically valid recipient,
 *   4. a production sender is configured (never the resend.dev testing domain,
 *      which answers HTTP 403 for anyone but the Resend account owner).
 *
 * Never performs I/O, never books, never charges.
 */
export function planConfirmationResend(input: ResendGuardInput): ResendGuardResult {
  const { bookingId, completed, recipient, from } = input;

  if (!completed) {
    return {
      allowed: false,
      reason: `nie znaleziono rezerwacji ${bookingId} (klucz booking:v1:completed:${bookingId}). Nie wysylam maila dla nieznanej rezerwacji.`,
    };
  }

  const status = String(completed.status ?? "").toUpperCase();
  if (!CONFIRMED_STATUSES.has(status)) {
    return {
      allowed: false,
      reason: `rezerwacja ${bookingId} ma status "${completed.status}" — wymagany CONFIRMED/COMPLETED.`,
    };
  }

  const to = recipient.trim();
  if (!to || !EMAIL_RX.test(to)) {
    return {
      allowed: false,
      reason: `brak prawidlowego adresu odbiorcy. Podaj --to=ADRES (otrzymano: "${to || "-"}").`,
    };
  }

  if (!from) {
    return {
      allowed: false,
      reason:
        "EMAIL_FROM nie jest ustawione — brak nadawcy produkcyjnego. Nie wysylam z domeny testowej.",
    };
  }
  if (from.includes("resend.dev")) {
    return {
      allowed: false,
      reason: `nadawca to nadal domena testowa (${from}). Ustaw EMAIL_FROM na adres w domenie ZWERYFIKOWANEJ w Resend.`,
    };
  }

  return { allowed: true, booking: completed, recipient: to, from };
}
