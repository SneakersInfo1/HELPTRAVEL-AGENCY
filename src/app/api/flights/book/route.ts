// POST /api/flights/book — proxy do LiteAPI POST /flights/bookings
// (payment.method:"TRANSACTION_ID"). Wołane PO udanej płatności.
//
// Cienki wrapper: rate-limit + walidacja body, a CAŁA logika finalizacji jest w
// finalizeFlightBooking (src/lib/flights/finalize.ts), żeby ta sama ścieżka
// działała wołana BEZPOŚREDNIO ze strony powrotu (bez HTTP self-fetchu, który
// na preview trafiał na produkcję bez tras lotów — patrz finalize.ts).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/rate-limit";
import { finalizeFlightBooking } from "@/lib/flights/finalize";
import { FlightStoreUnavailableError } from "@/lib/flights/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({ sessionId: z.string().uuid() });

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

  try {
    const { status, body } = await finalizeFlightBooking(parsed.data.sessionId);
    return NextResponse.json(body, { status });
  } catch (err) {
    // Jedyny throw to niedostępny store na starcie (getFlightSession) — wtedy
    // jeszcze NIE oznaczyliśmy paid, więc bezpiecznie poprosić o ponowienie.
    if (err instanceof FlightStoreUnavailableError) {
      return NextResponse.json(
        { error: "store_unavailable", message: "Chwilowy problem techniczny. Spróbuj ponownie za moment." },
        { status: 503 },
      );
    }
    throw err;
  }
}
