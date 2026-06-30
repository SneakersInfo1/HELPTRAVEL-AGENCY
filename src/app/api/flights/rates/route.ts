// POST /api/flights/rates — proxy do LiteAPI POST /flights/rates (wyszukiwanie).
//
// NAZWA: `/rates` (nie `/search`) — odpowiada nazwie endpointu LiteAPI
// (POST /flights/rates). Cała rodzina lotów LiteAPI: /api/flights/{rates,
// verify,prebook,book,booking}.
//
// Read-only, brak płatności. Walidacja zod (legs 1–2, IATA, daty przyszłe).

import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/rate-limit";
import { searchFlightRates, toFlightApiError } from "@/lib/flights/client";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import { normalizeRatesResponse } from "@/lib/flights/display";
import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  setCachedFlightOffers,
} from "@/lib/flights/rates-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lista pokazuje setki ofert; cap utrzymuje payload <0,5 MB i Redis-friendly.
// Sort po cenie PRZED capem → najtańsze zawsze zostają; klient re-sortuje wg wyboru.
const FLIGHT_OFFERS_CAP = 150;

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
  const input = parsed.data;

  // Cache-hit → instant (oferty już chude i przycięte). [] = trafiony negatywny
  // cache (martwa trasa) — też zwracamy bez ruszania LiteAPI.
  // `?fresh=1` (recovery po wygaśnięciu oferty) POMIJA odczyt cache, żeby user
  // nie dostał ponownie tej samej wygasłej oferty; zapis poniżej zostaje.
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const cacheKey = flightRatesCacheKey(input);
  const cached = fresh ? null : await getCachedFlightOffers(cacheKey);
  if (cached !== null) {
    return NextResponse.json({ offers: cached, count: cached.length, cached: true }, { status: 200 });
  }

  try {
    const res = await searchFlightRates(input);
    const offers = normalizeRatesResponse(res)
      .slice()
      .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
      .slice(0, FLIGHT_OFFERS_CAP);
    await setCachedFlightOffers(cacheKey, offers);
    return NextResponse.json({ offers, count: offers.length, cached: false }, { status: 200 });
  } catch (err) {
    const e = toFlightApiError(err, "search");
    console.warn(`[flights][rates] ${e.code} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode}`);
    return NextResponse.json(
      { error: e.code, message: e.message, debug: { liteApiStatus: e.liteApiStatus, liteApiCode: e.liteApiCode } },
      { status: e.httpStatus },
    );
  }
}
