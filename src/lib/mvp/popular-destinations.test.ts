// Kontrakt listy „popularne kierunki" pod polem „Dokąd".
//
// Test istnieje po to, żeby wymóg właściciela („mają być w bazie LiteAPI") był
// SPRAWDZANY, a nie deklarowany w komentarzu. Seed data/destinations.json jest
// generowany z LiteAPI, więc obecność `id` w seedzie == kierunek istnieje
// u dostawcy. Literówka w id albo kierunek wycofany po regeneracji seeda
// zatrzymuje `pnpm test`, zamiast objawić się użytkownikowi jako pozycja,
// która po kliknięciu nie znajduje nic.
//
// Czytamy JSON wprost, a nie przez lib/mvp/destinations-seed — tamten moduł ma
// `import "server-only"`, co wywala node:test (patrz CLAUDE.md).

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  POPULAR_DESTINATIONS,
  POPULAR_DESTINATION_IDS,
  POPULAR_GROUP_LABELS,
} from "./popular-destinations";

interface SeedEntry {
  id: string;
  city: { pl: string; en: string };
  country: { pl: string; code: string };
  airports?: string[];
}

const seed = JSON.parse(readFileSync("data/destinations.json", "utf8")) as {
  destinations: SeedEntry[];
};
const byId = new Map(seed.destinations.map((d) => [d.id, d]));

test("każdy popularny kierunek istnieje w seedzie LiteAPI", () => {
  const missing = POPULAR_DESTINATION_IDS.filter((id) => !byId.has(id));
  assert.deepEqual(
    missing,
    [],
    `Kierunki spoza seeda (literówka albo wycofane przez dostawcę): ${missing.join(", ")}`,
  );
});

test("każdy popularny kierunek ma lotnisko — inaczej tryb LOTY pokaże pozycję bez trafienia", () => {
  const withoutAirport = POPULAR_DESTINATION_IDS.filter(
    (id) => (byId.get(id)?.airports ?? []).length === 0,
  );
  assert.deepEqual(withoutAirport, [], `Bez kodu IATA: ${withoutAirport.join(", ")}`);
});

test("lista ma 20 pozycji, bez duplikatów", () => {
  assert.equal(POPULAR_DESTINATIONS.length, 20);
  assert.equal(new Set(POPULAR_DESTINATION_IDS).size, 20, "zduplikowane id");
});

test("limit 5 kierunków na kraj — lista ma czytać się jak oferta, nie jak katalog jednego rynku", () => {
  const perCountry = new Map<string, number>();
  for (const id of POPULAR_DESTINATION_IDS) {
    const code = byId.get(id)?.country.code ?? "??";
    perCountry.set(code, (perCountry.get(code) ?? 0) + 1);
  }
  const over = [...perCountry.entries()].filter(([, n]) => n > 5);
  assert.deepEqual(over, [], `Za dużo kierunków z jednego kraju: ${JSON.stringify(over)}`);
});

test("obie grupy są niepuste i mają etykiety", () => {
  for (const group of ["beach", "city"] as const) {
    assert.ok(
      POPULAR_DESTINATIONS.some((d) => d.group === group),
      `grupa ${group} jest pusta`,
    );
    assert.ok(POPULAR_GROUP_LABELS[group]?.length > 0, `brak etykiety dla ${group}`);
  }
});

test("podpowiedź nie powtarza nazwy miasta — byłaby wtedy szumem", () => {
  const redundant = POPULAR_DESTINATIONS.filter((d) => {
    if (!d.hint) return false;
    const cityPl = byId.get(d.id)?.city.pl ?? "";
    return d.hint.toLowerCase() === cityPl.toLowerCase();
  }).map((d) => d.id);
  assert.deepEqual(redundant, [], `Podpowiedź == nazwa miasta: ${redundant.join(", ")}`);
});

// Ten test powstał po realnym błędzie: pierwsza wersja listy miała hinty
// „Turcja, Riwiera Turecka" i „Cypr", a UI składa wiersz jako
// „miasto / hint · kraj" — więc na ekranie wychodziło „…· Turcja · Turcja"
// i „Cypr · Cypr". Podpowiedź ma nieść region, nie powtarzać kraju.
test("podpowiedź nie zawiera nazwy kraju — wiersz i tak ją pokazuje obok", () => {
  const withCountry = POPULAR_DESTINATIONS.filter((d) => {
    if (!d.hint) return false;
    const countryPl = byId.get(d.id)?.country.pl ?? "";
    if (!countryPl) return false;
    return d.hint.toLowerCase().includes(countryPl.toLowerCase());
  }).map((d) => `${d.id} („${d.hint}")`);
  assert.deepEqual(withCountry, [], `Podpowiedź powtarza kraj: ${withCountry.join(", ")}`);
});
