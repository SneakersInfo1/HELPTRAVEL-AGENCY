// Kontrakt resolwera krajów.
//
// Testy 1:1 odpowiadają defektom zmierzonym 2026-07-26 na starej mapie
// (73 wpisy, tylko Europa + basen Morza Śródziemnego): każdy kierunek daleki
// zwracał `null`, więc użytkownik nie mógł dojść do większości oferty LiteAPI
// nawet wpisując kraj ręcznie.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  allCountries,
  countryNameEn,
  countryNamePl,
  normalizeCountryName,
  resolveCountryCode,
} from "./countries";

test("kierunki dalekie rozpoznawane po polsku i po angielsku (REGRESJA: wszystkie dawały null)", () => {
  const cases: Array<[string, string]> = [
    ["Tajlandia", "TH"], ["Thailand", "TH"],
    ["Wietnam", "VN"], ["Vietnam", "VN"],
    ["Japonia", "JP"], ["Japan", "JP"],
    ["Meksyk", "MX"], ["Mexico", "MX"],
    ["Malediwy", "MV"], ["Maldives", "MV"],
    ["Indonezja", "ID"], ["Indonesia", "ID"],
    ["Sri Lanka", "LK"],
    ["Dominikana", "DO"], ["Republika Dominikańska", "DO"],
    ["Stany Zjednoczone", "US"], ["United States", "US"], ["USA", "US"],
    ["Zanzibar", "TZ"], ["Bali", "ID"], ["Tahiti", "PF"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(resolveCountryCode(input), expected, `${input} → oczekiwano ${expected}`);
  }
});

test("kraje, które działały wcześniej, dalej działają (brak regresji)", () => {
  const cases: Array<[string, string]> = [
    ["Spain", "ES"], ["Hiszpania", "ES"],
    ["Grecja", "GR"], ["Turcja", "TR"], ["Egipt", "EG"], ["Cypr", "CY"],
    ["United Kingdom", "GB"], ["UK", "GB"], ["Wielka Brytania", "GB"],
    ["Republic of Italy", "IT"],
    ["Czech Republic", "CZ"], ["Czechia", "CZ"], ["Czechy", "CZ"],
    ["Zjednoczone Emiraty Arabskie", "AE"], ["UAE", "AE"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(resolveCountryCode(input), expected, `${input} → oczekiwano ${expected}`);
  }
});

test("polska Albania trafia w mapę (REGRESJA: klucz `Albania_PL` obchodził kolizję nazw)", () => {
  assert.equal(resolveCountryCode("Albania"), "AL");
});

test("diakrytyki i wielkość liter nie mają znaczenia", () => {
  assert.equal(resolveCountryCode("wŁochy"), "IT");
  assert.equal(resolveCountryCode("Łotwa"), "LV"); // ł nie rozkłada się przez NFD
  assert.equal(resolveCountryCode("Türkiye"), "TR");
  assert.equal(resolveCountryCode("  hiszpania  "), "ES");
  assert.equal(normalizeCountryName("Bośnia i Hercegowina"), "bosnia i hercegowina");
});

test("dopasowanie fragmentem idzie od NAJDŁUŻSZEJ nazwy", () => {
  // „Korea" jest fragmentem „Korea Południowa" — dłuższa nazwa musi wygrać,
  // inaczej kolejność wstawiania decydowałaby o wyniku.
  assert.equal(resolveCountryCode("Korea Południowa"), "KR");
  assert.equal(resolveCountryCode("Macedonia Północna"), "MK");
});

test("dwuliterowy kod przechodzi tylko, gdy REALNIE istnieje", () => {
  assert.equal(resolveCountryCode("TH"), "TH");
  assert.equal(resolveCountryCode("th"), "TH");
  // REGRESJA: stara wersja zwracała każde dwie litery wielkimi, więc literówka
  // jechała do LiteAPI jako countryCode=XX i kończyła się pustą listą.
  assert.equal(resolveCountryCode("Hi"), null);
  assert.equal(resolveCountryCode("Qq"), null);
});

test("nierozpoznane wejście daje null, a nie zgadywanie", () => {
  for (const bad of ["Atlantis", "", "   ", "?!", "Śródziemie"]) {
    assert.equal(resolveCountryCode(bad), null, `${bad} powinno dać null`);
  }
});

test("każdy kraj ma nazwę PL i EN, kody są unikalne i dwuliterowe", () => {
  const all = allCountries();
  assert.ok(all.length >= 150, `oczekiwano ≥150 krajów, jest ${all.length}`);
  const codes = new Set<string>();
  for (const c of all) {
    assert.match(c.code, /^[A-Z]{2}$/, `zły kod: ${c.code}`);
    assert.ok(c.pl.length > 1, `brak nazwy PL dla ${c.code}`);
    assert.ok(c.en.length > 1, `brak nazwy EN dla ${c.code}`);
    assert.ok(!codes.has(c.code), `zduplikowany kod ${c.code}`);
    codes.add(c.code);
  }
});

test("nazwa kraju w obie strony", () => {
  assert.equal(countryNamePl("TH"), "Tajlandia");
  assert.equal(countryNameEn("TH"), "Thailand");
  assert.equal(countryNamePl("th"), "Tajlandia");
  assert.equal(countryNamePl("ZZ"), null);
});

test("każda nazwa PL i EN rozwiązuje się z powrotem na własny kod", () => {
  // Wyłapuje literówki w tabeli: gdyby dwa kraje miały tę samą nazwę albo
  // nazwa nie przechodziła normalizacji, ten test to pokaże.
  for (const c of allCountries()) {
    assert.equal(resolveCountryCode(c.pl), c.code, `PL „${c.pl}" nie wraca na ${c.code}`);
    assert.equal(resolveCountryCode(c.en), c.code, `EN „${c.en}" nie wraca na ${c.code}`);
  }
});
