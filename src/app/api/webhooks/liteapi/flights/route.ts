// Webhook LiteAPI (loty + hotelowe błędy booku) → zdarzenia sagi pakietów.
// Webhook jest TYLKO triggerem — źródłem prawdy o statusie jest
// GET /flights/bookings/{id} (polling w cron/package-deadlines). Oba źródła
// piszą przez applySagaEvent (optimistic lock), więc wyścig jest bezpieczny.
//
// Odpowiedzi: 200 = przyjęte/zignorowane (także saga nieznana — ten sam
// endpoint dostaje eventy zwykłych rezerwacji hotelowych spoza pakietów),
// 401 = zły podpis, 503 = brak sekretu (nie przetwarzamy niezweryfikowanych),
// 500 = błąd zapisu (LiteAPI ponowi dostawę).

import { NextResponse } from "next/server";

import { applySagaEvent } from "@/modules/packages/saga/orchestrator";
import { createPrismaSagaStore, SagaStoreUnavailableError } from "@/modules/packages/saga/prismaSagaStore";
import { createProductionEffectSink } from "@/modules/packages/saga/productionEffectSink";
import { mapLiteApiWebhook, verifyWebhookSignature } from "@/modules/packages/saga/webhookMapper";

export const dynamic = "force-dynamic";

// TODO:VERIFY — nazwa nagłówka podpisu niepotwierdzona realnym webhookiem;
// sprawdzamy typowe warianty, po pierwszym evencie prod zostawić jeden.
const SIGNATURE_HEADERS = ["x-liteapi-signature", "x-webhook-signature", "x-signature"];

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.LITEAPI_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[webhook/liteapi] LITEAPI_WEBHOOK_SECRET nie ustawiony — odmawiam przetwarzania.");
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const signature = SIGNATURE_HEADERS.map((h) => request.headers.get(h)).find((v) => v) ?? null;
  if (!verifyWebhookSignature(raw, signature, secret)) {
    console.warn("[webhook/liteapi] nieprawidłowy podpis — odrzucam.");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const mapped = mapLiteApiWebhook(payload);
  if (!mapped) return NextResponse.json({ handled: false, reason: "event bez przejścia sagi" });

  try {
    const store = createPrismaSagaStore();
    const sagaId = await store.findIdByReference(mapped.ref);
    if (!sagaId) {
      // Normalne: eventy rezerwacji spoza pakietów (zwykły hotelowy flow).
      return NextResponse.json({ handled: false, reason: "brak sagi dla referencji" });
    }

    const result = await applySagaEvent(
      { store, effects: createProductionEffectSink() },
      sagaId,
      mapped.event,
    );

    if (result.kind === "conflict") {
      // Nie udało się zapisać po retry — niech LiteAPI dostarczy ponownie.
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }
    if (result.kind === "invalid") {
      console.warn(`[webhook/liteapi] ${mapped.event.type} invalid dla sagi ${sagaId}: ${result.reason}`);
    }
    if (result.effectErrors.length) {
      console.error("[webhook/liteapi] błędy efektów:", result.effectErrors);
    }
    return NextResponse.json({ handled: result.kind === "applied", kind: result.kind, state: result.state });
  } catch (err) {
    if (err instanceof SagaStoreUnavailableError) {
      // Baza niepodpięta (bramka Fazy 2) — nie ma sag, więc nic do zrobienia.
      return NextResponse.json({ handled: false, reason: "saga store unavailable" });
    }
    console.error("[webhook/liteapi] błąd:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
