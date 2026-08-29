// Finalizacja rezerwacji lotu PO udanej płatności — WSPÓLNA logika dla
// POST /api/flights/book ORAZ strony powrotu /loty/platnosc/return.
//
// DLACZEGO TU, A NIE TYLKO W ROUTE (bug 2026-06-14):
// Strona powrotu robiła HTTP self-fetch `${getSiteUrl()}/api/flights/book`.
// `getSiteUrl()` zwraca KANONICZNĄ domenę (NEXT_PUBLIC_SITE_URL = helptravel.pl)
// na KAŻDYM środowisku — więc na PREVIEW fetch trafiał na PRODUKCJĘ, która nie
// ma jeszcze tras lotów → 404 → book NIGDY się nie wykonał mimo pobranej
// płatności (karta obciążona, rezerwacja niezrobiona, sesja utknęła w
// `prebooked`/`pending`, a RULE 6 manual_review się nie odpalił, bo route nie
// został w ogóle wywołany). Rozwiązanie: strona powrotu woła tę funkcję
// BEZPOŚREDNIO (in-process, ta sama deployment) — zero self-fetchu.

import { notifyCritical } from "@/lib/alerting/notify";
import {
  flightConfirmationInputFromSession,
  sendFlightConfirmation,
  sendFlightManualReviewAlert,
} from "@/lib/email/send-flight-alerts";
import { bookFlight, extractBookingId, toFlightApiError } from "@/lib/flights/client";
import {
  getFlightSession,
  linkBookingToSession,
  saveFlightCompleted,
  saveFlightFailed,
  saveFlightSession,
  type FlightBookingStatus,
  type FlightTicketingStatus,
} from "@/lib/flights/session";

export interface FinalizeResult {
  status: number;
  body: Record<string, unknown>;
}

/** Wyciąga status/pnr/eticket z odpowiedzi book (kształt zależny od dostawcy). */
function readBookingFacts(data: unknown): {
  bookingId?: string;
  status?: string;
  pnr?: string;
  eTicketNumbers?: string[];
  ticketingStatus?: FlightTicketingStatus;
} {
  const node = Array.isArray((data as { data?: unknown })?.data)
    ? (data as { data: unknown[] }).data[0]
    : ((data as { data?: unknown }).data ?? data);
  const rec = (node && typeof node === "object" ? node : {}) as Record<string, unknown>;
  const bookingId = extractBookingId(data);
  const status = typeof rec.status === "string" ? rec.status : undefined;
  const pnr =
    typeof rec.pnr === "string"
      ? rec.pnr
      : typeof (rec.booking as Record<string, unknown>)?.pnr === "string"
        ? ((rec.booking as Record<string, unknown>).pnr as string)
        : undefined;
  const tickets = Array.isArray(rec.eTicketNumbers) ? (rec.eTicketNumbers as string[]) : undefined;
  const ticketingStatus: FlightTicketingStatus = tickets && tickets.length > 0 ? "ticketed" : "pending";
  return { bookingId, status, pnr, eTicketNumbers: tickets, ticketingStatus };
}

function mapBookingStatus(raw?: string): FlightBookingStatus {
  const s = (raw || "").toLowerCase();
  if (/confirm/.test(s)) return "confirmed";
  if (/pending/.test(s)) return "pending_confirmation";
  if (/cancel/.test(s)) return "cancelled";
  if (/fail|error/.test(s)) return "failed";
  return "confirmed"; // book 2xx bez statusu → traktujemy jak confirmed (GET zweryfikuje)
}

/**
 * Finalizuje rezerwację po płatności. Idempotentne: confirmed → zwraca istniejący
 * wynik; book z payment.method:"TRANSACTION_ID" referuje JUŻ pobraną transakcję
 * (bez ponownego obciążenia). Może rzucić tylko gdy store (Redis) niedostępny na
 * starcie (getFlightSession) — caller (route/return) łapie to i pokazuje uczciwy
 * komunikat. Po oznaczeniu paymentStatus=paid błędy booka idą w manual_review.
 */
export async function finalizeFlightBooking(sessionId: string): Promise<FinalizeResult> {
  const session = await getFlightSession(sessionId);
  if (!session) {
    return { status: 404, body: { error: "session_not_found", message: "Sesja rezerwacji wygasła." } };
  }
  if (session.bookingStatus === "confirmed" && session.bookingId) {
    return { status: 200, body: { bookingId: session.bookingId, bookingStatus: "confirmed", alreadyBooked: true } };
  }
  if (!session.prebookId || !session.transactionId) {
    return { status: 409, body: { error: "session_incomplete", message: "Brak danych prebooka — rozpocznij rezerwację od nowa." } };
  }
  // Bramka kwoty (2026-08-29). Sesja, w której cena locka rozjechała się z ceną
  // zaakceptowaną przez klienta, NIGDY nie dostała `secretKey`, więc nie mogła
  // zostać opłacona. Gdyby ktoś wszedł na `/loty/platnosc/return?sid=…` z takim
  // identyfikatorem (a klient go zna — jest w jego własnym URL-u powrotu),
  // dotychczasowy kod oznaczyłby sesję jako `paid` i poszedł bookować.
  // `undefined` przepuszczamy: to sesje sprzed wprowadzenia flagi.
  if (session.priceGatePassed === false) {
    console.warn(`[flights][finalize] odmowa: bramka kwoty nie przeszła sid=${sessionId}`);
    return {
      status: 409,
      body: {
        error: "price_not_confirmed",
        message: "Cena tej rezerwacji nie została potwierdzona. Rozpocznij rezerwację od nowa.",
      },
    };
  }

  // Płatność uznajemy za wykonaną (wołane PO sukcesie widgetu). Oznacz
  // paymentStatus=paid + bookingStatus=booking PRZED próbą — od tego momentu
  // każdy błąd to paid-but-unbooked (manual_review), nie cichy zgon.
  await saveFlightSession(sessionId, { ...session, paymentStatus: "paid", bookingStatus: "booking", updatedAt: Date.now() });

  try {
    const res = await bookFlight({ prebookId: session.prebookId, transactionId: session.transactionId });
    const facts = readBookingFacts(res);
    const bookingStatus = mapBookingStatus(facts.status);
    const bookingId = facts.bookingId ?? session.prebookId;

    const shouldSendMail = bookingStatus === "confirmed" && !session.confirmationSent && Boolean(session.contactData?.email);

    await saveFlightSession(sessionId, {
      ...session,
      paymentStatus: "paid",
      bookingStatus,
      bookingId,
      pnr: facts.pnr,
      eTicketNumbers: facts.eTicketNumbers,
      ticketingStatus: facts.ticketingStatus,
      confirmationSent: session.confirmationSent || shouldSendMail,
      updatedAt: Date.now(),
    });
    await linkBookingToSession(bookingId, sessionId);
    if (bookingStatus === "confirmed" || bookingStatus === "pending_confirmation") {
      await saveFlightCompleted({
        bookingId,
        sessionId,
        status: facts.status ?? bookingStatus,
        pnr: facts.pnr,
        eTicketNumbers: facts.eTicketNumbers,
        ticketingStatus: facts.ticketingStatus,
        price: session.price,
        currency: session.currency,
        createdAt: Date.now(),
      });
    }
    if (shouldSendMail) {
      const mail = flightConfirmationInputFromSession(session, {
        bookingId,
        pnr: facts.pnr,
        eTicketNumbers: facts.eTicketNumbers,
        ticketingPending: facts.ticketingStatus !== "ticketed",
      });
      if (mail) sendFlightConfirmation(mail).catch(() => {});
    }

    return { status: 200, body: { bookingId, bookingStatus, ticketingStatus: facts.ticketingStatus, pnr: facts.pnr } };
  } catch (err) {
    // ── 1.4.5 KRYTYCZNY: płatność OK, booking failed po retry ──
    const e = toFlightApiError(err, "book");
    const reason = `book failed: ${e.code} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode}`;
    console.error(`[flights][book][CRITICAL] sid=${sessionId} prebookId=${session.prebookId} — ${reason}`);

    try {
      await saveFlightSession(sessionId, {
        ...session,
        paymentStatus: "paid",
        bookingStatus: "manual_review",
        manualReviewReason: reason,
        updatedAt: Date.now(),
      });
      await saveFlightFailed({
        sessionId,
        prebookId: session.prebookId,
        transactionId: session.transactionId,
        errorCode: e.code,
        message: e.message,
        manualReviewReason: reason,
        createdAt: Date.now(),
      });
    } catch (persistErr) {
      console.error(
        `[flights][book][CRITICAL] manual_review persist FAILED sid=${sessionId} — ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`,
      );
    }

    notifyCritical({
      source: "flights-book",
      title: "Flight payment OK but booking FAILED — manual review",
      body: "Klient zapłacił, ale /flights/bookings nie powiodło się po retry. Wymaga ręcznej weryfikacji i kontaktu z klientem.",
      fields: { sessionId, prebookId: session.prebookId, contactEmail: session.contactData?.email, reason },
    }).catch(() => {});
    sendFlightManualReviewAlert({ sessionId, prebookId: session.prebookId, reason, contact: session.contactData }).catch(() => {});

    return {
      status: 202,
      body: {
        error: "manual_review",
        bookingStatus: "manual_review",
        message: "Płatność została odnotowana, ale rezerwacja wymaga ręcznej weryfikacji. Skontaktujemy się z Tobą jak najszybciej.",
      },
    };
  }
}
