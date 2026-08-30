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

// ── KONTRAKT ZMIERZONY NA PRODUKCJI (2026-08-30) ─────────────────────────────
//
// Do 2026-08-30 zdanie „`secretKey` lotów to Stripe client secret" pochodziło
// z ANALOGII DO HOTELI. Na tej analogii stała bramka `payment_intent_mismatch`
// — jedyny werdykt „rejected" wydawany bez udziału Stripe'a. Fałszywa analogia
// oznaczałaby odrzucanie prawidłowo opłaconych transakcji.
//
// Pomiar: `pnpm probe:flight-binding` — 5 prebooków na produkcyjnym kluczu
// LiteAPI (WAW→BCN ×3, WAW→LHR ×2, różne oferty i przewoźnicy). W KAŻDYM:
//   • `secretKey` ma 60 znaków i kształt `pi_<id>_secret_<...>`,
//   • `paymentIntentIdFromSecret` wyciąga `pi_3UA…`,
//   • odczyt `GET api.stripe.com/v1/payment_intents/{id}?client_secret=…`
//     kluczem publishable z `payment-wrapper.liteapi.travel/config` zwraca
//     PaymentIntent o DOKŁADNIE tym `id` (bindingMatch = true, 5/5),
//   • `status` = `requires_payment_method` (utworzony, nieopłacony).
//
// Poniższe testy trzymają ten kontrakt. Zmiana długości/kształtu po stronie
// dostawcy ma tu zapalić czerwone światło, a nie po cichu zdegradować dowód.

test("ZMIERZONE: 60-znakowy client secret produkcyjny → wyciągamy pi_", () => {
  // Kształt i długość jak w pomiarze; wartości losowe, nie z produkcji.
  const secret = "pi_3UAbCdEfGhIjKlMnOpQr_secret_StUvWxYz0123456789ABC";
  const id = paymentIntentIdFromSecret(secret);
  assert.equal(id, "pi_3UAbCdEfGhIjKlMnOpQr");
  assert.ok(id!.startsWith("pi_"));
  // Sam sekret NIGDY nie może zostać w wyniku.
  assert.equal(id!.includes("_secret_"), false);
  assert.equal(id!.includes("StUvWxYz"), false);
});

test("ZMIERZONE: identyfikator z secretKey == payment_intent z adresu powrotu → przechodzi", () => {
  // Stripe dokleja do returnUrl `payment_intent` równy id PaymentIntentu,
  // którego client secret dostał widget. To jest zmierzone wiązanie.
  const secret = "pi_3UAbCdEfGhIjKlMnOpQr_secret_StUvWxYz0123456789ABC";
  const expected = paymentIntentIdFromSecret(secret);
  const ev = evaluatePaymentEvidence({
    expectedPaymentIntentId: expected,
    returnedPaymentIntentId: "pi_3UAbCdEfGhIjKlMnOpQr",
    redirectStatus: "succeeded",
  });
  assert.equal(ev.verdict, "consistent");
  assert.equal(ev.reason, "succeeded");
});

test("FAIL-SAFE: nierozpoznany format secretKey NIE blokuje płacącego klienta", () => {
  // Gdyby LiteAPI kiedyś przestało oddawać client secret, `expected` jest
  // `undefined` — i bramka mismatch MUSI wtedy milczeć, bo inaczej odcięłaby
  // ludzi, którzy zapłacili. Decyzję oddajemy LiteAPI.
  for (const dziwne of ["seti_123_secret_abc", "tok_abc", "pi__secret_x", "", "   "]) {
    const expected = paymentIntentIdFromSecret(dziwne);
    assert.equal(expected, undefined, `format ${JSON.stringify(dziwne)}`);
    const ev = evaluatePaymentEvidence({
      expectedPaymentIntentId: expected,
      returnedPaymentIntentId: "pi_cokolwiek",
      redirectStatus: "succeeded",
    });
    assert.notEqual(ev.verdict, "rejected");
    assert.equal(ev.verdict, "consistent");
  }
});
