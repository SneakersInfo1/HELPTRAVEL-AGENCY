// Testy maszyny stanów sagi (§3.4) — każdy scenariusz kompensacji ze spec,
// duplikaty webhook/polling (ignored), przejścia spoza tabeli (invalid).

import test from "node:test";
import assert from "node:assert/strict";

import { AWAITING_FLIGHT_MAX_MS, computeDeadline, transition } from "./sagaMachine";
import type { SagaEvent, SagaSnapshot, PackageSagaState } from "./sagaTypes";

function snap(state: PackageSagaState, over: Partial<SagaSnapshot> = {}): SagaSnapshot {
  return { state, txnFlightHistory: [], prebookExpiresAt: null, ...over };
}

function effectTypes(r: ReturnType<typeof transition>): string[] {
  return r.effects.map((e) => e.type);
}

// ── computeDeadline: min(TTL prebooka, 25 min) ────────────────────────────────

test("deadline = koniec holdu prebooka, gdy wcześniejszy niż 25 min", () => {
  const booked = new Date("2026-08-10T12:00:00Z");
  const prebook = new Date("2026-08-10T12:10:00Z");
  assert.equal(computeDeadline(booked, prebook).toISOString(), prebook.toISOString());
});

test("deadline = +25 min, gdy prebook żyje dłużej", () => {
  const booked = new Date("2026-08-10T12:00:00Z");
  const prebook = new Date("2026-08-10T13:00:00Z");
  assert.equal(computeDeadline(booked, prebook).getTime(), booked.getTime() + AWAITING_FLIGHT_MAX_MS);
});

test("deadline = +25 min, gdy brak TTL prebooka", () => {
  const booked = new Date("2026-08-10T12:00:00Z");
  assert.equal(computeDeadline(booked, null).getTime(), booked.getTime() + AWAITING_FLIGHT_MAX_MS);
});

// ── Ścieżka szczęśliwa: DRAFT → … → CONFIRMED ────────────────────────────────

test("pełna ścieżka szczęśliwa przechodzi wszystkie stany i emituje właściwe efekty", () => {
  let s = snap("DRAFT");
  const step = (event: SagaEvent) => {
    const r = transition(s, event);
    assert.equal(r.kind, "applied", `${event.type} w ${s.state}: ${r.reason ?? ""}`);
    s = {
      state: r.next,
      txnFlightHistory: r.patch.txnFlightHistory ?? s.txnFlightHistory,
      prebookExpiresAt: r.patch.prebookExpiresAt !== undefined ? r.patch.prebookExpiresAt : s.prebookExpiresAt,
    };
    return r;
  };

  let r = step({
    type: "FLIGHT_PREBOOK_OK",
    flightPrebookId: "pb-1",
    txnFlight: "txn-B",
    prebookExpiresAt: "2026-08-10T12:15:00Z",
  });
  assert.equal(s.state, "FLIGHT_HELD");
  assert.deepEqual(s.txnFlightHistory, ["txn-B"]);

  // Attach bagaży: B → B' (stary intent martwy — historia rośnie).
  r = step({ type: "SERVICES_ATTACHED", txnFlight: "txn-B2" });
  assert.equal(s.state, "FLIGHT_HELD");
  assert.deepEqual(s.txnFlightHistory, ["txn-B", "txn-B2"]);
  assert.equal(r.patch.txnFlight, "txn-B2");

  step({ type: "HOTEL_PREBOOK_OK", hotelPrebookId: "hpb-1", txnHotel: "txn-A" });
  assert.equal(s.state, "HOTEL_PREBOOKED");

  step({ type: "HOTEL_PAYMENT_OK" });
  assert.equal(s.state, "HOTEL_PAID");

  r = step({ type: "HOTEL_BOOK_OK", hotelBookingId: "hb-1", hotelBookedAt: "2026-08-10T12:05:00Z" });
  assert.equal(s.state, "HOTEL_BOOKED_AWAITING_FLIGHT");
  assert.deepEqual(effectTypes(r), ["SCHEDULE_DEADLINE", "SEND_RESUME_EMAIL"]);
  // min(prebook 12:15, book+25min=12:30) = 12:15 (TTL prebooka krótszy)
  assert.equal(r.patch.deadlineAt, "2026-08-10T12:15:00.000Z");

  step({ type: "FLIGHT_PAYMENT_OK" });
  assert.equal(s.state, "FLIGHT_PAID");

  step({ type: "FLIGHT_BOOK_OK", flightBookingId: "fb-1" });
  assert.equal(s.state, "FLIGHT_BOOKED");

  r = step({ type: "FLIGHT_CONFIRMED" });
  assert.equal(s.state, "CONFIRMED");
  assert.deepEqual(effectTypes(r), ["SEND_CONFIRMATION_EMAIL", "TRACK"]);
});

// ── Kompensacje ze spec §3.4 ─────────────────────────────────────────────────

test("fail płatności hotelu: retry w miejscu, ZERO efektów/zwrotów", () => {
  const r = transition(snap("HOTEL_PREBOOKED"), { type: "HOTEL_PAYMENT_FAILED", reason: "karta odrzucona" });
  assert.equal(r.kind, "applied");
  assert.equal(r.next, "HOTEL_PREBOOKED");
  assert.deepEqual(r.effects, []);
  assert.equal(r.patch.failureReason, "karta odrzucona");
});

test("fail booku hotelu PO płatności: refund A, BEZ anulacji hotelu (book nie istnieje)", () => {
  const r = transition(snap("HOTEL_PAID"), { type: "HOTEL_BOOK_FAILED", reason: "booking.book_error" });
  assert.equal(r.next, "COMPENSATING");
  assert.deepEqual(effectTypes(r), ["REFUND_HOTEL", "SEND_REFUND_EMAIL", "TRACK"]);
  assert.ok(!effectTypes(r).includes("CANCEL_HOTEL"));
});

test("deadline między checkoutami: cancel hotelu + refund A + e-mail + GA4 abandoned", () => {
  const r = transition(snap("HOTEL_BOOKED_AWAITING_FLIGHT"), { type: "DEADLINE_REACHED" });
  assert.equal(r.next, "COMPENSATING");
  assert.deepEqual(effectTypes(r), ["CANCEL_HOTEL", "REFUND_HOTEL", "SEND_REFUND_EMAIL", "TRACK"]);
  const track = r.effects.find((e) => e.type === "TRACK");
  assert.equal(track && "event" in track ? track.event : null, "package_abandoned_between_checkouts");
});

test("fail płatności lotu: retryable w oknie (stan bez zmian, bez kompensacji)", () => {
  const r = transition(snap("HOTEL_BOOKED_AWAITING_FLIGHT"), { type: "FLIGHT_PAYMENT_FAILED", reason: "3DS fail" });
  assert.equal(r.kind, "applied");
  assert.equal(r.next, "HOTEL_BOOKED_AWAITING_FLIGHT");
  assert.deepEqual(r.effects, []);
});

test("permanent fail booku lotu po płatności: refund B' + cancel + refund A + alert + NEEDS_MANUAL_ACTION", () => {
  const r = transition(snap("FLIGHT_PAID"), { type: "FLIGHT_BOOK_FAILED_PERMANENT", reason: "provider 500" });
  assert.equal(r.next, "NEEDS_MANUAL_ACTION");
  assert.deepEqual(effectTypes(r), ["REFUND_FLIGHT", "CANCEL_HOTEL", "REFUND_HOTEL", "ALERT_ADMIN", "TRACK"]);
});

test("flight.book.expired po booku lotu = jak permanent fail", () => {
  const r = transition(snap("FLIGHT_BOOKED"), { type: "FLIGHT_EXPIRED" });
  assert.equal(r.next, "NEEDS_MANUAL_ACTION");
  assert.deepEqual(effectTypes(r), ["REFUND_FLIGHT", "CANCEL_HOTEL", "REFUND_HOTEL", "ALERT_ADMIN", "TRACK"]);
});

test("rezygnacja przed pieniędzmi (DRAFT/FLIGHT_HELD/HOTEL_PREBOOKED) → CANCELLED bez efektów", () => {
  for (const state of ["DRAFT", "FLIGHT_HELD", "HOTEL_PREBOOKED"] as const) {
    const r = transition(snap(state), { type: "USER_ABANDONED" });
    assert.equal(r.next, "CANCELLED", state);
    assert.deepEqual(r.effects, []);
  }
});

test("USER_ABANDONED po zaksięgowanych pieniądzach jest invalid (od tego są kompensacje)", () => {
  const r = transition(snap("HOTEL_BOOKED_AWAITING_FLIGHT"), { type: "USER_ABANDONED" });
  assert.equal(r.kind, "invalid");
  assert.equal(r.next, "HOTEL_BOOKED_AWAITING_FLIGHT");
});

test("FLIGHT_REHELD: nowy prebook/txn w oknie oczekiwania, historia rośnie, deadline BEZ zmian", () => {
  const r = transition(snap("HOTEL_BOOKED_AWAITING_FLIGHT", { txnFlightHistory: ["txn-B"] }), {
    type: "FLIGHT_REHELD",
    flightPrebookId: "pb-2",
    txnFlight: "txn-B2",
    prebookExpiresAt: "2026-08-10T12:40:00Z",
  });
  assert.equal(r.kind, "applied");
  assert.equal(r.next, "HOTEL_BOOKED_AWAITING_FLIGHT");
  assert.deepEqual(r.patch.txnFlightHistory, ["txn-B", "txn-B2"]);
  assert.equal(r.patch.flightPrebookId, "pb-2");
  assert.equal(r.patch.deadlineAt, undefined); // nigdy nie przedłużamy okna
  assert.deepEqual(r.effects, []);

  // Poza oknem = invalid (np. po opłaceniu lotu).
  assert.equal(
    transition(snap("FLIGHT_PAID"), { type: "FLIGHT_REHELD", flightPrebookId: "x", txnFlight: "y", prebookExpiresAt: null }).kind,
    "invalid",
  );
});

test("USER_CANCELLED_AWAITING: kompensacja jak deadline, powód = rezygnacja klienta", () => {
  const r = transition(snap("HOTEL_BOOKED_AWAITING_FLIGHT"), { type: "USER_CANCELLED_AWAITING" });
  assert.equal(r.next, "COMPENSATING");
  assert.deepEqual(effectTypes(r), ["CANCEL_HOTEL", "REFUND_HOTEL", "SEND_REFUND_EMAIL", "TRACK"]);
  assert.match(r.patch.failureReason ?? "", /rezygnacja klienta/);
  assert.equal(transition(snap("HOTEL_PAID"), { type: "USER_CANCELLED_AWAITING" }).kind, "invalid");
});

test("COMPENSATION_DONE domyka kompensację → REFUNDED", () => {
  const r = transition(snap("COMPENSATING"), { type: "COMPENSATION_DONE" });
  assert.equal(r.next, "REFUNDED");
});

// ── Idempotencja / wyścigi webhook vs polling ────────────────────────────────

test("zdarzenia w stanach terminalnych są ignorowane (no-op)", () => {
  for (const state of ["CONFIRMED", "CANCELLED", "REFUNDED", "NEEDS_MANUAL_ACTION"] as const) {
    const r = transition(snap(state), { type: "FLIGHT_CONFIRMED" });
    assert.equal(r.kind, "ignored", state);
    assert.equal(r.next, state);
    assert.deepEqual(r.effects, []);
  }
});

test("DEADLINE_REACHED poza oknem oczekiwania jest ignorowany (cron strzela po fakcie)", () => {
  for (const state of ["FLIGHT_PAID", "FLIGHT_BOOKED", "HOTEL_PAID"] as const) {
    const r = transition(snap(state), { type: "DEADLINE_REACHED" });
    assert.equal(r.kind, "ignored", state);
  }
});

test("duplikat HOTEL_PAYMENT_OK / FLIGHT_PAYMENT_OK jest ignorowany", () => {
  assert.equal(transition(snap("HOTEL_PAID"), { type: "HOTEL_PAYMENT_OK" }).kind, "ignored");
  assert.equal(transition(snap("FLIGHT_PAID"), { type: "FLIGHT_PAYMENT_OK" }).kind, "ignored");
});

test("przejście spoza tabeli = invalid, stan bez zmian, zero efektów", () => {
  const r = transition(snap("DRAFT"), { type: "FLIGHT_BOOK_OK", flightBookingId: "x" });
  assert.equal(r.kind, "invalid");
  assert.equal(r.next, "DRAFT");
  assert.deepEqual(r.effects, []);
  assert.match(r.reason ?? "", /niedozwolone/);
});

test("SERVICES_ATTACHED po opłaceniu lotu jest invalid (intent już skonsumowany)", () => {
  const r = transition(snap("FLIGHT_PAID"), { type: "SERVICES_ATTACHED", txnFlight: "txn-B3" });
  assert.equal(r.kind, "invalid");
});

test("SERVICES_ATTACHED dozwolony między checkoutami (przed płatnością lotu)", () => {
  const r = transition(snap("HOTEL_BOOKED_AWAITING_FLIGHT", { txnFlightHistory: ["a", "b"] }), {
    type: "SERVICES_ATTACHED",
    txnFlight: "c",
  });
  assert.equal(r.kind, "applied");
  assert.deepEqual(r.patch.txnFlightHistory, ["a", "b", "c"]);
});
