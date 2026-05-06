// Destination autocomplete for the hotel search form (Phase 2 spec §5.1).
// Currently delegates to the existing curated-catalog + Geoapify pipeline at
// `getDestinationSuggestions` — LiteAPI's `/data/places` is a Phase 1 stub
// (see src/lib/liteapi/places.ts). When LiteAPI's place endpoint is wired up
// it can layer on top here without API contract changes.

import { NextRequest, NextResponse } from "next/server";

import { getDestinationSuggestions } from "@/lib/mvp/destination-suggestions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
  try {
    const items = await getDestinationSuggestions(q);
    return NextResponse.json(
      { items },
      {
        headers: {
          // 1h edge cache per spec; client keeps a fresher in-memory cache.
          "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.json({ items: [], error: "autocomplete_failed" }, { status: 200 });
  }
}
