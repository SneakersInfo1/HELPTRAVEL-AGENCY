import assert from "node:assert/strict";
import { test } from "node:test";
import type { DestinationPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import { destinationPriceKey } from "@/lib/prices/destination-price-snapshot";
import { getMoodBySlug, TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import { rankTripCandidates, resolveThemeCities } from "./trip-search";

const now = Date.UTC(2026, 6, 7);
function entry(pkg: number) {
  return { hotelFromPlnPerNight: 200, checkin: "2026-08-10", checkout: "2026-08-17", computedAt: now,
    pkgPerPersonPln: pkg, pkgCheckin: "2026-08-10", pkgCheckout: "2026-08-17", pkgComputedAt: now };
}
const snap: DestinationPriceSnapshot = {
  [destinationPriceKey("Malaga", "Spain")]: entry(1800),
  [destinationPriceKey("Barcelona", "Spain")]: entry(2600),
  [destinationPriceKey("Dubai", "UAE")]: entry(5200), // ponad budżet
};

test("rankTripCandidates: zwraca tylko ≤ budżet, posortowane rosnąco", () => {
  const cities = [
    { cityEn: "Malaga", countryEn: "Spain", cityPl: "Malaga" },
    { cityEn: "Barcelona", countryEn: "Spain", cityPl: "Barcelona" },
    { cityEn: "Dubai", countryEn: "UAE", cityPl: "Dubaj" },
  ];
  const out = rankTripCandidates(cities, snap, { budgetPln: 3000, budgetKind: "per_person" }, now);
  assert.deepEqual(out.map((c) => c.cityEn), ["Malaga", "Barcelona"]);
});

test("rankTripCandidates: budżet 'za dwoje' dzieli próg na 2", () => {
  const cities = [{ cityEn: "Barcelona", countryEn: "Spain", cityPl: "Barcelona" }]; // 2600/os
  // 3000 za dwoje = 1500/os → Barcelona (2600/os) odpada
  assert.equal(rankTripCandidates(cities, snap, { budgetPln: 3000, budgetKind: "total_two" }, now).length, 0);
});

test("rankTripCandidates: brak świeżego pakietu → kierunek pomijany (nie zgadujemy)", () => {
  const cities = [{ cityEn: "Nieznane", countryEn: "X", cityPl: "Nieznane" }];
  assert.equal(rankTripCandidates(cities, snap, { budgetPln: 9999, budgetKind: "per_person" }, now).length, 0);
});

test("resolveThemeCities: znany slug zwraca niepustą, odduplikowaną listę; nieznany → []", () => {
  const knownSlug = TRAVEL_MOODS[0].slug;
  const mood = getMoodBySlug(knownSlug);
  assert.ok(mood, "fixture sanity: mood exists");
  const out = resolveThemeCities(knownSlug);
  assert.ok(out.length > 0);
  const seen = new Set(out.map((c) => `${c.cityEn}|${c.countryEn}`));
  assert.equal(seen.size, out.length, "brak duplikatów cityEn+countryEn");

  assert.deepEqual(resolveThemeCities("nieistniejacy-slug"), []);
});
