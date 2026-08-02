import assert from "node:assert/strict";
import { test } from "node:test";

import seedJson from "../../../data/destinations.json";
import {
  computeDealDateWindows,
  DEAL_NIGHTS,
  DEAL_ROUTES,
  DEAL_ROUTES_PER_RUN,
  DEAL_SAMPLE_LEAD_DAYS,
} from "./deals-config";
import { rotateSlice } from "../home/rotation";
import { hasCityGenitive } from "./airports";

const DAY_MS = 86_400_000;
const STARTS = [
  "2026-06-29", // poniedziałek
  "2026-06-30", // wtorek
  "2026-07-01", // środa
  "2026-07-02", // czwartek
  "2026-07-03", // piątek
  "2026-07-04", // sobota
  "2026-07-05", // niedziela
];

for (const start of STARTS) {
  test(`okna okazji mają pełne siedem nocy i leżą w przyszłości dla ${start}`, () => {
    const now = new Date(`${start}T19:45:00Z`);
    const base = Date.parse(`${start}T00:00:00Z`);
    const windows = computeDealDateWindows(now);

    assert.equal(windows.length, DEAL_SAMPLE_LEAD_DAYS.length);
    for (const [index, window] of windows.entries()) {
      const checkin = Date.parse(`${window.checkin}T00:00:00Z`);
      const checkout = Date.parse(`${window.checkout}T00:00:00Z`);
      assert.ok(checkin > base, `${window.label} musi zaczynać się w przyszłości`);
      assert.equal((checkout - checkin) / DAY_MS, DEAL_NIGHTS);
      assert.equal(window.label, `lead-${DEAL_SAMPLE_LEAD_DAYS[index]}`);
    }
  });
}

// To jest test WŁASNOŚCI MEDIANY, nie kosmetyki dat. Sekcja mówi
// użytkownikowi „zwykle ok. X zł na tej trasie" — jeżeli wszystkie próbki
// wypadną w ten sam dzień tygodnia, ta liczba opisuje cenę piątkową albo
// niedzielną, a nie typową. Pierwsza wersja odstępów ([18, 25, 33, 46, 60, 81])
// dawała pięć z sześciu próbek w ten sam dzień; test mierzył wtedy przekrój po
// CAŁYM tygodniu startów, więc przechodził i przykrywał tę wadę.
//
// Warunek jest więc twardy: KAŻDY pojedynczy przebieg, niezależnie od dnia
// uruchomienia, musi objąć sześć różnych dni tygodnia.
for (const start of STARTS) {
  test(`próbki jednego przebiegu wypadają w sześciu różnych dniach tygodnia (start ${start})`, () => {
    const weekdays = new Set(
      computeDealDateWindows(new Date(`${start}T19:45:00Z`)).map((window) =>
        new Date(`${window.checkin}T00:00:00Z`).getUTCDay(),
      ),
    );
    assert.equal(
      weekdays.size,
      DEAL_SAMPLE_LEAD_DAYS.length,
      `mediana liczona z ${weekdays.size} dni tygodnia nie opisuje typowej ceny trasy`,
    );
  });
}

test("odstępy próbek mają komplet różnych reszt modulo 7", () => {
  // Własność, z której wynika test wyżej — zapisana wprost, żeby przy zmianie
  // listy było widać, co dokładnie trzeba zachować.
  const remainders = new Set(DEAL_SAMPLE_LEAD_DAYS.map((lead) => lead % 7));
  assert.equal(remainders.size, DEAL_SAMPLE_LEAD_DAYS.length);
});

test("każda trasa wskazuje istniejący kierunek i jego właściwe lotnisko", () => {
  const destinations = (seedJson as {
    destinations: Array<{ id: string; airports: string[] }>;
  }).destinations;
  const byId = new Map(destinations.map((destination) => [destination.id, destination]));

  for (const route of DEAL_ROUTES) {
    const destination = byId.get(route.destinationId);
    assert.ok(destination, `${route.destinationId} nie istnieje w seedzie`);
    assert.ok(
      destination.airports.includes(route.destinationIata),
      `${route.destinationIata} nie należy do ${route.destinationId}`,
    );
  }
});

// Karta pisze „z Warszawy", więc każde lotnisko wylotu z puli musi mieć formę
// dopełniacza. Bez tego testu dodanie trasy z nowego miasta wypuściłoby na
// stronę „z Gdańsk" i nikt by tego nie zauważył przed wdrożeniem.
test("każde lotnisko wylotu z puli ma polską formę dopełniacza", () => {
  for (const origin of new Set(DEAL_ROUTES.map((route) => route.origin))) {
    assert.ok(hasCityGenitive(origin), `brak dopełniacza dla miasta lotniska ${origin}`);
  }
});

test("pula nie zawiera duplikatów pary lotnisk", () => {
  const keys = DEAL_ROUTES.map((route) => `${route.origin}-${route.destinationIata}`);
  assert.equal(new Set(keys).size, keys.length);
});

// Świeżość kart (`DEAL_FRESH_MS`) jest policzona z DŁUGOŚCI PEŁNEGO OBROTU.
// Gdyby pula przestała dzielić się przez liczbę tras na przebieg, część tras
// nigdy nie zostałaby sprawdzona w oknie świeżości i znikałaby z sekcji bez
// żadnego powodu widocznego w logu.
test("pełny obrót puli mieści się w trzech przebiegach i obejmuje każdą trasę", () => {
  assert.equal(
    DEAL_ROUTES.length % DEAL_ROUTES_PER_RUN,
    0,
    "pula musi dzielić się bez reszty przez liczbę tras na przebieg",
  );
  const runs = DEAL_ROUTES.length / DEAL_ROUTES_PER_RUN;
  const seen = new Set<string>();
  for (let bucket = 0; bucket < runs; bucket++) {
    for (const route of rotateSlice(DEAL_ROUTES, DEAL_ROUTES_PER_RUN, bucket)) {
      seen.add(`${route.origin}-${route.destinationIata}`);
    }
  }
  assert.equal(seen.size, DEAL_ROUTES.length, `po ${runs} przebiegach niesprawdzone trasy`);
});
