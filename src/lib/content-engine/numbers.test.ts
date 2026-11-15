import assert from "node:assert/strict";
import test from "node:test";

import { numbersCoveredBy } from "./numbers";

test("ta sama wartość wyłącznie z innym wymiarem nie pokrywa twierdzenia", () => {
  for (const [claim, evidence] of [
    ["Trasa ma 3 km", "The journey takes 3 hours"],
    ["Temperatura wynosi 20°C", "The discount is 20 percent"],
    ["Udział wynosi 30%", "The ticket costs 30 EUR"],
    ["Wpis pochodzi z 1987 roku", "The distance is 1987 km"],
    ["Bilet kosztuje 50 EUR", "The route is 50 km long"],
  ]) {
    assert.equal(numbersCoveredBy(claim, evidence).ok, false, `${claim} / ${evidence}`);
  }
  assert.equal(numbersCoveredBy("Wpis pochodzi z 1987 roku", "Date of Inscription: 1987").ok, true);
});

test("przecinek dziesiętny nie tworzy osobnej liczby całkowitej", () => {
  assert.equal(numbersCoveredBy("Dojazd trwa 3 godziny", "The journey takes 3,5 hours").ok, false);
  assert.equal(numbersCoveredBy("Szczyt ma 3718 m", "The summit is at 3,718 m").ok, true);
});

test("identyfikator alfanumeryczny musi wystąpić dosłownie w dowodzie", () => {
  assert.deepEqual(numbersCoveredBy("Trasy PR1 i PR6 prowadzą przez góry", "Routes PR1 and PR5 cross the mountains").missingIdentifiers, ["PR6"]);
  assert.equal(numbersCoveredBy("Samolot A380 korzysta z T2", "Aircraft A380 uses T2").ok, true);
  assert.equal(numbersCoveredBy("Trasa pr1 prowadzi granią", "Route PR1 follows the ridge").ok, false);
});
