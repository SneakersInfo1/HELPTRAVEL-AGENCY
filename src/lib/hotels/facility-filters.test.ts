// Etap 6 przebudowy sekcji hotelowej — filtry marki i udogodnień.
//
// Filtr, który po kliknięciu daje zero wyników, jest gorszy niż jego brak:
// psuje zaufanie do WSZYSTKICH pozostałych filtrów. Te testy pilnują, że
// pokazujemy tylko to, co bieżąca pula faktycznie obsłuży (brief §9).

import assert from "node:assert/strict";
import { test } from "node:test";

import { availableChains, availableFacilityFilters, facilityGroupsFor } from "./facility-filters";

test("grupy: klucz filtra mapuje się na WSZYSTKIE warianty ID danego pojęcia", () => {
  const [pool] = facilityGroupsFor(["pool"]);
  // „Basen wewnętrzny", „na zewnątrz", „sezonowy", „na dachu" — jedno pojęcie.
  assert.ok(pool.length > 1, "basen powinien mieć kilka ID");
  assert.ok(pool.includes(103) && pool.includes(104));
});

test("grupy: nieznany klucz jest pomijany, nie wywraca filtrowania", () => {
  assert.deepEqual(facilityGroupsFor(["nie-ma-takiego"]), []);
  assert.equal(facilityGroupsFor(["pool", "nie-ma-takiego"]).length, 1);
});

test("dostępne filtry: pokazujemy TYLKO te, które coś znajdą, z liczbą trafień", () => {
  const offers = [
    { facilityIds: [103, 47] }, // basen + wifi
    { facilityIds: [47] }, // samo wifi
    { facilityIds: [] },
  ];
  const out = availableFacilityFilters(offers);
  const keys = out.map((o) => o.filter.key);
  assert.ok(keys.includes("pool"));
  assert.ok(keys.includes("wifi"));
  // Nikt nie ma basenu na dachu ani spa → te filtry NIE mogą się pojawić.
  assert.ok(!keys.includes("spa"));
  assert.equal(out.find((o) => o.filter.key === "wifi")?.count, 2);
  assert.equal(out.find((o) => o.filter.key === "pool")?.count, 1);
});

test("dostępne filtry: pusta pula → zero filtrów (nie pokazujemy martwych opcji)", () => {
  assert.deepEqual(availableFacilityFilters([]), []);
  assert.deepEqual(availableFacilityFilters([{ facilityIds: undefined }]), []);
});

test("marki: etykiety oznaczające BRAK sieci nie są markami", () => {
  const out = availableChains([
    { chain: "Not Available" },
    { chain: "Not Available" },
    { chain: "Independent" },
    { chain: "Independent" },
    { chain: "Vincci Hoteles" },
    { chain: "Vincci Hoteles" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Vincci Hoteles");
  assert.equal(out[0].count, 2);
});

test("marki: sieć z JEDNYM obiektem nie jest filtrem (to ten sam hotel)", () => {
  const out = availableChains([{ chain: "Hilton" }, { chain: "Accor" }, { chain: "Accor" }]);
  assert.deepEqual(out.map((c) => c.name), ["Accor"]);
});

test("marki: sortowanie po liczbie obiektów, potem alfabetycznie po polsku", () => {
  const out = availableChains([
    { chain: "Zzz" }, { chain: "Zzz" },
    { chain: "Accor" }, { chain: "Accor" }, { chain: "Accor" },
    { chain: "Ibis" }, { chain: "Ibis" },
  ]);
  assert.deepEqual(out.map((c) => c.name), ["Accor", "Ibis", "Zzz"]);
});
