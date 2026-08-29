// GET /api/flights/booking/[bookingId] — dane strony potwierdzenia lotu.
//
// Autoryzacja: jak przy hotelach — znajomość bookingId (losowy identyfikator)
// JEST capability. Zwracamy WYŁĄCZNIE pola bezpieczne dla klienta — nigdy
// transactionId/prebookId/secretKey ani numerów dokumentów.
//
// USUNIĘTE 2026-08-29: opcjonalne `?email=`, które porównywano z mailem
// kontaktu. Wyglądało na drugą warstwę autoryzacji, a nią nie było —
// sprawdzenie odpalało się TYLKO wtedy, gdy wywołujący sam podał parametr,
// więc każdy, kto chciał je ominąć, po prostu go nie wysyłał. Żadne miejsce
// we froncie go nie wysyłało. Kontrola, którą omija się przez pominięcie,
// nie jest kontrolą — jest zaciemnieniem tego, co naprawdę chroni zasób.
//
// ticketingStatus odświeżamy LIVE przez GET /flights/bookings/{id} (webhook to
// tylko trigger; GET = źródło prawdy — brief 1.6). Awaria live-GET nie wywraca
// strony: zwracamy ostatni znany stan z Redis.

import { NextRequest, NextResponse } from "next/server";

import { getFlightBooking } from "@/lib/flights/client";
import { extractProviderItinerary, mergeItineraries } from "@/lib/flights/provider-itinerary";
import {
  getFlightCompleted,
  getFlightSession,
  getSessionIdByBooking,
  saveFlightCompleted,
  saveFlightSession,
  type FlightTicketingStatus,
} from "@/lib/flights/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ticketingFromLive(data: unknown): { ticketingStatus?: FlightTicketingStatus; pnr?: string; eTickets?: string[]; status?: string } {
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

export async function GET(_request: NextRequest, ctx: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await ctx.params;

  const completed = await getFlightCompleted(bookingId).catch(() => null);
  const sessionId = await getSessionIdByBooking(bookingId).catch(() => null);
  const session = sessionId ? await getFlightSession(sessionId).catch(() => null) : null;

  if (!completed && !session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Odśwież status biletu LIVE (best-effort).
  let live: ReturnType<typeof ticketingFromLive> = {};
  let liveItinerary: ReturnType<typeof extractProviderItinerary> = null;
  try {
    const res = await getFlightBooking(bookingId);
    live = ticketingFromLive(res);
    liveItinerary = extractProviderItinerary(res);
    // Nadpisz cache, gdy live przyniósł świeższe dane.
    if (completed) {
      await saveFlightCompleted({
        ...completed,
        status: live.status ?? completed.status,
        pnr: live.pnr ?? completed.pnr,
        eTicketNumbers: live.eTickets ?? completed.eTicketNumbers,
        ticketingStatus: live.ticketingStatus ?? completed.ticketingStatus,
      }).catch(() => {});
    }
    if (session) {
      await saveFlightSession(session.searchSessionId, {
        ...session,
        pnr: live.pnr ?? session.pnr,
        eTicketNumbers: live.eTickets ?? session.eTicketNumbers,
        ticketingStatus: live.ticketingStatus ?? session.ticketingStatus,
        providerItinerary: liveItinerary ?? session.providerItinerary,
        updatedAt: Date.now(),
      }).catch(() => {});
    }
  } catch {
    // Live-GET padł — pokazujemy ostatni znany stan z Redis.
  }

  const merged = mergeItineraries(liveItinerary ?? session?.providerItinerary, session?.itinerary);
  const bookingStatus = session?.bookingStatus ?? completed?.status ?? "confirmed";
  const ticketingStatus = live.ticketingStatus ?? completed?.ticketingStatus ?? session?.ticketingStatus ?? "unknown";

  return NextResponse.json({
    bookingId,
    bookingStatus,
    // Strona potwierdzenia MUSI wiedzieć, co wiemy o pieniądzach: dla
    // `manual_review` mówiła dotąd „Płatność została odnotowana" niezależnie od
    // tego, czy cokolwiek zostało pobrane. Teraz rozróżnia `paid` od
    // `processing` (status nierozstrzygnięty) — patrz `payment-evidence.ts`.
    paymentStatus: session?.paymentStatus ?? (completed ? "paid" : null),
    ticketingStatus,
    pnr: live.pnr ?? completed?.pnr ?? session?.pnr ?? null,
    eTicketNumbers: live.eTickets ?? completed?.eTicketNumbers ?? session?.eTicketNumbers ?? [],
    price: completed?.price ?? session?.price ?? null,
    currency: completed?.currency ?? session?.currency ?? null,
    passengers: session?.passengerData?.map((p) => ({ firstName: p.firstName, lastName: p.lastName, type: p.type })) ?? [],
    // Trasa i taryfa do strony potwierdzenia. Do 2026-08-29 potwierdzenie
    // pokazywało wyłącznie numer, status i kwotę — klient nie miał na nim
    // ANI JEDNEJ informacji o locie, który właśnie kupił.
    //
    // KOLEJNOŚĆ ŹRÓDEŁ (2026-08-29): live-GET od dostawcy → trasa zapisana
    // przy prebooku → migawka z przeglądarki. Strona potwierdzenia opisuje
    // kupiony bilet, więc nie może mówić danymi z `sessionStorage`, kiedy
    // dostawca powiedział, co realnie zarezerwował.
    itinerary: merged.itinerary ?? null,
    itinerarySource: merged.source,
  });
}
