import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addMoney,
  buildPackagePricing,
  countAdults,
  pln,
  priceDelta,
  pricePerPerson,
  subtractMoney,
} from "./packagePricing";

// ── pln / float-safety ────────────────────────────────────────────────────────

test("pln zaokrągla do 2 miejsc i chroni przed dryfem float", () => {
  assert.deepEqual(pln(0.1 + 0.2), { amount: 0.3, currency: "PLN" });
  assert.deepEqual(pln(1899), { amount: 1899, currency: "PLN" });
});

test("addMoney sumuje odpornie na float", () => {
  assert.deepEqual(addMoney(pln(0.1), pln(0.2)), { amount: 0.3, currency: "PLN" });
  assert.deepEqual(addMoney(pln(1200.5), pln(699.5)), { amount: 1900, currency: "PLN" });
});

test("subtractMoney zwraca różnicę, dopuszcza wynik ujemny", () => {
  assert.deepEqual(subtractMoney(pln(1000), pln(1120)), { amount: -120, currency: "PLN" });
});

// ── pricePerPerson (ceil, edge nieparzystych kwot) ────────────────────────────

test("pricePerPerson: kwota parzysta dzieli się równo", () => {
  assert.deepEqual(pricePerPerson(pln(3800), 2), { amount: 1900, currency: "PLN" });
});

test("pricePerPerson: kwota nieparzysta zaokrągla W GÓRĘ (nie zaniżamy ceny)", () => {
  // 3799 / 2 = 1899,5 → 1900
  assert.deepEqual(pricePerPerson(pln(3799), 2), { amount: 1900, currency: "PLN" });
  // 5698 / 3 = 1899,33… → 1900
  assert.deepEqual(pricePerPerson(pln(5698), 3), { amount: 1900, currency: "PLN" });
});

test("pricePerPerson: adults < 1 lub nie-całkowite rzuca", () => {
  assert.throws(() => pricePerPerson(pln(1000), 0));
  assert.throws(() => pricePerPerson(pln(1000), -2));
  assert.throws(() => pricePerPerson(pln(1000), 1.5));
});

// ── countAdults ───────────────────────────────────────────────────────────────

test("countAdults sumuje dorosłych ze wszystkich pokoi", () => {
  assert.equal(countAdults([{ adults: 2, children: [4] }, { adults: 1, children: [] }]), 3);
});

// ── buildPackagePricing ───────────────────────────────────────────────────────

test("buildPackagePricing: total = hotel + lot, cena/os. z total, breakdown zachowany", () => {
  const p = buildPackagePricing({ hotel: pln(1600), flight: pln(2198), adults: 2 });
  assert.deepEqual(p.total, { amount: 3798, currency: "PLN" });
  assert.deepEqual(p.pricePerPerson, { amount: 1899, currency: "PLN" });
  assert.deepEqual(p.breakdown, { hotel: { amount: 1600, currency: "PLN" }, flight: { amount: 2198, currency: "PLN" } });
  assert.equal(p.taxesAtHotel, undefined);
});

test("buildPackagePricing: ancillaries wliczone do total i breakdown; taxesAtHotel osobno (nie w total)", () => {
  const p = buildPackagePricing({
    hotel: pln(1600),
    flight: pln(2198),
    adults: 2,
    ancillaries: pln(200),
    taxesAtHotel: pln(150),
  });
  assert.deepEqual(p.total, { amount: 3998, currency: "PLN" }); // 1600+2198+200; podatki NIE w total
  assert.deepEqual(p.pricePerPerson, { amount: 1999, currency: "PLN" });
  assert.deepEqual(p.breakdown.ancillaries, { amount: 200, currency: "PLN" });
  assert.deepEqual(p.taxesAtHotel, { amount: 150, currency: "PLN" });
});

// ── priceDelta ────────────────────────────────────────────────────────────────

test("priceDelta: domyślna oferta = +0 zł", () => {
  assert.deepEqual(priceDelta(pln(2198), pln(2198)), { amount: 0, currency: "PLN" });
});

test("priceDelta: droższa alternatywa = dodatnia delta", () => {
  assert.deepEqual(priceDelta(pln(2198), pln(2730)), { amount: 532, currency: "PLN" });
});

test("priceDelta: tańsza alternatywa (tab Najtańsze) = ujemna delta", () => {
  assert.deepEqual(priceDelta(pln(2198), pln(2078)), { amount: -120, currency: "PLN" });
});

// ── walidacja waluty (defensywnie) ────────────────────────────────────────────

test("addMoney odrzuca walutę inną niż PLN", () => {
  assert.throws(() => addMoney({ amount: 100, currency: "EUR" as "PLN" }, pln(100)));
});
