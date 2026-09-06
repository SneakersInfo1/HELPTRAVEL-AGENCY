// Publikacja snapshotu — staging, walidacja, ATOMOWY promote, rollback
// (§30-§38). Testy jada na FAKE Redisie, wiec nie dotykaja produkcji.
//
// Rzecz, ktorej pilnujemy najmocniej: uzytkownik NIGDY nie moze zobaczyc
// polowy buildu. Poprzedni wzorzec (`mergePriceSnapshot` = odczyt-scal-zapis
// na jednym kluczu) tego nie gwarantowal: przebieg przerwany w polowie
// zostawial klucz z czescia kierunkow odswiezonych, a czescia nie.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  __resetSnapshotRedisForTests,
  __setSnapshotRedisForTests,
  publishSnapshot,
  readActiveSnapshot,
  readPreviousSnapshot,
  rollbackToPrevious,
  validateSnapshot,
  writeStaging,
} from "./store";
import { SNAPSHOT_VERSION, type ConciergeSnapshot, type SnapshotRecord } from "./types";

// ── Fake Redis ──────────────────────────────────────────────────────────────

function fakeRedis(opts: { failOn?: RegExp; throwOnSet?: boolean } = {}) {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T>(key: string): Promise<T | null> {
      if (opts.failOn?.test(key)) throw new Error("redis down");
      return (data.get(key) as T) ?? null;
    },
    async set(key: string, value: unknown): Promise<unknown> {
      if (opts.throwOnSet) throw new Error("redis down");
      if (opts.failOn?.test(key)) throw new Error("redis down");
      data.set(key, value);
      return "OK";
    },
    async del(key: string): Promise<unknown> {
      data.delete(key);
      return 1;
    },
  };
}

const NOW = Date.UTC(2026, 8, 6, 12);

function rec(over: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    destId: "malaga-spain",
    cityEn: "Malaga",
    cityPl: "Malaga",
    countryEn: "Spain",
    countryPl: "Hiszpania",
    origin: "WAW",
    destIata: "AGP",
    checkin: "2026-10-05",
    checkout: "2026-10-09",
    month: 10,
    year: 2026,
    nights: 4,
    flightPln: 600,
    hotelPlnPerNight: 200,
    perPersonPln: 1000,
    currency: "PLN",
    tier: "A",
    pricedAt: NOW,
    carriedForward: false,
    ...over,
  };
}

function snap(records: SnapshotRecord[], runId = "run-1"): ConciergeSnapshot {
  const map: Record<string, SnapshotRecord> = {};
  records.forEach((r, i) => {
    map[`${r.destId}|${r.origin}|${r.checkin}|${r.nights}|${i}`] = r;
  });
  return {
    meta: {
      version: SNAPSHOT_VERSION,
      runId,
      builtAt: NOW,
      windowConfig: { monthsAhead: 4, nights: [4, 7], labels: [] },
      originConfig: { tierA: ["WAW"], tierB: [] },
      destinationTierConfig: { a: 53, b: 86, c: 647 },
      coverage: {
        seedDestinations: 786,
        destinationsWithPrice: records.length,
        destinationCoveragePct: 0,
        futureUsableDestinations: records.length,
        futureUsableCoveragePct: 0,
        weightedCoveragePct: 0,
        tierACoveragePct: 0,
        tierBCoveragePct: 0,
        records: records.length,
        futureRecords: records.length,
        expiredRecords: 0,
        fresh: records.length,
        staleButUsable: 0,
        expiredPrice: 0,
        monthsCovered: 1,
        nightsCovered: 1,
        originsCovered: 1,
        countriesCovered: 1,
      },
      segment: 0,
      segmentCount: 5,
    },
    records: map,
  };
}

function manyRecords(n: number): SnapshotRecord[] {
  return Array.from({ length: n }, (_, i) => rec({ destId: `dest-${i}` }));
}

// ── §36: walidacja przed promote ────────────────────────────────────────────

test("walidacja przepuszcza zdrowy snapshot", () => {
  const v = validateSnapshot(snap(manyRecords(50)), null, NOW);
  assert.equal(v.ok, true, v.problems.join("; "));
});

test("walidacja odrzuca rekord z PRZESZLA data wyjazdu", () => {
  const v = validateSnapshot(snap([...manyRecords(49), rec({ checkin: "2026-08-10", checkout: "2026-08-17" })]), null, NOW);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("przesz")), v.problems.join("; "));
});

test("walidacja odrzuca ceny NaN / ujemne / nonsensowne (§38)", () => {
  for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
    const v = validateSnapshot(snap([...manyRecords(49), rec({ perPersonPln: bad })]), null, NOW);
    assert.equal(v.ok, false, `cena ${bad} powinna zostac odrzucona`);
  }
});

test("walidacja odrzuca zla walute i zla liczbe nocy", () => {
  assert.equal(
    validateSnapshot(snap([...manyRecords(49), rec({ currency: "EUR" as "PLN" })]), null, NOW).ok,
    false,
  );
  assert.equal(validateSnapshot(snap([...manyRecords(49), rec({ nights: 0 })]), null, NOW).ok, false);
});

test("walidacja odrzuca pusty snapshot", () => {
  assert.equal(validateSnapshot(snap([]), null, NOW).ok, false);
});

// ── §37: bramka minimalnego pokrycia ────────────────────────────────────────

test("§37: gwaltowny spadek pokrycia wzgledem ACTIVE blokuje publikacje", () => {
  const active = snap(manyRecords(120), "run-old");
  const collapsed = snap(manyRecords(8), "run-new");
  const v = validateSnapshot(collapsed, active, NOW);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("pokrycie")), v.problems.join("; "));
});

test("§37: lagodny spadek pokrycia przechodzi (dostawca miewa gorsze dni)", () => {
  const active = snap(manyRecords(120), "run-old");
  const slightlyWorse = snap(manyRecords(105), "run-new");
  assert.equal(validateSnapshot(slightlyWorse, active, NOW).ok, true);
});

// ── §30/§32: staging → atomowy promote → previous ───────────────────────────

test("§30: publikacja przechodzi przez staging i konczy sie ATOMOWYM promote", async () => {
  const redis = fakeRedis();
  __setSnapshotRedisForTests(redis);
  try {
    const s = snap(manyRecords(50), "run-1");
    await writeStaging(s);
    // Przed promote ACTIVE jest wciaz pusty — uzytkownik nie widzi polowy buildu.
    assert.equal(await readActiveSnapshot(), null);
    const res = await publishSnapshot(s, NOW);
    assert.equal(res.published, true, res.problems.join("; "));
    assert.equal((await readActiveSnapshot())?.meta.runId, "run-1");
  } finally {
    __resetSnapshotRedisForTests();
  }
});

test("§32: drugi promote przesuwa poprzedni ACTIVE do PREVIOUS", async () => {
  const redis = fakeRedis();
  __setSnapshotRedisForTests(redis);
  try {
    await publishSnapshot(snap(manyRecords(50), "run-1"), NOW);
    await publishSnapshot(snap(manyRecords(50), "run-2"), NOW);
    assert.equal((await readActiveSnapshot())?.meta.runId, "run-2");
    assert.equal((await readPreviousSnapshot())?.meta.runId, "run-1");
  } finally {
    __resetSnapshotRedisForTests();
  }
});

test("§33: rollback przywraca PREVIOUS bez przebudowy", async () => {
  const redis = fakeRedis();
  __setSnapshotRedisForTests(redis);
  try {
    await publishSnapshot(snap(manyRecords(50), "run-1"), NOW);
    await publishSnapshot(snap(manyRecords(50), "run-2"), NOW);
    const done = await rollbackToPrevious();
    assert.equal(done.ok, true);
    assert.equal((await readActiveSnapshot())?.meta.runId, "run-1");
  } finally {
    __resetSnapshotRedisForTests();
  }
});

test("§33: rollback bez PREVIOUS nie rusza ACTIVE", async () => {
  const redis = fakeRedis();
  __setSnapshotRedisForTests(redis);
  try {
    await publishSnapshot(snap(manyRecords(50), "run-1"), NOW);
    const done = await rollbackToPrevious();
    assert.equal(done.ok, false);
    assert.equal((await readActiveSnapshot())?.meta.runId, "run-1");
  } finally {
    __resetSnapshotRedisForTests();
  }
});

// ── §35: awarie ─────────────────────────────────────────────────────────────

test("§35: nieudana walidacja NIE rusza ACTIVE — stary snapshot zyje dalej", async () => {
  const redis = fakeRedis();
  __setSnapshotRedisForTests(redis);
  try {
    await publishSnapshot(snap(manyRecords(50), "run-good"), NOW);
    const broken = snap([...manyRecords(49), rec({ checkin: "2026-08-10" })], "run-broken");
    const res = await publishSnapshot(broken, NOW);
    assert.equal(res.published, false);
    assert.equal((await readActiveSnapshot())?.meta.runId, "run-good");
  } finally {
    __resetSnapshotRedisForTests();
  }
});

test("§35: padniety Redis daje degradacje do miss, nie wyjatek", async () => {
  __setSnapshotRedisForTests(fakeRedis({ throwOnSet: true }));
  try {
    const res = await publishSnapshot(snap(manyRecords(50), "run-1"), NOW);
    assert.equal(res.published, false);
    assert.equal(await readActiveSnapshot(), null);
  } finally {
    __resetSnapshotRedisForTests();
  }
});

test("§35: brak Redisa (null) nie wywraca odczytu", async () => {
  __setSnapshotRedisForTests(null);
  try {
    assert.equal(await readActiveSnapshot(), null);
    assert.equal(await readPreviousSnapshot(), null);
  } finally {
    __resetSnapshotRedisForTests();
  }
});

test("zapis i odczyt zachowuja rekordy 1:1 (gzip round-trip)", async () => {
  const redis = fakeRedis();
  __setSnapshotRedisForTests(redis);
  try {
    const s = snap(manyRecords(60), "run-1");
    await publishSnapshot(s, NOW);
    const back = await readActiveSnapshot();
    assert.equal(Object.keys(back?.records ?? {}).length, 60);
    assert.deepEqual(Object.values(back!.records)[0], Object.values(s.records)[0]);
  } finally {
    __resetSnapshotRedisForTests();
  }
});
