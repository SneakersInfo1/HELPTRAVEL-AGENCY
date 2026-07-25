// packageOrchestrator — SAGA rezerwacji (§3.4). SERCE Fazy 2.
// STUB Fazy 0: zamrożony tylko typ stanów (patrz PackageSagaState w ../types).
//
// WARUNEK WEJŚCIA: rozstrzygnięcie prawne §0 pkt 1 (rola organizatora). Do tego
// czasu NIE implementujemy — Faza 1 jest bez płatności.
//
// Zasada nadrzędna: pieniądze za lot ruszają dopiero, gdy hotel jest potwierdzony.
// Sekwencja: verify → prebook(lot, hold) → [attach services → nowy txn/secret] →
// prebook(hotel) → CHECKOUT 1 (płatność hotelu) → book(hotel) → CHECKOUT 2
// (płatność lotu) → book(lot, idempotent po prebookId) → webhook/polling → CONFIRMED.
// Kompensacje + deadline HOTEL_BOOKED_AWAITING_FLIGHT = min(TTL prebooka, 25 min).
// Persystencja: Postgres `PackageBooking` (sagaState, oba booking ID, txnHotel,
// txnFlight z historią podmian, failureReason, compensationLog jsonb).

import type { PackageSagaState } from "../types";

export const INITIAL_SAGA_STATE: PackageSagaState = "DRAFT";

export function orchestratePackageBooking(): never {
  throw new Error("packageOrchestrator: not implemented (Faza 2 — po rozstrzygnięciu prawnym §0 pkt 1)");
}
