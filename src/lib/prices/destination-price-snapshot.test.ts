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

// ── Pakiety „Cały wyjazd od X zł/os." (2026-07-03) ────────────────────────
// Uczciwość pakietu: lot i hotel z TEGO SAMEGO okna dat; cena na osobę przy
// 2 os. = lot(1 os.) + noce × hotel(pokój 2 os.) / 2, zaokrąglane W GÓRĘ
// (nigdy nie zaniżamy sumy).

test("computePackagePerPerson: lot + noce×hotel/2, ceil w górę", async () => {
  const { computePackagePerPerson } = await import("./destination-price-snapshot");
  // 7 nocy × 200 zł / 2 os. = 700; + lot 500 = 1200
  assert.equal(computePackagePerPerson(500, 200, "2026-10-17", "2026-10-24"), 1200);
  // 7 × 333 / 2 = 1165,5; + 500 = 1665,5 → 1666 (ceil, nie floor)
  assert.equal(computePackagePerPerson(500, 333, "2026-10-17", "2026-10-24"), 1666);
});

test("computePackagePerPerson: nonsens (0 nocy, ujemne, NaN) → null", async () => {
  const { computePackagePerPerson } = await import("./destination-price-snapshot");
  assert.equal(computePackagePerPerson(500, 200, "2026-10-17", "2026-10-17"), null);
  assert.equal(computePackagePerPerson(0, 200, "2026-10-17", "2026-10-24"), null);
  assert.equal(computePackagePerPerson(500, -1, "2026-10-17", "2026-10-24"), null);
  assert.equal(computePackagePerPerson(Number.NaN, 200, "2026-10-17", "2026-10-24"), null);
});

test("pickFreshPackage: świeży wpis z pkg → dane; stary/brak pkg → null", async () => {
  const { pickFreshPackage, PRICE_FRESH_MS } = await import("./destination-price-snapshot");
  const now = Date.now();
  const key = destinationPriceKey("Malaga", "Spain");
  const base = { hotelFromPlnPerNight: 200, checkin: "2026-10-17", checkout: "2026-10-24", computedAt: now };
  const withPkg: DestinationPriceSnapshot = {
    [key]: { ...base, pkgPerPersonPln: 1200, pkgCheckin: "2026-10-17", pkgCheckout: "2026-10-24", pkgComputedAt: now },
  };
  assert.deepEqual(pickFreshPackage(withPkg, "Malaga", "Spain", now), {
    perPersonPln: 1200,
    checkin: "2026-10-17",
    checkout: "2026-10-24",
  });
  const stale: DestinationPriceSnapshot = {
    [key]: { ...withPkg[key], pkgComputedAt: now - PRICE_FRESH_MS - 1 },
  };
  assert.equal(pickFreshPackage(stale, "Malaga", "Spain", now), null);
  const noPkg: DestinationPriceSnapshot = { [key]: base };
  assert.equal(pickFreshPackage(noPkg, "Malaga", "Spain", now), null);
  assert.equal(pickFreshPackage(null, "Malaga", "Spain", now), null);
});
