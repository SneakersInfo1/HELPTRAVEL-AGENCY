// POST /api/admin/resend-confirmation — re-sends the confirmation email for an
// EXISTING, already-confirmed booking. Nothing else.
//
// Why this exists (incydent 2026-08-28, booking 9c-OQvmqJ): the booking was
// confirmed by the provider, but Resend rejected the mail with HTTP 403 (the
// sender was the `onboarding@resend.dev` testing domain). The customer never
// got their confirmation. Recovery must not require a developer's laptop —
// the production RESEND_API_KEY lives only on Vercel.
//
// WHAT THIS ROUTE CANNOT DO — by construction, not by promise. It imports
// exactly three things that touch the outside world: `getCompleted` (Upstash
// GET), `getBooking` (LiteAPI GET /bookings/{id}) and `sendBookingConfirmation`
// (Resend). There is no import here that can:
//   • call /rates/book or /rates/prebook  → no booking can be created
//   • touch Stripe                        → no charge, no PaymentIntent, no refund
//   • write booking state                 → price and status are never modified
// `src/lib/email/email-config.test.ts` fails the build if that ever changes.
//
// Protected by the same Basic Auth middleware that gates /admin/*.
//
// Dry run (default — nothing is sent):
//   curl -u admin:YOUR_ADMIN_SECRET -X POST \
//     "https://helptravel.pl/api/admin/resend-confirmation?bookingId=9c-OQvmqJ"
//
// Real send (requires the explicit confirm flag):
//   curl -u admin:YOUR_ADMIN_SECRET -X POST \
//     "https://helptravel.pl/api/admin/resend-confirmation?bookingId=9c-OQvmqJ&send=1"
//
// Optional query params:
//   to=ADDRESS   override the recipient (default: holder address from LiteAPI)
//   guests=N     party size shown in the mail; omit and the "Goście" row is
//                left out entirely rather than guessed.

import { NextRequest, NextResponse } from "next/server";

import { getCompleted } from "@/lib/booking/session";
import { getBooking } from "@/lib/liteapi/retrieve";
import { getDefaultFrom, getReplyTo } from "@/lib/email/client";
import { planConfirmationResend } from "@/lib/email/resend-confirmation-guard";
import { renderBookingConfirmation } from "@/lib/email/templates/booking-confirmation";
import { sendBookingConfirmation } from "@/lib/email/send-booking-confirmation";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Rate-limit even authenticated admin traffic: a leaked secret plus this
  // route would otherwise be a way to mail our own customers repeatedly.
  const limited = await enforceRateLimit(request, "admin-email-test");
  if (limited) return limited;

  const url = new URL(request.url);
  const bookingId = url.searchParams.get("bookingId")?.trim();
  const toOverride = url.searchParams.get("to")?.trim() || undefined;
  const guestsParam = url.searchParams.get("guests")?.trim();
  const doSend = url.searchParams.get("send") === "1";

  if (!bookingId) {
    return NextResponse.json(
      { ok: false, error: "missing_bookingId", message: "Pass ?bookingId=..." },
      { status: 400 },
    );
  }

  // 1. The booking must exist in our durable store.
  let stored;
  try {
    stored = await getCompleted(bookingId);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "store_unavailable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }

  // 2. Holder + provider status, read-only. Never fatal — `to` can be supplied.
  let holderFirstName = "";
  let holderLastName = "";
  let recipient = toOverride ?? "";
  let providerStatus: string | null = null;
  let providerLookupError: string | null = null;
  try {
    const provider = await getBooking(bookingId);
    providerStatus = provider.status ?? null;
    holderFirstName = provider.holder?.firstName?.trim() ?? "";
    holderLastName = provider.holder?.lastName?.trim() ?? "";
    if (!recipient) recipient = provider.holder?.email?.trim() ?? "";
  } catch (err) {
    providerLookupError = err instanceof Error ? err.message : String(err);
  }

  // 3. Every refusal rule in one tested place.
  const plan = planConfirmationResend({
    bookingId,
    completed: stored,
    recipient,
    from: getDefaultFrom(),
  });
  if (!plan.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "refused",
        message: plan.reason,
        bookingId,
        providerStatus,
        providerLookupError,
      },
      { status: 409 },
    );
  }

  const { booking, from } = plan;
  const replyTo = getReplyTo();
  // Omitted rather than guessed: an older booking's session (which carried the
  // real party size) is long gone, and an invented number on a confirmation is
  // worse than no number.
  const parsedGuests = Number.parseInt(guestsParam ?? "", 10);
  const guestCount = Number.isFinite(parsedGuests) && parsedGuests > 0 ? parsedGuests : null;

  const supportEmail =
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    process.env.EMAIL_REPLY_TO?.trim() ||
    "pomoc@helptravel.pl";

  const preview = renderBookingConfirmation({
    bookingId: booking.bookingId,
    confirmationCode: booking.confirmationCode ?? null,
    hotelName: booking.hotelSummary.name,
    city: booking.hotelSummary.city,
    checkin: booking.rateSummary.checkin,
    checkout: booking.rateSummary.checkout,
    boardName: booking.rateSummary.boardName,
    price: booking.price,
    currency: booking.currency ?? "PLN",
    holder: { firstName: holderFirstName, lastName: holderLastName, email: plan.recipient },
    guestCount,
    supportEmail,
  });

  const summary = {
    bookingId: booking.bookingId,
    status: booking.status,
    providerStatus,
    hotel: booking.hotelSummary,
    stay: { checkin: booking.rateSummary.checkin, checkout: booking.rateSummary.checkout },
    price: booking.price ?? null,
    currency: booking.currency ?? null,
    guestCount,
    to: plan.recipient,
    from,
    replyTo: replyTo ?? null,
    subject: preview.subject,
    guarantees: {
      providerBookCalled: false,
      providerPrebookCalled: false,
      stripePaymentIntentCreated: false,
      stripeChargeOrRefund: false,
      bookingModified: false,
    },
  };

  if (!doSend) {
    return NextResponse.json(
      {
        ok: true,
        dryRun: true,
        ...summary,
        message: "DRY RUN — nothing was sent. Repeat with &send=1 to actually send.",
      },
      { status: 200 },
    );
  }

  const result = await sendBookingConfirmation({
    bookingId: booking.bookingId,
    confirmationCode: booking.confirmationCode ?? null,
    hotelSummary: booking.hotelSummary,
    rateSummary: booking.rateSummary,
    price: booking.price,
    currency: booking.currency,
    holder: { firstName: holderFirstName, lastName: holderLastName, email: plan.recipient },
    guestCount,
  });

  if (result.ok) {
    console.log(
      `[admin][resend-confirmation] sent bookingId=${booking.bookingId} messageId=${result.messageId ?? "unknown"} to=${plan.recipient}`,
    );
    return NextResponse.json(
      { ok: true, dryRun: false, sent: true, messageId: result.messageId ?? null, ...summary },
      { status: 200 },
    );
  }

  if ("skipped" in result) {
    return NextResponse.json(
      { ok: false, error: result.skipped, sent: false, ...summary },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { ok: false, error: "send_failed", sent: false, detail: result.error, ...summary },
    { status: 502 },
  );
}
