// Rok z tekstu uzytkownika — mechanicznie, bo model tego nie podaje.
//
// Pomiar na Preview (2026-09-06): mimo jawnej instrukcji w schemacie narzedzia
// haiku-4.5 na „10-17 sierpnia 2026" przekazal `month: 8` i NIC wiecej.

import assert from "node:assert/strict";
import { test } from "node:test";

import { extractExplicitYear, extractUserDateHints } from "./user-date-hints";

test("wyciaga rok z realnego zdania uzytkownika", () => {
  assert.equal(extractExplicitYear("Chcemy lecieć 10-17 sierpnia 2026 do Grecji"), 2026);
  assert.equal(extractExplicitYear("w sierpniu 2027 na tydzień"), 2027);
  assert.equal(extractExplicitYear("2026"), 2026);
});

test("brak roku w tekscie daje undefined", () => {
  assert.equal(extractExplicitYear("Chcemy lecieć w sierpniu do Grecji"), undefined);
  assert.equal(extractExplicitYear("plaża do 3000 zł"), undefined);
  assert.equal(extractExplicitYear(""), undefined);
  assert.equal(extractExplicitYear(null), undefined);
});

test("KWOTA nie moze udawac roku", () => {
  // To jest realne ryzyko: budzety w tym produkcie sa czterocyfrowe.
  assert.equal(extractExplicitYear("budżet 3000 zł"), undefined);
  assert.equal(extractExplicitYear("do 2000 zł na osobę"), undefined);
  assert.equal(extractExplicitYear("mamy 2050 zł"), undefined, "kwota z waluta to budzet, nie rok");
  assert.equal(extractExplicitYear("koszt 12026 zł"), undefined, "rok przyklejony do innej cyfry");
  assert.equal(extractExplicitYear("cena 2026,50 zł"), undefined);
});

test("przy kilku latach wygrywa OSTATNIE", () => {
  assert.equal(extractExplicitYear("w 2025 byliśmy w Grecji, teraz myślimy o sierpniu 2026"), 2026);
});

test("budzet i rok w jednym zdaniu — rok wygrywa, kwota jest ignorowana", () => {
  // Realne zdanie ze smoke'a na Preview.
  assert.equal(
    extractExplicitYear("Chcemy lecieć 10-17 sierpnia 2026 do Grecji, 2 osoby, budżet 5000 zł na osobę"),
    2026,
  );
  assert.equal(extractExplicitYear("budżet 2000 zł, lecimy w sierpniu 2027"), 2027);
});

test("rok spoza rozsadnego zakresu jest ignorowany", () => {
  assert.equal(extractExplicitYear("rok 2199"), undefined);
  assert.equal(extractExplicitYear("1999"), undefined);
});

test("extractUserDateHints zwraca pusty obiekt bez roku", () => {
  assert.deepEqual(extractUserDateHints("plaża do 3000 zł"), {});
  assert.deepEqual(extractUserDateHints("sierpień 2026"), { year: 2026 });
});
