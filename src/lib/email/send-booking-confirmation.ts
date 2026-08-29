// Orchestrator: takes booking + holder data, renders the Polish confirmation
// template, and ships it via Resend. NEVER throws — callers fire-and-forget.
//
// Failure semantics:
//   • Email is a COURTESY artifact. The booking itself is already confirmed
//     by the time we reach this function. A failed send must not:
//       - block the HTTP response (use `void send(...).catch(() => {})`)
//       - degrade the user's confirmation page UX
//       - flag as [CRITICAL] (the customer has their booking ID on screen).
//   • We DO emit a `warning`-level alert so the operator notices repeated
//     send failures and can intervene (e.g. verify domain in Resend).
//
// What we log:
//   • Success → bookingId + Resend messageId for traceability.
//   • Skip (no API key) → warn once per process, then quiet.
//   • Error → bookingId + error + recipient (no other PII).

import { notifyWarning } from "@/lib/alerting/notify";
import {
  MISSING_FROM_REASON,
  getBcc,
  getDefaultFrom,
  getReplyTo,
  getResendClient,
} from "./client";
import { renderBookingConfirmation } from "./templates/booking-confirmation";

export interface SendBookingConfirmationInput {
  bookingId: string;
  confirmationCode?: string | null;
  hotelSummary: { name: string; city?: string };
  rateSummary: { boardName?: string; checkin: string; checkout: string };
  price?: number;
  currency?: string;
  holder: { firstName: string; lastName: string; email: string };
  /** Liczba osob; pomijana w mailu, gdy nieznana (recznie doslane potwierdzenie). */
  guestCount?: number | null;
}

export type SendResult =
  | { ok: true; messageId?: string }
  | { ok: false; skipped: "no_api_key" | "no_email" | "no_sender" }
  | { ok: false; error: string };

export async function sendBookingConfirmation(
  input: SendBookingConfirmationInput,
): Promise<SendResult> {
  const to = input.holder.email?.trim();
  if (!to) {
    console.warn(
      `[email][booking-confirmation] skipped — holder.email missing bookingId=${input.bookingId}`,
    );
    return { ok: false, skipped: "no_email" };
  }

  const client = getResendClient();
  if (!client) {
    // Not an error condition — Resend is simply not configured yet.
    // Logged once per process via console.warn so the operator sees it on
    // first booking and can decide to add RESEND_API_KEY.
    console.warn(
      `[email][booking-confirmation] skipped — RESEND_API_KEY not set; bookingId=${input.bookingId}`,
    );
    return { ok: false, skipped: "no_api_key" };
  }

  const supportEmail =
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    process.env.EMAIL_REPLY_TO?.trim() ||
    "pomoc@helptravel.pl";

  const rendered = renderBookingConfirmation({
    bookingId: input.bookingId,
    confirmationCode: input.confirmationCode ?? null,
    hotelName: input.hotelSummary.name,
    city: input.hotelSummary.city,
    checkin: input.rateSummary.checkin,
    checkout: input.rateSummary.checkout,
    boardName: input.rateSummary.boardName,
    price: input.price,
    // Session currency may be undefined for old records; default to PLN at
    // the boundary so the template never has to guess.
    currency: input.currency ?? "PLN",
    holder: input.holder,
    guestCount:
      typeof input.guestCount === "number" && input.guestCount > 0 ? input.guestCount : null,
    supportEmail,
  });

  const from = getDefaultFrom();
  // No usable sender → skip LOUDLY instead of attempting a send that Resend
  // would answer with 403 (incydent 2026-08-28: a real customer's confirmation
  // died exactly this way, on the old hardcoded resend.dev fallback). The
  // booking is already persisted and stays CONFIRMED — only the courtesy mail
  // is skipped, and the operator gets a warning naming the env var to set.
  if (!from) {
    console.error(
      `[email][booking-confirmation] SKIPPED — no sender configured; bookingId=${input.bookingId} to=${to}. ${MISSING_FROM_REASON}`,
    );
    void notifyWarning({
      source: "email",
      title: "Booking confirmation email skipped — sender not configured",
      body: `Booking ${input.bookingId} is CONFIRMED. ${MISSING_FROM_REASON}`,
      fields: {
        bookingId: input.bookingId,
        to,
        errorCode: "BOOKING_CONFIRMATION_EMAIL_FAILED",
        reason: "no_sender",
      },
    }).catch(() => {});
    return { ok: false, skipped: "no_sender" };
  }

  const replyTo = getReplyTo();
  const bcc = getBcc();

  // Bound the Resend call to 5s. The Resend SDK does not expose a request
  // timeout; if their endpoint hangs the TCP socket, our `void send().catch()`
  // pattern at the call site frees the HTTP response immediately — but the
  // Vercel function keeps the awaited Promise alive until `maxDuration` (60s)
  // fires, burning function-seconds. The 5s cap is well above Resend's
  // documented p99 (~600ms) and short enough that one bad call doesn't
  // pin the function open.
  const SEND_TIMEOUT_MS = 5000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("resend_timeout_5s")), SEND_TIMEOUT_MS),
  );

  try {
    const sendPromise = client.emails.send({
      from,
      to,
      ...(replyTo ? { replyTo } : {}),
      ...(bcc ? { bcc } : {}),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        // Helps Gmail / Apple Mail group related messages in the same thread.
        "X-Entity-Ref-ID": input.bookingId,
      },
      tags: [
        { name: "type", value: "booking_confirmation" },
        // Resend tag values: [a-zA-Z0-9_-] only. Keep dashes (common in
        // LiteAPI booking IDs like BK-12345); strip everything else.
        { name: "booking_id", value: input.bookingId.replace(/[^a-zA-Z0-9_-]/g, "_") },
      ],
    });
    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (result.error) {
      console.error(
        `[email][booking-confirmation] FAILED bookingId=${input.bookingId} to=${to} error=${result.error.message}`,
      );
      void notifyWarning({
        source: "email",
        title: "Booking confirmation email failed",
        body: `Resend rejected the send. Booking ${input.bookingId} is confirmed; manual email may be required.`,
        fields: {
          bookingId: input.bookingId,
          to,
          // Explicit, greppable code. Deliberately NOT BOOK_FAILED_AFTER_PAYMENT:
          // the provider booking is confirmed and persisted — only the mail failed.
          errorCode: "BOOKING_CONFIRMATION_EMAIL_FAILED",
          error: result.error.message,
          // Resend sometimes returns a `name` field with the error class
          // (e.g. "validation_error", "rate_limit_exceeded"). Stringify
          // defensively — newer SDKs change this shape.
          name: (result.error as { name?: string }).name,
        },
      }).catch(() => {});
      return { ok: false, error: result.error.message };
    }

    console.log(
      `[email][booking-confirmation] sent bookingId=${input.bookingId} messageId=${result.data?.id ?? "unknown"} to=${to}`,
    );
    return { ok: true, messageId: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[email][booking-confirmation] THREW bookingId=${input.bookingId} to=${to} error=${message}`,
    );
    void notifyWarning({
      source: "email",
      title: "Booking confirmation email threw",
      body: `Resend client threw (network / auth / etc). Booking ${input.bookingId} is confirmed; manual email may be required.`,
      fields: {
        bookingId: input.bookingId,
        to,
        errorCode: "BOOKING_CONFIRMATION_EMAIL_FAILED",
        error: message,
      },
    }).catch(() => {});
    return { ok: false, error: message };
  }
}
