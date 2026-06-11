// /api/hotels/search — orchestrates LiteAPI searchHotels + getRates and
// returns a flat array of NormalizedHotelOffer (cheapest rate per hotel).
// Master spec §4 / §5.2.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fromMinor } from "@/lib/money";
import { fetchHotelsList, getRates, LiteApiError } from "@/lib/liteapi";
import { enforceRateLimit } from "@/lib/rate-limit";
import { normalizeOffer } from "@/lib/hotels/normalize";

export const runtime = "nodejs";
export const revalidate = 60; // 60s edge cache per spec

const ChildSchema = z.coerce.number().int().min(0).max(17);

const QuerySchema = z.object({
  destination: z.string().min(2),
  country: z.string().min(2),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(15).default(2), // 15 = 9 adults + 6 children (guests popover)
  children: z.string().optional(), // comma-separated ages
  rooms: z.coerce.number().int().min(1).max(5).default(1),
  currency: z.string().length(3).default("PLN"),
  limit: z.coerce.number().int().min(1).max(40).default(20),
});

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, "stays-search");
  if (limited) return limited;

  const url = request.nextUrl;
  const parsed = QuerySchema.safeParse({
    destination: url.searchParams.get("destination"),
    country: url.searchParams.get("country") ?? "",
    checkin: url.searchParams.get("checkin"),
    checkout: url.searchParams.get("checkout"),
    adults: url.searchParams.get("adults"),
    children: url.searchParams.get("children") ?? undefined,
    rooms: url.searchParams.get("rooms"),
    currency: url.searchParams.get("currency") ?? "PLN",
    limit: url.searchParams.get("limit"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  }
  const q = parsed.data;
  const childAges = q.children
    ? q.children.split(",").map((s) => s.trim()).filter(Boolean).map((s) => ChildSchema.parse(s))
    : [];

  try {
    const list = await fetchHotelsList({ city: q.destination, country: q.country, limit: q.limit });
    if (!list.data || list.data.length === 0) {
      return NextResponse.json({ offers: [], meta: { total: 0, currency: q.currency } });
    }
    const hotelIds = list.data.map((h) => h.id);
    const rates = await getRates({
      hotelIds,
      checkin: q.checkin,
      checkout: q.checkout,
      currency: q.currency,
      occupancies: Array.from({ length: q.rooms }, () => ({ adults: q.adults, children: childAges })),
    });

    const ratesByHotel = new Map(rates.data.map((r) => [r.hotelId, r] as const));
    const offers = list.data
      .map((h) => normalizeOffer(h, ratesByHotel.get(h.id)))
      .filter((o): o is NonNullable<typeof o> => o !== null)
      // Send minor-unit bigints over the wire as plain numbers (display-only).
      .map((o) => ({
        ...o,
        cheapestRate: {
          ...o.cheapestRate,
          totalAmountMinor: undefined,
          totalAmount: fromMinor(o.cheapestRate.totalAmountMinor),
        },
      }));

    return NextResponse.json(
      {
        offers,
        meta: {
          total: offers.length,
          currency: q.currency,
          checkin: q.checkin,
          checkout: q.checkout,
          adults: q.adults,
          rooms: q.rooms,
          childAges,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    if (err instanceof LiteApiError) {
      return NextResponse.json(
        { error: err.internalCode, message: err.userMessagePl },
        { status: err.status ?? 500 },
      );
    }
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
