// isHotelNotFoundError — rozpoznaje „hotel naprawdę nie istnieje" dla strony
// szczegółów. Subtelne, bo LiteAPI dla złego hotelId zwraca 400/4002 (nie 404),
// a 4002 dzieli z prebookiem (wygasła oferta). Regresja tu = albo martwe hotele
// wracają jako 500 (źle dla SEO), albo przejściowy błąd udaje 404 (znów martwy
// hotel na 6h). Dlatego pilnujemy tego testem.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isHotelNotFoundError,
  liteApiErrorFromResponse,
  LiteApiNetworkError,
  LiteApiTimeoutError,
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
