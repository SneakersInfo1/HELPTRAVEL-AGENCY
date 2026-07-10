import assert from "node:assert/strict";
import { test } from "node:test";
import { missingFields, normalizeIntent } from "./budget";
import type { ConciergeIntent } from "./types";

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
test("normalizeIntent: brak wantsFlight/wantsHotel → domyślnie true; nie mutuje wejścia", () => {
  const input = { theme: "plaza" } as ConciergeIntent;
  const out = normalizeIntent(input);
  assert.equal(out.wantsFlight, true);
  assert.equal(out.wantsHotel, true);
  assert.equal(out.adults, 2);
  assert.equal(out.children, 0);
  // wejście nietknięte
  assert.equal(input.origin, undefined);
  assert.equal(input.adults, undefined);
});

test("missingFields: brak budżetu → budgetKind NIE jest wymagane (wymagane tylko przy kwocie)", () => {
  const out = missingFields({ theme: "plaza", month: 8, adults: 2, wantsFlight: true, wantsHotel: true });
  assert.equal(out.includes("budgetKind"), false);
  assert.equal(out.includes("budgetPln"), true);
});

test("missingFields: budgetPln:0 i adults:0 traktowane jako obecne (nie falsy)", () => {
  const out = missingFields({ theme: "plaza", budgetPln: 0, budgetKind: "per_person", month: 8, adults: 0, wantsFlight: true, wantsHotel: true });
  assert.equal(out.includes("budgetPln"), false);
  assert.equal(out.includes("adults"), false);
});
