// Orkiestrator sagi PackageBooking — jedyny punkt, przez który zdarzenia
// (checkout, webhook, polling, cron) zmieniają stan. Spec §3.4: „oba źródła
// piszą do sagi przez jeden serializowany handler — optimistic lock na
// sagaState". Tu: wersjonowanie rekordu (stateVersion) + retry po konflikcie.
//
// I/O WSTRZYKIWANE (SagaStore/EffectSink) — orkiestrator jest testowalny bez
// bazy i bez LiteAPI; adapter Prisma i realne efekty (refund/cancel/mail)
// dochodzą w Kroku 2.1+. Efekty wykonują się PO zapisie stanu (at-least-once
// — sink MUSI być idempotentny); błąd efektu NIE cofa przejścia, tylko ląduje
// w wyniku i w logu kompensacji (admin widzi, klient nigdy nie dostaje 500).

import { transition } from "./sagaMachine";
import type {
  PackageSagaState,
  SagaEffect,
  SagaEvent,
  SagaPatch,
  SagaStateLogEntry,
} from "./sagaTypes";

/** Rekord sagi, jak w Postgresie (odpowiednik modelu Prisma `PackageBooking`). */
export interface PackageBookingRecord {
  id: string;
  sagaState: PackageSagaState;
  /** Optimistic lock: update tylko przy zgodnej wersji. */
  stateVersion: number;
  flightPrebookId: string | null;
  flightBookingId: string | null;
  hotelPrebookId: string | null;
  hotelBookingId: string | null;
  txnHotel: string | null;
  txnFlight: string | null;
  txnFlightHistory: string[];
  prebookExpiresAt: string | null;
  deadlineAt: string | null;
  failureReason: string | null;
  stateLog: SagaStateLogEntry[];
  compensationLog: CompensationLogEntry[];
}

export interface CompensationLogEntry {
  effect: SagaEffect["type"];
  at: string;
  ok: boolean;
  detail?: string;
}

export interface SagaStore {
  load(id: string): Promise<PackageBookingRecord | null>;
  /**
   * Zapis przejścia POD WARUNKIEM zgodności wersji (optimistic lock).
   * Zwraca false przy konflikcie (ktoś zapisał między load a update).
   */
  update(id: string, expectedVersion: number, next: PackageBookingRecord): Promise<boolean>;
  /** Dopisanie wpisów do logu kompensacji (poza lockiem stanu — append-only). */
  appendCompensationLog(id: string, entries: CompensationLogEntry[]): Promise<void>;
}

export interface EffectSink {
  /** Wykonaj efekt (idempotentnie!). Rzucony błąd = odnotowany, nie cofa stanu. */
  run(booking: PackageBookingRecord, effect: SagaEffect): Promise<void>;
}

export interface SagaClock {
  now(): Date;
}

export interface ApplySagaEventResult {
  kind: "applied" | "ignored" | "invalid" | "not_found" | "conflict";
  state?: PackageSagaState;
  reason?: string;
  /** Efekty, których sink nie wykonał (są też w compensationLog). */
  effectErrors: { effect: SagaEffect["type"]; error: string }[];
}

const MAX_LOCK_RETRIES = 3;

function applyPatch(rec: PackageBookingRecord, patch: SagaPatch): void {
  if (patch.flightPrebookId !== undefined) rec.flightPrebookId = patch.flightPrebookId;
  if (patch.flightBookingId !== undefined) rec.flightBookingId = patch.flightBookingId;
  if (patch.hotelPrebookId !== undefined) rec.hotelPrebookId = patch.hotelPrebookId;
  if (patch.hotelBookingId !== undefined) rec.hotelBookingId = patch.hotelBookingId;
  if (patch.txnHotel !== undefined) rec.txnHotel = patch.txnHotel;
  if (patch.txnFlight !== undefined) rec.txnFlight = patch.txnFlight;
  if (patch.txnFlightHistory !== undefined) rec.txnFlightHistory = patch.txnFlightHistory;
  if (patch.prebookExpiresAt !== undefined) rec.prebookExpiresAt = patch.prebookExpiresAt;
  if (patch.deadlineAt !== undefined) rec.deadlineAt = patch.deadlineAt;
  if (patch.failureReason !== undefined) rec.failureReason = patch.failureReason;
}

/**
 * Zastosuj zdarzenie do sagi: load → czyste przejście → zapis z lockiem →
 * efekty. Konflikt locka = przeładowanie i ponowna decyzja (maszyna sama
 * odfiltruje duplikat jako ignored) — max 3 podejścia.
 */
export async function applySagaEvent(
  deps: { store: SagaStore; effects: EffectSink; clock?: SagaClock },
  bookingId: string,
  event: SagaEvent,
): Promise<ApplySagaEventResult> {
  const clock = deps.clock ?? { now: () => new Date() };

  for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
    const rec = await deps.store.load(bookingId);
    if (!rec) return { kind: "not_found", reason: `brak sagi ${bookingId}`, effectErrors: [] };

    const result = transition(
      { state: rec.sagaState, txnFlightHistory: rec.txnFlightHistory, prebookExpiresAt: rec.prebookExpiresAt },
      event,
    );

    if (result.kind !== "applied") {
      // ignored/invalid: bez zapisu, bez efektów — tylko diagnostyka.
      return { kind: result.kind, state: rec.sagaState, reason: result.reason, effectErrors: [] };
    }

    const next: PackageBookingRecord = { ...rec };
    applyPatch(next, result.patch);
    next.sagaState = result.next;
    next.stateVersion = rec.stateVersion + 1;
    next.stateLog = [
      ...rec.stateLog,
      { state: result.next, event: event.type, at: clock.now().toISOString() },
    ];

    const saved = await deps.store.update(bookingId, rec.stateVersion, next);
    if (!saved) continue; // wyścig webhook vs polling — przeładuj i zdecyduj od nowa

    // Stan zapisany — efekty (at-least-once). Błędy zbieramy, nie rzucamy.
    const effectErrors: ApplySagaEventResult["effectErrors"] = [];
    const logEntries: CompensationLogEntry[] = [];
    for (const effect of result.effects) {
      try {
        await deps.effects.run(next, effect);
        logEntries.push({ effect: effect.type, at: clock.now().toISOString(), ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        effectErrors.push({ effect: effect.type, error: msg });
        logEntries.push({ effect: effect.type, at: clock.now().toISOString(), ok: false, detail: msg });
      }
    }
    if (logEntries.length) await deps.store.appendCompensationLog(bookingId, logEntries);

    return { kind: "applied", state: next.sagaState, effectErrors };
  }

  return {
    kind: "conflict",
    reason: `optimistic lock: ${MAX_LOCK_RETRIES} kolejne konflikty zapisu sagi ${bookingId}`,
    effectErrors: [],
  };
}

/** Świeży rekord sagi (DRAFT) — do utworzenia przy wejściu w checkout. */
export function newPackageBookingRecord(id: string): PackageBookingRecord {
  return {
    id,
    sagaState: "DRAFT",
    stateVersion: 0,
    flightPrebookId: null,
    flightBookingId: null,
    hotelPrebookId: null,
    hotelBookingId: null,
    txnHotel: null,
    txnFlight: null,
    txnFlightHistory: [],
    prebookExpiresAt: null,
    deadlineAt: null,
    failureReason: null,
    stateLog: [],
    compensationLog: [],
  };
}
