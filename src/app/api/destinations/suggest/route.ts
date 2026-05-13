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

import { suggestDestinations } from "@/lib/mvp/destination-suggest-fuse";
import type { DestinationSuggestion } from "@/lib/mvp/types";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(20, Math.max(1, Number(limitParam) || 8));

  const hits = suggestDestinations(q, limit);

  // Adapt to DestinationSuggestion so existing client code (mini-planner-form,
  // premium-home-hero) keeps working without changes.
  const items: DestinationSuggestion[] = hits.map((h) => ({
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
  }));

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
