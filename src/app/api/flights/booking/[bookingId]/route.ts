// GET /api/flights/booking/[bookingId] — dane strony potwierdzenia lotu.
//
// Autoryzacja: jak przy hotelach — znajomość bookingId (losowy identyfikator)
// JEST capability. Dodatkowo, jeśli podasz ?email=, musi się zgadzać z mailem
// kontaktu z sesji (druga warstwa, gdy sesja jest dostępna). Zwracamy WYŁĄCZNIE
// pola bezpieczne dla klienta — nigdy transactionId/prebookId/secretKey ani
// numerów dokumentów.
//
// ticketingStatus odświeżamy LIVE przez GET /flights/bookings/{id} (webhook to
// tylko trigger; GET = źródło prawdy — brief 1.6). Awaria live-GET nie wywraca
// strony: zwracamy ostatni znany stan z Redis.

import { NextRequest, NextResponse } from "next/server";

import { getFlightBooking } from "@/lib/flights/client";
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

export async function GET(request: NextRequest, ctx: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await ctx.params;
  const emailParam = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();

  const completed = await getFlightCompleted(bookingId).catch(() => null);
  const sessionId = await getSessionIdByBooking(bookingId).catch(() => null);
  const session = sessionId ? await getFlightSession(sessionId).catch(() => null) : null;

  if (!completed && !session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Druga warstwa autoryzacji (gdy znamy sesję): email musi pasować.
  if (emailParam && session?.contactData?.email && session.contactData.email.toLowerCase() !== emailParam) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Odśwież status biletu LIVE (best-effort).
  let live: ReturnType<typeof ticketingFromLive> = {};
  try {
    const res = await getFlightBooking(bookingId);
    live = ticketingFromLive(res);
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
        updatedAt: Date.now(),
      }).catch(() => {});
    }
  } catch {
    // Live-GET padł — pokazujemy ostatni znany stan z Redis.
  }

  const bookingStatus = session?.bookingStatus ?? completed?.status ?? "confirmed";
  const ticketingStatus = live.ticketingStatus ?? completed?.ticketingStatus ?? session?.ticketingStatus ?? "unknown";

  return NextResponse.json({
    bookingId,
    bookingStatus,
    ticketingStatus,
    pnr: live.pnr ?? completed?.pnr ?? session?.pnr ?? null,
    eTicketNumbers: live.eTickets ?? completed?.eTicketNumbers ?? session?.eTicketNumbers ?? [],
    price: completed?.price ?? session?.price ?? null,
    currency: completed?.currency ?? session?.currency ?? null,
    passengers: session?.passengerData?.map((p) => ({ firstName: p.firstName, lastName: p.lastName, type: p.type })) ?? [],
    // Trasa i taryfa do strony potwierdzenia. Do 2026-08-29 potwierdzenie
    // pokazywało wyłącznie numer, status i kwotę — klient nie miał na nim
    // ANI JEDNEJ informacji o locie, który właśnie kupił.
    itinerary: session?.itinerary ?? null,
  });
}
