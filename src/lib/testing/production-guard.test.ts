// Bezpiecznik „test nie dotyka produkcji" — testy samego bezpiecznika.
//
// Uwaga na ironię: te testy same działają POD bezpiecznikiem, więc
// `isRunningUnderTest()` jest tu prawdziwe. To dobrze — sprawdzamy zachowanie
// dokładnie w warunkach, w których ma działać.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProductionAccessInTestError,
  assertNoProductionStoreInTests,
  assertNoProviderWriteInTests,
  isProviderWritePath,
  isRunningUnderTest,
} from "./production-guard";

test("pod runnerem testów bezpiecznik jest AKTYWNY", () => {
  // Gdyby to kiedyś przestało być prawdą, cała ochrona milcząco znika —
  // dlatego jest to osobna asercja, a nie założenie.
  assert.equal(isRunningUnderTest(), true);
});

test("połączenie z prawdziwym Upstash pod testem → rzuca", () => {
  assert.throws(() => assertNoProductionStoreInTests("loty"), ProductionAccessInTestError);
});

test("błąd bezpiecznika NIE jest błędem „store niedostępny”", async () => {
  // To rozróżnienie jest istotne: `FlightStoreUnavailableError` jest łapany na
  // ścieżce prebooka i zamieniany na HTTP 503. Gdyby bezpiecznik rzucał tym
  // samym typem, zapomniana atrapa dałaby zielony test opisujący 503.
  const { FlightStoreUnavailableError } = await import("@/lib/flights/session");
  try {
    assertNoProductionStoreInTests("loty");
    assert.fail("powinno rzucić");
  } catch (e) {
    assert.ok(e instanceof ProductionAccessInTestError);
    assert.ok(!(e instanceof FlightStoreUnavailableError));
  }
});

test("rozpoznaje ścieżki ZAPISU u dostawcy", () => {
  for (const url of [
    "https://book.liteapi.travel/v3.0/flights/prebooks",
    "https://book.liteapi.travel/v3.0/flights/bookings",
    "https://book.liteapi.travel/v3.0/rates/prebook",
    "https://book.liteapi.travel/v3.0/bookings/abc/cancel",
  ]) {
    assert.equal(isProviderWritePath(url), true, url);
  }
});

test("odczyty NIE są traktowane jak zapisy", () => {
  for (const url of [
    "https://api.liteapi.travel/v3.0/flights/rates",
    "https://api.liteapi.travel/v3.0/data/hotel?hotelId=x",
    "https://api.liteapi.travel/v3.0/data/places",
    "https://api.liteapi.travel/v3.0/hotels/rates",
  ]) {
    assert.equal(isProviderWritePath(url), false, url);
  }
});

test("zapis do dostawcy z ZAMOCKOWANYM fetch przechodzi (tak działają istniejące testy)", () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}")) as typeof fetch;
  try {
    assertNoProviderWriteInTests("https://book.liteapi.travel/v3.0/flights/prebooks");
  } finally {
    globalThis.fetch = orig;
  }
});

test("zapis do dostawcy z PRAWDZIWYM fetch → rzuca", () => {
  // `globalThis.fetch` nietknięty — dokładnie sytuacja „ktoś zapomniał mocka".
  assert.throws(
    () => assertNoProviderWriteInTests("https://book.liteapi.travel/v3.0/flights/prebooks"),
    ProductionAccessInTestError,
  );
});

test("odczyt z prawdziwym fetch przechodzi — nie utrudniamy życia bez powodu", () => {
  assertNoProviderWriteInTests("https://api.liteapi.travel/v3.0/flights/rates");
});
