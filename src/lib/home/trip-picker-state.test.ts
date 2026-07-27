// Kontrakt dobieracza wyjazdu (sekcja C).
//
// Zamiast renderować komponent (repo nie ma DOM-u w testach) sprawdzamy jego
// logikę stanu — tę samą, której komponent używa jako jedynego źródła decyzji.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { DealCard } from "./deal-card";
import {
  EMPTY_PICKER_STATE,
  hasChoice,
  pickerCtaHref,
  pickerSummary,
  toggleBudget,
  toggleTheme,
} from "./trip-picker-state";

function deal(over: Partial<DealCard> = {}): DealCard {
  return {
    id: "malaga-spain",
    city: "Malaga",
    cityLabel: "Malaga",
    country: "Spain",
    countryLabel: "Hiszpania",
    imageUrl: "",
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

// ── Przełączanie ────────────────────────────────────────────────────────────

test("drugi klik w ten sam chip CZYŚCI filtr", () => {
  // Bez tego użytkownik, który kliknął „do 1000 zł" i zobaczył dwie oferty,
  // nie ma jak wrócić do pełnej puli inaczej niż przeładowaniem strony.
  const po1 = toggleBudget(EMPTY_PICKER_STATE, "do-1000");
  assert.equal(po1.state.budget, "do-1000");
  const po2 = toggleBudget(po1.state, "do-1000");
  assert.equal(po2.state.budget, null);

  const t1 = toggleTheme(EMPTY_PICKER_STATE, "plaza");
  assert.equal(t1.state.theme, "plaza");
  assert.equal(toggleTheme(t1.state, "plaza").state.theme, null);
});

test("klik w INNY chip podmienia wybór, nie dokłada drugiego", () => {
  const po1 = toggleBudget(EMPTY_PICKER_STATE, "do-1000");
  const po2 = toggleBudget(po1.state, "1500-2500");
  assert.equal(po2.state.budget, "1500-2500");
});

test("budżet i typ są niezależne — zmiana jednego nie kasuje drugiego", () => {
  const zBudzetem = toggleBudget(EMPTY_PICKER_STATE, "1000-1500").state;
  const zOboma = toggleTheme(zBudzetem, "plaza").state;
  assert.deepEqual(zOboma, { budget: "1000-1500", theme: "plaza" });
  // Odznaczenie typu zostawia budżet.
  assert.deepEqual(toggleTheme(zOboma, "plaza").state, { budget: "1000-1500", theme: null });
});

test("ODZNACZENIE nie jest ukończeniem kroku w pomiarze", () => {
  // Policzone jako ukończenie zawyżałoby lejek doboru — wyglądałoby, że ludzie
  // przechodzą kroki, podczas gdy oni je cofają.
  const zaznacz = toggleBudget(EMPTY_PICKER_STATE, "do-1000");
  assert.equal(zaznacz.reported, "do-1000");
  assert.equal(toggleBudget(zaznacz.state, "do-1000").reported, null);

  const typ = toggleTheme(EMPTY_PICKER_STATE, "plaza");
  assert.equal(typ.reported, "plaza");
  assert.equal(toggleTheme(typ.state, "plaza").reported, null);
});

test("stan wejściowy nie jest mutowany", () => {
  const start = { ...EMPTY_PICKER_STATE };
  toggleBudget(start, "do-1000");
  toggleTheme(start, "plaza");
  assert.deepEqual(start, { budget: null, theme: null });
});

// ── Podsumowanie ────────────────────────────────────────────────────────────

test("bez wyboru: zachęta, nie wynik i nie pustka", () => {
  assert.deepEqual(pickerSummary(EMPTY_PICKER_STATE, []), { kind: "prompt" });
  assert.equal(hasChoice(EMPTY_PICKER_STATE), false);
});

test("z wyborem i dopasowaniami: licznik i najniższa cena z TEJ SAMEJ puli", () => {
  const pula = [deal({ id: "a", pricePerPersonPln: 1117 }), deal({ id: "b", pricePerPersonPln: 737 })];
  const stan = toggleBudget(EMPTY_PICKER_STATE, "1000-1500").state;
  assert.deepEqual(pickerSummary(stan, pula), { kind: "results", count: 2, cheapestPln: 737 });
});

test("wybór bez pokrycia daje stan PUSTY — odróżnialny od zachęty", () => {
  // To rozróżnienie jest powodem istnienia `hasChoice`: gdyby oba stany
  // renderowały to samo, użytkownik po odfiltrowaniu wszystkiego zobaczyłby
  // „wybierz budżet", mimo że właśnie go wybrał. Ślepa uliczka bez wyjścia.
  const stan = toggleBudget(EMPTY_PICKER_STATE, "2500-plus").state;
  assert.deepEqual(pickerSummary(stan, []), { kind: "empty" });
});

test("dopasowania wygrywają nad brakiem wyboru — licznik pokazuje pełną pulę", () => {
  const pula = [deal({ id: "a" })];
  assert.deepEqual(pickerSummary(EMPTY_PICKER_STATE, pula), {
    kind: "results",
    count: 1,
    cheapestPln: 1623,
  });
});

// ── CTA ─────────────────────────────────────────────────────────────────────

test("CTA nigdy nie prowadzi do wyszukiwarki hoteli bez kierunku i dat", () => {
  // Wyszukiwarka bez kierunku pokazuje pusty formularz, czyli kasuje kontekst,
  // który użytkownik właśnie podał.
  for (const stan of [
    EMPTY_PICKER_STATE,
    toggleBudget(EMPTY_PICKER_STATE, "do-1000").state,
    toggleTheme(EMPTY_PICKER_STATE, "plaza").state,
  ]) {
    assert.ok(!pickerCtaHref(stan).startsWith("/hotele/szukaj"), `zły cel dla ${JSON.stringify(stan)}`);
  }
});

test("CTA idzie do strony typu, a bez typu do katalogu", () => {
  assert.equal(pickerCtaHref(EMPTY_PICKER_STATE), "/kierunki");
  assert.equal(pickerCtaHref(toggleBudget(EMPTY_PICKER_STATE, "do-1000").state), "/kierunki");
  assert.equal(pickerCtaHref(toggleTheme(EMPTY_PICKER_STATE, "plaza").state), "/wyjazdy/plaza");
});
