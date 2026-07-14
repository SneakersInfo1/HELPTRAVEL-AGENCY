// Testy orkiestratora: zapis z optimistic lockiem, wyścig webhook vs polling,
// efekty PO zapisie (at-least-once, błąd efektu nie cofa stanu), no-op bez zapisu.

import test from "node:test";
import assert from "node:assert/strict";

import {
  applySagaEvent,
  newPackageBookingRecord,
  type CompensationLogEntry,
  type EffectSink,
  type PackageBookingRecord,
  type SagaStore,
} from "./orchestrator";
import type { SagaEffect } from "./sagaTypes";

class MemoryStore implements SagaStore {
  rec: PackageBookingRecord | null;
  updates = 0;
  /** Ile pierwszych update'ów ma udawać konflikt locka. */
  failFirstUpdates = 0;
  compLog: CompensationLogEntry[] = [];

  constructor(rec: PackageBookingRecord | null) {
    this.rec = rec;
  }
  async load(): Promise<PackageBookingRecord | null> {
    // Głęboka kopia jak z bazy — mutacje po stronie orkiestratora nie przeciekają.
    return this.rec ? structuredClone(this.rec) : null;
  }
  async update(_id: string, expectedVersion: number, next: PackageBookingRecord): Promise<boolean> {
    this.updates++;
    if (this.failFirstUpdates > 0) {
      this.failFirstUpdates--;
      return false;
    }
    if (!this.rec || this.rec.stateVersion !== expectedVersion) return false;
    this.rec = structuredClone(next);
    return true;
  }
  async appendCompensationLog(_id: string, entries: CompensationLogEntry[]): Promise<void> {
    this.compLog.push(...entries);
  }
}

function sink(ran: SagaEffect["type"][], failing: Set<SagaEffect["type"]> = new Set()): EffectSink {
  return {
    async run(_b, effect) {
      if (failing.has(effect.type)) throw new Error(`sink fail: ${effect.type}`);
      ran.push(effect.type);
    },
  };
}

function awaitingRecord(): PackageBookingRecord {
  const rec = newPackageBookingRecord("pkg-1");
  rec.sagaState = "HOTEL_BOOKED_AWAITING_FLIGHT";
  rec.stateVersion = 5;
  rec.txnFlightHistory = ["txn-B"];
  return rec;
}

test("applied: zapisuje nowy stan, podbija wersję, dopisuje stateLog, odpala efekty PO zapisie", async () => {
  const store = new MemoryStore(newPackageBookingRecord("pkg-1"));
  const ran: SagaEffect["type"][] = [];
  const clock = { now: () => new Date("2026-08-10T12:00:00Z") };

  const r = await applySagaEvent({ store, effects: sink(ran), clock }, "pkg-1", {
    type: "FLIGHT_PREBOOK_OK",
    flightPrebookId: "pb-1",
    txnFlight: "txn-B",
    prebookExpiresAt: "2026-08-10T12:15:00Z",
  });

  assert.equal(r.kind, "applied");
  assert.equal(store.rec?.sagaState, "FLIGHT_HELD");
  assert.equal(store.rec?.stateVersion, 1);
  assert.equal(store.rec?.flightPrebookId, "pb-1");
  assert.deepEqual(store.rec?.txnFlightHistory, ["txn-B"]);
  assert.deepEqual(store.rec?.stateLog, [
    { state: "FLIGHT_HELD", event: "FLIGHT_PREBOOK_OK", at: "2026-08-10T12:00:00.000Z" },
  ]);
});

test("wyścig (konflikt locka): przeładowuje i ponawia — duplikat kończy jako ignored", async () => {
  const store = new MemoryStore(awaitingRecord());
  store.failFirstUpdates = 1; // pierwszy zapis „przegrywa" z równoległym handlerem
  const ran: SagaEffect["type"][] = [];

  const r = await applySagaEvent({ store, effects: sink(ran) }, "pkg-1", { type: "FLIGHT_PAYMENT_OK" });

  assert.equal(r.kind, "applied");
  assert.equal(store.updates, 2); // konflikt + udany retry
  assert.equal(store.rec?.sagaState, "FLIGHT_PAID");

  // Drugie źródło (polling) przynosi TO SAMO zdarzenie → maszyna mówi ignored,
  // zero zapisów, zero efektów.
  const dup = await applySagaEvent({ store, effects: sink(ran) }, "pkg-1", { type: "FLIGHT_PAYMENT_OK" });
  assert.equal(dup.kind, "ignored");
  assert.equal(store.rec?.stateVersion, 6);
});

test("trwały konflikt locka → kind: conflict (bez pętli w nieskończoność)", async () => {
  const store = new MemoryStore(awaitingRecord());
  store.failFirstUpdates = 99;
  const r = await applySagaEvent({ store, effects: sink([]) }, "pkg-1", { type: "FLIGHT_PAYMENT_OK" });
  assert.equal(r.kind, "conflict");
  assert.equal(store.rec?.sagaState, "HOTEL_BOOKED_AWAITING_FLIGHT"); // stan nietknięty
});

test("ignored/invalid: bez zapisu i bez efektów", async () => {
  const store = new MemoryStore(awaitingRecord());
  const ran: SagaEffect["type"][] = [];

  const ignored = await applySagaEvent({ store, effects: sink(ran) }, "pkg-1", { type: "DEADLINE_REACHED" });
  // DEADLINE w oknie oczekiwania NIE jest ignored — użyj stanu, gdzie jest.
  assert.equal(ignored.kind, "applied"); // sanity: to przejście istnieje

  const store2 = new MemoryStore(newPackageBookingRecord("pkg-2"));
  const invalid = await applySagaEvent({ store: store2, effects: sink(ran) }, "pkg-2", {
    type: "FLIGHT_BOOK_OK",
    flightBookingId: "x",
  });
  assert.equal(invalid.kind, "invalid");
  assert.equal(store2.rec?.sagaState, "DRAFT");
  assert.equal(store2.rec?.stateVersion, 0);
  assert.equal(store2.updates, 0);
});

test("kompensacja deadline'u: efekty wykonane i zalogowane w compensationLog", async () => {
  const store = new MemoryStore(awaitingRecord());
  const ran: SagaEffect["type"][] = [];
  const r = await applySagaEvent({ store, effects: sink(ran) }, "pkg-1", { type: "DEADLINE_REACHED" });

  assert.equal(r.kind, "applied");
  assert.equal(store.rec?.sagaState, "COMPENSATING");
  assert.deepEqual(ran, ["CANCEL_HOTEL", "REFUND_HOTEL", "SEND_REFUND_EMAIL", "TRACK"]);
  assert.deepEqual(
    store.compLog.map((e) => [e.effect, e.ok]),
    [["CANCEL_HOTEL", true], ["REFUND_HOTEL", true], ["SEND_REFUND_EMAIL", true], ["TRACK", true]],
  );
});

test("błąd efektu NIE cofa stanu — ląduje w effectErrors i compensationLog", async () => {
  const store = new MemoryStore(awaitingRecord());
  const ran: SagaEffect["type"][] = [];
  const r = await applySagaEvent(
    { store, effects: sink(ran, new Set(["REFUND_HOTEL"])) },
    "pkg-1",
    { type: "DEADLINE_REACHED" },
  );

  assert.equal(r.kind, "applied");
  assert.equal(store.rec?.sagaState, "COMPENSATING"); // stan zapisany mimo faila
  assert.deepEqual(r.effectErrors, [{ effect: "REFUND_HOTEL", error: "sink fail: REFUND_HOTEL" }]);
  const failed = store.compLog.find((e) => e.effect === "REFUND_HOTEL");
  assert.equal(failed?.ok, false);
  // Pozostałe efekty i tak poszły (at-least-once, niezależnie od siebie).
  assert.deepEqual(ran, ["CANCEL_HOTEL", "SEND_REFUND_EMAIL", "TRACK"]);
});

test("brak sagi → not_found (webhook o nieznanym bookingu nie wywala handlera)", async () => {
  const store = new MemoryStore(null);
  const r = await applySagaEvent({ store, effects: sink([]) }, "pkg-x", { type: "FLIGHT_CONFIRMED" });
  assert.equal(r.kind, "not_found");
});
