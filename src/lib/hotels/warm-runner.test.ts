// Rdzeń crona warm-rates bez sieci: budżet czasu, limit czasu i przerwanie
// zapytań, bezpiecznik dostawcy, rotacja z punktem kontrolnym, plan hoteli,
// deduplikacja zadań. Tło: incydent 2026-11-06 — zapytanie wysłane w tle
// przez Data Cache wisiało 298,7 s i trzymało funkcję do limitu 300 s.

import assert from "node:assert/strict";
import { test } from "node:test";

import { LiteApiNetworkError, LiteApiRateLimitError, LiteApiTimeoutError } from "@/lib/liteapi/errors";
import type { SlimRate } from "./rate-cache";
import {
  buildWarmTasks,
  executeWarmTasks,
  isFailedWarmRun,
  nextRotationCursor,
  refreshHotelPlans,
  rotationSlice,
  runPool,
  shouldAlertWarmFailures,
  streakAtStart,
  type ExecuteWarmDeps,
  type WarmDestination,
  type WarmTask,
} from "./warm-runner";
import type { WarmWindow } from "./warm-config";

const NEAR: WarmWindow[] = [
  { checkin: "2026-11-13", checkout: "2026-11-15", label: "weekend-1" },
  { checkin: "2026-11-20", checkout: "2026-11-22", label: "weekend-2" },
];
const CHEAP: WarmWindow[] = [
  { checkin: "2027-01-09", checkout: "2027-01-16", label: "tani-tydzien" },
  { checkin: "2026-12-21", checkout: "2026-12-25", label: "srodtydzien" },
];

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function dest(id: string, group: "core" | "snapshot", hotels = 150): WarmDestination {
  return { id, label: id, priceKey: `${id}|key`, iata: null, group, hotelIds: ids(`h-${id}-`, hotels) };
}

function build(dests: WarmDestination[], sliceIds: string[]): WarmTask[] {
  return buildWarmTasks({
    dests,
    nearWindows: NEAR,
    cheapWindows: CHEAP,
    sliceIds,
    nearHotels: 50,
    chunk: 50,
    deepWindowLabel: "tani-tydzien",
  });
}

const rate = (total: number): SlimRate => ({ totalAmount: total, currency: "PLN" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Zależności wykonania z rozsądnymi wartościami; test nadpisuje to, co bada. */
function deps(over: Partial<ExecuteWarmDeps> = {}): ExecuteWarmDeps {
  return {
    resolve: async (task) => Object.fromEntries(task.hotelIds.map((h) => [h, rate(700)])),
    concurrency: 3,
    startedAt: Date.now(),
    budgetMs: 10_000,
    hardStopMs: 10_000,
    maxConsecutiveFailures: 4,
    storeAvailable: () => true,
    ...over,
  };
}

// ── Pula i rotacja ───────────────────────────────────────────────────────────

test("runPool: nigdy więcej niż N zadań naraz", async () => {
  let inFlight = 0;
  let peak = 0;
  await runPool(ids("x", 40), 6, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await sleep(2);
    inFlight--;
  });
  assert.equal(peak, 6);
});

test("rotationSlice: kolejne partie z zawinięciem listy", () => {
  const all = ids("d", 10);
  assert.deepEqual(rotationSlice(all, 0, 4), { start: 0, ids: ["d0", "d1", "d2", "d3"] });
  assert.deepEqual(rotationSlice(all, 8, 4), { start: 8, ids: ["d8", "d9", "d0", "d1"] });
  // Kursor spoza zakresu (np. lista kierunków się skróciła) nie wywraca przebiegu.
  assert.deepEqual(rotationSlice(all, 23, 2), { start: 3, ids: ["d3", "d4"] });
  assert.deepEqual(rotationSlice([], 5, 4), { start: 0, ids: [] });
});

test("nextRotationCursor: zatrzymuje się na pierwszym niedokończonym kierunku partii", () => {
  const slice = rotationSlice(ids("d", 10), 8, 4); // d8 d9 d0 d1
  assert.equal(nextRotationCursor(10, slice, new Set()), 2, "cała partia → dalej o 4 (z zawinięciem)");
  assert.equal(nextRotationCursor(10, slice, new Set(["d0", "d1"])), 0, "d0 niedokończone → od d0");
  assert.equal(nextRotationCursor(10, slice, new Set(["d8"])), 8, "nic nie skończone → ta sama partia");
  assert.equal(nextRotationCursor(10, slice, new Set(["x-spoza-partii"])), 2);
});

// ── Zadania ──────────────────────────────────────────────────────────────────

test("buildWarmTasks: bliskie okna core co przebieg, tanie okna tylko dla partii, głęboko tylko pierwsze", () => {
  const dests = [dest("a", "core"), dest("b", "core"), dest("c", "snapshot")];
  const tasks = build(dests, ["b", "c"]);
  const near = tasks.filter((t) => t.writeCache);
  const cheap = tasks.filter((t) => !t.writeCache);
  assert.equal(near.length, 4, "2 core × 2 bliskie okna");
  assert.ok(near.every((t) => t.hotelIds.length === 50 && !t.windowLabel));
  // b i c: tani-tydzien 3 paczki (150 hoteli) + srodtydzien 1 paczka (50).
  assert.equal(cheap.length, 8);
  assert.ok(cheap.every((t) => t.targets.every((x) => x.snapshot)));
  assert.ok(!tasks.some((t) => !t.writeCache && t.targets.some((x) => x.destId === "a")), "a nie jest w partii");
  // Bliskie okna kierunku spoza partii nie zasilają snapshotu, z partii — tak.
  assert.ok(near.filter((t) => t.targets[0].destId === "a").every((t) => !t.targets[0].snapshot));
  assert.ok(near.filter((t) => t.targets[0].destId === "b").every((t) => t.targets[0].snapshot));
  // Najpierw bliskie okna (użytkownicy), potem partia w kolejności rotacji.
  assert.ok(tasks.findIndex((t) => !t.writeCache) > tasks.findLastIndex((t) => t.writeCache));
});

test("buildWarmTasks: identyczne zapytanie idzie RAZ (duplikat kierunku dopisuje się jako cel)", () => {
  const a = dest("a", "core");
  const twin: WarmDestination = { ...dest("a2", "core"), hotelIds: a.hotelIds, priceKey: "a2|key" };
  const tasks = build([a, twin], ["a", "a2"]);
  const keys = tasks.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length, "brak zduplikowanych zapytań");
  assert.equal(tasks.length, build([a], ["a"]).length);
  assert.ok(tasks.every((t) => t.targets.map((x) => x.destId).join() === "a,a2"));
});

test("buildWarmTasks: kierunek bez listy hoteli nie daje zadań, krótka lista daje mniej paczek", () => {
  const tasks = build([{ ...dest("a", "core"), hotelIds: [] }, dest("b", "snapshot", 70)], ["a", "b"]);
  assert.ok(tasks.every((t) => t.targets[0].destId === "b"));
  assert.deepEqual(
    tasks.map((t) => t.hotelIds.length),
    [50, 20, 50],
    "tani-tydzien: 50 + 20, srodtydzien: 50",
  );
});

// ── Wykonanie ────────────────────────────────────────────────────────────────

test("wszystko udane: snapshot z minimum po oknach, okna pakietu, completed", async () => {
  const tasks = build([dest("a", "core"), dest("b", "snapshot")], ["a", "b"]);
  const exec = await executeWarmTasks(
    tasks,
    deps({
      // Tańszy hotel tylko w tanim tygodniu → ma wygrać minimum.
      resolve: async (task) =>
        Object.fromEntries(task.hotelIds.map((h) => [h, rate(task.windowLabel === "tani-tydzien" ? 700 : 900)])),
    }),
  );
  assert.equal(exec.stopReason, "completed");
  assert.equal(exec.attempted, tasks.length);
  assert.equal(exec.succeeded, tasks.length);
  assert.equal(exec.notStarted + exec.aborted + exec.failed, 0);
  assert.equal(exec.bestPrice.get("a|key")?.hotelFromPlnPerNight, 100, "700 zł / 7 nocy");
  assert.equal(exec.bestPrice.get("a|key")?.checkin, "2027-01-09");
  assert.equal(exec.hotelByWindow.get("b|key|srodtydzien"), 225, "900 zł / 4 noce");
  assert.equal(exec.unfinishedDestIds.size, 0);
  assert.equal(exec.failedDestIds.size, 0);
});

test("BUDŻET: po budżecie nie zaczyna nowych zadań, kończy się w czasie, reszta = niezaczęte", async () => {
  const tasks = build([dest("a", "snapshot"), dest("b", "snapshot"), dest("c", "snapshot")], ["a", "b", "c"]);
  const startedAt = Date.now();
  const exec = await executeWarmTasks(
    tasks,
    deps({
      concurrency: 2,
      startedAt,
      budgetMs: 60,
      hardStopMs: 1_000,
      resolve: async (task) => {
        await sleep(25);
        return { [task.hotelIds[0]]: rate(700) };
      },
    }),
  );
  const took = Date.now() - startedAt;
  assert.equal(exec.stopReason, "time_budget");
  assert.ok(exec.notStarted > 0);
  assert.equal(exec.attempted + exec.notStarted, tasks.length);
  // Hojny margines na obciążony runner (Windows: zegar ~15 ms). Bez budżetu
  // przebieg trwałby 18 zadań × 25 ms / 2 ≈ 225 ms i więcej.
  assert.ok(took < 60 + 25 + 120, `koniec w budżecie + jedno zadanie, było ${took} ms`);
  assert.ok(exec.unfinishedDestIds.size > 0);
});

test("TIMEOUT dostawcy: zawieszone zapytanie liczone jako timeout, przebieg idzie dalej", async () => {
  const tasks = build([dest("a", "snapshot")], ["a"]);
  let calls = 0;
  const exec = await executeWarmTasks(
    tasks,
    deps({
      resolve: async (task) => {
        calls++;
        if (calls === 2) {
          // Tak kończy się zapytanie z limitem czasu w kliencie LiteAPI.
          await sleep(20);
          throw new LiteApiTimeoutError("Timed out after 15000ms");
        }
        return { [task.hotelIds[0]]: rate(700) };
      },
    }),
  );
  assert.equal(exec.stopReason, "completed");
  assert.equal(exec.timedOut, 1);
  assert.equal(exec.failed, 1);
  assert.equal(calls, tasks.length, "bez ponowień: jedno wywołanie na zadanie");
  // Kierunek z nieudanym zadaniem nie idzie do snapshotu (minimum z części
  // okien mogłoby zawyżyć cenę), ale nie blokuje kursora rotacji.
  assert.ok(exec.failedDestIds.has("a"));
  assert.equal(exec.unfinishedDestIds.size, 0);
});

test("TWARDY KONIEC: zapytania, które ignorują limit, są przerywane sygnałem i nie wiszą", async () => {
  const tasks = build([dest("a", "snapshot")], ["a"]);
  const startedAt = Date.now();
  const exec = await executeWarmTasks(
    tasks,
    deps({
      startedAt,
      budgetMs: 1_000,
      hardStopMs: 80,
      // Zawieszone na zawsze — jak zapytanie z incydentu (298,7 s) — chyba że sygnał.
      resolve: (_task, signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
    }),
  );
  const took = Date.now() - startedAt;
  assert.ok(took < 400, `przebieg skończony po ${took} ms, nie wisi`);
  assert.equal(exec.stopReason, "time_budget");
  assert.ok(exec.aborted > 0, "przerwane przez nas");
  assert.equal(exec.failed, 0, "przerwane to nie błąd dostawcy");
  assert.ok(exec.unfinishedDestIds.has("a"), "kierunek wraca w następnym przebiegu");
});

test("BEZPIECZNIK: seria błędów zatrzymuje przebieg i przerywa trwające — bez niekontrolowanych ponowień", async () => {
  const tasks = build([dest("a", "core"), dest("b", "snapshot"), dest("c", "snapshot")], ["b", "c"]);
  let calls = 0;
  let abortedInFlight = 0;
  const exec = await executeWarmTasks(
    tasks,
    deps({
      concurrency: 3,
      maxConsecutiveFailures: 4,
      resolve: (_task, signal) => {
        calls++;
        return new Promise((_, reject) => {
          const onAbort = () => {
            clearTimeout(t);
            abortedInFlight++;
            reject(new Error("aborted"));
          };
          const t = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            reject(new LiteApiNetworkError("HTTP 500"));
          }, 5);
          signal.addEventListener("abort", onAbort, { once: true });
        });
      },
    }),
  );
  assert.equal(exec.stopReason, "provider_unavailable");
  assert.ok(exec.failed >= 4);
  assert.ok(calls <= 4 + 3, `najwyżej próg + równoległość wywołań, było ${calls}`);
  assert.equal(exec.attempted, calls, "jedno wywołanie na zadanie");
  assert.equal(exec.aborted, abortedInFlight);
  assert.equal(exec.attempted + exec.notStarted, tasks.length);
});

test("ODMOWY 403/429: trzy z rzędu zamykają przebieg", async () => {
  const tasks = build([dest("a", "snapshot"), dest("b", "snapshot")], ["a", "b"]);
  let calls = 0;
  const exec = await executeWarmTasks(
    tasks,
    deps({
      concurrency: 1,
      maxConsecutiveFailures: 100,
      resolve: async () => {
        calls++;
        throw new LiteApiRateLimitError("HTTP 429", { status: 429 });
      },
    }),
  );
  assert.equal(exec.stopReason, "provider_refused");
  assert.equal(exec.refused, 3);
  assert.equal(calls, 3);
  assert.equal(exec.lastRefusalStatus, 429);
});

test("REDIS padł w trakcie: koniec przebiegu, trwające przerwane, nic więcej do dostawcy", async () => {
  const tasks = build([dest("a", "snapshot"), dest("b", "snapshot")], ["a", "b"]);
  let calls = 0;
  let storeUp = true;
  const exec = await executeWarmTasks(
    tasks,
    deps({
      concurrency: 2,
      storeAvailable: () => storeUp,
      resolve: async (task) => {
        calls++;
        if (calls === 3) storeUp = false;
        await sleep(5);
        return { [task.hotelIds[0]]: rate(700) };
      },
    }),
  );
  assert.equal(exec.stopReason, "store_lost");
  assert.ok(calls <= 4, `po utracie magazynu bez nowych zapytań, było ${calls}`);
  assert.equal(exec.attempted + exec.notStarted, tasks.length);
});

test("CZĘŚCIOWE wykonanie + WZNOWIENIE: kolejny przebieg zaczyna od niedokończonego kierunku", async () => {
  const all = ["a", "b", "c", "d"];
  const dests = all.map((id) => dest(id, "snapshot"));
  const done: string[] = [];

  // Przebieg 1: budżet kończy się w trakcie partii a,b,c. Sztuczny zegar:
  // każde zadanie „trwa" 10 ms, budżet 45 ms → a (4 zadania) skończone,
  // b zaczęte i przerwane budżetem.
  const slice1 = rotationSlice(all, 0, 3);
  let clock = 0;
  const exec1 = await executeWarmTasks(
    build(dests, slice1.ids),
    deps({
      concurrency: 1,
      startedAt: 0,
      now: () => clock,
      budgetMs: 45,
      hardStopMs: 60_000,
      resolve: async (task) => {
        clock += 10;
        done.push(task.targets[0].destId);
        return { [task.hotelIds[0]]: rate(700) };
      },
    }),
  );
  assert.deepEqual([...new Set(done)], ["a", "b"]);
  assert.equal(exec1.stopReason, "time_budget");
  assert.ok(exec1.bestPrice.has("a|key"), "a dokończone");
  const cursor = nextRotationCursor(all.length, slice1, exec1.unfinishedDestIds);
  assert.equal(cursor, 1, "wracamy od b");

  // Przebieg 2 (po „nieudanym"): zdrowy dostawca, ta sama reszta partii.
  const slice2 = rotationSlice(all, cursor, 3);
  assert.deepEqual(slice2.ids, ["b", "c", "d"]);
  const exec2 = await executeWarmTasks(build(dests, slice2.ids), deps());
  assert.equal(exec2.stopReason, "completed");
  assert.deepEqual([...exec2.bestPrice.keys()].sort(), ["b|key", "c|key", "d|key"]);
  assert.equal(nextRotationCursor(all.length, slice2, exec2.unfinishedDestIds), 0, "obieg zamknięty");
});

// ── Plan hoteli ──────────────────────────────────────────────────────────────

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

test("plan: brakujące pobierane zawsze, przeterminowane najwyżej limit najstarszych, świeże bez dostawcy", async () => {
  const needed = ["fresh", "stale1", "stale2", "stale3", "missing"].map((id) => ({ id }));
  const current = new Map([
    ["fresh", { ids: ["h1"], at: NOW - HOUR }],
    ["stale1", { ids: ["h1"], at: NOW - 30 * HOUR }],
    ["stale2", { ids: ["h1"], at: NOW - 40 * HOUR }],
    ["stale3", { ids: ["h1"], at: NOW - 26 * HOUR }],
  ]);
  const fetched: string[] = [];
  const res = await refreshHotelPlans(needed, current, {
    fetchIds: async (d) => {
      fetched.push(d.id);
      return [`${d.id}-new`];
    },
    now: () => NOW,
    maxAgeMs: 24 * HOUR,
    refreshCap: 2,
    concurrency: 2,
    budgetMs: 1_000,
  });
  assert.deepEqual(fetched.sort(), ["missing", "stale1", "stale2"], "dwa najstarsze przeterminowane");
  assert.equal(res.refreshed, 3);
  assert.equal(res.hits, 2);
  assert.equal(res.missing, 0);
  assert.deepEqual(res.plans.get("stale3")?.ids, ["h1"], "poza limitem: stary plan dalej w użyciu");
  assert.deepEqual(res.updated.map(([id]) => id).sort(), ["missing", "stale1", "stale2"]);
});

test("plan: nieudane odświeżenie zostawia stary plan, brakujący bez listy = missing", async () => {
  const res = await refreshHotelPlans([{ id: "old" }, { id: "none" }], new Map([["old", { ids: ["h1"], at: 0 }]]), {
    fetchIds: async () => {
      throw new LiteApiNetworkError("HTTP 500");
    },
    now: () => NOW,
    maxAgeMs: HOUR,
    refreshCap: 5,
    concurrency: 2,
    budgetMs: 1_000,
  });
  assert.equal(res.failed, 2);
  assert.deepEqual(res.plans.get("old")?.ids, ["h1"]);
  assert.equal(res.missing, 1);
  assert.equal(res.updated.length, 0, "nic do zapisu");
});

test("plan: budżet fazy przerywa zawieszone pobieranie", async () => {
  const t0 = Date.now();
  const res = await refreshHotelPlans([{ id: "a" }, { id: "b" }], new Map(), {
    fetchIds: (_d, signal) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
    now: Date.now,
    maxAgeMs: HOUR,
    refreshCap: 5,
    concurrency: 2,
    budgetMs: 50,
  });
  assert.ok(Date.now() - t0 < 400);
  assert.equal(res.failed, 2);
  assert.equal(res.missing, 2);
});

// ── Ocena przebiegu ──────────────────────────────────────────────────────────

test("ocena przebiegu i próg alertu", () => {
  const ok = { stopReason: "completed" as const, attempted: 100, failed: 3 };
  const shape = { tasks: 100, neededPlans: 31, missingPlans: 0 };
  assert.equal(isFailedWarmRun(ok, shape), false);
  assert.equal(isFailedWarmRun({ ...ok, stopReason: "time_budget" }, shape), true);
  assert.equal(isFailedWarmRun({ ...ok, failed: 50 }, shape), true, "połowa zadań padła");
  // Zimny start przy leżącym /data/hotels: zero zadań to NIE jest sukces.
  assert.equal(isFailedWarmRun({ ...ok, attempted: 0, failed: 0 }, { ...shape, tasks: 0, missingPlans: 31 }), true);
  assert.equal(isFailedWarmRun(ok, { ...shape, missingPlans: 16 }), true, "połowa kierunków bez listy hoteli");
  assert.equal(isFailedWarmRun(ok, { ...shape, missingPlans: 2 }), false, "pojedyncze braki nie alarmują");
  assert.equal(shouldAlertWarmFailures(2, 3), false);
  assert.equal(shouldAlertWarmFailures(3, 3), true);
  assert.equal(shouldAlertWarmFailures(4, 3), false, "bez spamu co przebieg");
  assert.equal(shouldAlertWarmFailures(19, 3), true, "przypomnienie po 16 przebiegach");
});

test("KOLEJNE przebiegi zabite przez platformę: seria rośnie na starcie, alert przy trzecim", () => {
  // Każdy zabity przebieg zdążył zapisać tylko znacznik startu (z serią ze startu).
  let state = { failStreak: 0, runningSince: null as number | null };
  const alerts: number[] = [];
  for (let run = 1; run <= 4; run++) {
    const start = streakAtStart(state);
    if (start.previousRunDied && shouldAlertWarmFailures(start.failStreak, 3)) alerts.push(start.failStreak);
    state = { failStreak: start.failStreak, runningSince: 1_000 * run }; // zabity przed końcem
  }
  assert.equal(state.failStreak, 3, "A, B, C zabite → D startuje z serią 3");
  assert.deepEqual(alerts, [3]);
  assert.deepEqual(streakAtStart({ failStreak: 5, runningSince: null }), { previousRunDied: false, failStreak: 5 });
});
