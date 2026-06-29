import assert from "node:assert/strict";
import { test } from "node:test";

import { searchAirports, lookupAirport, AIRPORTS } from "./airports";

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

test("domyślna lista podpowiedzi prowadzi kierunkami wakacyjnymi (nie tylko huby)", () => {
  const codes = searchAirports("", 30)
    .filter((o): o is { kind: "airport"; airport: { code: string } } => o.kind === "airport")
    .map((o) => o.airport.code);
  // przynajmniej kilka top-plaż jest w domyślnej liście
  const leisureInDefault = ["BCN", "AGP", "PMI", "AYT", "RHO"].filter((c) => codes.includes(c));
  assert.ok(leisureInDefault.length >= 3, `oczekiwano ≥3 plaż w domyślnej liście, jest ${leisureInDefault.length}`);
});
