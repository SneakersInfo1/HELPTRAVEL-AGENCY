// GET /api/pakiety/checkout/{sagaId} — stan sagi dla UI (sanityzowany:
// ZERO sekretów — secretKey nigdy nie jest w storage, transactionId zostaje
// serwerowy). UI odpytuje po powrocie z płatności / przy wznowieniu z maila.

import { NextRequest, NextResponse } from "next/server";

import { createPrismaSagaStore, SagaStoreUnavailableError } from "@/modules/packages/saga/prismaSagaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sagaId: string }> },
) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { sagaId } = await params;

  try {
    const store = createPrismaSagaStore();
    const [rec, ctx] = await Promise.all([store.load(sagaId), store.loadCheckoutContext(sagaId)]);
    if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const offerJson = (ctx?.offerJson ?? null) as { offer?: unknown } | null;
    return NextResponse.json({
      sagaId: rec.id,
      state: rec.sagaState,
      deadlineAt: rec.deadlineAt,
      hotelBookingId: rec.hotelBookingId,
      flightBookingId: rec.flightBookingId,
      failureReason: rec.failureReason,
      amountHotelMinor: ctx?.amountHotelMinor ?? null,
      amountFlightMinor: ctx?.amountFlightMinor ?? null,
      offer: offerJson?.offer ?? null,
    });
  } catch (err) {
    if (err instanceof SagaStoreUnavailableError) {
      return NextResponse.json({ error: "store_unavailable" }, { status: 503 });
    }
    console.error("[pakiety/checkout][state] błąd:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
