// Testy serwisu checkoutu — pełny happy path na fake'ach (zero sieci) +
// krytyczne ścieżki błędów: zmiana ceny bez prebooka, fail booku hotelu po
// płatności (kompensacja zamiast wyjątku), permanent fail booku lotu (manual).

import test from "node:test";
import assert from "node:assert/strict";

import {
  confirmFlightPaidAndBook,
  confirmHotelPaidAndBook,
  holdFlight,
  prebookHotelStep,
  reportPaymentFailure,
  startPackageCheckout,
  type CheckoutDeps,
} from "./checkoutService";
import type { CompensationLogEntry, PackageBookingRecord } from "./orchestrator";
import type { SagaEffect } from "./sagaTypes";

class FakeStore {
  recs = new Map<string, PackageBookingRecord>();
  async create(rec: PackageBookingRecord): Promise<void> {
    this.recs.set(rec.id, structuredClone(rec));
  }
  async load(id: string): Promise<PackageBookingRecord | null> {
    const r = this.recs.get(id);
    return r ? structuredClone(r) : null;
  }
  async update(id: string, expectedVersion: number, next: PackageBookingRecord): Promise<boolean> {
    const cur = this.recs.get(id);
    if (!cur || cur.stateVersion !== expectedVersion) return false;
    this.recs.set(id, structuredClone(next));
    return true;
  }
  async appendCompensationLog(id: string, entries: CompensationLogEntry[]): Promise<void> {
    const cur = this.recs.get(id);
    if (cur) cur.compensationLog.push(...entries);
  }
}

function makeDeps(over: Partial<CheckoutDeps> = {}) {
  const store = new FakeStore();
  const effects: SagaEffect["type"][] = [];
  let id = 0;
  const deps: CheckoutDeps = {
    store,
    effects: { run: async (_b, e) => void effects.push(e.type) },
    verifyFlight: async () => ({ priceChanged: false }),
    prebookFlight: async () => ({
      prebookId: "pb-f",
      transactionId: "txn-B",
      secretKey: "sec-B",
      expiresAt: "2026-08-10T12:15:00.000Z",
    }),
    prebookHotel: async () => ({ prebookId: "pb-h", transactionId: "txn-A", secretKey: "sec-A" }),
    bookHotel: async () => ({ bookingId: "hb-1" }),
    bookFlight: async () => ({ bookingId: "fb-1" }),
    newId: () => `pkg-${++id}`,
    now: () => new Date("2026-08-10T12:05:00Z"),
    ...over,
  };
  return { deps, store, effects };
}

const START = { contactEmail: "klient@example.com", amountHotelMinor: 160000, amountFlightMinor: 220000 };

test("pełny happy path: DRAFT → … → FLIGHT_BOOKED z deadline'em i mailem wznawiającym", async () => {
  const { deps, store, effects } = makeDeps();

  const id = await startPackageCheckout(deps, START);
  assert.equal(store.recs.get(id)?.sagaState, "DRAFT");
  assert.equal(store.recs.get(id)?.contactEmail, "klient@example.com");

  const hold = await holdFlight(deps, id, { offerId: "off-1" });
  assert.equal(hold.priceChanged, false);
  assert.equal(store.recs.get(id)?.sagaState, "FLIGHT_HELD");
  assert.equal(store.recs.get(id)?.txnFlight, "txn-B");

  const pre = await prebookHotelStep(deps, id, { rateId: "rate-1" });
  assert.equal(pre.transactionId, "txn-A");
  assert.equal(store.recs.get(id)?.sagaState, "HOTEL_PREBOOKED");

  const hotel = await confirmHotelPaidAndBook(deps, id);
  assert.deepEqual(hotel, { ok: true, hotelBookingId: "hb-1" });
  const rec = store.recs.get(id)!;
  assert.equal(rec.sagaState, "HOTEL_BOOKED_AWAITING_FLIGHT");
  // deadline = min(prebook 12:15, book 12:05 + 25 min) = 12:15 (TTL prebooka)
  assert.equal(rec.deadlineAt, "2026-08-10T12:15:00.000Z");
  assert.ok(effects.includes("SEND_RESUME_EMAIL"));

  const flight = await confirmFlightPaidAndBook(deps, id);
  assert.deepEqual(flight, { ok: true, flightBookingId: "fb-1" });
  assert.equal(store.recs.get(id)?.sagaState, "FLIGHT_BOOKED"); // CONFIRMED da webhook/polling
});

test("zmiana ceny na verify: ZERO prebooka, saga zostaje w DRAFT (decyzja wraca do UI)", async () => {
  let prebooked = false;
  const { deps, store } = makeDeps({
    verifyFlight: async () => ({ priceChanged: true, total: 2450 }),
    prebookFlight: async () => {
      prebooked = true;
      throw new Error("nie powinno być wywołane");
    },
  });
  const id = await startPackageCheckout(deps, START);
  const r = await holdFlight(deps, id, { offerId: "off-1" });
  assert.equal(r.priceChanged, true);
  assert.equal(r.priceChanged && r.total, 2450);
  assert.equal(prebooked, false);
  assert.equal(store.recs.get(id)?.sagaState, "DRAFT");
});

test("fail booku hotelu PO płatności: kompensacja (refund A) zamiast wyjątku do UI", async () => {
  const { deps, store, effects } = makeDeps({
    bookHotel: async () => {
      throw new Error("booking.book_error: sold out");
    },
  });
  const id = await startPackageCheckout(deps, START);
  await holdFlight(deps, id, { offerId: "off-1" });
  await prebookHotelStep(deps, id, { rateId: "rate-1" });

  const r = await confirmHotelPaidAndBook(deps, id);
  assert.deepEqual(r, { ok: false, compensated: true });
  assert.equal(store.recs.get(id)?.sagaState, "COMPENSATING");
  assert.ok(effects.includes("REFUND_HOTEL"));
  assert.ok(!effects.includes("CANCEL_HOTEL")); // book nie istnieje — nie ma czego anulować
});

test("permanent fail booku lotu: NEEDS_MANUAL_ACTION + pełna kompensacja + alert, bez wyjątku", async () => {
  const { deps, store, effects } = makeDeps({
    bookFlight: async () => {
      throw new Error("provider 500 po retry");
    },
  });
  const id = await startPackageCheckout(deps, START);
  await holdFlight(deps, id, { offerId: "off-1" });
  await prebookHotelStep(deps, id, { rateId: "rate-1" });
  await confirmHotelPaidAndBook(deps, id);

  const r = await confirmFlightPaidAndBook(deps, id);
  assert.deepEqual(r, { ok: false, manual: true });
  assert.equal(store.recs.get(id)?.sagaState, "NEEDS_MANUAL_ACTION");
  for (const e of ["REFUND_FLIGHT", "CANCEL_HOTEL", "REFUND_HOTEL", "ALERT_ADMIN"]) {
    assert.ok(effects.includes(e as SagaEffect["type"]), e);
  }
});

test("nieudana płatność (SDK) jest retryable — saga zostaje w miejscu z powodem", async () => {
  const { deps, store } = makeDeps();
  const id = await startPackageCheckout(deps, START);
  await holdFlight(deps, id, { offerId: "off-1" });
  await prebookHotelStep(deps, id, { rateId: "rate-1" });

  await reportPaymentFailure(deps, id, "hotel", "karta odrzucona");
  assert.equal(store.recs.get(id)?.sagaState, "HOTEL_PREBOOKED");
  assert.equal(store.recs.get(id)?.failureReason, "karta odrzucona");

  await confirmHotelPaidAndBook(deps, id);
  await reportPaymentFailure(deps, id, "flight", "3DS timeout");
  assert.equal(store.recs.get(id)?.sagaState, "HOTEL_BOOKED_AWAITING_FLIGHT");
});

test("duplikat potwierdzenia płatności hotelu nie psuje flow (ignored → book i tak idzie)", async () => {
  const { deps, store } = makeDeps();
  const id = await startPackageCheckout(deps, START);
  await holdFlight(deps, id, { offerId: "off-1" });
  await prebookHotelStep(deps, id, { rateId: "rate-1" });

  const first = await confirmHotelPaidAndBook(deps, id);
  assert.equal(first.ok, true);
  assert.equal(store.recs.get(id)?.sagaState, "HOTEL_BOOKED_AWAITING_FLIGHT");
});
