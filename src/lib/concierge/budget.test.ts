import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMonth, missingFields, normalizeIntent } from "./budget";
import type { ConciergeIntent } from "./types";

test("missingFields: sam motyw+budżet → brakuje interpretacji budżetu i liczby osób", () => {
  assert.deepEqual(missingFields({ theme: "plaza", budgetPln: 3000, wantsFlight: true, wantsHotel: true }).sort(),
    ["adults", "budgetKind"].sort());
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

// ── Miesiąc nie może BLOKOWAĆ wyszukiwania ────────────────────────────────
// Zmierzone na batterii ewaluacyjnej (2026-09-04): przypadek „Lecimy z dwójką
// dzieci w wakacje, budżet 8000 zł łącznie" oblało 8 z 9 testowanych modeli —
// wszystkie zadawały pytanie „który miesiąc?", bo `month` było wymagane, a
// „wakacje" to nie liczba. To był przymus STRUKTURALNY, nie wina modelu:
// system prompt każe przy niekonkretnym kliencie przyjąć założenie i szukać.
test("missingFields: brak miesiąca NIE blokuje wyszukiwania", () => {
  const out = missingFields({
    theme: "plaza",
    budgetPln: 8000,
    budgetKind: "total_two",
    adults: 4,
    wantsFlight: true,
    wantsHotel: true,
  });
  assert.equal(out.includes("month"), false);
});

test("missingFields: nadal wymaga motywu i liczby osób", () => {
  const out = missingFields({ budgetPln: 3000, budgetKind: "per_person", wantsFlight: true, wantsHotel: true });
  assert.ok(out.includes("theme"));
  assert.ok(out.includes("adults"));
});

test("defaultMonth: bez miesiąca bierze NASTĘPNY pełny miesiąc", () => {
  // 2026-09-04 → następny pełny miesiąc to październik (10).
  assert.equal(defaultMonth(Date.UTC(2026, 8, 4)), 10);
  // 2026-12-20 → styczeń (1), z przewinięciem roku.
  assert.equal(defaultMonth(Date.UTC(2026, 11, 20)), 1);
});
