// /api/hotels/rates — wraps LiteAPI getRates for a single hotel + dates.
// Used by the /hotele/[hotelId] page to fetch the rooms/rates table.
// 60s edge cache.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fromMinor } from "@/lib/money";
import { getRates, LiteApiError } from "@/lib/liteapi";
import { rateTotalMinor } from "@/lib/hotels/normalize";

export const runtime = "nodejs";
export const revalidate = 60;

const BodySchema = z.object({
  hotelId: z.string().min(1),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(8).default(2),
  children: z.array(z.number().int().min(0).max(17)).default([]),
  rooms: z.number().int().min(1).max(5).default(1),
  currency: z.string().length(3).default("PLN"),
  guestNationality: z.string().length(2).default("PL"),
});

export async function POST(request: NextRequest) {
  try {
    const body = BodySchema.parse(await request.json());
    const rates = await getRates({
      hotelIds: [body.hotelId],
      checkin: body.checkin,
      checkout: body.checkout,
      currency: body.currency,
      guestNationality: body.guestNationality,
      occupancies: Array.from({ length: body.rooms }, () => ({ adults: body.adults, children: body.children })),
    });
    const hotelRates = rates.data.find((r) => r.hotelId === body.hotelId) ?? { hotelId: body.hotelId, roomTypes: [] };

    // Inject display-only totalAmount alongside the raw retailRate so the
    // server-rendered page doesn't have to recompute.
    const roomTypes = (hotelRates.roomTypes ?? []).map((rt) => ({
      offerId: rt.offerId,
      supplier: rt.supplier,
      rates: (rt.rates ?? []).map((r) => {
        const minor = rateTotalMinor(r);
        return {
          ...r,
          totalAmount: minor !== null ? fromMinor(minor) : null,
        };
      }),
    }));

    return NextResponse.json(
      { hotelId: body.hotelId, roomTypes },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
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
