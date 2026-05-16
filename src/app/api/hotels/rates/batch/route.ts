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

export interface SlimRate {
  totalAmount: number;
  currency: string;
  boardName?: string;
  refundableTag?: string;
  cancellationDeadline?: string;
  offerId: string;
  rateId: string;
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "stays-search");
  if (limited) return limited;

  try {
    const body = BodySchema.parse(await request.json());
    const rates = await getRates({
      hotelIds: body.hotelIds,
      checkin: body.checkin,
      checkout: body.checkout,
      currency: body.currency,
      guestNationality: body.guestNationality,
      occupancies: Array.from({ length: body.rooms }, () => ({ adults: body.adults, children: body.children })),
    });

    const byHotel = new Map(rates.data.map((r) => [r.hotelId, r] as const));
    const out: Record<string, SlimRate | null> = {};
    for (const hotelId of body.hotelIds) {
      const hr = byHotel.get(hotelId);
      const cheapest = hr ? pickCheapestRate(hr.roomTypes ?? []) : null;
      if (!cheapest) {
        out[hotelId] = null;
        continue;
      }
      const minor = rateTotalMinor(cheapest.rate);
      const currency = rateCurrency(cheapest.rate);
      if (minor === null || !currency) {
        out[hotelId] = null;
        continue;
      }
      out[hotelId] = {
        totalAmount: fromMinor(minor),
        currency,
        boardName: cheapest.rate.boardName,
        refundableTag: cheapest.rate.refundableTag,
        cancellationDeadline: rateCancellationDeadline(cheapest.rate) ?? undefined,
        offerId: cheapest.offerId,
        rateId: cheapest.rate.rateId,
      };
    }

    return NextResponse.json(
      { rates: out },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } },
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
