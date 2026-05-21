// /api/hotels/:hotelId — wraps LiteAPI getHotelDetail. 1h edge cache.

import { NextRequest, NextResponse } from "next/server";
import { getHotelDetail, LiteApiError } from "@/lib/liteapi";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(_request: NextRequest, ctx: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await ctx.params;
  if (!hotelId) {
    return NextResponse.json({ error: "missing_hotelId" }, { status: 400 });
  }
  try {
    const data = await getHotelDetail(hotelId);
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    if (err instanceof LiteApiError) {
      return NextResponse.json(
        { error: err.internalCode, message: err.userMessagePl },
        { status: err.status ?? 500 },
      );
    }
    return NextResponse.json({ error: "detail_failed" }, { status: 500 });
  }
}
