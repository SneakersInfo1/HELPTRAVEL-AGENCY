import assert from "node:assert/strict";
import { test } from "node:test";

import {
  searchAirports,
  lookupAirport,
  iataForCity,
  AIRPORTS,
  AIRPORT_GROUPS,
  resolveOriginFromOption,
} from "./airports";

test("brak zduplikowanych kodów IATA w słowniku (Map BY_CODE gubiłaby duplikat po cichu)", () => {
  const codes = AIRPORTS.map((a) => a.code);
  const dups = codes.filter((c, i) => codes.indexOf(c) !== i);
  assert.deepEqual(dups, [], `duplikaty: ${dups.join(", ")}`);
});

function findsCode(query: string, code: string): boolean {
  return searchAirports(query, 8).some((o) => o.kind === "airport" && o.airport.code === code);
}

// Faza D — pokrycie kierunków wakacyjnych. Wszystkie ZWERYFIKOWANE na żywo na
// LiteAPI (oferty z WAW). Test pilnuje, że są wyszukiwalne i mają poprawne IATA.
const LEISURE: Array<[string, string]> = [
  ["antalya", "AYT"], ["rodos", "RHO"], ["malaga", "AGP"], ["palma", "PMI"],
  ["teneryfa", "TFS"], ["split", "SPU"], ["larnaka", "LCA"], ["faro", "FAO"],
  ["lizbona", "LIS"], ["korfu", "CFU"], ["kreta", "HER"], ["burgas", "BOJ"],
  ["nicea", "NCE"], ["stambul", "IST"], ["dubrownik", "DBV"], ["barcelona", "BCN"],
  ["ateny", "ATH"], ["alicante", "ALC"], ["warna", "VAR"], ["tirana", "TIA"],
];

test("kierunki wakacyjne wyszukiwalne po polskiej nazwie", () => {
  for (const [q, code] of LEISURE) {
    assert.ok(findsCode(q, code), `'${q}' powinno znaleźć ${code}`);
  }
});

test("wszystkie 31 zweryfikowanych kierunków ma wpis w słowniku", () => {
  const codes = [
    "BCN", "AGP", "ALC", "PMI", "LPA", "TFS", "VLC", "MAD",
    "ATH", "RHO", "HER", "CFU", "SKG", "KGS",
    "IST", "AYT", "LIS", "FAO", "OPO", "SPU", "DBV",
    "LCA", "MLA", "BOJ", "VAR", "TIA", "FCO", "NAP", "CTA", "VCE", "NCE",
  ];
  for (const code of codes) assert.ok(lookupAirport(code), `brak lotniska ${code}`);
});

test("angielska / potoczna pisownia też trafia", () => {
  assert.ok(findsCode("majorka", "PMI"), "majorka → PMI");
  assert.ok(findsCode("rhodes", "RHO"), "rhodes → RHO");
  assert.ok(findsCode("crete", "HER"), "crete → HER");
  assert.ok(findsCode("istanbul", "IST"), "istanbul → IST");
  assert.ok(findsCode("kanary", "LPA"), "kanary → LPA");
});

test("„Polska — dowolne lotnisko” jest PIERWSZĄ podpowiedzią na pustej liście", () => {
  const first = searchAirports("", 40)[0];
  assert.ok(first?.kind === "group", "pierwszy element powinien być grupą");
  assert.equal(first.group.id, "poland-all");
});

test("„Polska” / „dowolne lotnisko” znajduje grupę poland-all", () => {
  for (const q of ["polska", "dowolne", "dowolne lotnisko", "wszystkie lotniska w polsce"]) {
    const hit = searchAirports(q, 8).find((o) => o.kind === "group" && o.group.id === "poland-all");
    assert.ok(hit, `'${q}' powinno znaleźć grupę Polska`);
  }
});

test("wybór poland-all rozwija się w fan-out po największych lotniskach (bez kodu metra)", () => {
  const group = AIRPORT_GROUPS.find((g) => g.id === "poland-all");
  assert.ok(group, "grupa poland-all istnieje");
  const sel = resolveOriginFromOption({ kind: "group", group: group! });
  assert.ok(sel.codes.length >= 4, `oczekiwano fan-outu (≥4 kody), jest ${sel.codes.length}`);
  assert.ok(sel.codes.includes("WAW"), "WAW w fan-oucie");
  assert.ok(sel.isGroup, "isGroup=true (nota o ograniczeniach)");
  // Każdy kod fan-outu musi być realnym lotniskiem ze słownika.
  for (const c of sel.codes) assert.ok(lookupAirport(c), `kod ${c} musi istnieć w słowniku`);
});

test("iataForCity: EN nazwy miast z picks nastrojów trafiają w IATA", () => {
  assert.equal(iataForCity("Barcelona"), "BCN");
  assert.equal(iataForCity("Lisbon"), "LIS"); // alias EN
  assert.equal(iataForCity("Malaga"), "AGP"); // fold diakrytyków (Málaga)
  assert.equal(iataForCity("Antalya"), "AYT");
  assert.equal(iataForCity("Middle of Nowhere"), null);
  assert.equal(iataForCity(""), null);
});

test("rozszerzenie 2026-07-11: nowe kierunki wakacyjne wyszukiwalne po polsku", () => {
  const cases: Array<[string, string]> = [
    ["ibiza", "IBZ"], ["santorini", "JTR"], ["bodrum", "BJV"], ["madera", "FNC"],
    ["zakintos", "ZTH"], ["zadar", "ZAD"], ["pafos", "PFO"], ["marsa alam", "RMF"],
    ["budapeszt", "BUD"], ["malediwy", "MLE"], ["agadir", "AGA"], ["fuerteventura", "FUE"],
  ];
  for (const [q, code] of cases) {
    assert.ok(findsCode(q, code), `'${q}' powinno znaleźć ${code}`);
  }
});

test("tolerancja literówek: zapytanie z 1-2 błędami nadal trafia", () => {
  assert.ok(findsCode("barcelina", "BCN"), "barcelina → BCN (1 literówka)");
  assert.ok(findsCode("gdanks", "GDN"), "gdanks → GDN (przestawka)");
  assert.ok(findsCode("santorni", "JTR"), "santorni → JTR (brak litery)");
  assert.ok(findsCode("majurka", "PMI"), "majurka → PMI");
});

test("tolerancja literówek NIE psuje normalnych wyników (substring ma pierwszeństwo)", () => {
  const hits = searchAirports("barcelona", 8);
  assert.ok(hits.some((o) => o.kind === "airport" && o.airport.code === "BCN"));
});

test("grupy Rzym i Nowy Jork rozwijają się w fan-out (bez niezweryfikowanego kodu metra)", () => {
  for (const [id, expected] of [["rome-all", "FCO"], ["newyork-all", "JFK"]] as const) {
    const group = AIRPORT_GROUPS.find((g) => g.id === id);
    assert.ok(group, `grupa ${id} istnieje`);
    const sel = resolveOriginFromOption({ kind: "group", group: group! });
    assert.ok(sel.codes.length >= 2, `${id}: fan-out ≥2 kody`);
    assert.ok(sel.codes.includes(expected), `${id}: ${expected} w fan-oucie`);
  }
});

test("domyślna lista podpowiedzi prowadzi kierunkami wakacyjnymi (nie tylko huby)", () => {
  const codes = searchAirports("", 30).flatMap((o) => (o.kind === "airport" ? [o.airport.code] : []));
  // przynajmniej kilka top-plaż jest w domyślnej liście
  const leisureInDefault = ["BCN", "AGP", "PMI", "AYT", "RHO"].filter((c) => codes.includes(c));
  assert.ok(leisureInDefault.length >= 3, `oczekiwano ≥3 plaż w domyślnej liście, jest ${leisureInDefault.length}`);
});
