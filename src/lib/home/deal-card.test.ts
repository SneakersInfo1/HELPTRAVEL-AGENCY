// Kontrakt modelu oferty dla trzech sekcji strony głównej.
//
// Dwa obszary są tu krytyczne i dlatego mają najwięcej przypadków:
//   • formatowanie ceny — bo cena to najważniejsza liczba na stronie,
//     a domyślne `Intl` dla pl-PL NIE grupuje kwot czterocyfrowych;
//   • kotwica cenowa — bo pokazanie przekreślonej ceny bez pokrycia to
//     pozorny rabat, czyli ryzyko prawne, nie tylko utrata zaufania.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUDGET_BANDS,
  cheapestPrice,
  dealsLabel,
  filterDeals,
  formatDateRange,
  formatPricePln,
  nightsBetween,
  nightsLabel,
  priceAnchor,
  totalFor,
  type DealCard,
} from "./deal-card";

function deal(over: Partial<DealCard> = {}): DealCard {
  return {
    id: "malaga-spain",
    city: "Malaga",
    cityLabel: "Malaga",
    country: "Spain",
    countryLabel: "Hiszpania",
    imageUrl: "/x.jpg",
    imageAlt: "Malaga",
    pricePerPersonPln: 1623,
    priceTotalPln: 3246,
    nights: 4,
    dateFrom: "2026-09-07",
    dateTo: "2026-09-11",
    departureAirport: "WAW",
    searchUrl: "/hotele/szukaj?destination=Malaga",
    ...over,
  };
}

// ── Cena ────────────────────────────────────────────────────────────────────

test("cena czterocyfrowa dostaje separator — spację NIEŁAMLIWĄ", () => {
  const s = formatPricePln(1623);
  assert.equal(s, "1 623 zł");
  // Separator tysięcy MUSI być U+00A0, nie zwykłą spacją — inaczej przeglądarka
  // złamie „1 623 zł" na końcu wiersza i cena rozjedzie się na dwie linie.
  assert.ok(s.includes("1 623"), "brak NBSP jako separatora tysięcy");
});

test("REGRESJA: domyślne Intl dla pl-PL NIE grupuje czterocyfrowych", () => {
  // To jest powód istnienia `formatPricePln`. Gdyby ktoś kiedyś podmienił ją
  // na `formatPLN` z lib/money, ten test to wychwyci.
  const domyslne = new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(1623);
  assert.equal(domyslne, "1623 zł", "zmieniło się zachowanie Intl — zweryfikuj formatPricePln");
  assert.notEqual(formatPricePln(1623), domyslne);
});

test("cena trzycyfrowa bez separatora, pięciocyfrowa z separatorem", () => {
  assert.equal(formatPricePln(737), "737 zł");
  assert.equal(formatPricePln(12345), "12 345 zł");
});

test("cena łączna liczona w jednym miejscu, baza = 2 osoby", () => {
  assert.equal(totalFor(1623), 3246);
  assert.equal(totalFor(1623, 3), 4869);
});

// ── Kotwica cenowa ──────────────────────────────────────────────────────────

test("brak ceny konkurencji = brak kotwicy (nie zgadujemy)", () => {
  assert.equal(priceAnchor(deal()), null);
  assert.equal(priceAnchor(deal({ competitorPricePln: undefined })), null);
});

test("kotwica tylko gdy konkurencja jest DROŻSZA", () => {
  assert.equal(priceAnchor(deal({ competitorPricePln: 1623 })), null, "równa cena to nie oszczędność");
  assert.equal(priceAnchor(deal({ competitorPricePln: 1400 })), null, "tańsza konkurencja to nie kotwica");
  assert.deepEqual(priceAnchor(deal({ competitorPricePln: 1900 })), {
    competitor: 1900,
    savingPercent: 15,
  });
});

test("oszczędność zaokrąglona poniżej 1% nie jest pokazywana", () => {
  // 1623 → 1630 to 0,4%. „Taniej o 0%" wygląda na błąd i podważa resztę strony.
  assert.equal(priceAnchor(deal({ competitorPricePln: 1630 })), null);
});

test("śmieciowa wartość nie przechodzi jako kotwica", () => {
  assert.equal(priceAnchor(deal({ competitorPricePln: Number.NaN })), null);
  assert.equal(priceAnchor(deal({ competitorPricePln: Number.POSITIVE_INFINITY })), null);
});

// ── Daty i noce ─────────────────────────────────────────────────────────────

test("zakres dat: ten sam miesiąc skraca się, różne miesiące nie", () => {
  assert.equal(formatDateRange("2026-09-07", "2026-09-11"), "7–11.09");
  assert.equal(formatDateRange("2026-09-26", "2026-10-03"), "26.09–3.10");
});

test("niepoprawne daty dają pusty zakres zamiast „Invalid Date”", () => {
  assert.equal(formatDateRange("", ""), "");
  assert.equal(formatDateRange("bzdura", "2026-09-11"), "");
});

test("liczba nocy: poprawna, odwrócona, ta sama", () => {
  assert.equal(nightsBetween("2026-09-07", "2026-09-11"), 4);
  assert.equal(nightsBetween("2026-09-11", "2026-09-07"), 0, "odwrócony zakres nie może dać ujemnych nocy");
  assert.equal(nightsBetween("2026-09-07", "2026-09-07"), 0);
});

test("polska odmiana nocy i wyjazdów", () => {
  assert.equal(nightsLabel(1), "1 noc");
  assert.equal(nightsLabel(4), "4 noce");
  assert.equal(nightsLabel(7), "7 nocy");
  assert.equal(nightsLabel(12), "12 nocy", "12–14 to wyjątek od reguły 2–4");
  assert.equal(nightsLabel(22), "22 noce");
  assert.equal(dealsLabel(1), "1 wyjazd");
  assert.equal(dealsLabel(3), "3 wyjazdy");
  assert.equal(dealsLabel(47), "47 wyjazdów");
  assert.equal(dealsLabel(13), "13 wyjazdów");
});

// ── Filtrowanie (dobieracz z sekcji C) ──────────────────────────────────────

const pula: DealCard[] = [
  deal({ id: "sofia-bulgaria", pricePerPersonPln: 737 }),
  deal({ id: "budapest-hungary", pricePerPersonPln: 1068 }),
  deal({ id: "larnaca-cyprus", pricePerPersonPln: 1117 }),
  deal({ id: "malaga-spain", pricePerPersonPln: 1623 }),
  deal({ id: "funchal-portugal", pricePerPersonPln: 3106 }),
];
const przynaleznosc = {
  plaza: ["larnaca-cyprus", "malaga-spain", "funchal-portugal"],
  "city-break": ["sofia-bulgaria", "budapest-hungary"],
};

test("brak filtrów zwraca całą pulę", () => {
  assert.equal(filterDeals(pula, { budget: null, theme: null }, przynaleznosc).length, 5);
});

test("budżet filtruje po granicach zakresu włącznie", () => {
  const r = filterDeals(pula, { budget: "1000-1500", theme: null }, przynaleznosc);
  assert.deepEqual(r.map((d) => d.id), ["budapest-hungary", "larnaca-cyprus"]);
});

test("najwyższy zakres nie ma górnej granicy", () => {
  const r = filterDeals(pula, { budget: "2500-plus", theme: null }, przynaleznosc);
  assert.deepEqual(r.map((d) => d.id), ["funchal-portugal"]);
});

test("typ wyjazdu i budżet działają łącznie", () => {
  const r = filterDeals(pula, { budget: "1000-1500", theme: "plaza" }, przynaleznosc);
  assert.deepEqual(r.map((d) => d.id), ["larnaca-cyprus"]);
});

test("nieznany typ daje pustkę, nie całą pulę — inaczej licznik kłamie", () => {
  assert.equal(filterDeals(pula, { budget: null, theme: "nie-ma-takiego" }, przynaleznosc).length, 0);
});

test("licznik i najniższa cena liczone z TEJ SAMEJ puli co wynik", () => {
  const r = filterDeals(pula, { budget: null, theme: "city-break" }, przynaleznosc);
  assert.equal(r.length, 2);
  assert.equal(cheapestPrice(r), 737);
  assert.equal(cheapestPrice([]), null, "pusta pula nie może dać ceny");
});

test("zakresy budżetu pokrywają się granicami, bez dziur", () => {
  // Dziura między zakresami oznaczałaby ofertę, której nie da się znaleźć
  // żadnym filtrem — a użytkownik nie ma jak się dowiedzieć, że istnieje.
  for (let i = 1; i < BUDGET_BANDS.length; i++) {
    assert.equal(BUDGET_BANDS[i].minPln, BUDGET_BANDS[i - 1].maxPln, `dziura przed ${BUDGET_BANDS[i].id}`);
  }
  assert.equal(BUDGET_BANDS[BUDGET_BANDS.length - 1].maxPln, null, "ostatni zakres musi być otwarty");
});
