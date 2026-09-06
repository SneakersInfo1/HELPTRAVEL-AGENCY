import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDaysIso,
  daysBetweenIso,
  isIsoDate,
  travelToday,
  __resetTravelClockForTests,
  __setTravelClockForTests,
} from "./travel-now";

test("travelToday zwraca dzień w Europe/Warsaw, nie w UTC", () => {
  // 2026-09-06 23:30 UTC = 2026-09-07 01:30 w Warszawie (CEST, UTC+2).
  // Naiwne toISOString().slice(0,10) dałoby tu 2026-09-06 — czyli cały
  // produkt myślałby, że jest wczoraj, przez dwie godziny każdej doby.
  assert.equal(travelToday(Date.parse("2026-09-06T23:30:00Z")), "2026-09-07");
});

test("travelToday działa też zimą (CET, UTC+1)", () => {
  assert.equal(travelToday(Date.parse("2026-12-31T23:30:00Z")), "2027-01-01");
  // 22:30 UTC w grudniu to jeszcze 31 grudnia w Warszawie (23:30 lokalnie).
  assert.equal(travelToday(Date.parse("2026-12-31T22:30:00Z")), "2026-12-31");
});

test("travelToday w środku dnia jest zwykłą datą", () => {
  assert.equal(travelToday(Date.parse("2026-09-06T12:00:00Z")), "2026-09-06");
});

test("wstrzyknięty zegar wygrywa z zegarem systemowym", () => {
  __setTravelClockForTests(Date.parse("2026-08-01T09:00:00Z"));
  try {
    assert.equal(travelToday(), "2026-08-01");
  } finally {
    __resetTravelClockForTests();
  }
});

test("isIsoDate przyjmuje tylko YYYY-MM-DD", () => {
  assert.equal(isIsoDate("2026-09-06"), true);
  assert.equal(isIsoDate("2026-9-6"), false);
  assert.equal(isIsoDate("2026-09-06T00:00:00Z"), false);
  assert.equal(isIsoDate(""), false);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-02-30"), false);
});

test("addDaysIso przechodzi przez granicę miesiąca i roku", () => {
  assert.equal(addDaysIso("2026-09-06", 1), "2026-09-07");
  assert.equal(addDaysIso("2026-09-30", 1), "2026-10-01");
  assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysIso("2026-03-01", -1), "2026-02-28");
});

test("addDaysIso nie gubi doby na zmianie czasu", () => {
  // Ostatnia niedziela marca 2027 (28.03) to zmiana czasu w Polsce. Arytmetyka
  // na UTC-północy jest na to odporna; arytmetyka na czasie lokalnym nie.
  assert.equal(addDaysIso("2027-03-27", 1), "2027-03-28");
  assert.equal(addDaysIso("2027-03-28", 1), "2027-03-29");
});

test("daysBetweenIso liczy noce", () => {
  assert.equal(daysBetweenIso("2026-10-19", "2026-10-23"), 4);
  assert.equal(daysBetweenIso("2026-10-19", "2026-10-19"), 0);
  assert.equal(daysBetweenIso("2026-10-23", "2026-10-19"), -4);
});
