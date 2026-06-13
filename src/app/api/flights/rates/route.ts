// POST /api/flights/rates — proxy do LiteAPI POST /flights/rates (wyszukiwanie).
//
// NAZWA: świadomie `/rates` (nie `/search`), bo `/api/flights/search` jest
// zajęte przez istniejącą integrację Travelpayouts (panel lotów na stronie
// hoteli). TP zostaje nietknięty do Fazy 4 (usuwanie Aviasales). Reszta
// rodziny lotów LiteAPI żyje pod /api/flights/{verify,prebook,book,booking}.
//
// Read-only, brak płatności. Walidacja zod (legs 1–2, IATA, daty przyszłe).

import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/rate-limit";
import { searchFlightRates, toFlightApiError } from "@/lib/flights/client";
import { FlightSearchInputSchema } from "@/lib/flights/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "flights-search");
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = FlightSearchInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const res = await searchFlightRates(parsed.data);
    const journeys = res.data?.flatMap((d) => d.journeys ?? []) ?? [];
    return NextResponse.json({ data: res.data, count: journeys.length }, { status: 200 });
  } catch (err) {
    const e = toFlightApiError(err, "search");
    console.warn(`[flights][rates] ${e.code} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode}`);
    return NextResponse.json(
      { error: e.code, message: e.message, debug: { liteApiStatus: e.liteApiStatus, liteApiCode: e.liteApiCode } },
      { status: e.httpStatus },
    );
  }
}
