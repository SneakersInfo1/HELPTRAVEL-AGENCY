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

import { fromMinor } from "@/lib/money";
import { getRates, LiteApiError } from "@/lib/liteapi";
import { pickCheapestRate, rateCancellationDeadline, rateCurrency, rateTotalMinor } from "@/lib/hotels/normalize";
import { getCachedRates, setCachedRates, type RateCacheContext, type SlimRate } from "@/lib/hotels/rate-cache";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({
  hotelIds: z.array(z.string().min(1)).min(1).max(12),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(8).default(2),
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

    const out: Record<string, SlimRate | null> = {};
    const missIds: string[] = [];

    // 1) Serve whatever the slim-rate cache already has.
    const cached = await getCachedRates(body.hotelIds, ctx);
    for (const hotelId of body.hotelIds) {
      const look = cached.get(hotelId) ?? { state: "miss" as const };
      if (look.state === "hit") out[hotelId] = look.rate;
      else if (look.state === "unavailable") out[hotelId] = null;
      else missIds.push(hotelId);
    }

    const cacheHits = body.hotelIds.length - missIds.length;

    // 2) Only the cache misses cost a live LiteAPI call.
    if (missIds.length > 0) {
      const rates = await getRates({
        hotelIds: missIds,
        checkin: body.checkin,
        checkout: body.checkout,
        currency: body.currency,
        guestNationality: body.guestNationality,
        occupancies: Array.from({ length: body.rooms }, () => ({ adults: body.adults, children: body.children })),
      });
      const byHotel = new Map(rates.data.map((r) => [r.hotelId, r] as const));
      const fresh: Array<{ hotelId: string; rate: SlimRate | null }> = [];
      for (const hotelId of missIds) {
        const hr = byHotel.get(hotelId);
        const cheapest = hr ? pickCheapestRate(hr.roomTypes ?? []) : null;
        let slim: SlimRate | null = null;
        if (cheapest) {
          const minor = rateTotalMinor(cheapest.rate);
          const currency = rateCurrency(cheapest.rate);
          if (minor !== null && currency) {
            slim = {
              totalAmount: fromMinor(minor),
              currency,
              boardName: cheapest.rate.boardName,
              refundableTag: cheapest.rate.refundableTag,
              cancellationDeadline: rateCancellationDeadline(cheapest.rate) ?? undefined,
              offerId: cheapest.offerId,
              rateId: cheapest.rate.rateId,
            };
          }
        }
        out[hotelId] = slim;
        fresh.push({ hotelId, rate: slim });
      }
      // 3) Populate the cache for the next visitor (best-effort).
      await setCachedRates(fresh, ctx);
    }

    return NextResponse.json(
      { rates: out },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
          "X-Rate-Cache": `hits=${cacheHits};misses=${missIds.length}`,
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
