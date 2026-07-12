import assert from "node:assert/strict";
import { test } from "node:test";

import type { PackageFlightSummary, PackageHotelSummary } from "../types";

import { assemblePackageOffers, type PackageBaseFlight, type PackageHotelCandidate } from "./assembleOffers";
import { pln } from "./packagePricing";

// ── fixtures ──────────────────────────────────────────────────────────────────

function hotel(id: string, name: string): PackageHotelSummary {
  return {
    hotelId: id,
    name,
    freeCancellationUntil: "2026-07-30",
    hotelOfferId: `off-${id}`,
    nights: 3,
  };
}

function candidate(id: string, name: string, now: number, taxes?: number): PackageHotelCandidate {
  return {
    hotel: hotel(id, name),
    hotelNow: pln(now),
    ...(taxes !== undefined ? { taxesAtHotel: pln(taxes) } : {}),
  };
}

const flightSummary: PackageFlightSummary = { offerId: "flt-1", direct: true, carrierCode: "LO" };
const baseFlight: PackageBaseFlight = { summary: flightSummary, price: pln(2198) };

// ── testy ─────────────────────────────────────────────────────────────────────

test("każda oferta = hotel + ten sam lot bazowy; wycena per hotel", () => {
  const offers = assemblePackageOffers([candidate("a", "Hotel A", 1600)], baseFlight, 2);
  assert.equal(offers.length, 1);
  const o = offers[0];
  assert.equal(o.hotel.hotelId, "a");
  assert.equal(o.flight.offerId, "flt-1");
  assert.deepEqual(o.pricing.total, { amount: 3798, currency: "PLN" }); // 1600 + 2198
  assert.deepEqual(o.pricing.pricePerPerson, { amount: 1899, currency: "PLN" });
  assert.deepEqual(o.pricing.breakdown, {
    hotel: { amount: 1600, currency: "PLN" },
    flight: { amount: 2198, currency: "PLN" },
  });
});

test("lot bazowy jest wspólny — różni się tylko część hotelowa", () => {
  const offers = assemblePackageOffers(
    [candidate("a", "Hotel A", 1600), candidate("b", "Hotel B", 2000)],
    baseFlight,
    2,
  );
  assert.deepEqual(
    offers.map((o) => o.pricing.breakdown.flight),
    [{ amount: 2198, currency: "PLN" }, { amount: 2198, currency: "PLN" }],
  );
});

test("oferty posortowane rosnąco po cenie/os. (najtańszy pakiet na górze)", () => {
  const offers = assemblePackageOffers(
    [candidate("pricey", "Pricey", 3000), candidate("cheap", "Cheap", 1200), candidate("mid", "Mid", 2000)],
    baseFlight,
    2,
  );
  assert.deepEqual(offers.map((o) => o.hotel.hotelId), ["cheap", "mid", "pricey"]);
});

test("taxesAtHotel przenoszone do oferty, NIE wliczane do total ani ceny/os.", () => {
  const offers = assemblePackageOffers([candidate("a", "Hotel A", 1600, 150)], baseFlight, 2);
  assert.deepEqual(offers[0].pricing.total, { amount: 3798, currency: "PLN" }); // bez podatków
  assert.deepEqual(offers[0].pricing.taxesAtHotel, { amount: 150, currency: "PLN" });
});

test("pusta lista kandydatów → pusta lista ofert", () => {
  assert.deepEqual(assemblePackageOffers([], baseFlight, 2), []);
});

test("adults < 1 rzuca (dzielenie ceny per osoba niemożliwe)", () => {
  assert.throws(() => assemblePackageOffers([candidate("a", "A", 1600)], baseFlight, 0));
});
