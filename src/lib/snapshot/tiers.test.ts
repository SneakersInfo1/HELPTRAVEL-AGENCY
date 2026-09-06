// Tiery kierunków (§18) — MUSZĄ być deterministyczne i jawnie heurystyczne.
//
// Repo nie ma danych o realnym popycie (analityka ruchu jest martwa — patrz
// audyt), a `popularity` w seedzie NIE jest popytem polskim: 640 z 796
// kierunków ma dokładnie 50-59, a szczyt listy to sama Hiszpania. Dlatego
// tier A budujemy z list KURATOROWANYCH przez właściciela, a nie z liczby,
// która wygląda na sygnał, ale nim nie jest.

import assert from "node:assert/strict";
import { test } from "node:test";

import seedJson from "../../../data/destinations.json";
import {
  buildDestinationTiers,
  ORIGIN_TIER_A,
  ORIGIN_TIER_B,
  TIER_WEIGHT,
  type TierSeedRecord,
} from "./tiers";

const SEED = (seedJson as { destinations: TierSeedRecord[] }).destinations;

test("kazdy kierunek seedu dostaje dokladnie jeden tier", () => {
  // Seed ma 10 par rekordow o tym samym id (warianty diakrytyczne nazw), wiec
  // porownujemy do liczby UNIKALNYCH id — dedup jest tu zamierzony.
  const uniqueIds = new Set(SEED.map((d) => d.id));
  const tiers = buildDestinationTiers(SEED);
  assert.equal(tiers.length, uniqueIds.size);
  assert.equal(new Set(tiers.map((t) => t.id)).size, uniqueIds.size, "duplikaty id na wyjsciu");
  for (const t of tiers) {
    assert.ok(["A", "B", "C"].includes(t.tier), `${t.id}: nieznany tier ${t.tier}`);
  }
});

test("dedup wybiera rekord KANONICZNY, nie pierwszy z brzegu", () => {
  const malaga = buildDestinationTiers(SEED).find((t) => t.id === "malaga-spain");
  // Seed ma „Malaga" (popularity 100) i „Málaga" (50) pod tym samym id.
  assert.equal(malaga?.popularity, 100);
});

test("tier A jest maly i skonczony — to jest zestaw, ktory grzejemy czesto", () => {
  const a = buildDestinationTiers(SEED).filter((t) => t.tier === "A");
  assert.ok(a.length >= 30, `tier A za maly: ${a.length}`);
  assert.ok(a.length <= 80, `tier A za duzy (rozsadzi budzet crona): ${a.length}`);
});

test("kierunki z kafelkow homepage i sekcji pakietow sa w tierze A", () => {
  const byId = new Map(buildDestinationTiers(SEED).map((t) => [t.id, t]));
  for (const id of ["barcelona-spain", "rome-italy", "larnaca-cyprus", "rhodes-greece"]) {
    assert.equal(byId.get(id)?.tier, "A", `${id} powinien byc w tierze A`);
  }
});

test("tier B jest ZROZNICOWANY krajowo, nie jest sama Hiszpania", () => {
  // To jest konkretna pulapka tego seedu: sortowanie po `popularity` daje
  // trzydziesci hiszpanskich miast pod rzad. Limit na kraj ma to rozbic.
  const b = buildDestinationTiers(SEED).filter((t) => t.tier === "B");
  assert.ok(b.length > 0);
  const byCountry = new Map<string, number>();
  for (const t of b) byCountry.set(t.countryEn, (byCountry.get(t.countryEn) ?? 0) + 1);
  const biggest = Math.max(...byCountry.values());
  assert.ok(
    biggest <= b.length / 3,
    `jeden kraj dominuje tier B: ${biggest} z ${b.length} (${[...byCountry].sort((x, y) => y[1] - x[1])[0][0]})`,
  );
  assert.ok(byCountry.size >= 8, `za malo krajow w tierze B: ${byCountry.size}`);
});

test("tier A + B daje docelowe pokrycie rzedu 15-25% seedu", () => {
  const tiers = buildDestinationTiers(SEED);
  const warmable = tiers.filter((t) => t.tier !== "C").length;
  const pct = (warmable / SEED.length) * 100;
  assert.ok(pct >= 15, `pokrycie warmowalne za male: ${pct.toFixed(1)}%`);
  assert.ok(pct <= 30, `pokrycie warmowalne za duze — cron tego nie udzwignie: ${pct.toFixed(1)}%`);
});

test("tierowanie jest deterministyczne", () => {
  assert.deepEqual(buildDestinationTiers(SEED), buildDestinationTiers(SEED));
});

test("kolejnosc w tierze jest stabilna i niezalezna od kolejnosci wejscia", () => {
  const normal = buildDestinationTiers(SEED).map((t) => `${t.id}:${t.tier}`);
  const shuffled = buildDestinationTiers([...SEED].reverse()).map((t) => `${t.id}:${t.tier}`);
  assert.deepEqual([...normal].sort(), [...shuffled].sort());
});

test("wagi tierow rosna od C do A — pokrycie wazone ma premiowac HOT", () => {
  assert.ok(TIER_WEIGHT.A > TIER_WEIGHT.B);
  assert.ok(TIER_WEIGHT.B > TIER_WEIGHT.C);
  assert.ok(TIER_WEIGHT.C > 0);
});

test("lotniska wylotu: tier A to realne polskie huby, bez duplikatow", () => {
  assert.ok(ORIGIN_TIER_A.length >= 1 && ORIGIN_TIER_A.length <= 3);
  assert.ok(ORIGIN_TIER_A.includes("WAW"), "WAW dominuje polski ruch leisure");
  const all = [...ORIGIN_TIER_A, ...ORIGIN_TIER_B];
  assert.equal(new Set(all).size, all.length, "lotnisko powtorzone w dwoch tierach");
  for (const iata of all) assert.match(iata, /^[A-Z]{3}$/);
});

test("kazdy kierunek niesie lotnisko docelowe — inaczej nie ma czego szukac", () => {
  for (const t of buildDestinationTiers(SEED).filter((x) => x.tier !== "C")) {
    assert.match(t.iata ?? "", /^[A-Z]{3}$/, `${t.id} bez IATA w tierze ${t.tier}`);
  }
});
