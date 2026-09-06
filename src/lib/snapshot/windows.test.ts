// Okna dat snapshotu MUSZA PRZESUWAC SIE Z KALENDARZEM (§21).
//
// Poprzedni generator dawal dwa okna liczone od „dzis" i to dzialalo, ale
// snapshot mial przez to DOKLADNIE jedna pare (miesiac, liczba nocy) na
// kierunek — pomiar produkcyjny 2026-09-06: 32 kierunki wycenione na
// 19-23 pazdziernika i 14 na 7-14 listopada. Pytanie „Grecja, pazdziernik,
// 7 nocy" nie mialo jak trafic.

import assert from "node:assert/strict";
import { test } from "node:test";

import { isBookableStart, isWithinSaleHorizon } from "@/lib/concierge/travel-dates";
import { daysBetweenIso, monthOfIso } from "@/lib/time/travel-now";
import { buildWindowMatrix, WINDOW_MONTHS_AHEAD, WINDOW_NIGHTS } from "./windows";

const NOW = "2026-09-06";

test("kazde wygenerowane okno jest PRZYSZLE i sprzedawalne", () => {
  // Caly rok, kilka dni w miesiacu — zaden dzien startowy nie moze wyprodukowac
  // okna w przeszlosci.
  for (let m = 1; m <= 12; m += 1) {
    for (const day of ["01", "15", "28"]) {
      const today = `2026-${String(m).padStart(2, "0")}-${day}`;
      for (const w of buildWindowMatrix(today)) {
        assert.ok(isBookableStart(w.checkin, today), `${w.label}: ${w.checkin} nie jest sprzedawalne (dzis ${today})`);
        assert.ok(w.checkout > w.checkin, `${w.label}: checkout <= checkin`);
      }
    }
  }
});

test("zadne okno nie wychodzi poza horyzont sprzedazy lotow", () => {
  for (const w of buildWindowMatrix(NOW)) {
    assert.ok(isWithinSaleHorizon(w.checkin, NOW), `${w.label} (${w.checkin}) poza horyzontem`);
  }
});

test("okna pokrywaja KILKA miesiecy, nie jeden", () => {
  const months = new Set(buildWindowMatrix(NOW).map((w) => monthOfIso(w.checkin)));
  assert.ok(months.size >= 3, `za malo miesiecy: ${[...months].join(",")}`);
  assert.equal(months.size, WINDOW_MONTHS_AHEAD);
});

test("KAZDY miesiac dostaje KAZDA dlugosc pobytu (cross-coverage)", () => {
  // To jest sedno §20: nie chcemy juz „pazdziernik = tylko 4 noce,
  // listopad = tylko 7 nocy".
  const matrix = buildWindowMatrix(NOW);
  const months = [...new Set(matrix.map((w) => monthOfIso(w.checkin)))];
  for (const month of months) {
    const nights = new Set(matrix.filter((w) => monthOfIso(w.checkin) === month).map((w) => w.nights));
    for (const n of WINDOW_NIGHTS) {
      assert.ok(nights.has(n), `miesiac ${month} nie ma okna na ${n} nocy (ma: ${[...nights].join(",")})`);
    }
  }
});

test("liczba nocy w oknie zgadza sie z etykieta", () => {
  for (const w of buildWindowMatrix(NOW)) {
    assert.equal(daysBetweenIso(w.checkin, w.checkout), w.nights, w.label);
  }
});

test("miniony miesiac NIE dostaje okien — budzet nie idzie w przeszlosc", () => {
  // 28 grudnia: pierwszy pelny miesiac to juz styczen NASTEPNEGO roku.
  const matrix = buildWindowMatrix("2026-12-28");
  for (const w of matrix) {
    assert.ok(w.checkin > "2026-12-28", `${w.label}: ${w.checkin}`);
  }
  const years = new Set(matrix.map((w) => w.checkin.slice(0, 4)));
  assert.ok(years.has("2027"), "rollover roku nie zadzialal");
});

test("etykiety okien sa unikalne i stabilne", () => {
  const labels = buildWindowMatrix(NOW).map((w) => w.label);
  assert.equal(new Set(labels).size, labels.length, "duplikaty etykiet");
  assert.deepEqual(labels, buildWindowMatrix(NOW).map((w) => w.label), "generator nie jest deterministyczny");
});

test("okna startuja w sobote (tydzien) i poniedzialek (krotki pobyt)", () => {
  // Sobota = klasyczny turnus, poniedzialek = tanie stawki weekdayowe.
  // Dzien tygodnia liczymy na polnocy UTC, jak reszta arytmetyki dat.
  for (const w of buildWindowMatrix(NOW)) {
    const dow = new Date(`${w.checkin}T00:00:00Z`).getUTCDay();
    assert.equal(dow, w.nights === 7 ? 6 : 1, `${w.label} (${w.checkin}) ma zly dzien tygodnia: ${dow}`);
  }
});
