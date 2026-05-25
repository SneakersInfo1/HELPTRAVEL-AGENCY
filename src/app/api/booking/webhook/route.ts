// POST /api/booking/webhook — LiteAPI webhook receiver.
//
// Authentication: the `Authorization` header equals the shared token
// configured in the LiteAPI dashboard (Developer tools → Webhooks →
// Authentication Token). Mirror that token into the env var
// `LITEAPI_WEBHOOK_AUTH_TOKEN` on Vercel. Without it the handler fails
// closed (401) — we never persist anything trusting an unverified payload.
//
// Why this exists: even with our /rates/book reconciliation safety nets,
// edge cases like serverless cold-start retries, network drops, or LiteAPI
// returning a response shape our parser can't yet read can leave a booking
// committed on their side that we never recorded on ours. The webhook is
// the authoritative ground truth: LiteAPI sends us a `booking.book` event
// containing the full request + response as stringified JSON, and we
// persist it as a completed record. Same flow for `booking.refund` and
// `booking.cancel` — they update the local record so the admin shows the
// right state.
//
// IMPORTANT: this handler returns 200 unless the auth check itself fails.
// LiteAPI retries failed webhooks aggressively; returning 5xx on a
// parse/persist hiccup would cause a retry storm. We log + persist what
// we can, then ACK.

import { NextRequest, NextResponse } from "next/server";

import {
  LiteApiWebhookSignatureError,
  parseWebhookEmbeddedJson,
  verifyWebhookAuthToken,
} from "@/lib/liteapi";
import { saveCompleted, type CompletedRecord } from "@/lib/booking/session";
import { notifyCritical, notifyWarning } from "@/lib/alerting/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Webhook handlers should respond quickly; 60s gives us plenty of headroom
// over any Redis tail-latency. LiteAPI's own retry policy will re-deliver
// if we ever exceed this.
export const maxDuration = 60;

// LiteAPI's known event names. We don't strictly validate against this list
// (the canonical webhook envelope already passes `event_name: z.string()`),
// but we BRANCH on these to decide whether to persist anything.
const KNOWN_EVENTS = new Set([
  "booking.book", // booking created/confirmed
  "booking.confirmed", // legacy alias
  "booking.refund", // refund issued
  "booking.cancel", // cancellation issued
  "booking.cancelled", // legacy alias
  "booking.modify",
  "payment.success",
  "payment.failed",
]);

// Embedded `response` shape we care about for booking.book events. Lenient
// on purpose — we re-use the philosophy of LiteApiBookingSchema. If the
// shape drifts, we still ACK the webhook (don't fail-loud the storm).
interface EmbeddedBookingResponse {
  data?: {
    bookingId?: string;
    status?: string;
    hotelConfirmationCode?: string;
    checkin?: string;
    checkout?: string;
    hotel?: { hotelId?: string; name?: string };
    price?: number;
    currency?: string;
    paymentTransactionId?: string;
  };
}

function logLine(parts: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(parts)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

export async function POST(request: NextRequest) {
  // We MUST read the raw body before parsing — token verification operates on
  // the raw bytes (though for Authorization-header auth the body content is
  // not part of the signature, we still keep the pattern consistent with the
  // legacy HMAC path).
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error(
      `[liteapi][webhook] failed to read body: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");

  let event;
  try {
    event = verifyWebhookAuthToken({
      rawBody,
      authorizationHeader: authHeader,
    });
  } catch (err) {
    if (err instanceof LiteApiWebhookSignatureError) {
      console.warn(
        `[liteapi][webhook] auth FAILED: ${err.message} (ip=${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"})`,
      );
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // Schema parse failure — token was valid but payload didn't match envelope.
    // ACK with 200 (don't retry storm) but log loudly so we can investigate.
    console.error(
      `[liteapi][webhook][CRITICAL] payload parse FAILED: ${err instanceof Error ? err.message : String(err)} — bodyLen=${rawBody.length}`,
    );
    return NextResponse.json({ status: "accepted_with_parse_error" }, { status: 200 });
  }

  const eventName = event.event_name;
  const isKnown = KNOWN_EVENTS.has(eventName);
  console.log(
    `[liteapi][webhook] received ${logLine({
      event_id: event.event_id,
      event_name: eventName,
      known: isKnown,
      sandbox: typeof event.sandbox === "boolean" ? event.sandbox : undefined,
    })}`,
  );

  // Branch on event type. For each branch: parse the embedded response JSON
  // (it's a STRING per LiteAPI envelope) and persist what's actionable.
  switch (eventName) {
    case "booking.book":
    case "booking.confirmed": {
      const embedded = parseWebhookEmbeddedJson<EmbeddedBookingResponse>(event.response);
      const data = embedded?.data;
      if (!data?.bookingId) {
        console.warn(
          `[liteapi][webhook] ${eventName} missing data.bookingId in embedded response — event_id=${event.event_id}`,
        );
        break;
      }
      const record: CompletedRecord = {
        bookingId: data.bookingId,
        confirmationCode: data.hotelConfirmationCode || undefined,
        status: data.status ?? "CONFIRMED",
        hotelSummary: {
          name: data.hotel?.name ?? "Unknown hotel",
          city: undefined,
        },
        rateSummary: {
          boardName: undefined,
          price: data.price,
          currency: data.currency,
          checkin: data.checkin ?? "",
          checkout: data.checkout ?? "",
        },
        price: data.price,
        currency: data.currency,
        createdAt: Date.now(),
      };
      try {
        await saveCompleted(record);
        console.log(
          `[liteapi][webhook] persisted completed bookingId=${data.bookingId} status=${record.status} via=${eventName}`,
        );
      } catch (persistErr) {
        // Failure to persist a webhook is logged loudly. LiteAPI will retry
        // on 5xx — but we 200 here to avoid retry storms; we log [CRITICAL]
        // so ops can re-fire the recovery script.
        console.error(
          `[liteapi][webhook][CRITICAL] saveCompleted FAILED for bookingId=${data.bookingId} event_id=${event.event_id} — manual recovery required (persist error: ${persistErr instanceof Error ? persistErr.message : String(persistErr)})`,
        );
        notifyCritical({
          source: "webhook",
          title: "Webhook saveCompleted FAILED",
          body: "LiteAPI sent us a booking confirmation but we couldn't persist it. Booking is live on their side, invisible to our admin.",
          fields: {
            bookingId: data.bookingId,
            eventId: event.event_id,
            eventName,
            error: persistErr instanceof Error ? persistErr.message : String(persistErr),
          },
        }).catch(() => {});
      }
      break;
    }
    case "booking.refund":
    case "booking.cancel":
    case "booking.cancelled": {
      // For refund/cancel we do not flip the completed record (the user still
      // had a booking — it just got refunded/cancelled later). The admin
      // surfaces the LiteAPI state separately. We log here for ops visibility
      // and so an alert can pick this up.
      const embedded = parseWebhookEmbeddedJson<EmbeddedBookingResponse>(event.response);
      const bookingId = embedded?.data?.bookingId ?? "unknown";
      console.warn(
        `[liteapi][webhook] ${eventName} bookingId=${bookingId} event_id=${event.event_id} — ops review`,
      );
      // Refunds and cancellations are not failures, but ops should know. Use
      // warning level so they aren't silently ignored by anyone filtering on
      // [CRITICAL] only.
      notifyWarning({
        source: "webhook",
        title: `LiteAPI ${eventName.replace("booking.", "Booking ")}`,
        body: "A refund or cancellation was processed. Verify it matches a user request; if not, investigate.",
        fields: { bookingId, eventId: event.event_id, eventName },
      }).catch(() => {});
      break;
    }
    default:
      // Known-but-not-handled or completely unknown. Just log.
      console.log(
        `[liteapi][webhook] noop for event_name=${eventName} event_id=${event.event_id}`,
      );
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
