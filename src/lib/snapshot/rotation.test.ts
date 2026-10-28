// Rotacja i priorytety (§28, §29, §52).

import assert from "node:assert/strict";
import { test } from "node:test";

import seedJson from "../../../data/destinations.json";
import { buildDestinationTiers, ORIGIN_TIER_A, ORIGIN_TIER_B, type TierSeedRecord } from "./tiers";
import { buildTaskList, planRun, resolveSegment, segmentForNow } from "./rotation";
import { SEGMENT_COUNT as SEGMENT_COUNT_PROD, TASK_BUDGET as TASK_BUDGET_PROD } from "./config";
import { buildWindowMatrix } from "./windows";

const SEED = (seedJson as { destinations: TierSeedRecord[] }).destinations;
const TIERS = buildDestinationTiers(SEED);
const WINDOWS = buildWindowMatrix("2026-09-06");
const ORIGINS = { tierA: ORIGIN_TIER_A, tierB: ORIGIN_TIER_B };
const SEGMENTS = 5;

test("tier C nigdy nie trafia do planu — dlugi ogon jest on-demand", () => {
  for (const t of buildTaskList(TIERS, WINDOWS, ORIGINS)) {
    assert.notEqual(t.dest.tier, "C", `${t.dest.id} w tierze C nie powinien byc grzany`);
  }
});

test("§29: lista zaczyna sie od tieru A na najblizszym miesiacu", () => {
  const first = buildTaskList(TIERS, WINDOWS, ORIGINS)[0];
  assert.equal(first.dest.tier, "A");
  assert.ok(ORIGIN_TIER_A.includes(first.origin as "WAW"));
  const earliestMonth = Math.min(...WINDOWS.map((w) => w.year * 12 + w.month));
  assert.equal(first.window.year * 12 + first.window.month, earliestMonth);
});

test("§29: wszystkie zadania tieru A stoja przed wszystkimi tieru B", () => {
  const list = buildTaskList(TIERS, WINDOWS, ORIGINS);
  const lastA = list.map((t) => t.dest.tier).lastIndexOf("A");
  const firstB = list.map((t) => t.dest.tier).indexOf("B");
  assert.ok(firstB === -1 || lastA < firstB, `tier B (${firstB}) wchodzi przed koncem tieru A (${lastA})`);
});

test("§28: segmenty sa rozlaczne i razem pokrywaja cala liste", () => {
  const all = buildTaskList(TIERS, WINDOWS, ORIGINS);
  const seen = new Set<string>();
  let total = 0;
  for (let s = 0; s < SEGMENTS; s += 1) {
    const run = planRun(TIERS, WINDOWS, ORIGINS, { segment: s, segmentCount: SEGMENTS, taskBudget: 100_000 });
    total += run.length;
    for (const t of run) {
      const key = `${t.dest.id}|${t.origin}|${t.window.label}`;
      assert.ok(!seen.has(key), `zadanie ${key} powtorzone w segmencie ${s}`);
      seen.add(key);
    }
  }
  assert.equal(total, all.length);
  assert.equal(seen.size, all.length);
});

test("§28: KAZDY segment zawiera kierunki tieru A (hot grzany w kazdym przebiegu)", () => {
  for (let s = 0; s < SEGMENTS; s += 1) {
    const run = planRun(TIERS, WINDOWS, ORIGINS, { segment: s, segmentCount: SEGMENTS, taskBudget: 120 });
    assert.ok(
      run.some((t) => t.dest.tier === "A"),
      `segment ${s} bez ani jednego kierunku tieru A`,
    );
  }
});

test("budzet zadan jest twardym limitem", () => {
  const run = planRun(TIERS, WINDOWS, ORIGINS, { segment: 0, segmentCount: SEGMENTS, taskBudget: 37 });
  assert.equal(run.length, 37);
});

test("plan jest deterministyczny dla tego samego segmentu", () => {
  const a = planRun(TIERS, WINDOWS, ORIGINS, { segment: 2, segmentCount: SEGMENTS, taskBudget: 50 });
  const b = planRun(TIERS, WINDOWS, ORIGINS, { segment: 2, segmentCount: SEGMENTS, taskBudget: 50 });
  assert.deepEqual(a.map((t) => t.dest.id), b.map((t) => t.dest.id));
});

test("segment z zegara obraca sie po kolei i wraca do zera", () => {
  const twoHours = 2 * 3600 * 1000;
  const seen = Array.from({ length: SEGMENTS + 1 }, (_, i) => segmentForNow(i * twoHours, twoHours, SEGMENTS));
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 0]);
});

test("tier B dostaje mniej okien niz tier A", () => {
  const list = buildTaskList(TIERS, WINDOWS, ORIGINS, { tierBWindows: 2 });
  const windowsForA = new Set(list.filter((t) => t.dest.tier === "A").map((t) => t.window.label));
  const windowsForB = new Set(list.filter((t) => t.dest.tier === "B").map((t) => t.window.label));
  assert.equal(windowsForA.size, WINDOWS.length);
  assert.equal(windowsForB.size, 2);
});

test("lotniska tieru B trafiaja do planu przez rotacje po kierunkach", () => {
  const origins = new Set(buildTaskList(TIERS, WINDOWS, ORIGINS).map((t) => t.origin));
  assert.ok(origins.has("WAW"));
  assert.ok(
    ORIGIN_TIER_B.some((o) => origins.has(o)),
    `zadne lotnisko tieru B nie weszlo: ${[...origins].join(",")}`,
  );
});

test("kazde zadanie ma komplet danych do odpytania dostawcy", () => {
  for (const t of buildTaskList(TIERS, WINDOWS, ORIGINS).slice(0, 200)) {
    assert.match(t.origin, /^[A-Z]{3}$/);
    assert.match(t.dest.iata ?? "", /^[A-Z]{3}$/);
    assert.ok(t.window.checkin < t.window.checkout);
  }
});

test("segment miesci sie w zmierzonym najgorszym tempie zimnego przebiegu", () => {
  // Pomiar na Preview: segment 3 na zimno startowal 54 zadania w budzecie 170 s
  // = 3,15 s/zadanie. Segment wiekszy niz ~54 zadania ryzykuje, ze budzet
  // utnie ZAWSZE TEN SAM ogon (kolejnosc zadan jest stala), wiec te zadania
  // nigdy sie nie odswieza. Ten test pilnuje, ze konfiguracja nie wroci
  // po cichu do rozmiaru, ktory to powoduje.
  const NAJGORSZE_TEMPO_S = 3.15;
  const BUDZET_S = 170;
  const maxZadanWBudzecie = Math.floor(BUDZET_S / NAJGORSZE_TEMPO_S);
  const all = buildTaskList(TIERS, WINDOWS, ORIGINS, { tierBWindows: 2 });
  for (let s = 0; s < SEGMENT_COUNT_PROD; s += 1) {
    const size = all.filter((_, i) => i % SEGMENT_COUNT_PROD === s).length;
    assert.ok(
      size <= maxZadanWBudzecie,
      `segment ${s} ma ${size} zadan, a w najgorszym zmierzonym tempie budzet starcza na ${maxZadanWBudzecie}`,
    );
  }
});

test("budzet zadan nie ucina zadnego segmentu przy produkcyjnej konfiguracji", () => {
  const all = buildTaskList(TIERS, WINDOWS, ORIGINS, { tierBWindows: 2 });
  for (let s = 0; s < SEGMENT_COUNT_PROD; s += 1) {
    const size = all.filter((_, i) => i % SEGMENT_COUNT_PROD === s).length;
    assert.ok(size <= TASK_BUDGET_PROD, `segment ${s}: ${size} > budzet ${TASK_BUDGET_PROD}`);
  }
});

// REGRESJA z produkcji (2026-10-24): harmonogram woła crona BEZ `?segment`,
// a `Number(null) === 0` przypinało KAŻDY przebieg do segmentu 0 — te same
// zadania co 30 minut, pokrycie snapshotu zamrożone na 6,11%.
test("resolveSegment: brak parametru = segment z ZEGARA, nie 0", () => {
  const interval = 30 * 60 * 1000;
  const t = 1_792_808_713_144; // 2026-10-24T02:25 UTC — w logach produkcji: segment 0
  assert.equal(segmentForNow(t, interval, 20), 4);
  assert.equal(resolveSegment(null, t, interval, 20), 4);
  assert.equal(resolveSegment("", t, interval, 20), 4);
  assert.equal(resolveSegment("abc", t, interval, 20), 4);
  assert.equal(resolveSegment("-3", t, interval, 20), 4);
  // kolejny przebieg (+30 min) to KOLEJNY segment
  assert.equal(resolveSegment(null, t + interval, interval, 20), 5);
});

test("resolveSegment: jawny parametr (pomiar ręczny) nadal działa, modulo liczba segmentów", () => {
  const interval = 30 * 60 * 1000;
  assert.equal(resolveSegment("0", 0, interval, 20), 0);
  assert.equal(resolveSegment("7", 0, interval, 20), 7);
  assert.equal(resolveSegment("27", 0, interval, 20), 7);
  assert.equal(resolveSegment(" 3 ", 0, interval, 20), 3);
});
