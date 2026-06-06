// Live hotel stats for "deep" pages (audit action C — information gain).
//
// Flagship comparison pages get REAL, current data from our LiteAPI inventory
// instead of only modelled estimates: how many properties we actually have for
// the city, the average guest rating across them, and a few real top-rated
// examples. This is genuine information gain (data no static competitor page
// has) and is 100% real — every field is omitted, not faked, when the upstream
// call fails.
//
// Why only the /data/hotels list (no live /hotels/rates here): the rates
// endpoint returns every rate for every room (2-9 MB per city), which (a)
// blows past Next's 2 MB data-cache limit and (b) a "from" price sampled from
// top-rated hotels would be biased high — i.e. misleading. Accurate live
// per-night pricing lives on the search + hotel pages, which this page links
// to. Here we surface inventory + ratings, which the list endpoint gives us
// cheaply and cacheably (24h).
//
// Server-only: imports the LiteAPI client. Only ever called from async server
// components (comparison pages) at ISR build/revalidate time. All network is
// wrapped — a LiteAPI outage degrades to `null`, never breaks the page.

import { fetchHotelsList } from "@/lib/liteapi/search";

export interface CityHotelStats {
  /** Total properties LiteAPI lists for the city (or sample size fallback). */
  propertyCount: number;
  /** How many hotels we inspected for ratings. */
  sampleCount: number;
  /** Average guest rating (0-10) across rated hotels, or null if none rated. */
  avgGuestRating: number | null;
  ratedCount: number;
  /** A few real, top-rated example hotels (name + rating + stars). */
  topHotels: Array<{ id: string; name: string; rating: number | null; stars: number | null }>;
  /** When this snapshot was taken (ISO) — shown as an honesty/freshness signal. */
  asOfISO: string;
}

export async function getCityHotelStats(
  englishCity: string,
  englishCountry: string,
): Promise<CityHotelStats | null> {
  try {
    const list = await fetchHotelsList({ city: englishCity, country: englishCountry, limit: 50 });
    const hotels = list.data ?? [];
    if (hotels.length === 0) return null;

    const propertyCount = list.total ?? hotels.length;
    const rated = hotels.filter((h) => typeof h.rating === "number" && (h.rating ?? 0) > 0);
    const avgGuestRating = rated.length
      ? Math.round((rated.reduce((sum, h) => sum + (h.rating ?? 0), 0) / rated.length) * 10) / 10
      : null;

    const topHotels = [...hotels]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 4)
      .map((h) => ({ id: h.id, name: h.name, rating: h.rating ?? null, stars: h.stars ?? null }));

    return {
      propertyCount,
      sampleCount: hotels.length,
      avgGuestRating,
      ratedCount: rated.length,
      topHotels,
      asOfISO: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
