// Sesja C2 — server-side fuzzy autocomplete.
//
// Backed by Fuse.js indexed against `data/destinations.index.json` (built
// nightly by `scripts/build-destinations-seed.ts`). Response time at pilot
// scale is <5 ms; at full scale (~2k entries) still <50 ms.
//
// Query contract:
//   GET /api/destinations/suggest?q=lis&limit=8
// Response shape kept BACKWARD COMPATIBLE with the existing
// DestinationSuggestion clients — `city`/`country`/`region`/`label`/
// `queryValue`/`source` plus the new `id`, `iata`, `popularity` extras.

import { NextRequest, NextResponse } from "next/server";

import { matchRegions } from "@/lib/hotels/regions";
import { suggestDestinations } from "@/lib/mvp/destination-suggest-fuse";
import type { DestinationSuggestion } from "@/lib/mvp/types";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(20, Math.max(1, Number(limitParam) || 8));

  // Zadanie 2 — wyspy/regiony NAD miastami. matchRegions() dopasowuje po
  // polskiej nazwie, aliasach (mallorca→Majorka) i archipelagu
  // (kanary→Teneryfa…), bez diakrytyków. Miasta dopełniają limit.
  const regionHits = matchRegions(q, 4);
  const regionItems: DestinationSuggestion[] = regionHits.map((r) => ({
    id: `region-${r.id}`,
    kind: "region" as const,
    regionId: r.id,
    city: r.nameEn,
    country: r.countryPl,
    region: "wyspa",
    label: `${r.namePl} — wyspa, ${r.countryPl}`,
    queryValue: `${r.namePl}, ${r.countryPl}`,
    source: "curated" as const,
    airportCode: r.airports[0],
    cityPl: r.namePl,
    countryPl: r.countryPl,
    popularity: r.popularity,
  }));

  const hits = suggestDestinations(q, Math.max(1, limit - regionItems.length));

  // Adapt to DestinationSuggestion so existing client code (mini-planner-form,
  // premium-home-hero) keeps working without changes.
  const cityItems: DestinationSuggestion[] = hits.map((h) => ({
    id: h.id,
    city: h.cityEn,
    country: h.countryPl, // already Polish here so UI doesn't need to re-localize
    region: undefined,
    label: `${h.label}, ${h.countryPl}`,
    queryValue: `${h.cityEn}, ${h.countryPl}`,
    source: "curated" as const,
    destinationSlug: h.id,
    airportCode: h.iata ?? undefined,
    cityPl: h.label,
    countryPl: h.countryPl,
    popularity: h.popularity,
    // Obecne tylko przy pustym q (redakcyjna lista popularnych) — UI używa ich
    // do nagłówków grup i podpowiedzi „Heraklion · Kreta".
    group: h.group,
    hint: h.hint,
  }));

  // Indeks miast miewa wpis o tej samej nazwie co wyspa ("Teneryfa") —
  // duplikat pod pozycją wyspy tylko myli, więc go chowamy.
  const regionNames = new Set(
    regionHits.flatMap((r) => [r.namePl.toLowerCase(), r.nameEn.toLowerCase()]),
  );
  const dedupedCities = cityItems.filter(
    (c) =>
      !regionNames.has((c.cityPl ?? "").toLowerCase()) &&
      !regionNames.has(c.city.toLowerCase()),
  );
  const items = [...regionItems, ...dedupedCities].slice(0, limit);

  return NextResponse.json(
    { items },
    {
      headers: {
        // Cache for 1 hour at the edge — the seed only changes on rebuild.
        "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
