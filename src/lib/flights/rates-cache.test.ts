import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  setCachedFlightOffers,
  __setFlightRatesRedisForTests,
  __resetFlightRatesRedisForTests,
} from "./rates-cache";
import type { FlightSearchInput } from "./types";
import type { DisplayOffer } from "./display";

afterEach(() => __resetFlightRatesRedisForTests());

const baseInput: FlightSearchInput = {
  legs: [{ origin: "WAW", destination: "BCN", date: "2026-08-10", direction: "OUTBOUND" }],
  adults: 1, children: 0, infants: 0, cabinClass: "ECONOMY", currency: "PLN", country: "PL",
};

const sampleOffer: DisplayOffer = {
  offerId: "o1", total: 500, currency: "PLN", legs: [], maxDurationMinutes: 120,
  hasCheckedBag: false, hasCarryOnBag: true, fares: [],
};

function mapRedis() {
  const store = new Map<string, unknown>();
  const ttl = new Map<string, number | undefined>();
  return {
    store,
    ttl,
    client: {
      async get<T = unknown>(k: string): Promise<T | null> { return (store.get(k) as T) ?? null; },
      async set(k: string, v: unknown, opts?: { ex?: number }): Promise<unknown> {
        store.set(k, v);
        ttl.set(k, opts?.ex);
        return "OK";
      },
    },
  };
}

test("klucz: deterministyczny i stabilny", () => {
  assert.equal(flightRatesCacheKey(baseInput), flightRatesCacheKey({ ...baseInput }));
});

test("klucz: round-trip (2 legi) różny od one-way", () => {
  const rt: FlightSearchInput = {
    ...baseInput,
    legs: [...baseInput.legs, { origin: "BCN", destination: "WAW", date: "2026-08-17", direction: "INBOUND" }],
  };
  assert.notEqual(flightRatesCacheKey(baseInput), flightRatesCacheKey(rt));
});

test("klucz: inna liczba pasażerów → inny klucz", () => {
  assert.notEqual(flightRatesCacheKey(baseInput), flightRatesCacheKey({ ...baseInput, adults: 2 }));
});

test("brak Redis → get=null, set nie rzuca", async () => {
  __setFlightRatesRedisForTests(null);
  assert.equal(await getCachedFlightOffers("k"), null);
  await setCachedFlightOffers("k", [sampleOffer]); // nie może rzucić
});

test("round-trip z mock Redis: set → get zwraca te same oferty", async () => {
  const { client } = mapRedis();
  __setFlightRatesRedisForTests(client);
  await setCachedFlightOffers("k1", [sampleOffer]);
  assert.deepEqual(await getCachedFlightOffers("k1"), [sampleOffer]);
});

test("v2: wartość w Redis to gzip+base64 (string, magic H4sI), nie surowa tablica", async () => {
  const { client, store } = mapRedis();
  __setFlightRatesRedisForTests(client);
  await setCachedFlightOffers("k-gz", [sampleOffer]);
  const stored = store.get("k-gz");
  assert.equal(typeof stored, "string");
  assert.ok((stored as string).startsWith("H4sI"), "gzip magic w base64");
});

test("v2: stary format (surowa tablica z wpisu v1) → miss, nie crash", async () => {
  const { client, store } = mapRedis();
  __setFlightRatesRedisForTests(client);
  store.set("k-old", [sampleOffer]);
  assert.equal(await getCachedFlightOffers("k-old"), null);
});

test("pusta lista (negatywny cache) zapisana i odczytana jako []", async () => {
  const { client } = mapRedis();
  __setFlightRatesRedisForTests(client);
  await setCachedFlightOffers("empty", []);
  assert.deepEqual(await getCachedFlightOffers("empty"), []);
});

test("TTL: on-demand=600s, warm=2400s, pusta=600s (prewarming przeżywa cykl crona)", async () => {
  const { client, ttl } = mapRedis();
  __setFlightRatesRedisForTests(client);
  await setCachedFlightOffers("k-ondemand", [sampleOffer]);
  await setCachedFlightOffers("k-warm", [sampleOffer], "warm");
  await setCachedFlightOffers("k-empty", []);
  assert.equal(ttl.get("k-ondemand"), 600);
  assert.equal(ttl.get("k-warm"), 2400);
  assert.equal(ttl.get("k-empty"), 600);
});

test("błąd klienta Redis → miss (get=null), set połknięty", async () => {
  __setFlightRatesRedisForTests({
    async get() { throw new Error("boom"); },
    async set() { throw new Error("boom"); },
  });
  assert.equal(await getCachedFlightOffers("k"), null);
  await setCachedFlightOffers("k", [sampleOffer]); // nie może rzucić
});
