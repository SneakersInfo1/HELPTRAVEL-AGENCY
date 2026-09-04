import assert from "node:assert/strict";
import { test } from "node:test";
import type { DestinationPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import { destinationPriceKey } from "@/lib/prices/destination-price-snapshot";
import { getMoodBySlug, TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import seedJson from "../../../data/destinations.json";
import { rankTripCandidates, resolveThemeCities, type SeedDestinationLike } from "./trip-search";

// Lookup seedu do wstrzyknięcia: te same DANE (data/destinations.json) i ta
// sama semantyka dopasowania co getDestinationByCityCountry z
// @/lib/mvp/destinations-seed (city.en|city.pl + country en/pl/code,
// case-insensitive). Nie importujemy tego modułu wprost, bo jego
// `import "server-only"` nie rozwiązuje się pod `node --import tsx --test`.
interface SeedDestRecord extends SeedDestinationLike {
  country: { code: string | null; en: string; pl: string };
}
const seedDestinations = (seedJson as { destinations: SeedDestRecord[] }).destinations;
function seedLookup(city: string, country?: string): SeedDestRecord | undefined {
  const targetCity = city.trim().toLowerCase();
  const targetCountry = country?.trim().toLowerCase();
  return seedDestinations.find((d) => {
    const matchCity =
      d.city.en.toLowerCase() === targetCity || d.city.pl.toLowerCase() === targetCity;
    if (!matchCity) return false;
    if (!targetCountry) return true;
    return (
      d.country.en.toLowerCase() === targetCountry ||
      d.country.pl.toLowerCase() === targetCountry ||
      d.country.code?.toLowerCase() === targetCountry
    );
  });
}

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
  const out = resolveThemeCities(knownSlug, seedLookup);
  assert.ok(out.length > 0);
  const seen = new Set(out.map((c) => `${c.cityEn}|${c.countryEn}`));
  assert.equal(seen.size, out.length, "brak duplikatów cityEn+countryEn");

  assert.deepEqual(resolveThemeCities("nieistniejacy-slug", seedLookup), []);
});

test("resolveThemeCities: każdy pick z każdego motywu trafia w rekord seedu (klucze cen z crona)", () => {
  // Cron warm-rates pisze snapshot pod destinationPriceKey(seed.city.en,
  // seed.country.en). Każdy zwrócony kierunek MUSI produkować dokładnie taki
  // klucz — inaczej nigdy nie trafi w cenę i będzie po cichu znikał
  // (regresja: pick „Palma de Mallorca" vs seed „Palma").
  const cronKeys = new Set(seedDestinations.map((d) => destinationPriceKey(d.city.en, d.country.en)));
  for (const mood of TRAVEL_MOODS) {
    const cities = resolveThemeCities(mood.slug, seedLookup);
    assert.ok(cities.length > 0, `motyw ${mood.slug} bez kierunków`);
    for (const c of cities) {
      assert.ok(
        cronKeys.has(destinationPriceKey(c.cityEn, c.countryEn)),
        `Brak rekordu seedu dla ${c.cityEn}|${c.countryEn} (motyw ${mood.slug})`,
      );
    }
  }
});

// ── Długość pobytu: ranking musi porównywać porównywalne ──────────────────
// Zmierzone na PRODUKCYJNYM snapshocie (2026-09-04): 31 kierunków wycenionych
// na 4 noce (październik) i 15 na 7 nocy (listopad), w JEDNEJ liście. Sortowanie
// po kwocie bezwzględnej stawiało więc krótsze pobyty na górze niezależnie od
// tego, czy są tańsze — sześć najtańszych pozycji to były same pakiety 4-nocne.
const nowT = Date.UTC(2026, 6, 7);
function entryNights(hotelPerNight: number, flight: number, checkin: string, checkout: string) {
  return {
    hotelFromPlnPerNight: hotelPerNight,
    checkin,
    checkout,
    computedAt: nowT,
    flightFromPln: flight,
    flightDepart: checkin,
    flightReturn: checkout,
    flightComputedAt: nowT,
    pkgPerPersonPln:
      flight + Math.ceil((hotelPerNight * Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000)) / 2),
    pkgCheckin: checkin,
    pkgCheckout: checkout,
    pkgComputedAt: nowT,
  };
}

// Krótki: 4 noce, hotel 400/noc → 800/os. hotelu + 500 lotu = 1300/os.
// Długi:  7 nocy, hotel 200/noc → 700/os. hotelu + 500 lotu = 1200/os.
// Przy 7 nocach TANI jest ten drugi (1200 < 1650), mimo że w snapshocie
// pakiet krótki wygląda na tańszy per capita tylko dzięki liczbie nocy.
const snapNights: DestinationPriceSnapshot = {
  [destinationPriceKey("Krotki", "X")]: entryNights(400, 500, "2026-10-19", "2026-10-23"),
  [destinationPriceKey("Dlugi", "X")]: entryNights(200, 500, "2026-11-07", "2026-11-14"),
};
const citiesNights = [
  { cityEn: "Krotki", countryEn: "X", cityPl: "Krotki" },
  { cityEn: "Dlugi", countryEn: "X", cityPl: "Dlugi" },
];

test("rankTripCandidates: bez podanych nocy zachowuje dotychczasowe zachowanie", () => {
  const out = rankTripCandidates(citiesNights, snapNights, { budgetPln: 9999, budgetKind: "per_person" }, nowT);
  // Krotki = 1300/os. (4 noce), Dlugi = 1200/os. (7 nocy) — sort rosnaco.
  assert.deepEqual(out.map((c) => c.cityEn), ["Dlugi", "Krotki"]);
});

test("rankTripCandidates: podane nights przelicza pakiet na ŻĄDANĄ długość pobytu", () => {
  const out = rankTripCandidates(
    citiesNights,
    snapNights,
    { budgetPln: 9999, budgetKind: "per_person" },
    nowT,
    { nights: 7 },
  );
  // Na 7 nocy: Krotki = 500 + 7*400/2 = 1900; Dlugi = 500 + 7*200/2 = 1200.
  assert.deepEqual(out.map((c) => c.cityEn), ["Dlugi", "Krotki"]);
  assert.deepEqual(out.map((c) => c.perPersonPln), [1200, 1900]);
  assert.deepEqual(out.map((c) => c.nights), [7, 7]);
});

test("rankTripCandidates: nights filtruje budżet na przeliczonej cenie, nie snapshotowej", () => {
  // Snapshotowy pakiet Krotkiego to 1300/os., ale na 7 nocy wychodzi 1900 —
  // przy budżecie 1500 NIE MOŻE się zakwalifikować.
  const out = rankTripCandidates(
    citiesNights,
    snapNights,
    { budgetPln: 1500, budgetKind: "per_person" },
    nowT,
    { nights: 7 },
  );
  assert.deepEqual(out.map((c) => c.cityEn), ["Dlugi"]);
});
