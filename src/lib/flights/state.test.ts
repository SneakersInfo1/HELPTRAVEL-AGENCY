// Maszyna stanów rezerwacji lotu — gwarancje przejść.
//
// Najważniejszy test w tym pliku to ten, który sprawdza, że NIE DA SIĘ dojść
// do „potwierdzone" bez „opłacone". Reszta pilnuje, żeby ścieżki awaryjne nie
// przeskakiwały etapów.

import assert from "node:assert/strict";
import { test } from "node:test";

import { canTransition, checkFlightTransition, flightFlowState, type FlightStatePair } from "./state";

const pair = (paymentStatus: FlightStatePair["paymentStatus"], bookingStatus: FlightStatePair["bookingStatus"], priceGatePassed?: boolean): FlightStatePair => ({
  paymentStatus,
  bookingStatus,
  priceGatePassed,
});

// ── Odwzorowanie pary pól na stan ────────────────────────────────────────────

test("stan wyliczany z pary pól, nie zapisywany osobno", () => {
  assert.equal(flightFlowState(pair("pending", "intent")), "PRICE_ACCEPTED");
  assert.equal(flightFlowState(pair("pending", "prebooked", true)), "PAYMENT_CREATED");
  assert.equal(flightFlowState(pair("pending", "prebooked", false)), "PAYMENT_BLOCKED");
  assert.equal(flightFlowState(pair("processing", "prebooked", true)), "PAYMENT_PROCESSING");
  assert.equal(flightFlowState(pair("failed", "prebooked", true)), "PAYMENT_FAILED");
  assert.equal(flightFlowState(pair("processing", "booking")), "BOOKING_STARTED");
  assert.equal(flightFlowState(pair("paid", "confirmed")), "BOOKING_CONFIRMED");
  assert.equal(flightFlowState(pair("processing", "manual_review")), "BOOKING_UNCERTAIN");
});

test("sesja sprzed bramki kwoty (priceGatePassed=undefined) NIE jest blokowana", () => {
  // Rekordy sprzed 2026-08-29 nie mają flagi. Traktowanie ich jak zablokowanych
  // unieważniłoby żywe sesje w locie.
  assert.equal(flightFlowState(pair("pending", "prebooked", undefined)), "PAYMENT_CREATED");
});

// ── TWARDY INWARIANT ─────────────────────────────────────────────────────────

test("NIE DA SIĘ przejść do BOOKING_CONFIRMED bez paymentStatus=paid", () => {
  for (const from of [pair("pending", "prebooked", true), pair("processing", "booking"), pair("failed", "prebooked", true)]) {
    for (const payment of ["pending", "processing", "failed"] as const) {
      const check = checkFlightTransition(from, pair(payment, "confirmed"));
      assert.equal(check.ok, false, `${payment} → confirmed przeszło`);
      assert.equal(check.reason, "confirmed_without_payment");
    }
  }
});

test("pending_confirmation też wymaga opłacenia — dostawca trzyma miejsce za pieniądze", () => {
  const check = checkFlightTransition(pair("processing", "booking"), pair("processing", "pending_confirmation"));
  assert.equal(check.ok, false);
  assert.equal(check.reason, "confirmed_without_payment");
});

test("PAYMENT_PROCESSING → BOOKING_CONFIRMED jest niemożliwe wprost", () => {
  // To jest scenariusz z §3 briefu: bez udowodnionego PAYMENT_SUCCEEDED nie ma
  // potwierdzenia. Odrzucenie następuje na inwariancie, zanim w ogóle dojdzie
  // do sprawdzania tabeli.
  const check = checkFlightTransition(pair("processing", "prebooked", true), pair("processing", "confirmed"));
  assert.equal(check.ok, false);
});

test("legalna ścieżka szczęśliwa przechodzi w całości", () => {
  assert.equal(checkFlightTransition(pair("pending", "intent"), pair("pending", "prebooked", true)).ok, true);
  assert.equal(checkFlightTransition(pair("pending", "prebooked", true), pair("processing", "booking")).ok, true);
  assert.equal(checkFlightTransition(pair("processing", "booking"), pair("paid", "confirmed")).ok, true);
});

// ── Ślepe uliczki i ponowienia ───────────────────────────────────────────────

test("PAYMENT_BLOCKED nie prowadzi do żadnej płatności ani rezerwacji", () => {
  for (const to of ["PAYMENT_CREATED", "PAYMENT_PROCESSING", "BOOKING_STARTED", "BOOKING_CONFIRMED"] as const) {
    assert.equal(canTransition("PAYMENT_BLOCKED", to), false, to);
  }
});

test("stany końcowe są końcowe", () => {
  for (const to of ["BOOKING_CONFIRMED", "BOOKING_STARTED", "PAYMENT_CREATED"] as const) {
    assert.equal(canTransition("BOOKING_CANCELLED", to), false, `cancelled → ${to}`);
    assert.equal(canTransition("BOOKING_FAILED", to), false, `failed → ${to}`);
  }
});

test("po nieudanej próbie płatności klient może ponowić w tym samym prebooku", () => {
  assert.equal(canTransition("PAYMENT_FAILED", "BOOKING_STARTED"), true);
  assert.equal(canTransition("PAYMENT_FAILED", "PAYMENT_PROCESSING"), true);
});

test("„failed” po potwierdzeniu jest ignorowane, nie cofa rezerwacji (1.4.7)", () => {
  assert.equal(canTransition("BOOKING_CONFIRMED", "BOOKING_FAILED"), false);
  assert.equal(canTransition("BOOKING_CONFIRMED", "BOOKING_UNCERTAIN"), false);
  // Anulowanie przez przewoźnika jest jedyną legalną zmianą po potwierdzeniu.
  assert.equal(canTransition("BOOKING_CONFIRMED", "BOOKING_CANCELLED"), true);
});

test("zapis tego samego stanu jest zawsze legalny (idempotentny refresh i webhook)", () => {
  const confirmed = pair("paid", "confirmed");
  assert.equal(checkFlightTransition(confirmed, confirmed).ok, true);
  assert.equal(canTransition("BOOKING_CANCELLED", "BOOKING_CANCELLED"), true);
});

test("ręczna weryfikacja może się rozwiązać w obie strony", () => {
  assert.equal(canTransition("BOOKING_UNCERTAIN", "BOOKING_CONFIRMED"), true);
  assert.equal(canTransition("BOOKING_UNCERTAIN", "BOOKING_FAILED"), true);
  // …ale nadal nie bez opłacenia:
  assert.equal(
    checkFlightTransition(pair("processing", "manual_review"), pair("processing", "confirmed")).ok,
    false,
  );
});
