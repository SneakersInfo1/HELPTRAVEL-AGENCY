// Wpięcie sagi pakietów w ISTNIEJĄCY webhook lotów
// (`/api/liteapi/flights-webhook` — kontrakt koperty potwierdzony empirycznie
// w repo 1.6: { event_id, event_name, request/response jako STRINGI JSON,
// sandbox }, auth Bearer-tokenem, idempotencja po event_id).
//
// Saga NIE ma własnego URL-a webhooka: LiteAPI dostaje jeden endpoint, a route
// po nieznalezieniu sesji Redis lotów (zwykły flow) pyta sagę pakietową po
// bookingId/prebookId. Webhook = trigger; źródłem prawdy pozostaje polling
// GET /flights/bookings/{id} w cron/package-deadlines.

import { applySagaEvent } from "./orchestrator";
import { createPrismaSagaStore, SagaStoreUnavailableError } from "./prismaSagaStore";
import { createProductionEffectSink } from "./productionEffectSink";
import type { SagaEvent } from "./sagaTypes";

/**
 * event_name → zdarzenie sagi. null = bez przejścia (informacyjne / obsłużone
 * synchronicznie w checkoucie / post-terminalne, np. cancelled po CONFIRMED —
 * to świadoma ręczna operacja, nie automat).
 *
 * failed i expired oba mapują na FLIGHT_EXPIRED: maszyna dopuszcza je w
 * FLIGHT_PAID ORAZ FLIGHT_BOOKED (webhook może wyprzedzić albo spóźnić się
 * względem naszego POST /flights/bookings) i robi tę samą pełną kompensację.
 */
export function sagaEventForFlightWebhook(eventName: string, eventId: string): SagaEvent | null {
  switch (eventName) {
    case "flight.book.confirmed":
      return { type: "FLIGHT_CONFIRMED" };
    case "flight.book.failed":
    case "flight.book.expired":
      return { type: "FLIGHT_EXPIRED", reason: `${eventName} (webhook) event_id=${eventId}` };
    default:
      return null;
  }
}

export interface PackageWebhookInput {
  eventName: string;
  eventId: string;
  bookingId?: string;
  prebookId?: string;
}

export type PackageWebhookOutcome =
  | { handled: true; sagaId: string; kind: string }
  | { handled: false; reason: string };

/**
 * Próba obsłużenia eventu przez sagę pakietową. Wołane z istniejącego route'a
 * webhooka, gdy event nie pasuje do sesji Redis lotów. Wszystkie błędy →
 * handled:false (route i tak odpowiada 200; zgubiony event domknie polling).
 */
export async function tryApplyPackageSagaWebhook(input: PackageWebhookInput): Promise<PackageWebhookOutcome> {
  const event = sagaEventForFlightWebhook(input.eventName, input.eventId);
  if (!event) return { handled: false, reason: `event ${input.eventName} bez przejścia sagi` };
  if (!input.bookingId && !input.prebookId) return { handled: false, reason: "brak bookingId/prebookId" };

  try {
    const store = createPrismaSagaStore();
    const sagaId = await store.findIdByReference({
      flightBookingId: input.bookingId,
      flightPrebookId: input.prebookId,
    });
    if (!sagaId) return { handled: false, reason: "brak sagi dla referencji" };

    const result = await applySagaEvent({ store, effects: createProductionEffectSink() }, sagaId, event);
    if (result.effectErrors.length) {
      console.error(`[package-saga][webhook] błędy efektów sagi ${sagaId}:`, result.effectErrors);
    }
    return { handled: true, sagaId, kind: result.kind };
  } catch (err) {
    if (err instanceof SagaStoreUnavailableError) {
      return { handled: false, reason: "saga store unavailable (DATABASE_URL = bramka Fazy 2)" };
    }
    console.error("[package-saga][webhook] błąd:", err instanceof Error ? err.message : err);
    return { handled: false, reason: "błąd wewnętrzny (polling domknie)" };
  }
}
