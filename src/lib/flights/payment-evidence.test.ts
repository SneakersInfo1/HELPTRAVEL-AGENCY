// Dowód płatności — co wolno, a czego NIE WOLNO uznać za opłacone.
//
// Testy pilnują kierunku fail-safe: brak parametrów nikogo nie blokuje
// (inaczej zmiana w widgecie odcięłaby płacących klientów), ale parametr
// świadczący PRZECIW płatności blokuje twardo.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluatePaymentEvidence,
  isPaymentDisprovedByBookingFailure,
  paymentIntentIdFromSecret,
} from "./payment-evidence";

// ── Wyciąganie identyfikatora z client secret ────────────────────────────────

test("paymentIntentIdFromSecret: `pi_x_secret_y` → `pi_x`, sekret zostaje odcięty", () => {
  assert.equal(paymentIntentIdFromSecret("pi_3Ab9XyZ0000001_secret_kLmNoPqRsTu"), "pi_3Ab9XyZ0000001");
});

test("paymentIntentIdFromSecret: wszystko, co nie jest client secretem → undefined", () => {
  for (const bad of [undefined, null, "", "sk_live_abc", "pi_secret_only", "_secret_x", "abc_secret_def", 42 as unknown as string]) {
    assert.equal(paymentIntentIdFromSecret(bad as string | undefined), undefined, `nie powinno przejść: ${String(bad)}`);
  }
});

// ── Werdykty ─────────────────────────────────────────────────────────────────

test("brak parametrów → `unverified` (autorytetem zostaje LiteAPI, nie blokujemy)", () => {
  const e = evaluatePaymentEvidence({ expectedPaymentIntentId: "pi_1" });
  assert.equal(e.verdict, "unverified");
  assert.equal(e.reason, "no_params");
});

test("redirect_status=succeeded + zgodny payment_intent → `consistent`", () => {
  const e = evaluatePaymentEvidence({
    expectedPaymentIntentId: "pi_1",
    returnedPaymentIntentId: "pi_1",
    redirectStatus: "succeeded",
  });
  assert.equal(e.verdict, "consistent");
});

test("redirect_status=failed → `rejected` (nie ma pieniędzy, nie ma bookingu)", () => {
  const e = evaluatePaymentEvidence({ expectedPaymentIntentId: "pi_1", returnedPaymentIntentId: "pi_1", redirectStatus: "failed" });
  assert.equal(e.verdict, "rejected");
  assert.equal(e.reason, "redirect_failed");
});

test("statusy PaymentIntentu świadczące przeciw płatności → `rejected`", () => {
  for (const s of ["canceled", "cancelled", "requires_payment_method", "FAILED"]) {
    assert.equal(evaluatePaymentEvidence({ redirectStatus: s }).verdict, "rejected", s);
  }
});

test("statusy w toku (3DS/SCA, opóźniona metoda) → `processing`, NIE bookujemy", () => {
  for (const s of ["pending", "processing", "requires_action", "requires_confirmation", "requires_capture"]) {
    assert.equal(evaluatePaymentEvidence({ redirectStatus: s }).verdict, "processing", s);
  }
});

test("payment_intent z INNEJ transakcji → `rejected` nawet przy succeeded (replay)", () => {
  const e = evaluatePaymentEvidence({
    expectedPaymentIntentId: "pi_mine",
    returnedPaymentIntentId: "pi_someone_else",
    redirectStatus: "succeeded",
  });
  assert.equal(e.verdict, "rejected");
  assert.equal(e.reason, "payment_intent_mismatch");
});

test("nieznany payment_intent bez naszego odniesienia NIE jest odrzucany (sesje sprzed zmiany)", () => {
  // Rekordy utworzone przed 2026-08-29 nie mają `paymentIntentId`. Odrzucanie
  // ich znaczyłoby blokowanie ludzi, którzy JUŻ zapłacili.
  const e = evaluatePaymentEvidence({ returnedPaymentIntentId: "pi_x", redirectStatus: "succeeded" });
  assert.equal(e.verdict, "consistent");
});

test("nieznany status + identyfikator → `unverified`, nie `consistent`", () => {
  // Sam identyfikator niczego nie dowodzi: jest w adresie także wtedy, gdy
  // płatność się nie powiodła.
  const e = evaluatePaymentEvidence({ expectedPaymentIntentId: "pi_1", returnedPaymentIntentId: "pi_1", redirectStatus: "wat" });
  assert.equal(e.verdict, "unverified");
  assert.equal(e.reason, "unknown_status");
});

// ── Klasyfikacja porażki bookingu ────────────────────────────────────────────

test("odmowa walidacyjna 4xx bez dowodu zapłaty → płatności NIE BYŁO", () => {
  assert.equal(
    isPaymentDisprovedByBookingFailure({ evidence: "unverified", errorCode: "VALIDATION", liteApiStatus: 400 }),
    true,
  );
});

test("ta sama odmowa, ale Stripe potwierdził sukces → NIE podważamy płatności", () => {
  assert.equal(
    isPaymentDisprovedByBookingFailure({ evidence: "consistent", errorCode: "VALIDATION", liteApiStatus: 400 }),
    false,
  );
});

test("5xx / sieć / timeout → NIEROZSTRZYGNIĘTE, nigdy „płatności nie było”", () => {
  for (const c of [
    { errorCode: "PROVIDER_ERROR", liteApiStatus: 500 },
    { errorCode: "UNKNOWN", liteApiStatus: undefined },
    { errorCode: "OFFER_UNAVAILABLE", liteApiStatus: 409 },
  ]) {
    assert.equal(isPaymentDisprovedByBookingFailure({ evidence: "unverified", ...c }), false, c.errorCode);
  }
});
