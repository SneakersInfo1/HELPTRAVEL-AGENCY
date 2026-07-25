// POST /api/pakiety/checkout — START sagi pakietowej (DRAFT + kontekst oferty).
// Zero wywołań LiteAPI: sam zapis intencji w Postgresie (odpowiednik zapisu
// „intent PRZED prebookiem" z flow lotów — RULE 6). Za flagą pakietów.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { LiteApiHolderSchema } from "@/lib/liteapi";
import { enforceRateLimit } from "@/lib/rate-limit";
import { startPackageCheckout } from "@/modules/packages/saga/checkoutService";
import { createPrismaSagaStore, SagaStoreUnavailableError } from "@/modules/packages/saga/prismaSagaStore";
import { createProductionEffectSink } from "@/modules/packages/saga/productionEffectSink";
import { buildCheckoutDeps } from "@/modules/packages/saga/checkoutAdapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const OfferSchema = z.object({
  destination: z.string().min(1).max(80),
  hotelId: z.string().min(1).max(80),
  hotelName: z.string().min(1).max(160),
  /** hotelOfferId (rateId) z wyszukiwania pakietów — taryfa ZWROTNA (MVP). */
  rateId: z.string().min(1).max(600),
  /** offerId lotu wybranego w kroku 2. */
  flightOfferId: z.string().min(1).max(600),
  dateFrom: z.string().regex(ISO_DAY),
  dateTo: z.string().regex(ISO_DAY),
  adults: z.number().int().min(1).max(9),
  /** Kwoty z listingu (PLN, pełne zł) — do rekapu; realne kwoty płatności
   *  przyjdą z prebooków (zero dryfu między UI a obciążeniem). */
  hotelPln: z.number().positive(),
  flightPln: z.number().positive(),
});

const BodySchema = z.object({
  contact: LiteApiHolderSchema, // firstName/lastName/email/phone — holder hotelu
  offer: OfferSchema,
});

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const limited = await enforceRateLimit(request, "booking-prebook");
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
  const { contact, offer } = parsed.data;

  try {
    const store = createPrismaSagaStore();
    const deps = buildCheckoutDeps({ store, effects: createProductionEffectSink() });
    const sagaId = await startPackageCheckout(deps, {
      contactEmail: contact.email,
      amountHotelMinor: Math.round(offer.hotelPln * 100),
      amountFlightMinor: Math.round(offer.flightPln * 100),
    });
    await store.setCheckoutContext(sagaId, {
      offerJson: { offer, holder: contact },
      amountHotelMinor: Math.round(offer.hotelPln * 100),
      amountFlightMinor: Math.round(offer.flightPln * 100),
    });
    return NextResponse.json({ sagaId }, { status: 201 });
  } catch (err) {
    if (err instanceof SagaStoreUnavailableError) {
      // Świadomie GŁOŚNO: bez trwałego stanu checkout pakietowy się nie zaczyna.
      return NextResponse.json(
        { error: "store_unavailable", message: "Rezerwacje pakietów są chwilowo niedostępne. Spróbuj za moment." },
        { status: 503 },
      );
    }
    console.error("[pakiety/checkout][start] błąd:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
