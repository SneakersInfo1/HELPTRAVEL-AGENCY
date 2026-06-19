// FAZA 5 — testy jednej wspólnej etykiety oceny (konwencja Booking PL).

import assert from "node:assert/strict";
import { test } from "node:test";

import { ratingLabel } from "./rating";

test("ratingLabel — spójne progi 9/8/7/6", () => {
  assert.equal(ratingLabel(9.2), "Wspaniały");
  assert.equal(ratingLabel(9.0), "Wspaniały");
  assert.equal(ratingLabel(8.9), "Bardzo dobry");
  assert.equal(ratingLabel(8.0), "Bardzo dobry");
  assert.equal(ratingLabel(7.4), "Dobry");
  assert.equal(ratingLabel(7.0), "Dobry");
  assert.equal(ratingLabel(6.5), "Przyjemny");
  assert.equal(ratingLabel(5.9), "Przyzwoity");
});
