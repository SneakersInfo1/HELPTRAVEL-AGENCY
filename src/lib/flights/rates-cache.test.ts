import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import { RedisUnavailableError } from "../redis/requester";
import {
  flightRatesCacheKey,
  flightSummaryKey,
  getCachedFlightOffers,
  getCachedFlightSummary,
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

// ── Transakcja lista + skrót (Codex, przegląd 2, #9) ────────────────────────
// MULTI/EXEC nie wycofuje jednej odrzuconej komendy, gdy druga przeszła.
// Skrót nie może wtedy przeżyć ze starym albo cudzym minimum.

function txRedis(execImpl: (ops: Array<[string, unknown]>) => Promise<unknown>) {
  const store = new Map<string, unknown>();
  const deleted: string[] = [];
  return {
    store,
    deleted,
    client: {
      async get<T = unknown>(k: string): Promise<T | null> { return (store.get(k) as T) ?? null; },
      async set(k: string, v: unknown): Promise<unknown> { store.set(k, v); return "OK"; },
      async del(...keys: string[]): Promise<unknown> { for (const k of keys) { deleted.push(k); store.delete(k); } return keys.length; },
      multi() {
        const ops: Array<[string, unknown]> = [];
        return {
          set(k: string, v: unknown) { ops.push([k, v]); return this; },
          exec: () => execImpl(ops),
        };
      },
    },
  };
}

test("transakcja: lista i skrót zapisane razem (ten sam TTL), odczyt skrótu bez listy", async () => {
  const r = txRedis(async (ops) => { for (const [k, v] of ops) r.store.set(k, v); return ops.map(() => "OK"); });
  __setFlightRatesRedisForTests(r.client);
  const key = flightRatesCacheKey(baseInput);
  await setCachedFlightOffers(key, [sampleOffer]);
  assert.ok(r.store.has(key));
  assert.ok(r.store.has(flightSummaryKey(key)));
  assert.equal((await getCachedFlightSummary(key))?.count, 1);
});

test("transakcja: odrzucona POZYCJA (serwer odpowiedział) → skrót skasowany, nie zostaje stare minimum", async () => {
  const r = txRedis(async (ops) => {
    // pierwsza komenda (lista) przeszła, druga (skrót) odrzucona — jak SDK: wyjątek z exec()
    r.store.set(ops[0][0], ops[0][1]);
    throw new Error("Command 2 [ set ] failed: ERR value is too large");
  });
  __setFlightRatesRedisForTests(r.client);
  const key = flightRatesCacheKey(baseInput);
  r.store.set(flightSummaryKey(key), { min: 199, count: 3, at: 1 }); // skrót z POPRZEDNIEJ listy
  await setCachedFlightOffers(key, [sampleOffer]);
  assert.deepEqual(r.deleted, [flightSummaryKey(key)]);
  assert.equal(r.store.has(flightSummaryKey(key)), false, "brak skrótu = brak ceny, nigdy cena spoza listy");
});

test("transakcja: żądanie na pewno NIEWYKONANE (wyłącznik, limit planu, autoryzacja, adres) → bez dodatkowego DEL", async () => {
  for (const reason of ["circuit_open", "quota", "auth", "config"] as const) {
    const r = txRedis(async () => { throw new RedisUnavailableError(reason); });
    __setFlightRatesRedisForTests(r.client);
    await setCachedFlightOffers(flightRatesCacheKey(baseInput), [sampleOffer]);
    assert.deepEqual(r.deleted, [], reason);
  }
});

// Codex, przegląd 3: zgubiona odpowiedź (timeout, zerwane połączenie) może
// ukrywać EXEC, w którym jedna komenda przeszła, a druga nie.
test("transakcja: timeout / sieć / błąd serwera → skrót skasowany (wynik EXEC nieznany)", async () => {
  for (const reason of ["timeout", "network", "server"] as const) {
    const r = txRedis(async () => { throw new RedisUnavailableError(reason); });
    __setFlightRatesRedisForTests(r.client);
    const key = flightRatesCacheKey(baseInput);
    await setCachedFlightOffers(key, [sampleOffer]);
    assert.deepEqual(r.deleted, [flightSummaryKey(key)], reason);
  }
});

// Codex, przegląd 4 (M1): sprzątające DEL bywa niemożliwe (obwód otwarty tuż
// po nieudanym EXEC), więc skrót może przez chwilę odpowiadać innej liście tej
// samej trasy. Gwarancja: skrót jest zawsze minimum z PRAWDZIWEJ odpowiedzi
// dostawcy i nigdy starszy niż maksymalny wiek samej listy (40 min) — także
// gdy klucz straciłby TTL.
test("skrót: rozjechany z listą, ale nigdy starszy niż lista może być (40 min) — potem pudło", async () => {
  const r = mapRedis();
  __setFlightRatesRedisForTests(r.client);
  const key = flightRatesCacheKey(baseInput);
  const minute = 60_000;
  r.store.set(flightSummaryKey(key), { min: 450, count: 3, at: Date.now() - 39 * minute });
  assert.equal((await getCachedFlightSummary(key))?.min, 450, "39 min — w oknie listy");
  r.store.set(flightSummaryKey(key), { min: 450, count: 3, at: Date.now() - 42 * minute });
  assert.equal(await getCachedFlightSummary(key), null, "42 min — starszy niż lista może być");
  r.store.set(flightSummaryKey(key), { min: 450, count: 3 });
  assert.equal(await getCachedFlightSummary(key), null, "bez znacznika czasu — pudło");
  r.store.set(flightSummaryKey(key), { min: 450, count: 3, at: "wczoraj" });
  assert.equal(await getCachedFlightSummary(key), null);
});

test("skrót: min zawsze z PRAWDZIWEJ listy dostawcy (nigdy wymyślony), count = jej długość", async () => {
  const r = mapRedis();
  __setFlightRatesRedisForTests(r.client);
  const key = flightRatesCacheKey(baseInput);
  const offers = [{ ...sampleOffer, offerId: "a", total: 812 }, { ...sampleOffer, offerId: "b", total: 640 }];
  await setCachedFlightOffers(key, offers);
  const s = await getCachedFlightSummary(key);
  assert.equal(s?.count, 2);
  assert.equal(s?.min, 640);
  assert.ok(typeof s?.at === "number" && Date.now() - s.at < 5_000);
});
