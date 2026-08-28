// Lazy Resend client. Initialized once per process. Returns `null` if
// RESEND_API_KEY is not set — callers MUST handle that case (we just log
// + skip the send rather than throwing on the booking path, because email
// is a courtesy artifact: the booking itself is already confirmed at the
// point of send).
//
// Why Resend (decision 2026-05-27):
//   • Free tier covers our launch volume (3000/mo, 100/day).
//   • React Email is supported but not required — we pass `html` + `text`
//     directly to avoid the extra dependency and JSX-in-runtime overhead.
//
// ── SENDER POLICY (incydent 2026-08-28, booking 9c-OQvmqJ) ──────────────────
// `onboarding@resend.dev` is Resend's TESTING domain. It delivers ONLY to the
// Resend account owner's own address and answers HTTP 403 for every other
// recipient: "The resend.dev domain is for testing and can only send to your
// own email address. To send to other recipients, verify a domain and update
// the from address to use it."
//
// It used to be the hardcoded fallback here, so a real paying customer never
// received their confirmation while the code reported a plain "send failed".
// It is therefore NEVER a production fallback any more — see `getDefaultFrom`.

import { Resend } from "resend";

let cached: Resend | null | undefined;

/** Resend's testing sender. Dev/test only, behind an explicit opt-in. */
export const DEV_ONLY_FALLBACK_FROM = "HelpTravel <onboarding@resend.dev>";

/**
 * Returns a memoized Resend client, or null when RESEND_API_KEY is missing.
 * Callers SHOULD treat null as "email disabled" and continue without sending.
 */
export function getResendClient(): Resend | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    cached = null;
    return null;
  }
  cached = new Resend(apiKey);
  return cached;
}

/**
 * True when this process runs as a production deployment. Vercel sets
 * VERCEL_ENV to "production" | "preview" | "development"; NODE_ENV is the
 * local/self-hosted signal. Either one is enough to refuse the dev sender.
 */
function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
  );
}

/**
 * Sender used on outgoing emails, or `null` when no usable sender is
 * configured. Callers MUST treat null as "do not send" — never substitute a
 * sender of their own.
 *
 * Resolution order:
 *   1. `EMAIL_FROM` env — the only production-valid source. Must be an address
 *      on a domain VERIFIED in the Resend dashboard, e.g.
 *      "HelpTravel.pl <rezerwacje@mail.helptravel.pl>". A bare address is
 *      wrapped with the brand display name.
 *   2. Resend's testing sender — ONLY when `EMAIL_DEV_FALLBACK=1` is set AND
 *      this is not a production runtime. Deliberately opt-in: it delivers to
 *      the Resend account owner and nobody else.
 *   3. `null` — nothing usable. Better a loud skip than a silent 403 against
 *      a real customer.
 */
export function getDefaultFrom(): string | null {
  const custom = process.env.EMAIL_FROM?.trim();
  if (custom) {
    // If operator passed just an email address, wrap it with a display name.
    if (!custom.includes("<") && custom.includes("@")) {
      return `HelpTravel.pl <${custom}>`;
    }
    return custom;
  }

  if (process.env.EMAIL_DEV_FALLBACK === "1" && !isProductionRuntime()) {
    return DEV_ONLY_FALLBACK_FROM;
  }

  return null;
}

/**
 * Human-readable reason why `getDefaultFrom()` returned null. Logged by
 * senders so the operator sees exactly which env var to set.
 */
export const MISSING_FROM_REASON =
  "EMAIL_FROM is not set. Production must send from a Resend-VERIFIED domain " +
  '(e.g. EMAIL_FROM="HelpTravel.pl <rezerwacje@mail.helptravel.pl>"). ' +
  "The resend.dev testing sender is not a production fallback — it returns " +
  "HTTP 403 for any recipient other than the Resend account owner.";

/**
 * Reply-To used on outgoing emails. Falls back to the operator's contact
 * address. Undefined if neither is set — Resend then uses the From header
 * for replies.
 */
export function getReplyTo(): string | undefined {
  return (
    process.env.EMAIL_REPLY_TO?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    undefined
  );
}

/**
 * Optional BCC for ops/auditing. Set EMAIL_BCC to an internal address to
 * receive a copy of every confirmation — useful for the first weeks of
 * traffic to validate deliverability and formatting in real inboxes.
 */
export function getBcc(): string | undefined {
  return process.env.EMAIL_BCC?.trim() || undefined;
}

/** Test-only seam — resets the memoized client between tests. */
export function __resetResendClientForTests(): void {
  cached = undefined;
}
