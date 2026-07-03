// Rozróżnienie null vs "error" w batcherze cen jest fundamentem uczciwości
// listy wyników: null ukrywa hotel jako „potwierdzony brak miejsc", więc
// awaria sieci/endpointu NIE MOŻE się na null mapować (audyt 2026-07-03:
// padnięty /rates/batch wyświetlał „Brak dostępnych hoteli w tym terminie").
// Testujemy kontrakt fetchHotelPrice: sukces → SlimRate, pustka → null,
// podwójna porażka → "error", pojedyncza porażka → retry ratuje wynik.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { fetchHotelPrice, type PriceQuery, type SlimRate } from "./price-batcher";

const RATE: SlimRate = {
  totalAmount: 1234,
  currency: "PLN",
  offerId: "off-1",
  rateId: "rate-1",
};

function query(hotelId: string): PriceQuery {
  return {
    hotelId,
    checkin: "2026-07-17",
    checkout: "2026-07-19",
    adults: 2,
    children: [],
    rooms: 1,
    currency: "PLN",
  };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function okResponse(rates: Record<string, SlimRate | null>): Response {
  return new Response(JSON.stringify({ rates }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("sukces → SlimRate; hotel nieobecny w odpowiedzi → null (brak miejsc)", async () => {
  globalThis.fetch = async () => okResponse({ h1: RATE });
  const [priced, missing] = await Promise.all([
    fetchHotelPrice(query("h1")),
    fetchHotelPrice(query("h2")),
  ]);
  assert.deepEqual(priced, RATE);
  assert.equal(missing, null);
});

test("podwójna porażka fetcha → 'error', NIGDY null", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("network down");
  };
  const result = await fetchHotelPrice(query("h3"));
  assert.equal(result, "error");
  assert.equal(calls, 2, "dokładnie jedna ponowka");
});

test("porażka + udana ponowka → SlimRate (przejściowe czknięcie ratowane)", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("oops", { status: 500 });
    return okResponse({ h4: RATE });
  };
  const result = await fetchHotelPrice(query("h4"));
  assert.deepEqual(result, RATE);
  assert.equal(calls, 2);
});
