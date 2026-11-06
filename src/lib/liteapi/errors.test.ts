// isHotelNotFoundError — rozpoznaje „hotel naprawdę nie istnieje" dla strony
// szczegółów. Subtelne, bo LiteAPI dla złego hotelId zwraca 400/4002 (nie 404),
// a 4002 dzieli z prebookiem (wygasła oferta). Regresja tu = albo martwe hotele
// wracają jako 500 (źle dla SEO), albo przejściowy błąd udaje 404 (znów martwy
// hotel na 6h). Dlatego pilnujemy tego testem.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isHotelNotFoundError,
  isNoAvailabilityBody,
  liteApiErrorFromResponse,
  LiteApiNetworkError,
  LiteApiTimeoutError,
  LiteApiUnknownError,
  LiteApiValidationError,
} from "./errors";

test("404 → not found", () => {
  assert.equal(isHotelNotFoundError(liteApiErrorFromResponse(404, null)), true);
});

test("400 + code 4002 (zmierzony kształt LiteAPI dla złego hotelId) → not found", () => {
  const err = liteApiErrorFromResponse(400, {
    error: { code: 4002, description: "hotelId is missing or invalid" },
  });
  assert.equal(isHotelNotFoundError(err), true);
});

test("400 + opis 'hotelId ... invalid' bez kodu → not found", () => {
  const err = liteApiErrorFromResponse(400, { error: { description: "The hotelId is invalid" } });
  assert.equal(isHotelNotFoundError(err), true);
});

test("400 niezwiązane (inny błąd walidacji wejścia) → NIE not found", () => {
  const err = liteApiErrorFromResponse(400, { error: { code: 1234, description: "bad checkin date" } });
  assert.equal(isHotelNotFoundError(err), false);
});

test("przejściowe: 5xx/sieć/timeout/walidacja → NIE not found (mają lecieć jako błąd, nie 404)", () => {
  assert.equal(isHotelNotFoundError(liteApiErrorFromResponse(503, null)), false);
  assert.equal(isHotelNotFoundError(new LiteApiNetworkError("net")), false);
  assert.equal(isHotelNotFoundError(new LiteApiTimeoutError("timeout")), false);
  assert.equal(isHotelNotFoundError(new LiteApiValidationError("zod")), false);
});

test("nie-LiteApiError (zwykły Error) → false", () => {
  assert.equal(isHotelNotFoundError(new Error("boom")), false);
  assert.equal(isHotelNotFoundError(null), false);
});

// ── 2001 „no availability" (prebook hotelu) ──────────────────────────────────
// Logi Vercela 2026-11-03: `400 "2001: no prebook availability"`. Dokumentacja
// LiteAPI („API Errors for booking workflow"): prebook 2001 = HTTP 400/409,
// „Offer no longer available…", zalecenie: nowe wyszukiwanie, świeża oferta.

test("isNoAvailabilityBody: kod 2001 (liczba albo tekst) → true", () => {
  assert.equal(
    isNoAvailabilityBody({ error: { code: 2001, message: "no availability found" } }),
    true,
  );
  assert.equal(isNoAvailabilityBody({ error: { code: "2001" } }), true);
});

test("isNoAvailabilityBody: bez kodu, ale treść „no (prebook) availability” → true", () => {
  assert.equal(isNoAvailabilityBody({ error: { message: "no prebook availability" } }), true);
  assert.equal(isNoAvailabilityBody({ error: { description: "No availability found" } }), true);
});

test("isNoAvailabilityBody: inne błędy dostawcy i śmieci → false", () => {
  // 4002 = wygasła/nieprawidłowa oferta — ma własną ścieżkę (PREBOOK_EXPIRED).
  assert.equal(isNoAvailabilityBody({ error: { code: 4002, message: "invalid offerId" } }), false);
  assert.equal(
    isNoAvailabilityBody({ error: { code: 5000, message: "unable to process request" } }),
    false,
  );
  assert.equal(isNoAvailabilityBody({ error: { code: 2013, message: "booking failed" } }), false);
  assert.equal(isNoAvailabilityBody({ error: "no availability" }), false);
  assert.equal(isNoAvailabilityBody("2001: no prebook availability"), false);
  assert.equal(isNoAvailabilityBody(null), false);
  assert.equal(isNoAvailabilityBody(undefined), false);
});

// Wspólny mapper obsługuje też LOTY i wyszukiwanie hoteli. Gdyby to on
// zamieniał 2001 na „sold out", loty po cichu zmieniłyby klasyfikację (przy
// booku lotu — po płatności) z VALIDATION na OFFER_UNAVAILABLE, a trasy
// wyszukiwania hoteli zwracałyby „pokój niedostępny" na liście wyników.
// 2001 jest przemapowywane WYŁĄCZNIE w prebooku hotelu (prebook.ts).
test("wspólny mapper NIE przemapowuje 2001 — loty i wyszukiwanie zachowują dotychczasową klasyfikację", () => {
  const err = liteApiErrorFromResponse(400, {
    error: { code: 2001, message: "no prebook availability" },
  });
  assert.ok(err instanceof LiteApiUnknownError);
  assert.equal(err.internalCode, "LITEAPI_UNKNOWN");
});
