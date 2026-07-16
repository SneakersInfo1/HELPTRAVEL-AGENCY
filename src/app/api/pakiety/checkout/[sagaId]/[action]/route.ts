// POST /api/pakiety/checkout/{sagaId}/{action} — akcje checkoutu pakietowego.
// Wszystkie przejścia idą przez checkoutService → applySagaEvent (maszyna
// stanów pilnuje kolejności; zła kolejność = 409, nie 500).
//
// Akcje:
//   hold-flight    body = FlightPrebookInput (offerId+contact+passengers[+lastTravelDate])
//                  → verify (zmiana ceny → 409 priceChanged, ZERO prebooka)
//                  → HOLD lotu; guests hotelu zapisywane z pasażerów.
//   prebook-hotel  body = {} (rateId z kontekstu) → PaymentIntent A (Checkout 1).
//   hotel-paid     po sukcesie płatności A w SDK → book hotelu (book z
//                  TRANSACTION_ID = autorytatywna walidacja transakcji);
//                  fail booku = kompensacja, odpowiedź 200 z uczciwym statusem.
//   flight-paid    po sukcesie płatności B' → book lotu (idempotentny);
//                  permanent fail = manual (alert), odpowiedź 200 ze statusem.
//   payment-failed body = {which:"hotel"|"flight", reason} → retryable.
//
// GRANICA PIENIĘDZY: płatność potwierdza wyłącznie klient w Payment SDK
// (przeglądarka); serwer NIGDY nie inicjuje obciążenia.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getLiteApiWidgetEnv } from "@/lib/liteapi/widget-env";
import { FlightPrebookInputSchema } from "@/lib/flights/types";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { LiteApiGuest } from "@/lib/liteapi";
import { buildCheckoutDeps, type HotelBookContext } from "@/modules/packages/saga/checkoutAdapters";
import {
  confirmFlightPaidAndBook,
  confirmHotelPaidAndBook,
  holdFlight,
  prebookHotelStep,
  reportPaymentFailure,
} from "@/modules/packages/saga/checkoutService";
import { createPrismaSagaStore, SagaStoreUnavailableError } from "@/modules/packages/saga/prismaSagaStore";
import { createProductionEffectSink } from "@/modules/packages/saga/productionEffectSink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Book hotelu na prod widziany do ~9,8 s (audyt 2026-05-24) + book lotu z
// retry — headroom jak w /api/booking/book.
export const maxDuration = 60;

const PaymentFailedSchema = z.object({
  which: z.enum(["hotel", "flight"]),
  reason: z.string().min(1).max(300),
});

interface StoredCheckoutContext {
  offer?: { rateId?: string };
  holder?: HotelBookContext["holder"];
  guests?: LiteApiGuest[];
}

function widgetEnv(): "live" | "sandbox" {
  return getLiteApiWidgetEnv();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sagaId: string; action: string }> },
) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { sagaId, action } = await params;

  const limited = await enforceRateLimit(request, "booking-prebook");
  if (limited) return limited;

  let json: unknown = {};
  try {
    const raw = await request.text();
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const store = createPrismaSagaStore();
    const effects = createProductionEffectSink();

    switch (action) {
      case "hold-flight": {
        const parsed = FlightPrebookInputSchema.safeParse(json);
        if (!parsed.success) {
          return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
        }
        const b = parsed.data;
        const acceptPriceChange = Boolean((json as { acceptPriceChange?: unknown }).acceptPriceChange);
        const deps = buildCheckoutDeps({
          store,
          effects,
          flight: { contact: b.contact, passengers: b.passengers },
        });
        const result = await holdFlight(deps, sagaId, { offerId: b.offerId, acceptPriceChange });
        if (result.priceChanged) {
          // Jawny banner w UI — zero cichych zmian kwot, zero prebooka.
          return NextResponse.json({ priceChanged: true, total: result.total ?? null }, { status: 409 });
        }
        // Goście hotelowi = pasażerowie (dorośli); zapis do kontekstu booku.
        const ctx = (await store.loadCheckoutContext(sagaId))?.offerJson as StoredCheckoutContext | null;
        const guests: LiteApiGuest[] = b.passengers
          .filter((p) => p.type !== "INF") // niemowlę nie zajmuje łóżka
          .map((p) => ({ occupancyNumber: 1, firstName: p.firstName, lastName: p.lastName }));
        await store.setCheckoutContext(sagaId, { offerJson: { ...(ctx ?? {}), guests } });
        // secretKey WYŁĄCZNIE do frontu (Checkout 2) — nigdy do storage.
        return NextResponse.json({
          priceChanged: false,
          secretKey: result.secretKey,
          amount: result.price ?? null, // realna kwota PaymentIntentu lotu
          currency: result.currency ?? "PLN",
          widgetEnv: widgetEnv(),
        });
      }

      case "prebook-hotel": {
        const ctx = (await store.loadCheckoutContext(sagaId))?.offerJson as StoredCheckoutContext | null;
        const rateId = ctx?.offer?.rateId;
        if (!rateId) return NextResponse.json({ error: "missing_rate", message: "Brak taryfy hotelu w sadze." }, { status: 409 });
        const deps = buildCheckoutDeps({ store, effects });
        const pre = await prebookHotelStep(deps, sagaId, { rateId });
        return NextResponse.json({
          secretKey: pre.secretKey,
          amount: pre.price ?? null, // realna kwota PaymentIntentu (zero dryfu)
          currency: pre.currency ?? "PLN",
          widgetEnv: widgetEnv(),
        });
      }

      case "hotel-paid": {
        const ctx = (await store.loadCheckoutContext(sagaId))?.offerJson as StoredCheckoutContext | null;
        if (!ctx?.holder || !ctx.guests?.length) {
          return NextResponse.json({ error: "missing_context", message: "Brak danych gości do booku hotelu." }, { status: 409 });
        }
        const deps = buildCheckoutDeps({ store, effects, hotel: { holder: ctx.holder, guests: ctx.guests } });
        const r = await confirmHotelPaidAndBook(deps, sagaId);
        return NextResponse.json(
          r.ok
            ? { ok: true, hotelBookingId: r.hotelBookingId }
            : { ok: false, compensated: true, message: "Rezerwacja hotelu nie doszła do skutku — pełny zwrot płatności jest w drodze." },
        );
      }

      case "flight-paid": {
        const deps = buildCheckoutDeps({ store, effects });
        const r = await confirmFlightPaidAndBook(deps, sagaId);
        return NextResponse.json(
          r.ok
            ? { ok: true, flightBookingId: r.flightBookingId }
            : { ok: false, manual: true, message: "Finalizujemy Twoją rezerwację — potwierdzenie wyślemy e-mailem w ciągu 30 minut." },
        );
      }

      case "payment-failed": {
        const parsed = PaymentFailedSchema.safeParse(json);
        if (!parsed.success) {
          return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
        }
        const deps = buildCheckoutDeps({ store, effects });
        await reportPaymentFailure(deps, sagaId, parsed.data.which, parsed.data.reason);
        return NextResponse.json({ ok: true, retryable: true });
      }

      default:
        return NextResponse.json({ error: "unknown_action" }, { status: 404 });
    }
  } catch (err) {
    if (err instanceof SagaStoreUnavailableError) {
      return NextResponse.json(
        { error: "store_unavailable", message: "Rezerwacje pakietów są chwilowo niedostępne. Spróbuj za moment." },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    // Odmowa maszyny stanów (zła kolejność / duplikat spoza tabeli) = 409.
    if (/saga odmówiła przejścia/.test(msg)) {
      return NextResponse.json({ error: "invalid_state", message: msg }, { status: 409 });
    }
    console.error(`[pakiety/checkout][${action}] błąd:`, msg);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
