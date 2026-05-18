// GET /api/booking/[bookingId] — confirmation-page data source. Returns ONLY
// client-safe fields (no transactionId, prebookId, secretKey, or internal IDs).
// Not gated by BOOKING_FLOW_MODE: a confirmation must remain viewable even if
// the flag is later flipped off.

import { NextRequest, NextResponse } from "next/server";

import { BookingError } from "@/lib/liteapi";
import { getCompleted } from "@/lib/booking/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await ctx.params;

  let rec;
  try {
    rec = await getCompleted(bookingId);
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code }, { status: err.httpStatus });
    }
    throw err;
  }

  if (!rec) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    bookingId: rec.bookingId,
    confirmationCode: rec.confirmationCode ?? null,
    status: rec.status,
    hotel: rec.hotelSummary,
    rate: rec.rateSummary,
    price: rec.price ?? null,
    currency: rec.currency ?? null,
  });
}
