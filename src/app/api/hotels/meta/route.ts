// GET /api/hotels/meta — kolejne strony puli metadanych hoteli dla strony
// wyników. Strona 0 (pierwsze 300) renderuje ją serwer (/hotele/szukaj);
// klient (ResultsList) dociąga stąd resztę w tle, aż lista obejmie WSZYSTKIE
// hotele kierunku (do POOL_MAX_TOTAL). Metadane są tanie i cache'owane 24 h
// na warstwie fetcha (liteApiRequest nextCache) — patrz lib/hotels/meta-pool.
//
// Kontrakt zapytania (lustro tego, co zna strona wyników):
//   ?city=Barcelona&country=Hiszpania&lat=41.39&lng=2.16&offset=300
//   ?region=majorka&offset=300            (wyspy/regiony — placeId + isInRegion)
// Odpowiedź: { hotels: MetaOffer[], count } — count RAW (przed filtrem wyspy),
// żeby klient wiedział, czy jest kolejna strona (count === limit).

import { NextRequest, NextResponse } from "next/server";

import { fetchHotelsByPlaceId, fetchHotelsForDestination, LiteApiError } from "@/lib/liteapi";
import { getRegionById, isInRegion } from "@/lib/hotels/regions";
import { POOL_MAX_TOTAL, POOL_PAGE_SIZE, toMetaOffer } from "@/lib/hotels/meta-pool";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Ten sam budżet co batch stawek — dociąganie puli to część tego samego
  // lejka wyszukiwania (≤6 stron na wyszukiwanie, pomijalne obciążenie).
  const limited = await enforceRateLimit(request, "stays-search");
  if (limited) return limited;

  const sp = request.nextUrl.searchParams;
  const regionId = sp.get("region");
  const city = sp.get("city");
  const country = sp.get("country");
  const latRaw = Number(sp.get("lat"));
  const lngRaw = Number(sp.get("lng"));
  const offsetRaw = Number(sp.get("offset"));
  const offset = Number.isFinite(offsetRaw)
    ? Math.min(POOL_MAX_TOTAL, Math.max(0, Math.trunc(offsetRaw)))
    : 0;

  const region = regionId ? getRegionById(regionId) : null;
  if (!region && (!city || !country)) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  try {
    const list = region
      ? await fetchHotelsByPlaceId({ placeId: region.placeId, limit: POOL_PAGE_SIZE, offset })
      : await fetchHotelsForDestination({
          city: city!,
          country: country!,
          lat: Number.isFinite(latRaw) ? latRaw : null,
          lng: Number.isFinite(lngRaw) ? lngRaw : null,
          limit: POOL_PAGE_SIZE,
          offset,
        });
    let raw = list.data ?? [];
    const rawCount = raw.length;
    if (region) raw = raw.filter((h) => isInRegion(region, h));

    return NextResponse.json(
      { hotels: raw.map(toMetaOffer), count: rawCount },
      {
        headers: {
          // Metadane zmieniają się rzadko — pozwól CDN-owi serwować stronę
          // puli bez dotykania funkcji (spójne z 24h TTL warstwy fetcha).
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    const message = err instanceof LiteApiError ? err.userMessagePl : "meta_failed";
    return NextResponse.json({ error: "meta_failed", message }, { status: 502 });
  }
}
