// POST /api/admin/email-test — sends a sample booking confirmation email to
// any recipient, using fabricated data. Use this to:
//   • Verify Resend setup (RESEND_API_KEY + EMAIL_FROM) after deployment.
//   • Preview template changes in a real inbox.
//   • Check deliverability (spam folder, formatting, link rendering).
//
// Protected by the same Basic Auth middleware that gates /admin/*. Run from
// your terminal:
//
//   curl -u admin:YOUR_ADMIN_SECRET \
//     -X POST "https://helptravel.pl/api/admin/email-test?to=YOU@EXAMPLE.COM"
//
// Or from a browser: visit /admin first to authenticate, then open the URL
// directly (browser will reuse the cached Basic Auth credentials).
//
// The request body is ignored. The recipient address comes from `?to=`.

import { NextRequest, NextResponse } from "next/server";

import { sendBookingConfirmation } from "@/lib/email/send-booking-confirmation";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  // Rate-limit even authenticated admin traffic: a leaked secret + this
  // endpoint = a free spam spigot against the operator's Resend quota.
  // 5/min/IP is plenty for legitimate verification flows.
  const limited = await enforceRateLimit(request, "admin-email-test");
  if (limited) return limited;

  const url = new URL(request.url);
  const to = url.searchParams.get("to")?.trim();

  if (!to || !EMAIL_RX.test(to)) {
    return NextResponse.json(
      {
        error: "invalid_to",
        message:
          "Pass a valid recipient as ?to=YOU@EXAMPLE.COM (the address that will receive the test email).",
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const inOneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fiveDaysLater = new Date(inOneMonth.getTime() + 5 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const result = await sendBookingConfirmation({
    bookingId: `TEST-${Date.now().toString(36).toUpperCase()}`,
    confirmationCode: "HTL-DEMO-9988",
    hotelSummary: {
      name: "Hotel Riviera Demo",
      city: "Malaga, Hiszpania",
    },
    rateSummary: {
      boardName: "Pokój dwuosobowy ze śniadaniem",
      checkin: iso(inOneMonth),
      checkout: iso(fiveDaysLater),
    },
    price: 2480.5,
    currency: "PLN",
    holder: {
      firstName: "Anna",
      lastName: "Kowalska",
      email: to,
    },
    guestCount: 2,
  });

  if (result.ok) {
    return NextResponse.json(
      {
        ok: true,
        messageId: result.messageId,
        to,
        message:
          "Test email queued. Check your inbox (and spam folder!) within ~30 seconds.",
      },
      { status: 200 },
    );
  }

  // Distinguish "config missing" from "send failed" so the operator gets
  // actionable error text.
  if ("skipped" in result) {
    if (result.skipped === "no_api_key") {
      return NextResponse.json(
        {
          ok: false,
          error: "no_api_key",
          message:
            "RESEND_API_KEY is not configured on this environment. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: result.skipped, message: "Missing recipient." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "send_failed",
      message:
        "Resend rejected the send. Check the error string below — common causes: invalid EMAIL_FROM domain (verify in Resend dashboard) or recipient blocked.",
      detail: result.error,
    },
    { status: 502 },
  );
}
