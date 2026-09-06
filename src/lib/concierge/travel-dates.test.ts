// Kontrakt czasowy V2.2 — testy z §9 master prompta, zegar zawsze wstrzyknięty.
//
// Scenariusz odniesienia (realny incydent): dziś 2026-09-06, starter mówi
// „w sierpniu”, a karta pokazuje „10–17 sierpnia”. Te testy przybijają
// semantykę, która czyni ten wynik niemożliwym.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyTravelDate,
  isBookableStart,
  isWithinSaleHorizon,
  pickNearestFutureWindow,
  resolveExplicitMonthYear,
  resolveMonthWithoutYear,
  SALE_HORIZON_DAYS,
} from "./travel-dates";

const NOW = "2026-09-06";

// ── B/C: stan czasowy terminu ───────────────────────────────────────────────

test("B. oferta 2026-08-10 (przeszłość) jest PAST", () => {
  assert.equal(classifyTravelDate("2026-08-10", NOW), "PAST");
});

test("C. oferta 2026-09-10 (przyszłość) jest FUTURE", () => {
  assert.equal(classifyTravelDate("2026-09-10", NOW), "FUTURE");
});

test("dzisiejsza data to TODAY — nie PAST i nie FUTURE", () => {
  assert.equal(classifyTravelDate(NOW, NOW), "TODAY");
});

test("smieciowa data jest traktowana jak PAST (nie wpuszczamy nieznanego)", () => {
  assert.equal(classifyTravelDate("nie-data", NOW), "PAST");
  assert.equal(classifyTravelDate("", NOW), "PAST");
  assert.equal(classifyTravelDate(null, NOW), "PAST");
});

test("bookable wymaga co najmniej jutra — dzis sie nie sprzedaje", () => {
  assert.equal(isBookableStart("2026-08-10", NOW), false);
  assert.equal(isBookableStart(NOW, NOW), false);
  assert.equal(isBookableStart("2026-09-07", NOW), true);
});

// ── D/F/G/H: miesiąc bez roku ───────────────────────────────────────────────

test("D. sierpien bez roku we wrzesniu 2026 daje sierpien 2027", () => {
  const r = resolveMonthWithoutYear(8, NOW);
  assert.equal(r?.year, 2027);
  assert.equal(r?.month, 8);
  assert.equal(r?.rolledOver, true);
  assert.equal(r?.firstDayIso, "2027-08-01");
});

test("F. najblizszy przyszly: sierpien 2026 odpada, pazdziernik 2026 wygrywa", () => {
  const october = resolveMonthWithoutYear(10, NOW);
  assert.equal(october?.year, 2026);
  assert.equal(october?.rolledOver, false);
  // Pazdziernik jest w tym roku, sierpien dopiero w przyszlym — regula
  // najblizszego przyszlego trzyma sie DAT, nie numerow miesiecy.
  assert.ok((october?.firstDayIso ?? "") < (resolveMonthWithoutYear(8, NOW)?.firstDayIso ?? ""));
});

test("G. w grudniu 2026 styczen daje styczen 2027", () => {
  const r = resolveMonthWithoutYear(1, "2026-12-15");
  assert.equal(r?.year, 2027);
  assert.equal(r?.month, 1);
  assert.equal(r?.rolledOver, true);
});

test("H. rollover roku: grudzien zostaje w tym roku, dopoki sa dni", () => {
  // 1 grudnia z zapasem 7 dni — 8 grudnia wciaz jest w grudniu 2026.
  const stays = resolveMonthWithoutYear(12, "2026-12-01", 7);
  assert.equal(stays?.year, 2026);
  assert.equal(stays?.rolledOver, false);
  // 28 grudnia z zapasem 7 dni — 4 stycznia to juz nie grudzien, wiec 2027.
  const rolls = resolveMonthWithoutYear(12, "2026-12-28", 7);
  assert.equal(rolls?.year, 2027);
  assert.equal(rolls?.rolledOver, true);
});

test("biezacy miesiac zostaje biezacym, jesli miesci sie jeszcze termin", () => {
  // 6 wrzesnia, zapas 7 dni → 13 wrzesnia wciaz wrzesien 2026.
  const r = resolveMonthWithoutYear(9, NOW, 7);
  assert.equal(r?.year, 2026);
  assert.equal(r?.rolledOver, false);
});

test("miesiac spoza 1-12 jest odrzucany", () => {
  assert.equal(resolveMonthWithoutYear(0, NOW), null);
  assert.equal(resolveMonthWithoutYear(13, NOW), null);
});

// ── E: jawny termin z przeszłości ───────────────────────────────────────────

test("E. sierpien 2026 we wrzesniu 2026 to PAST, zero oferty do sprzedazy", () => {
  const r = resolveExplicitMonthYear(8, 2026, NOW);
  assert.equal(r?.state, "PAST");
  assert.equal(r?.bookable, false);
});

test("wrzesien 2026 w trakcie wrzesnia jest wciaz sprzedawalny", () => {
  const r = resolveExplicitMonthYear(9, 2026, NOW);
  assert.equal(r?.state, "TODAY");
  assert.equal(r?.bookable, true);
});

test("wrzesien 2027 to przyszlosc calkiem poza horyzontem sprzedazy lotow", () => {
  const r = resolveExplicitMonthYear(9, 2027, NOW);
  assert.equal(r?.state, "FUTURE");
  assert.equal(r?.withinSaleHorizon, false);
});

// ── Horyzont sprzedaży ──────────────────────────────────────────────────────

test("horyzont sprzedazy odcina terminy, na ktore GDS nie ma jeszcze lotow", () => {
  assert.equal(isWithinSaleHorizon("2026-10-19", NOW), true);
  // To jest DOKLADNIE termin, ktory generowal `datesForMonth(8, …)` dla prosby
  // o sierpien zlozonej 6 wrzesnia: przyszlosc, ale 338 dni naprzod — GDS nie
  // ma jeszcze rozkladow, wiec karta wracala bez lotu.
  assert.equal(isWithinSaleHorizon("2027-08-10", NOW), false);
  assert.equal(SALE_HORIZON_DAYS > 300 && SALE_HORIZON_DAYS < 400, true);
});

// ── §12: EXACT / NEAREST wyłącznie wśród PRZYSZŁYCH okien ───────────────────

const WINDOWS = [
  { checkin: "2026-08-08", checkout: "2026-08-15", nights: 7 }, // przeszlosc
  { checkin: "2026-11-07", checkout: "2026-11-14", nights: 7 },
  { checkin: "2026-10-19", checkout: "2026-10-23", nights: 4 },
];

test("EXACT: okno w zadanym miesiacu i o zadanej liczbie nocy", () => {
  const hit = pickNearestFutureWindow(WINDOWS, { month: 10, nights: 4 }, NOW);
  assert.equal(hit?.matchType, "EXACT");
  assert.equal(hit?.window.checkin, "2026-10-19");
});

test("NEAREST nigdy nie siega do przeszlosci, nawet gdy miesiac pasuje idealnie", () => {
  // Uzytkownik prosi o sierpien/7 nocy. Okno sierpniowe pasuje CO DO MIESIACA,
  // ale minelo — musi wypasc z puli, a nie wygrac jako najblizsze.
  const hit = pickNearestFutureWindow(WINDOWS, { month: 8, nights: 7 }, NOW);
  assert.notEqual(hit?.window.checkin, "2026-08-08");
  assert.equal(hit?.matchType, "NEAREST");
  assert.equal(hit?.window.checkin, "2026-11-07");
});

test("NEAREST przy braku miesiaca bierze najwczesniejsze przyszle okno", () => {
  const hit = pickNearestFutureWindow(WINDOWS, { nights: 4 }, NOW);
  assert.equal(hit?.window.checkin, "2026-10-19");
  assert.equal(hit?.matchType, "EXACT");
});

test("same przeszle okna daja brak dopasowania (nie podstawiamy przeszlosci)", () => {
  const hit = pickNearestFutureWindow([WINDOWS[0]], { month: 8, nights: 7 }, NOW);
  assert.equal(hit, null);
});

test("pusta pula okien daje null", () => {
  assert.equal(pickNearestFutureWindow([], { month: 10 }, NOW), null);
});
