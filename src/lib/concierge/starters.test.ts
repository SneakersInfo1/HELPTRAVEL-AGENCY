// Startery czatu NIE MOGĄ SIĘ STARZEĆ (§6, §64).
//
// Incydent 2026-09-06: starter „Plaża do 3000 zł w sierpniu” stał zaszyty
// w komponencie od miesięcy. We wrześniu zapraszał użytkownika do terminu,
// którego nie da się kupić — a po kliknięciu karta pokazywała „10–17
// sierpnia”. Test przechodzi CAŁY ROK, żeby żaden miesiąc nie mógł przejść
// przez tę bramkę po cichu.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildConciergeStarters, MONTH_LOCATIVE_PL } from "./starters";
import { monthOfIso } from "@/lib/time/travel-now";

const NOW = "2026-09-06";

test("startery nie wymieniaja miesiaca, ktory juz minal — przez caly rok", () => {
  for (let m = 1; m <= 12; m += 1) {
    const today = `2026-${String(m).padStart(2, "0")}-06`;
    const starters = buildConciergeStarters(today);
    const currentMonth = m;
    for (const s of starters) {
      for (let past = 1; past < currentMonth; past += 1) {
        assert.ok(
          !s.prompt.includes(MONTH_LOCATIVE_PL[past]),
          `starter „${s.prompt}” wymienia miniony miesiac ${MONTH_LOCATIVE_PL[past]} (dzis ${today})`,
        );
      }
    }
  }
});

test("A. we wrzesniu 2026 zaden starter nie mowi o sierpniu", () => {
  const starters = buildConciergeStarters(NOW);
  for (const s of starters) {
    assert.ok(!s.prompt.toLowerCase().includes("sierpn"), `starter mowi o sierpniu: ${s.prompt}`);
    assert.ok(!s.label.toLowerCase().includes("sierpn"), `etykieta mowi o sierpniu: ${s.label}`);
  }
});

test("kazdy starter ma niepusta etykiete i prompt oraz ikone", () => {
  const starters = buildConciergeStarters(NOW);
  assert.equal(starters.length, 3);
  for (const s of starters) {
    assert.ok(s.label.length > 0);
    assert.ok(s.prompt.length > 0);
    assert.ok(s.iconKey.length > 0);
  }
});

test("trzy rozne intencje: plaza, city break, slonce zima", () => {
  const keys = buildConciergeStarters(NOW).map((s) => s.intent);
  assert.deepEqual([...keys].sort(), ["beach", "city-break", "winter-sun"]);
});

test("starter plazowy nazywa miesiac tylko w sezonie plazowym", () => {
  // Wrzesien → nastepny pelny miesiac to pazdziernik: wciaz sezon, wiec
  // starter moze byc konkretny.
  const wrzesien = buildConciergeStarters("2026-09-06").find((s) => s.intent === "beach");
  assert.ok(wrzesien);
  assert.ok(wrzesien.prompt.includes(MONTH_LOCATIVE_PL[10]), wrzesien.prompt);

  // Listopad → nastepny pelny miesiac to grudzien: plaza w grudniu to nonsens,
  // wiec starter musi byc BEZTERMINOWY, a nie zapraszac na grudniowa plaze.
  const listopad = buildConciergeStarters("2026-11-06").find((s) => s.intent === "beach");
  assert.ok(listopad);
  for (let m = 1; m <= 12; m += 1) {
    assert.ok(
      !listopad.prompt.includes(MONTH_LOCATIVE_PL[m]),
      `poza sezonem starter plazowy nie powinien nazywac miesiaca: ${listopad.prompt}`,
    );
  }
});

test("miesiac w starterze plazowym jest zawsze PRZYSZLY wzgledem dzis", () => {
  for (let m = 1; m <= 12; m += 1) {
    const today = `2026-${String(m).padStart(2, "0")}-20`;
    const beach = buildConciergeStarters(today).find((s) => s.intent === "beach");
    assert.ok(beach);
    const named = beach.namedMonth;
    if (named === null) continue;
    // Nazwany miesiac musi wypadac PO dzisiaj — porownujemy przez date,
    // bo w grudniu „styczen” jest przyszloscia mimo mniejszego numeru.
    assert.ok(beach.namedMonthFirstDayIso !== null);
    assert.ok(
      (beach.namedMonthFirstDayIso as string) > today,
      `starter na ${today} nazywa miesiac ${named} zaczynajacy sie ${beach.namedMonthFirstDayIso}`,
    );
    assert.equal(monthOfIso(beach.namedMonthFirstDayIso), named);
  }
});

test("startery sa deterministyczne dla tego samego dnia", () => {
  assert.deepEqual(buildConciergeStarters(NOW), buildConciergeStarters(NOW));
});

test("etykiety mieszcza sie w budzecie dlugosci dla ekranu 375 px", () => {
  // To NIE jest dowod renderu — to budzet. Etykieta, ktora dzis jedzie na
  // produkcji („Plaza do 3000 zl w sierpniu", 27 znakow), miesci sie w jednym
  // wierszu przy 375 px. Najdluzszy wariant generowany („...w pazdzierniku")
  // ma 31 znakow. Prog 36 zostawia zapas, ale wywali sie, gdyby ktos wstawil
  // etykiete istotnie dluzsza niz cokolwiek, co bylo ogladane na telefonie.
  const MAX_LABEL_CHARS = 36;
  for (let m = 1; m <= 12; m += 1) {
    for (const s of buildConciergeStarters(`2026-${String(m).padStart(2, "0")}-06`)) {
      assert.ok(
        s.label.length <= MAX_LABEL_CHARS,
        `etykieta „${s.label}" ma ${s.label.length} znakow (budzet ${MAX_LABEL_CHARS})`,
      );
    }
  }
});

test("przyimek pasuje do miesiaca — 'we wrzesniu', nie 'w wrzesniu'", () => {
  // Zbitka „wrz" wymaga „we". Doklejanie stalego „w " dawalo „w wrzesniu".
  const sierpien = buildConciergeStarters("2026-07-06").find((s) => s.intent === "beach");
  assert.ok(sierpien?.label.includes("w sierpniu"), sierpien?.label);
  const wrzesien = buildConciergeStarters("2026-08-06").find((s) => s.intent === "beach");
  assert.ok(wrzesien?.label.includes("we wrześniu"), wrzesien?.label);
  assert.ok(!wrzesien?.label.includes("w wrześniu"), `zla forma: ${wrzesien?.label}`);
});
