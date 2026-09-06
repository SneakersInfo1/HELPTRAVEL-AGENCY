// Ostatnia linia obrony przed oferta z przeszlosci (§13, §I, §J).
//
// Karta jest jedynym miejscem, ktore uzytkownik naprawde widzi i klika, wiec
// nawet gdyby kazda wczesniejsza warstwa zawiodla, TU oferta z minionym
// terminem nie moze sie wyrenderowac ani wygenerowac linku.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatTravelDateRangePl,
  isOfferDateRenderable,
  withSafeDateParams,
} from "./offer-date-guard";

const NOW = "2026-09-06";

// ── Rok w tekscie ───────────────────────────────────────────────────────────

test("termin w biezacym roku nie pokazuje roku — czyta sie naturalnie", () => {
  assert.equal(formatTravelDateRangePl("2026-10-19", "2026-10-23", NOW), "19–23 października");
});

test("termin w INNYM roku pokazuje rok — to jest ten bug ze zrzutu", () => {
  // Bez roku „10–17 sierpnia" w dniu 6 wrzesnia 2026 wyglada jak przeszlosc,
  // mimo ze dane mowia o sierpniu 2027. Rok rozstrzyga te dwuznacznosc.
  const out = formatTravelDateRangePl("2027-08-10", "2027-08-17", NOW);
  assert.ok(out.includes("2027"), out);
  assert.ok(out.includes("sierpnia"), out);
});

test("termin przez granice roku pokazuje rok po obu stronach", () => {
  const out = formatTravelDateRangePl("2026-12-28", "2027-01-04", NOW);
  assert.ok(out.includes("2026"), out);
  assert.ok(out.includes("2027"), out);
});

test("smieciowe daty nie wywracaja formatowania", () => {
  assert.equal(formatTravelDateRangePl("bez-sensu", "tez-nie", NOW), "bez-sensu – tez-nie");
});

// ── I: karta z przeszlym terminem nie renderuje aktywnej oferty ─────────────

test("I. termin z przeszlosci nie jest renderowalny", () => {
  assert.equal(isOfferDateRenderable({ checkin: "2026-08-10", checkout: "2026-08-17" }, NOW), false);
});

test("I. dzisiejszy wyjazd tez nie — nie sprzedajemy na dzis", () => {
  assert.equal(isOfferDateRenderable({ checkin: NOW, checkout: "2026-09-13" }, NOW), false);
});

test("I. termin przyszly jest renderowalny", () => {
  assert.equal(isOfferDateRenderable({ checkin: "2026-10-19", checkout: "2026-10-23" }, NOW), true);
});

test("I. checkout przed checkin jest odrzucany", () => {
  assert.equal(isOfferDateRenderable({ checkin: "2026-10-19", checkout: "2026-10-15" }, NOW), false);
});

test("I. brakujace daty sa odrzucane", () => {
  assert.equal(isOfferDateRenderable({ checkin: "", checkout: "" }, NOW), false);
  assert.equal(isOfferDateRenderable({ checkin: null, checkout: null }, NOW), false);
});

// ── J: CTA z przeszla data jest odrzucane ──────────────────────────────────

test("J. link z przeszlym checkin jest odrzucany (null zamiast CTA)", () => {
  const url = "/hotele/lp123?checkin=2026-08-10&checkout=2026-08-17&adults=2&rooms=1";
  assert.equal(withSafeDateParams(url, NOW), null);
});

test("J. link z przyszlym checkin przechodzi bez zmian", () => {
  const url = "/hotele/lp123?checkin=2026-10-19&checkout=2026-10-23&adults=2&rooms=1";
  assert.equal(withSafeDateParams(url, NOW), url);
});

test("J. link lotu z przeszla data wylotu jest odrzucany", () => {
  const url = "/loty/wyniki?from=WAW&to=LCA&depart=2026-08-10&return=2026-08-17&adults=2";
  assert.equal(withSafeDateParams(url, NOW), null);
});

test("J. link bez parametrow dat przechodzi (nie ma czego walidowac)", () => {
  assert.equal(withSafeDateParams("/hotele/lp123", NOW), "/hotele/lp123");
});

test("J. link z data w zlym formacie jest odrzucany (fail-closed)", () => {
  assert.equal(withSafeDateParams("/hotele/lp1?checkin=kiedys&checkout=2026-10-23", NOW), null);
});

test("J. bezsensowny URL nie wywraca guardu", () => {
  assert.equal(withSafeDateParams("", NOW), null);
});

// ── Guard musi znac REALNE nazwy parametrow, nie wymyslone ──────────────────
//
// `withSafeDateParams` sprawdza date tylko w parametrach, ktore zna z nazwy.
// Gdyby ktos przemianowal parametr w builderze URL-i, guard przestalby cokolwiek
// walidowac — po cichu, bo nadal zwracalby link. Ten test wiaze guard z
// PRAWDZIWYMI builderami, wiec taka zmiana wywala sie tutaj.

test("guard lapie przeszla date w linku zbudowanym przez buildResultsUrl", async () => {
  const { buildResultsUrl } = await import("@/lib/flights/recovery");
  const url = buildResultsUrl({
    origin: "WAW",
    destination: "LCA",
    depart: "2026-08-10",
    ret: "2026-08-17",
    adults: 2,
    children: 0,
    infants: 0,
  });
  assert.ok(url.includes("depart=2026-08-10"), url);
  assert.equal(withSafeDateParams(url, NOW), null, `guard przepuscil przeszly link: ${url}`);
});

test("guard przepuszcza przyszly link z buildResultsUrl", async () => {
  const { buildResultsUrl } = await import("@/lib/flights/recovery");
  const url = buildResultsUrl({
    origin: "WAW",
    destination: "LCA",
    depart: "2026-10-19",
    ret: "2026-10-23",
    adults: 2,
    children: 0,
    infants: 0,
  });
  assert.equal(withSafeDateParams(url, NOW), url);
});

test("guard zna KAZDY parametr daty, ktory produkuje link hotelowy", () => {
  // Ksztalt 1:1 z buildHotelHandoffUrl (tools.ts): checkin, checkout, adults, rooms.
  const past = "/hotele/lp1?checkin=2026-08-10&checkout=2026-08-17&adults=2&rooms=1";
  const future = "/hotele/lp1?checkin=2026-10-19&checkout=2026-10-23&adults=2&rooms=1";
  assert.equal(withSafeDateParams(past, NOW), null);
  assert.equal(withSafeDateParams(future, NOW), future);
});
