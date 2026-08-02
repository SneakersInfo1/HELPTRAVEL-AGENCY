// Okna dat pre-warmingu muszą być deterministyczne i sensowne (piątek/sobota,
// właściwa liczba nocy, zawsze w przyszłości) — niezależnie od dnia uruchomienia
// crona. Test sprawdza WŁASNOŚCI (dzień tygodnia, noce, przyszłość) dla kilku
// „dni startu" rozłożonych po tygodniu, w tym przypadków brzegowych (start w
// piątek/sobotę), gdzie minAhead=2 nie może zwrócić „dziś".

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeSnapshotDateWindows,
  computeWarmDateWindows,
  HOME_TILE_DESTINATION_IDS,
  WARM_EXTRA_DESTINATION_IDS,
} from "./warm-config";
import { TRAVEL_MOODS } from "../mvp/travel-moods";
import seedJson from "../../../data/destinations.json";

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
  assert.equal(HOME_TILE_DESTINATION_IDS.length, 18, "18 = równe 3 rzędy przy xl:grid-cols-6");
  for (const id of HOME_TILE_DESTINATION_IDS) {
    assert.ok(WARM_EXTRA_DESTINATION_IDS.includes(id), `${id} nie jest grzany`);
  }
});

test("pakiety: kierunki ROZŁĄCZNE z kafelkami i obecne w seedzie (właściciel: „w obu sekcjach inne”)", async () => {
  const { PACKAGE_DESTINATION_IDS } = await import("./warm-config");
  assert.equal(PACKAGE_DESTINATION_IDS.length, 12);
  assert.equal(new Set(PACKAGE_DESTINATION_IDS).size, 12, "bez duplikatów");
  const tiles = new Set<string>(HOME_TILE_DESTINATION_IDS);
  const seedIds = new Set(
    (seedJson as unknown as { destinations: Array<{ id: string }> }).destinations.map((d) => d.id),
  );
  for (const id of PACKAGE_DESTINATION_IDS) {
    assert.ok(!tiles.has(id), `${id} dubluje kafelek homepage`);
    assert.ok(seedIds.has(id), `${id} nie istnieje w seedzie — nigdy nie dostanie pakietu`);
  }
});

// Tanie okna snapshotu (prośba właściciela 2026-07-02: ceny „od" na homepage
// za wysokie — najbliższe weekendy w szczycie sezonu są drogie). Okna daleko
// w przód + środek tygodnia dają REALNIE niższe minima bez zmyślania liczb.
for (const start of STARTS) {
  test(`tanie okna snapshotu: własności dla startu ${start}`, () => {
    const now = new Date(`${start}T09:00:00Z`);
    const w = computeSnapshotDateWindows(now);
    assert.equal(w.length, 2, "dwa tanie okna");

    const [taniTydzien, srodtydzien] = w;
    // tani-tydzien: sobota ≥60 dni w przód, 7 nocy (poza szczytem cenowym).
    assert.equal(dow(taniTydzien.checkin), 6, "tani-tydzien checkin = sobota");
    assert.equal(nights(taniTydzien.checkin, taniTydzien.checkout), 7, "tani-tydzien = 7 nocy");
    // srodtydzien: poniedziałek ≥40 dni w przód, 4 noce (stawki weekdayowe).
    assert.equal(dow(srodtydzien.checkin), 1, "srodtydzien checkin = poniedziałek");
    assert.equal(nights(srodtydzien.checkin, srodtydzien.checkout), 4, "srodtydzien = 4 noce");

    const base = new Date(now);
    base.setUTCHours(0, 0, 0, 0);
    assert.ok(
      new Date(`${taniTydzien.checkin}T00:00:00Z`).getTime() >= base.getTime() + 60 * DAY,
      "tani-tydzien ≥ 60 dni w przód",
    );
    assert.ok(
      new Date(`${srodtydzien.checkin}T00:00:00Z`).getTime() >= base.getTime() + 40 * DAY,
      "srodtydzien ≥ 40 dni w przód",
    );
  });
}

test("głębokość skanu snapshotu: wielokrotność 50 (cap calla LiteAPI) i ≥ WARM_HOTELS_PER_DEST", async () => {
  const { SNAPSHOT_HOTELS_PER_DEST, WARM_HOTELS_PER_DEST } = await import("./warm-config");
  assert.ok(SNAPSHOT_HOTELS_PER_DEST >= WARM_HOTELS_PER_DEST);
  assert.equal(SNAPSHOT_HOTELS_PER_DEST % 50, 0, "chunki po 50 muszą się równo dzielić");
});

test("pokrycie mood-picks: ≥90% unikalnych picks rozwiązuje się w seedzie (karty /wyjazdy dostaną ceny)", () => {
  const seen = new Set<string>();
  let hit = 0;
  const dests = (seedJson as { destinations: Array<{ city: { en: string }; country: { en: string } }> }).destinations;
  for (const m of TRAVEL_MOODS) {
    for (const p of m.picks) {
      const k = `${p.searchCity}|${p.country}`.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const found = dests.some(
        (d) =>
          d.city.en.toLowerCase() === p.searchCity.toLowerCase() &&
          d.country.en.toLowerCase() === p.country.toLowerCase(),
      );
      if (found) hit++;
    }
  }
  assert.ok(hit / seen.size >= 0.9, `w seedzie ${hit}/${seen.size} — za mało (karty bez cen)`);
});

test("pula polecanych hoteli: każdy slug istnieje w seedzie i nie ma duplikatów", async () => {
  // Slug spoza seeda nie wywala crona — po prostu wypada w ciszy, a okno
  // rotacji przynosi o jeden kierunek mniej. Sekcja robi się wtedy chudsza
  // z powodu literówki, której nikt nie zobaczy w logach.
  const { FEATURED_DESTINATION_POOL, FEATURED_DESTINATIONS_PER_RUN } = await import("./warm-config");
  const dests = (seedJson as { destinations: Array<{ id: string }> }).destinations;
  const ids = new Set(dests.map((d) => d.id));
  const brakujace = FEATURED_DESTINATION_POOL.filter((slug) => !ids.has(slug));
  assert.deepEqual(brakujace, [], "slugi spoza seeda");

  const duplikaty = FEATURED_DESTINATION_POOL.filter((s, i, a) => a.indexOf(s) !== i);
  assert.deepEqual(duplikaty, [], "duplikat w puli = ten sam kierunek dwa razy w jednym oknie");

  // Pula musi być WYRAŹNIE szersza niż jedno okno, inaczej rotacja nic nie
  // zmienia i obietnica „zestaw zmienia się co 6 godzin" przestaje być prawdą.
  assert.ok(
    FEATURED_DESTINATION_POOL.length >= FEATURED_DESTINATIONS_PER_RUN * 3,
    `pula ${FEATURED_DESTINATION_POOL.length} przy oknie ${FEATURED_DESTINATIONS_PER_RUN} — za mało na sensowną rotację`,
  );
});
