// FAZA 9 — testy selekcji opinii. Kształt danych z realnej odpowiedzi LiteAPI
// /data/reviews (probe lp27a0d8): wynik + język + pros/cons, często puste.

import assert from "node:assert/strict";
import { test } from "node:test";

import { selectReviews, reviewerTypePl, type LiteApiReview } from "./reviews";

const r = (o: Partial<LiteApiReview>): LiteApiReview => ({ source: "Nuitee", ...o });

test("pomija opinie bez tekstu i w nieczytelnych językach", () => {
  const out = selectReviews([
    r({ averageScore: 9, name: "Avnesh", language: "en-gb", date: "2026-06-13", pros: "Fantastic location and very helpful staff." }),
    r({ averageScore: 10, name: "NATSUMI", language: "ja", date: "2026-06-12", pros: "" }), // brak tekstu + ja
    r({ averageScore: 10, name: "Dmitry", language: "ru", date: "2026-06-11", pros: "Очень хорошо" }), // rosyjski → pomijamy
    r({ averageScore: 8, name: "Kata", language: "hu", date: "2026-06-12", pros: "" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Avnesh");
  assert.equal(out[0].isPolish, false);
});

test("polskie opinie idą pierwsze, potem najnowsze", () => {
  const out = selectReviews([
    r({ averageScore: 9, name: "John", language: "en", date: "2026-06-20", pros: "Great breakfast and clean rooms." }),
    r({ averageScore: 10, name: "Anna", language: "pl", date: "2026-05-01", pros: "Świetna lokalizacja, mili pracownicy." }),
    r({ averageScore: 8, name: "Marek", language: "pl-PL", date: "2026-06-10", pros: "Czysto, blisko centrum, polecam." }),
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].isPolish, true);
  assert.equal(out[1].isPolish, true);
  // wśród polskich najnowszy (Marek 06-10) przed starszym (Anna 05-01)
  assert.equal(out[0].name, "Marek");
  assert.equal(out[1].name, "Anna");
  assert.equal(out[2].name, "John");
});

test("limit max", () => {
  const many = Array.from({ length: 6 }, (_, i) =>
    r({ averageScore: 9, name: `G${i}`, language: "en", date: `2026-06-${10 + i}`, pros: "Nice and comfortable stay overall." }),
  );
  assert.equal(selectReviews(many, 3).length, 3);
});

test("brak nadających się opinii → pusta lista (sekcja się ukryje)", () => {
  const out = selectReviews([
    r({ averageScore: 10, language: "ja", pros: "" }),
    r({ averageScore: 9, language: "en", pros: "ok" }), // za krótkie (<12)
  ]);
  assert.deepEqual(out, []);
});

test("reviewerTypePl mapuje znane typy, inaczej null", () => {
  assert.equal(reviewerTypePl("couple"), "para");
  assert.equal(reviewerTypePl("business"), "podróż służbowa");
  assert.equal(reviewerTypePl("unknown_type"), null);
  assert.equal(reviewerTypePl(undefined), null);
});
