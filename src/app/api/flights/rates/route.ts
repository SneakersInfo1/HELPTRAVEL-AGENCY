// POST /api/flights/rates — proxy do LiteAPI POST /flights/rates (wyszukiwanie).
//
// NAZWA: `/rates` (nie `/search`) — odpowiada nazwie endpointu LiteAPI
// (POST /flights/rates). Cała rodzina lotów LiteAPI: /api/flights/{rates,
// verify,prebook,book,booking}.
//
// Read-only, brak płatności. Walidacja zod (legs 1–2, IATA, daty przyszłe).

import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/rate-limit";
import { toFlightApiError } from "@/lib/flights/client";
import { searchFlightOffers } from "@/lib/flights/search-offers";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  setCachedFlightOffers,
} from "@/lib/flights/rates-cache";

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
    // Wspólny helper (search → normalize → sort po cenie → cap) — ten sam,
    // którym cron grzeje cache, więc kształt ofert = identyczny.
    const offers = await searchFlightOffers(input);
    await setCachedFlightOffers(cacheKey, offers);
    return NextResponse.json({ offers, count: offers.length, cached: false }, { status: 200 });
  } catch (err) {
    const e = toFlightApiError(err, "search");
    // Opis dostawcy do logu (nigdy do przeglądarki): przy wyszukiwaniu nie
    // echuje danych osobowych — w zapytaniu są tylko lotniska, daty i liczba
    // osób. Bez niego przyczyna 403/40301 była nieczytelna z logów.
    const desc = e.providerDescription ? ` desc="${e.providerDescription.replace(/\s+/g, " ").slice(0, 200)}"` : "";
    console.warn(`[flights][rates] ${e.code} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode}${desc}`);
    return NextResponse.json(
      // Bez `debug` — kod dostawcy nie jest informacją dla przeglądarki.
      // Diagnostyka zostaje w logu serwera (linia wyżej), gdzie jest komplet.
      // `reason` to nasza taksonomia (np. PROVIDER_ACCESS_DENIED), nie kod dostawcy.
      { error: e.code, message: e.message, ...(e.reason ? { reason: e.reason } : {}) },
      { status: e.httpStatus },
    );
  }
}
