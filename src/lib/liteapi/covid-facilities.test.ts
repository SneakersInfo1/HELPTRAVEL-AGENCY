// FAZA 3 — testy filtra COVID. Frazy wzięte z realnych danych LiteAPI/Cupid
// (harvest z hotelu lp27a0d8). Kluczowe: realne udogodnienia bezpieczeństwa
// NIE mogą wpaść do filtra.

import assert from "node:assert/strict";
import { test } from "node:test";

import { isCovidBoilerplate, stripCovidFacilities } from "./covid-facilities";

const COVID_REAL = [
  "Physical distancing rules followed",
  "Guest rooms disinfected between stays",
  "Hand sanitizer in guest room and key areas",
  "Face masks for guests available",
  "Staff adhere to local safety protocols",
  "Screens / barriers between staff and guests for safety",
  "Sanitized tableware & silverware",
  "Guest room sealed after cleaning",
  "Property cleaned by professional cleaning companies",
  "Process in place to check health of guests",
  "Shared stationery like menus, pens are removed",
  // warianty polskie (z language=pl / naszego słownika)
  "Zachowany dystans w strefach gastronomicznych",
  "Ekrany / bariery między personelem a gośćmi",
  "Maseczki dla gości",
  "Dezynfekcja pokoju między pobytami",
  // FAZA 6 — luki znalezione na żywo (Ateny/Rzym)
  "Cleaning standards that are effective against Coronavirus",
  "Standardy czyszczenia skuteczne przeciwko koronawirusowi",
  "Thermometers for guests provided by property",
  "Delivered food - securely covered",
];

const SAFETY_KEEP = [
  "CCTV in common areas",
  "Smoke alarms",
  "Czujniki dymu",
  "Fire extinguishers",
  "Gaśnice",
  "24-hour security",
  "Ochrona całodobowa",
  "First aid kit available",
  "Key card access",
  "Bezdotykowe zameldowanie / wymeldowanie", // contactless to legit funkcja, zostaje
  "Klimatyzacja",
];

test("wykrywa realny boilerplate COVID (PL + EN)", () => {
  for (const s of COVID_REAL) {
    assert.equal(isCovidBoilerplate(s), true, `powinno być COVID: ${s}`);
  }
});

test("NIE łapie realnych udogodnień bezpieczeństwa ani contactless", () => {
  for (const s of SAFETY_KEEP) {
    assert.equal(isCovidBoilerplate(s), false, `NIE powinno być COVID: ${s}`);
  }
});

test("stripCovidFacilities (enabled) usuwa COVID, zostawia resztę", () => {
  const input = ["Maseczki dla gości", "CCTV in common areas", "Hand sanitizer in rooms", "Parking"];
  assert.deepEqual(stripCovidFacilities(input, true), ["CCTV in common areas", "Parking"]);
});

test("stripCovidFacilities (disabled) zwraca listę bez zmian", () => {
  const input = ["Maseczki dla gości", "Parking"];
  assert.deepEqual(stripCovidFacilities(input, false), input);
});
