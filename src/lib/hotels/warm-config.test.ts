// Okna dat pre-warmingu muszą być deterministyczne i sensowne (piątek/sobota,
// właściwa liczba nocy, zawsze w przyszłości) — niezależnie od dnia uruchomienia
// crona. Test sprawdza WŁASNOŚCI (dzień tygodnia, noce, przyszłość) dla kilku
// „dni startu" rozłożonych po tygodniu, w tym przypadków brzegowych (start w
// piątek/sobotę), gdzie minAhead=2 nie może zwrócić „dziś".

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeWarmDateWindows,
  HOME_TILE_DESTINATION_IDS,
  WARM_EXTRA_DESTINATION_IDS,
} from "./warm-config";

const DAY = 86_400_000;
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const nights = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY);

// Cały tydzień startów (pon…niedz) + losowa data — żeby złapać brzegi.
const STARTS = [
  "2026-06-29", // pon
  "2026-06-30", // wt
  "2026-07-01", // śr
  "2026-07-02", // czw
  "2026-07-03", // pt  (brzeg: minAhead nie może dać dziś)
  "2026-07-04", // sob (brzeg)
  "2026-07-05", // niedz
];

for (const start of STARTS) {
  test(`okna dat: poprawne własności dla startu ${start}`, () => {
    const now = new Date(`${start}T09:00:00Z`);
    const w = computeWarmDateWindows(now);
    assert.equal(w.length, 3, "trzy okna");

    const [we1, we2, wk1] = w;
    // weekend-1: piątek + 2 noce (niedziela)
    assert.equal(dow(we1.checkin), 5, "weekend-1 checkin = piątek");
    assert.equal(nights(we1.checkin, we1.checkout), 2, "weekend-1 = 2 noce");
    // weekend-2: dokładnie +7 dni od weekend-1
    assert.equal(nights(we1.checkin, we2.checkin), 7, "weekend-2 = +7 dni");
    assert.equal(dow(we2.checkin), 5, "weekend-2 checkin = piątek");
    assert.equal(nights(we2.checkin, we2.checkout), 2, "weekend-2 = 2 noce");
    // tydzien-1: sobota + 7 nocy
    assert.equal(dow(wk1.checkin), 6, "tydzien-1 checkin = sobota");
    assert.equal(nights(wk1.checkin, wk1.checkout), 7, "tydzien-1 = 7 nocy");

    // Wszystkie checkiny ≥ start+2 dni (nie grzejemy dziś/jutro).
    const minStart = new Date(now);
    minStart.setUTCHours(0, 0, 0, 0);
    for (const win of w) {
      const ci = new Date(`${win.checkin}T00:00:00Z`).getTime();
      assert.ok(ci >= minStart.getTime() + 2 * DAY, `${win.label} checkin ≥ start+2`);
    }
  });
}

test("okna dat: deterministyczne (ten sam wynik dla tego samego now)", () => {
  const now = new Date("2026-06-29T12:00:00Z");
  assert.deepEqual(computeWarmDateWindows(now), computeWarmDateWindows(now));
});

test("każdy kafelek homepage jest w extras crona (inaczej kafelek nigdy nie dostanie ceny)", () => {
  assert.equal(HOME_TILE_DESTINATION_IDS.length, 8);
  for (const id of HOME_TILE_DESTINATION_IDS) {
    assert.ok(WARM_EXTRA_DESTINATION_IDS.includes(id), `${id} nie jest grzany`);
  }
});
