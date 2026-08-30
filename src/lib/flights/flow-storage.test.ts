// Testy czystych pomocników przepływu lotu.
//
// Sam magazyn (sessionStorage) jest przeglądarkowy i tu go nie ruszamy —
// testujemy decyzje, które muszą być prawdziwe niezależnie od magazynu.

import assert from "node:assert/strict";
import { test } from "node:test";

import { flowTravellers, resolveWidgetEnv } from "./flow-storage";

// ── FAIL-SAFE ŚRODOWISKA WIDGETU ─────────────────────────────────────────────
//
// `widgetEnv` decyduje, o który klucz publishable widget poprosi LiteAPI.
// Klucz z INNEGO trybu niż client secret = Payment Element się nie montuje.
// Gdy tryb jest nieznany, jedyny bezpieczny domysł to „sandbox": w najgorszym
// razie widget nie wstanie. Domysł „live" w tę samą stronę oznaczałby
// pokazanie prawdziwego formularza płatności przy niepewnym środowisku.

test("znany tryb przechodzi bez zmian", () => {
  assert.equal(resolveWidgetEnv("live"), "live");
  assert.equal(resolveWidgetEnv("sandbox"), "sandbox");
});

test("NIEZNANY tryb spada na sandbox, NIGDY na live", () => {
  assert.equal(resolveWidgetEnv(undefined), "sandbox");
  assert.equal(resolveWidgetEnv(null), "sandbox");
  assert.equal(resolveWidgetEnv(""), "sandbox");
});

test("śmieci w magazynie też spadają na sandbox", () => {
  // `sessionStorage` może zawierać cokolwiek — starą wersję pola, ręczną
  // edycję, przycięty JSON. Nic z tego nie ma prawa włączyć trybu live.
  assert.equal(resolveWidgetEnv("LIVE"), "sandbox");
  assert.equal(resolveWidgetEnv("production"), "sandbox");
  assert.equal(resolveWidgetEnv("prod"), "sandbox");
  assert.equal(resolveWidgetEnv(123 as unknown as string), "sandbox");
  assert.equal(resolveWidgetEnv({} as unknown as string), "sandbox");
});

// ── Liczba podróżnych ────────────────────────────────────────────────────────

test("podróżni to suma dorosłych, dzieci i niemowląt", () => {
  assert.equal(flowTravellers({ adults: 2, children: 1, infants: 1 }), 4);
  assert.equal(flowTravellers({ adults: 1, children: 0, infants: 0 }), 1);
});
