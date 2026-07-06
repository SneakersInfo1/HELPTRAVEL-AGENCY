import assert from "node:assert/strict";
import { test } from "node:test";
import { missingFields, normalizeIntent } from "./budget";

test("missingFields: sam motyw+budżet → brakuje interpretacji budżetu i miesiąca", () => {
  assert.deepEqual(missingFields({ theme: "plaza", budgetPln: 3000, wantsFlight: true, wantsHotel: true }).sort(),
    ["adults", "budgetKind", "month"].sort());
});
test("normalizeIntent: brak origin → WAW; brak adults gdy podane → bez zmian", () => {
  const i = normalizeIntent({ theme: "plaza", budgetPln: 3000, budgetKind: "per_person", month: 8, adults: 2, wantsFlight: true, wantsHotel: true });
  assert.equal(i.origin, "WAW");
});
test("missingFields: komplet → []", () => {
  assert.deepEqual(missingFields({ theme: "plaza", budgetPln: 3000, budgetKind: "per_person", month: 8, adults: 2, wantsFlight: true, wantsHotel: true }), []);
});
