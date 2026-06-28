// /api/hotels/rates/batch — slim cheapest-rate-per-hotel for a small batch
// of hotelIds. Powers progressive (Booking-style) price loading on the
// search results list: the page renders instantly from /data/hotels
// metadata, then the client fills prices in via batched calls here.
//
// We deliberately return ONLY the cheapest rate per hotel (a few bytes),
// not the full roomTypes payload (~0.5MB/hotel) the single-hotel endpoint
// returns — that payload size is exactly what made the synchronous list
// search take ~22s.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { LiteApiError } from "@/lib/liteapi";
import { type RateCacheContext } from "@/lib/hotels/rate-cache";
import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({
  // Raised 30 → 50 in lockstep with the bumped client-side BATCH_SIZE
  // (2026-05-28 perf follow-up — the user reported ~5s cold scans on
  // /hotele/szukaj). LiteAPI's /hotels/rates per-call latency is roughly
  // O(1) in the hotelIds array length within reason — they parallelise
  // internally — so doubling the batch size halves the round-trips.
  // 50 also keeps each response payload manageable (~25MB raw → ~3-4MB
  // gzipped over the wire to LiteAPI). If LiteAPI ever returns
  // batch-size-related 4xx, drop back to 30.
  hotelIds: z.array(z.string().min(1)).min(1).max(50),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(15).default(2), // 15 = 9 adults + 6 children (guests popover)
  children: z.array(z.number().int().min(0).max(17)).default([]),
  rooms: z.number().int().min(1).max(5).default(1),
  currency: z.string().length(3).default("PLN"),
  guestNationality: z.string().length(2).default("PL"),
});

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "stays-search");
  if (limited) return limited;

  try {
    const body = BodySchema.parse(await request.json());
    const ctx: RateCacheContext = {
      checkin: body.checkin,
      checkout: body.checkout,
      adults: body.adults,
      children: body.children,
      rooms: body.rooms,
      currency: body.currency,
    };

    // Rdzeń (cache-read → getRates(maxRatesPerHotel:1) → slim → cache-write)
    // współdzielony z cronem prewarmingu (resolve-slim-rates.ts) — gwarancja, że
    // cron grzeje DOKŁADNIE ten klucz cache, który tu czytamy.
    const { rates: out, cacheHits, misses } = await resolveSlimRates(body.hotelIds, ctx, {
      guestNationality: body.guestNationality,
    });

    return NextResponse.json(
      { rates: out },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
          "X-Rate-Cache": `hits=${cacheHits};misses=${misses}`,
        },
      },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_body", issues: err.issues }, { status: 400 });
    }
    if (err instanceof LiteApiError) {
      return NextResponse.json(
        { error: err.internalCode, message: err.userMessagePl },
        { status: err.status ?? 500 },
      );
    }
    return NextResponse.json({ error: "rates_failed" }, { status: 500 });
  }
}
