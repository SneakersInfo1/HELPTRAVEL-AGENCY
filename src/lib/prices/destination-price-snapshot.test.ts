import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlimRate } from "../hotels/rate-cache";
import {
  __resetDestinationPriceRedisForTests,
  __setDestinationPriceRedisForTests,
  destinationPriceKey,
  isFreshPrice,
  mergePriceSnapshot,
  minPerNightFromRates,
  minTotalFromOffers,
  pickFreshFlightPrice,
  pickFreshPrice,
  pricePerNight,
  readPriceSnapshot,
  type DestinationPriceSnapshot,
} from "./destination-price-snapshot";

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async <T>(k: string) => (store.has(k) ? (store.get(k) as T) : null),
    set: async (k: string, v: unknown) => {
      store.set(k, v);
      return "OK";
    },
  };
}

function slim(totalAmount: number): SlimRate {
  return { totalAmount, currency: "PLN", offerId: "o", rateId: "r" };
}

test("destinationPriceKey: foldowany, stabilny, diakrytyki i wielkość liter nie rozjeżdżają klucza", () => {
  assert.equal(destinationPriceKey("Malaga", "Spain"), destinationPriceKey("MALAGA", "spain"));
  assert.equal(destinationPriceKey("Málaga", "Spain"), destinationPriceKey("Malaga", "Spain"));
  assert.notEqual(destinationPriceKey("Palma", "Spain"), destinationPriceKey("Parma", "Italy"));
});

test("pricePerNight: total/noce zaokrąglone w dół; nonsensy → null", () => {
  assert.equal(pricePerNight(800, "2026-08-10", "2026-08-12"), 400); // 2 noce
  assert.equal(pricePerNight(999, "2026-08-10", "2026-08-12"), 499); // floor
  assert.equal(pricePerNight(500, "2026-08-10", "2026-08-11"), 500); // 1 noc
  assert.equal(pricePerNight(500, "2026-08-10", "2026-08-10"), null); // 0 nocy
  assert.equal(pricePerNight(500, "2026-08-12", "2026-08-10"), null); // ujemne
  assert.equal(pricePerNight(0, "2026-08-10", "2026-08-12"), null); // total 0
  assert.equal(pricePerNight(-5, "2026-08-10", "2026-08-12"), null);
});

test("isFreshPrice: świeży <48h tak, starszy nie, zepsuty wpis nie", () => {
  const now = Date.now();
  const entry = { hotelFromPlnPerNight: 300, checkin: "2026-08-10", checkout: "2026-08-12", computedAt: now - 1000 };
  assert.equal(isFreshPrice(entry, now), true);
  assert.equal(isFreshPrice({ ...entry, computedAt: now - 49 * 3600 * 1000 }, now), false);
  assert.equal(isFreshPrice({ ...entry, computedAt: Number.NaN }, now), false);
  assert.equal(isFreshPrice(undefined, now), false);
});

test("minPerNightFromRates: minimum po hotelach z ceną; null-e i puste ignorowane", () => {
  const rates: Record<string, SlimRate | null> = { h1: slim(900), h2: slim(600), h3: null };
  assert.equal(minPerNightFromRates(rates, "2026-08-10", "2026-08-13"), 200); // 600/3
  assert.equal(minPerNightFromRates({ h: null }, "2026-08-10", "2026-08-13"), null);
  assert.equal(minPerNightFromRates({}, "2026-08-10", "2026-08-13"), null);
});

test("merge + read: nowe wpisy dochodzą, istniejące nadpisywane, nieobecne PRZEŻYWAJĄ", async () => {
  const r = fakeRedis();
  __setDestinationPriceRedisForTests(r);
  const now = Date.now();
  const a: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: { hotelFromPlnPerNight: 300, checkin: "a", checkout: "b", computedAt: now },
  };
  await mergePriceSnapshot(a);
  const b: DestinationPriceSnapshot = {
    [destinationPriceKey("Rome", "Italy")]: { hotelFromPlnPerNight: 450, checkin: "a", checkout: "b", computedAt: now },
  };
  await mergePriceSnapshot(b);
  const snap = await readPriceSnapshot();
  assert.ok(snap);
  assert.equal(snap![destinationPriceKey("Malaga", "Spain")].hotelFromPlnPerNight, 300);
  assert.equal(snap![destinationPriceKey("Rome", "Italy")].hotelFromPlnPerNight, 450);
  __resetDestinationPriceRedisForTests();
});

test("pickFreshPrice: zwraca cenę tylko dla świeżego wpisu istniejącego kierunku", () => {
  const now = Date.now();
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: { hotelFromPlnPerNight: 300, checkin: "a", checkout: "b", computedAt: now },
    [destinationPriceKey("Rome", "Italy")]: { hotelFromPlnPerNight: 450, checkin: "a", checkout: "b", computedAt: now - 72 * 3600 * 1000 },
  };
  assert.equal(pickFreshPrice(snap, "Malaga", "Spain", now), 300);
  assert.equal(pickFreshPrice(snap, "Rome", "Italy", now), null); // stęchły
  assert.equal(pickFreshPrice(snap, "Atlantis", "Nowhere", now), null); // brak
  assert.equal(pickFreshPrice(null, "Malaga", "Spain", now), null); // brak snapshotu
});

// ── Faza 6: ceny lotów w tym samym snapshotcie ───────────────────────────────

test("minTotalFromOffers: minimum po totalach, null-e pomijane, floor do zł", () => {
  assert.equal(minTotalFromOffers([{ total: 899.99 }, { total: 420.5 }, { total: null }]), 420);
  assert.equal(minTotalFromOffers([{ total: null }]), null);
  assert.equal(minTotalFromOffers([]), null);
  assert.equal(minTotalFromOffers([{ total: 0 }, { total: -5 }]), null); // nonsensy
});

test("pickFreshFlightPrice: świeżość liczona z flightComputedAt (osobno od hotelu)", () => {
  const now = Date.now();
  const key = destinationPriceKey("Barcelona", "Spain");
  const snap: DestinationPriceSnapshot = {
    [key]: {
      hotelFromPlnPerNight: 300,
      checkin: "a",
      checkout: "b",
      computedAt: now,
      flightFromPln: 450,
      flightDepart: "2026-09-05",
      flightReturn: "2026-09-12",
      flightComputedAt: now - 1000,
    },
  };
  assert.equal(pickFreshFlightPrice(snap, "Barcelona", "Spain", now), 450);
  // Stęchły lot (>48h) → null, mimo świeżego hotelu.
  snap[key].flightComputedAt = now - 49 * 3600 * 1000;
  assert.equal(pickFreshFlightPrice(snap, "Barcelona", "Spain", now), null);
  assert.equal(pickFreshPrice(snap, "Barcelona", "Spain", now), 300, "hotel dalej świeży");
  // Wpis bez pól lotu (np. brak IATA) → null, bez wyjątku.
  delete snap[key].flightFromPln;
  delete snap[key].flightComputedAt;
  assert.equal(pickFreshFlightPrice(snap, "Barcelona", "Spain", now), null);
  assert.equal(pickFreshFlightPrice(null, "Barcelona", "Spain", now), null);
});

test("read bez env/seama → null (degrade-to-miss, nigdy wyjątek)", async () => {
  __setDestinationPriceRedisForTests(null);
  assert.equal(await readPriceSnapshot(), null);
  await mergePriceSnapshot({}); // nie może rzucić
  __resetDestinationPriceRedisForTests();
});
