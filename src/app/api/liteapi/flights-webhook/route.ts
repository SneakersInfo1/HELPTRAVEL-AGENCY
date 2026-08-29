// POST /api/liteapi/flights-webhook — receiver eventów LiteAPI Flights (1.6).
//
// Koperta: { event_id, event_name, request, response, sandbox } — pola
// `request`/`response` to STRINGI JSON (drugi JSON.parse, defensywnie).
//
// Zasady:
//   • Idempotencja po event_id (Redis NX) — duplikat → 200, nic nie robimy.
//   • sandbox:true na produkcji → log + 200 (ignorujemy).
//   • Autoryzacja: jeśli token webhooka skonfigurowany (LITEAPI_FLIGHTS_WEBHOOK_
//     AUTH_TOKEN albo wspólny LITEAPI_WEBHOOK_AUTH_TOKEN) → weryfikuj
//     (fail-closed 401). Dodatkowo ZAWSZE walidujemy, że booking/prebook z
//     payloadu istnieje w naszej bazie, zanim zmienimy status.
//   • Webhook = trigger; po evencie zmieniającym status pobieramy GET
//     /flights/bookings/{id} (źródło prawdy) i nadpisujemy rekord.
//   • Zawsze 200 (poza twardym 401 auth) — LiteAPI agresywnie retry'uje; 5xx =
//     retry storm.
//
// Mapowanie statusów (1.6 + 1.4.7):
//   flight.book.confirmed            → confirmed + mail (jeśli nie wysłany)
//   flight.book.pending.confirmation → pending_confirmation
//   flight.book.failed / .expired    → manual_review + alert (chyba że już confirmed → log+ignore)
//   flight.book.cancelled            → cancelled + mail do klienta + alert admina
//   flight.prebook / .attachServices / .book.created → log

import { NextRequest, NextResponse } from "next/server";

import {
  LiteApiWebhookSignatureError,
  parseWebhookEmbeddedJson,
  verifyWebhookAuthToken,
} from "@/lib/liteapi";
import { notifyCritical, notifyWarning } from "@/lib/alerting/notify";
import { sendFlightCancellation, sendFlightManualReviewAlert } from "@/lib/email/send-flight-alerts";
import { getFlightBooking } from "@/lib/flights/client";
import { sendConfirmationOnce } from "@/lib/flights/finalize";
import { extractProviderItinerary } from "@/lib/flights/provider-itinerary";
import {
  getFlightSession,
  getSessionIdByBooking,
  getSessionIdByPrebook,
  linkBookingToSession,
  markWebhookEventProcessed,
  saveFlightCompleted,
  saveFlightFailed,
  saveFlightSession,
  type FlightBookingRecord,
  type FlightTicketingStatus,
} from "@/lib/flights/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface EmbeddedFlightResponse {
  data?:
    | {
        bookingId?: string;
        prebookId?: string;
        status?: string;
        pnr?: string;
        eTicketNumbers?: string[];
        price?: number;
        currency?: string;
      }
    | Array<{ bookingId?: string; prebookId?: string; status?: string; pnr?: string; eTicketNumbers?: string[] }>;
}

function firstData(embedded: EmbeddedFlightResponse | null) {
  const d = embedded?.data;
  return Array.isArray(d) ? d[0] : d;
}

function ticketingFromLive(data: unknown): { status?: string; pnr?: string; eTickets?: string[]; ticketingStatus: FlightTicketingStatus } {
  const node = Array.isArray((data as { data?: unknown })?.data)
    ? (data as { data: unknown[] }).data[0]
    : ((data as { data?: unknown }).data ?? data);
  const rec = (node && typeof node === "object" ? node : {}) as Record<string, unknown>;
  const eTickets = Array.isArray(rec.eTicketNumbers) ? (rec.eTicketNumbers as string[]) : undefined;
  return {
    status: typeof rec.status === "string" ? rec.status : undefined,
    pnr: typeof rec.pnr === "string" ? rec.pnr : undefined,
    eTickets,
    ticketingStatus: eTickets && eTickets.length > 0 ? "ticketed" : "pending",
  };
}

/** Odśwież rekord przez live GET (źródło prawdy). Best-effort. */
async function refreshFromLive(session: FlightBookingRecord, bookingId: string) {
  try {
    const res = await getFlightBooking(bookingId);
    const live = { ...ticketingFromLive(res), itinerary: extractProviderItinerary(res) ?? undefined };
    await saveFlightSession(session.searchSessionId, {
      ...session,
      bookingId,
      pnr: live.pnr ?? session.pnr,
      eTicketNumbers: live.eTickets ?? session.eTicketNumbers,
      ticketingStatus: live.ticketingStatus ?? session.ticketingStatus,
      providerItinerary: live.itinerary ?? session.providerItinerary,
      updatedAt: Date.now(),
    });
    return live;
  } catch {
    return null;
  }
}

/** Znajdź sesję po bookingId, a jak brak — po prebookId. */
async function resolveSession(bookingId?: string, prebookId?: string): Promise<{ sessionId: string; session: FlightBookingRecord } | null> {
  let sessionId: string | null = null;
  if (bookingId) sessionId = await getSessionIdByBooking(bookingId).catch(() => null);
  if (!sessionId && prebookId) sessionId = await getSessionIdByPrebook(prebookId).catch(() => null);
  if (!sessionId) return null;
  const session = await getFlightSession(sessionId).catch(() => null);
  if (!session) return null;
  return { sessionId, session };
}

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Auth: token lotów (lub wspólny). Jeśli żaden nie skonfigurowany — nie
  // weryfikujemy podpisu (Dashboard może nie udostępniać secretu dla flights),
  // ale i tak walidujemy istnienie rekordu w naszej bazie przed mutacją.
  const flightToken = process.env.LITEAPI_FLIGHTS_WEBHOOK_AUTH_TOKEN?.trim() || process.env.LITEAPI_WEBHOOK_AUTH_TOKEN?.trim();
  let event;
  if (flightToken) {
    try {
      event = verifyWebhookAuthToken({ rawBody, authorizationHeader: request.headers.get("authorization"), authToken: flightToken });
    } catch (err) {
      if (err instanceof LiteApiWebhookSignatureError) {
        console.warn(`[flights][webhook] auth FAILED: ${err.message}`);
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      console.error(`[flights][webhook][CRITICAL] payload parse FAILED: ${err instanceof Error ? err.message : String(err)} bodyLen=${rawBody.length}`);
      return NextResponse.json({ status: "accepted_with_parse_error" }, { status: 200 });
    }
  } else {
    // Brak tokenu — parsuj kopertę bez weryfikacji podpisu.
    try {
      const j = JSON.parse(rawBody) as { event_id?: string; event_name?: string; request?: string; response?: string; sandbox?: boolean };
      if (!j.event_id || !j.event_name) throw new Error("brak event_id/event_name");
      event = j as { event_id: string; event_name: string; request?: string; response?: string; sandbox?: boolean };
    } catch (err) {
      console.error(`[flights][webhook][CRITICAL] payload parse FAILED (no token): ${err instanceof Error ? err.message : String(err)}`);
      return NextResponse.json({ status: "accepted_with_parse_error" }, { status: 200 });
    }
  }

  const eventName = event.event_name;
  const eventId = event.event_id;

  // sandbox:true na produkcji → ignoruj.
  if (event.sandbox === true && process.env.VERCEL_ENV === "production") {
    console.warn(`[flights][webhook] ignored sandbox event on prod event_id=${eventId} name=${eventName}`);
    return NextResponse.json({ status: "ignored_sandbox" }, { status: 200 });
  }

  // Idempotencja po event_id.
  const isNew = await markWebhookEventProcessed(eventId);
  if (!isNew) {
    console.log(`[flights][webhook] duplicate event_id=${eventId} name=${eventName} — ack`);
    return NextResponse.json({ status: "duplicate_ignored" }, { status: 200 });
  }

  const embedded = parseWebhookEmbeddedJson<EmbeddedFlightResponse>(event.response);
  const data = firstData(embedded);
  const bookingId = data?.bookingId;
  const prebookId = data?.prebookId;
  console.log(`[flights][webhook] event_id=${eventId} name=${eventName} bookingId=${bookingId ?? "-"} prebookId=${prebookId ?? "-"}`);

  // Walidacja istnienia rekordu PRZED mutacją statusu.
  const resolved = await resolveSession(bookingId, prebookId);
  if (!resolved) {
    console.warn(`[flights][webhook] no matching session — bookingId=${bookingId ?? "-"} prebookId=${prebookId ?? "-"} event_id=${eventId} (ack, ignore)`);
    return NextResponse.json({ status: "no_match" }, { status: 200 });
  }
  const { sessionId, session } = resolved;
  const effectiveBookingId = bookingId ?? session.bookingId ?? prebookId!;

  switch (eventName) {
    case "flight.book.confirmed": {
      if (session.bookingStatus === "confirmed") {
        console.log(`[flights][webhook] already confirmed sid=${sessionId} — noop`);
        break;
      }
      await linkBookingToSession(effectiveBookingId, sessionId);
      const live = await refreshFromLive(session, effectiveBookingId);
      const ticketing = live?.ticketingStatus ?? "pending";
      // Webhook `flight.book.confirmed` JEST potwierdzeniem od dostawcy, że
      // rezerwacja istnieje — a rezerwacja u LiteAPI powstaje wyłącznie na
      // opłaconej transakcji. To jedyne miejsce poza udanym bookiem, w którym
      // wolno zapisać `paymentStatus:"paid"`.
      const confirmed: FlightBookingRecord = {
        ...session,
        bookingId: effectiveBookingId,
        bookingStatus: "confirmed",
        paymentStatus: "paid",
        ticketingStatus: ticketing,
        pnr: live?.pnr ?? session.pnr,
        eTicketNumbers: live?.eTickets ?? session.eTicketNumbers,
        // Trasa od dostawcy z live-GET-a, gdy przyszła; inaczej ta z prebooka.
        providerItinerary: live?.itinerary ?? session.providerItinerary,
        confirmationEmail: session.confirmationSent ? session.confirmationEmail : "EMAIL_PENDING",
        updatedAt: Date.now(),
      };
      await saveFlightSession(sessionId, confirmed);
      await saveFlightCompleted({ bookingId: effectiveBookingId, sessionId, status: "CONFIRMED", pnr: live?.pnr ?? session.pnr, eTicketNumbers: live?.eTickets ?? session.eTicketNumbers, ticketingStatus: ticketing, price: session.price, currency: session.currency, createdAt: Date.now() });
      // Mail przez wspólną bramkę: wysyła TYLKO gdy poprzednia próba nie
      // doszła, ustawia `confirmationSent` z FAKTU wysyłki i zlicza próby,
      // żeby seria webhooków nie zamieniła się w serię maili.
      await sendConfirmationOnce(sessionId, confirmed, {
        bookingId: effectiveBookingId,
        pnr: live?.pnr ?? session.pnr,
        eTicketNumbers: live?.eTickets ?? session.eTicketNumbers,
        ticketingPending: ticketing !== "ticketed",
      });
      break;
    }
    case "flight.book.pending.confirmation": {
      await linkBookingToSession(effectiveBookingId, sessionId);
      await saveFlightSession(sessionId, { ...session, bookingId: effectiveBookingId, bookingStatus: "pending_confirmation", updatedAt: Date.now() });
      break;
    }
    case "flight.book.failed":
    case "flight.book.expired": {
      // 1.4.7: jeśli już confirmed → log i ignoruj.
      if (session.bookingStatus === "confirmed") {
        console.warn(`[flights][webhook] ${eventName} but already confirmed sid=${sessionId} — log & ignore`);
        break;
      }
      const reason = `${eventName} (webhook) event_id=${eventId}`;
      await saveFlightSession(sessionId, { ...session, bookingStatus: "manual_review", manualReviewReason: reason, updatedAt: Date.now() });
      await saveFlightFailed({ sessionId, prebookId: session.prebookId, transactionId: session.transactionId, bookingId: effectiveBookingId, errorCode: eventName, message: reason, manualReviewReason: reason, createdAt: Date.now() }).catch(() => {});
      notifyCritical({ source: "flights-webhook", title: `Flight ${eventName} after payment — manual review`, body: "Webhook zgłosił niepowodzenie/wygaśnięcie rezerwacji po płatności. Wymaga ręcznej weryfikacji.", fields: { sessionId, bookingId: effectiveBookingId, prebookId: session.prebookId } }).catch(() => {});
      sendFlightManualReviewAlert({
        sessionId,
        prebookId: session.prebookId,
        reason,
        contact: session.contactData,
        // Ten sam werdykt, który zapisała finalizacja. Bez niego alert znów
        // twierdziłby „klient zapłacił" przy każdej porażce.
        paymentEvidence: session.paymentEvidence ? `${session.paymentEvidence.verdict}/${session.paymentEvidence.reason}` : undefined,
      }).catch(() => {});
      break;
    }
    case "flight.book.cancelled": {
      await saveFlightSession(sessionId, { ...session, bookingStatus: "cancelled", updatedAt: Date.now() });
      notifyWarning({ source: "flights-webhook", title: "Flight booking cancelled", body: "Rezerwacja lotu została anulowana. Zweryfikuj, czy zgodne z prośbą klienta.", fields: { sessionId, bookingId: effectiveBookingId } }).catch(() => {});
      // Mail o ANULOWANIU, nie potwierdzenie. Do 2026-08-29 leciał tu
      // `sendFlightConfirmation`, czyli klient z anulowanym lotem dostawał
      // wiadomość „Rezerwacja lotu potwierdzona".
      if (session.contactData?.email) {
        sendFlightCancellation({
          bookingId: effectiveBookingId,
          to: session.contactData.email,
          pnr: session.pnr,
          price: session.price,
          currency: session.currency,
        }).catch(() => {});
      }
      break;
    }
    case "flight.prebook":
    case "flight.attachServices":
    case "flight.book.created":
    default:
      console.log(`[flights][webhook] noop for ${eventName} event_id=${eventId}`);
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
