// Sesja C2 — IATA resolution regression. The user reported intermittent
// "Nie udalo się ustalic kodu lotniska (IATA)" errors. The cause was a
// sparse `airportCodesByKey` map in location.ts: only ~30 cities were
// covered out of the ~200 in `destination-catalog.ts`. Anything in the
// gap that wasn't also enumerated in `ORIGIN_GROUPS`/`DESTINATION_GROUPS`
// hard-errored the flight search.
//
// These tests pin the invariant going forward: every catalog city MUST
// resolve to an IATA on both the origin and destination paths. If someone
// adds a new city to the catalog without an airport mapping, this test
// fails loudly.

import { test } from "node:test";
import assert from "node:assert/strict";

import { getOriginAirports, getDestinationAirports } from "./airport-groups";
import { destinationCatalog } from "./destination-catalog";
import { POLISH_ORIGIN_CITIES, EUROPEAN_ORIGIN_CITIES } from "./origin-cities";

test("every destination-catalog city resolves to at least one IATA", () => {
  const failures: string[] = [];
  for (const entry of destinationCatalog) {
    const dest = getDestinationAirports(entry.city);
    if (dest.length === 0) {
      failures.push(`destination: ${entry.city}, ${entry.country}`);
    }
    // Catalog cities are usually destinations, but a user could still
    // type one into the SKĄD field — make sure that path resolves too.
    const orig = getOriginAirports(entry.city);
    if (orig.length === 0) {
      failures.push(`origin: ${entry.city}, ${entry.country}`);
    }
  }
  assert.equal(
    failures.length,
    0,
    `IATA lookup failed for ${failures.length} cities: ${failures.slice(0, 5).join("; ")}${failures.length > 5 ? "..." : ""}`,
  );
});

test("every origin-cities entry resolves to at least one IATA", () => {
  const failures: string[] = [];
  for (const city of [...POLISH_ORIGIN_CITIES, ...EUROPEAN_ORIGIN_CITIES]) {
    const orig = getOriginAirports(city.city);
    if (orig.length === 0) {
      failures.push(`${city.city} (${city.iata})`);
    }
  }
  assert.equal(failures.length, 0, `Origin lookup failed for: ${failures.join(", ")}`);
});

test("Polish exonyms resolve to the same IATA as canonical English forms", () => {
  // Catches the "user typed/URL leaked a Polish name" case. Each pair
  // must map to the same IATA so the search behaves identically whether
  // the input is "Lisbon" or "Lizbona".
  const pairs: Array<[english: string, polish: string]> = [
    ["Lisbon", "Lizbona"],
    ["Rome", "Rzym"],
    ["Milan", "Mediolan"],
    ["Paris", "Paryż"],
    ["London", "Londyn"],
    ["Vienna", "Wiedeń"],
    ["Munich", "Monachium"],
    ["Athens", "Ateny"],
    ["Florence", "Florencja"],
    ["Naples", "Neapol"],
    ["Venice", "Wenecja"],
    ["Pisa", "Piza"],
    ["Bologna", "Bolonia"],
    ["Stockholm", "Sztokholm"],
    ["Copenhagen", "Kopenhaga"],
    ["Istanbul", "Stambuł"],
    ["New York", "Nowy Jork"],
    ["Krakow", "Kraków"],
    ["Warsaw", "Warszawa"],
  ];
  for (const [english, polish] of pairs) {
    const en = getDestinationAirports(english);
    const pl = getDestinationAirports(polish);
    assert.ok(en.length > 0, `English form '${english}' must resolve`);
    assert.ok(pl.length > 0, `Polish form '${polish}' must resolve`);
    assert.equal(
      pl[0].iata,
      en[0].iata,
      `'${polish}' (${pl[0].iata}) must map to the same primary IATA as '${english}' (${en[0].iata})`,
    );
  }
});

test('"City, Country" labels (the dropdown queryValue format) still resolve', () => {
  // The autocomplete picks `Lisbon, Portugal` as the queryValue; if the URL
  // ever forwards that whole string (older bookmarks, share-links) we
  // must still pull an IATA from the first token.
  const cases = [
    "Lisbon, Portugal",
    "Milan, Italy",
    "Pisa, Italy",
    "Limassol, Cyprus",
    "Las Palmas, Spain",
  ];
  for (const label of cases) {
    const result = getDestinationAirports(label);
    assert.ok(result.length > 0, `'${label}' must resolve to at least one IATA`);
  }
});
