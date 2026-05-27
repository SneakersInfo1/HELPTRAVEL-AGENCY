// Lazy Resend client. Initialized once per process. Returns `null` if
// RESEND_API_KEY is not set — callers MUST handle that case (we just log
// + skip the send rather than throwing on the booking path, because email
// is a courtesy artifact: the booking itself is already confirmed at the
// point of send).
//
// Why Resend (decision 2026-05-27):
//   • Free tier covers our launch volume (3000/mo, 100/day).
//   • Default sender `onboarding@resend.dev` works without DNS setup —
//     the operator can ship today and switch to a branded sender later
//     by just setting EMAIL_FROM in Vercel. No code changes needed.
//   • React Email is supported but not required — we pass `html` + `text`
//     directly to avoid the extra dependency and JSX-in-runtime overhead.

import { Resend } from "resend";

let cached: Resend | null | undefined;

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
 * Sender used on outgoing emails.
 *
 * Resolution order:
 *   1. `EMAIL_FROM` env (preferred — branded address once DNS is set up,
 *      e.g. "HelpTravel <rezerwacje@helptravel.pl>" or just the address).
 *   2. Resend's "always works" dev sender. Lets the operator ship before
 *      domain DNS is configured. Switch to step (1) when ready.
 *
 * NOTE: Resend rejects sends from unverified custom domains with HTTP 403.
 * If the operator sets EMAIL_FROM to a non-resend domain WITHOUT verifying
 * it in the Resend dashboard, the send will fail and our orchestrator will
 * log a warning + best-effort alert. Recommended: leave EMAIL_FROM empty
 * until domain is verified in Resend.
 */
export function getDefaultFrom(): string {
  const custom = process.env.EMAIL_FROM?.trim();
  if (custom) {
    // If operator passed just an email address, wrap it with a display name.
    if (!custom.includes("<") && custom.includes("@")) {
      return `HelpTravel <${custom}>`;
    }
    return custom;
  }
  return "HelpTravel <onboarding@resend.dev>";
}

/**
 * Reply-To used on outgoing emails. Falls back to the operator's contact
 * address. Undefined if neither is set — Resend then uses the From header
 * for replies (which is fine when using a real branded domain, less useful
 * when on the dev sender).
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
