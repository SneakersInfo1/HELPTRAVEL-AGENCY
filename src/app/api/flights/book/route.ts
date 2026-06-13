// POST /api/flights/book — proxy do LiteAPI POST /flights/bookings
// (payment.method:"TRANSACTION_ID"). Wołane PO udanej płatności.
//
// Wejście: { sessionId }. transactionId/prebookId czytamy z Redis (server-only,
// NIGDY z frontu). Retry 3× z backoffem robi liteApiRequest (LiteAPI jest tu
// idempotentne — brief 1.2/1.4.5).
//
// SCENARIUSZ KRYTYCZNY 1.4.5: płatność OK + booking failed po wyczerpaniu
// retry → bookingStatus:"manual_review" + zapis FlightFailedRecord (RULE 6) +
// alert. NIGDY nie pokazuj potwierdzenia w tym stanie.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyCritical } from "@/lib/alerting/notify";
import { sendFlightManualReviewAlert } from "@/lib/email/send-flight-alerts";
import { sendFlightConfirmation } from "@/lib/email/send-flight-alerts";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({ sessionId: z.string().uuid() });

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

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "booking-book");
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { sessionId } = parsed.data;

  const session = await getFlightSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session_not_found", message: "Sesja rezerwacji wygasła." }, { status: 404 });
  }
  if (session.bookingStatus === "confirmed" && session.bookingId) {
    // Idempotencja: już potwierdzone — zwróć istniejący wynik.
    return NextResponse.json({ bookingId: session.bookingId, bookingStatus: "confirmed", alreadyBooked: true }, { status: 200 });
  }
  if (!session.prebookId || !session.transactionId) {
    return NextResponse.json(
      { error: "session_incomplete", message: "Brak danych prebooka — rozpocznij rezerwację od nowa." },
      { status: 409 },
    );
  }

  // Płatność uznajemy za wykonaną (front wołał book PO sukcesie widgetu).
  // Oznaczamy paymentStatus=paid + bookingStatus=booking przed próbą.
  await saveFlightSession(sessionId, { ...session, paymentStatus: "paid", bookingStatus: "booking", updatedAt: Date.now() });

  try {
    const res = await bookFlight({ prebookId: session.prebookId, transactionId: session.transactionId });
    const facts = readBookingFacts(res);
    const bookingStatus = mapBookingStatus(facts.status);
    const bookingId = facts.bookingId ?? session.prebookId; // fallback: użyj prebookId jako klucza

    // Mail potwierdzający (3.6) — tylko przy confirmed i jeśli jeszcze nie
    // wysłany (webhook flight.book.confirmed też wysyła; guard chroni przed
    // duplikatem).
    const shouldSendMail = bookingStatus === "confirmed" && !session.confirmationSent && Boolean(session.contactData?.email);

    const updated = {
      ...session,
      paymentStatus: "paid" as const,
      bookingStatus,
      bookingId,
      pnr: facts.pnr,
      eTicketNumbers: facts.eTicketNumbers,
      ticketingStatus: facts.ticketingStatus,
      confirmationSent: session.confirmationSent || shouldSendMail,
      updatedAt: Date.now(),
    };
    await saveFlightSession(sessionId, updated);
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
      sendFlightConfirmation({
        bookingId,
        to: session.contactData!.email,
        pnr: facts.pnr,
        ticketingPending: facts.ticketingStatus !== "ticketed",
        price: session.price,
        currency: session.currency,
      }).catch(() => {});
    }

    return NextResponse.json(
      { bookingId, bookingStatus, ticketingStatus: facts.ticketingStatus, pnr: facts.pnr },
      { status: 200 },
    );
  } catch (err) {
    // ── 1.4.5 KRYTYCZNY: płatność OK, booking failed po retry ──
    const e = toFlightApiError(err, "book");
    const reason = `book failed: ${e.code} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode}`;
    console.error(`[flights][book][CRITICAL] sid=${sessionId} prebookId=${session.prebookId} — ${reason}`);

    // Zapis stanu manual_review + rekord paid-but-unbooked. MUSI przetrwać.
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
      fields: {
        sessionId,
        prebookId: session.prebookId,
        contactEmail: session.contactData?.email,
        reason,
      },
    }).catch(() => {});
    sendFlightManualReviewAlert({ sessionId, prebookId: session.prebookId, reason, contact: session.contactData }).catch(() => {});

    // Front: NIE pokazuj potwierdzenia. Czytelny komunikat 1.4.5/5.3.
    return NextResponse.json(
      {
        error: "manual_review",
        bookingStatus: "manual_review",
        message: "Płatność została odnotowana, ale rezerwacja wymaga ręcznej weryfikacji. Skontaktujemy się z Tobą jak najszybciej.",
      },
      { status: 202 },
    );
  }
}
