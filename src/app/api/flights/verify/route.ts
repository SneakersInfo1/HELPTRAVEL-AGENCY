// POST /api/flights/verify — proxy do LiteAPI POST /flights/verify.
//
// Zwraca flagę `priceChanged` + starą/nową cenę, jeśli front przekazał
// `previousTotal` (z wyników). Scenariusze błędów (brief 1.4):
//   • cena zmieniona → priceChanged:true (front pokazuje modal, NIE kontynuuje sam)
//   • oferta niedostępna → 409 OFFER_UNAVAILABLE (front wraca do wyników)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/rate-limit";
import { extractVerifiedTotal, verifyFlightOffer, toFlightApiError } from "@/lib/flights/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  offerId: z.string().min(8),
  previousTotal: z.number().optional(),
  previousCurrency: z.string().length(3).optional(),
});

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "flights-search");
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { offerId, previousTotal, previousCurrency } = parsed.data;

  try {
    const res = await verifyFlightOffer(offerId);
    const { total, currency, baggage } = extractVerifiedTotal(res);

    // Porównanie z dokładnością do grosza (różnice <0.005 PLN ignorujemy).
    const priceChanged =
      typeof previousTotal === "number" && typeof total === "number"
        ? Math.abs(total - previousTotal) > 0.005
        : false;

    return NextResponse.json(
      {
        offerId,
        verified: true,
        total,
        currency: currency ?? previousCurrency,
        baggage,
        priceChanged,
        ...(priceChanged ? { oldTotal: previousTotal, newTotal: total } : {}),
      },
      { status: 200 },
    );
  } catch (err) {
    const e = toFlightApiError(err, "verify");
    console.warn(`[flights][verify] ${e.code} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode}`);
    return NextResponse.json(
      // Bez `debug` — kod dostawcy nie jest informacją dla przeglądarki.
      // Diagnostyka zostaje w logu serwera (linia wyżej), gdzie jest komplet.
      { error: e.code, message: e.message },
      { status: e.httpStatus },
    );
  }
}
