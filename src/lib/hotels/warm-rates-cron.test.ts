// Test integracyjny przebiegu crona /api/cron/warm-rates: PRAWDZIWY przebieg
// (blokada, plan, stawki, snapshot, stan, alert), prawdziwe SDK @upstash/redis
// na atrapie Upstash po HTTP (localhost) i atrapa LiteAPI w `globalThis.fetch`.
// Zero sieci zewnętrznej, zero produkcyjnego magazynu. Trasy nie importujemy
// (seed ma `import "server-only"`) — kierunki budujemy z tego samego JSON-a.
//
// Odtwarza warunki incydentu 2026-11-06 (zawieszone zapytanie dostawcy) oraz
// awarie, które cron musi przeżyć: Redis przed i w trakcie przebiegu, 5xx
// i 429 od dostawcy, dwie instancje naraz, przebieg zabity przez platformę.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, mock, test } from "node:test";

import { Redis } from "@upstash/redis";

import type { DestinationRecord } from "@/lib/mvp/destinations-seed";
import {
  __getSharedBreakerForTests,
  __resetSharedRedisForTests,
  __setSharedRedisForTests,
} from "@/lib/redis/client";
import { __resetRedisMetricsForTests } from "@/lib/redis/metrics";
import { createResilientRequester } from "@/lib/redis/requester";
import { startMockUpstash, type MockUpstash } from "@/lib/redis/testing/mock-upstash";
import seedJson from "../../../data/destinations.json";

import { getCachedRates, type RateCacheContext } from "./rate-cache";
import { resolveSlimRates } from "./resolve-slim-rates";
import {
  computeSnapshotDateWindows,
  computeWarmDateWindows,
  HOME_TILE_DESTINATION_IDS,
  PACKAGE_DESTINATION_IDS,
  WARM_DESTINATION_COUNT,
} from "./warm-config";
import { runWarmRatesCron, type WarmSeed } from "./warm-rates-cron";
import { WARM_STATE_KEY } from "./warm-state";

// Kierunki jak w trasie: top-N + kafelki (core), pakiety (snapshot).
const records = (seedJson as unknown as { destinations: DestinationRecord[] }).destinations;
function seeds(): WarmSeed[] {
  const core = new Map<string, DestinationRecord>();
  for (const d of records.slice(0, WARM_DESTINATION_COUNT)) core.set(d.id, d);
  for (const id of HOME_TILE_DESTINATION_IDS) {
    const d = records.find((r) => r.id === id);
    if (d && !core.has(id)) core.set(id, d);
  }
  const snapshot = PACKAGE_DESTINATION_IDS.map((id) => records.find((r) => r.id === id)).filter(
    (d): d is DestinationRecord => d !== undefined && !core.has(d.id),
  );
  return [
    ...[...core.values()].map((record) => ({ record, group: "core" as const })),
    ...snapshot.map((record) => ({ record, group: "snapshot" as const })),
  ];
}

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.ALERT_WEBHOOK_URL;
delete process.env.FLIGHTS_BACKGROUND_SEARCH;
process.env.LITEAPI_SANDBOX_KEY = "sand_test";

const realFetch = globalThis.fetch;
const LITEAPI = "https://api.liteapi.travel/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Atrapa dostawcy ──────────────────────────────────────────────────────────

interface RatesCall {
  key: string;
  init: RequestInit & { next?: unknown };
}

const provider = {
  /** Cena każdego hotelu (total za pobyt). */
  price: 1400,
  mode: "ok" as "ok" | "500" | "429",
  /** Które zapytanie o stawki (1-based) wisi, dopóki wołający go nie przerwie. */
  hangNth: 0,
  /** Od którego zapytania wszystkie wiszą (do przerwania). */
  hangFrom: 0,
  /** Które zapytanie o stawki (1-based) dostaje HTTP 500. */
  failNth: 0,
  onRates: undefined as undefined | ((n: number) => void),
  rates: [] as RatesCall[],
  hotels: 0,
  inFlight: 0,
  peak: 0,
  /** Zawieszone zapytania, które wołający przerwał sygnałem. */
  hangsAborted: 0,
};

function resetProvider() {
  Object.assign(provider, {
    price: 1400,
    mode: "ok",
    hangNth: 0,
    hangFrom: 0,
    failNth: 0,
    onRates: undefined,
    rates: [],
    hotels: 0,
    inFlight: 0,
    peak: 0,
    hangsAborted: 0,
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function hangUntilAborted(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    signal?.addEventListener(
      "abort",
      () => {
        provider.hangsAborted++;
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fakeLiteApi(url: URL, init: RequestInit): Promise<Response> {
  if (url.pathname.endsWith("/data/hotels")) {
    provider.hotels++;
    const city = (url.searchParams.get("cityName") ?? "x").toLowerCase().replace(/[^a-z]/g, "");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return json({
      data: Array.from({ length: limit }, (_, i) => ({ id: `lp-${city}-${i}`, name: `Hotel ${i}`, city })),
    });
  }
  if (!url.pathname.endsWith("/hotels/rates")) return json({ error: { message: "atrapa" } }, 404);

  const body = JSON.parse(String(init.body)) as { hotelIds: string[]; checkin: string; checkout: string };
  provider.rates.push({ key: `${body.checkin}|${body.checkout}|${body.hotelIds.join(",")}`, init });
  const n = provider.rates.length;
  provider.onRates?.(n);
  provider.inFlight++;
  provider.peak = Math.max(provider.peak, provider.inFlight);
  try {
    if (n === provider.hangNth || (provider.hangFrom > 0 && n >= provider.hangFrom)) {
      return await hangUntilAborted(init.signal);
    }
    await sleep(2);
    if (n === provider.failNth) return json({ error: { code: 5000, message: "internal" } }, 500);
    if (provider.mode === "500") return json({ error: { code: 5000, message: "internal" } }, 500);
    if (provider.mode === "429") return json({ error: { code: 4290, message: "too many requests" } }, 429);
    return json({
      data: body.hotelIds.map((hotelId) => ({
        hotelId,
        roomTypes: [
          {
            offerId: `oferta-${hotelId}`,
            rates: [
              {
                rateId: `stawka-${hotelId}`,
                occupancyNumber: 1,
                name: "Pokój",
                maxOccupancy: 2,
                adultCount: 2,
                childCount: 0,
                boardType: "RO",
                boardName: "Room Only",
                retailRate: { total: [{ amount: provider.price, currency: "PLN" }] },
                cancellationPolicies: { refundableTag: "NRFN" },
              },
            ],
          },
        ],
      })),
    });
  } finally {
    provider.inFlight--;
  }
}

// ── Atrapa Upstash + przechwycone logi ───────────────────────────────────────

let upstash: MockUpstash;
let logs: string[] = [];
/** Wybrana komenda Upstash kończy się błędem (np. tylko zapis snapshotu). */
let upstashFailWhen: ((body: string) => boolean) | undefined;

before(async () => {
  upstash = await startMockUpstash();
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href.startsWith(LITEAPI)) return fakeLiteApi(url, init);
    if (url.hostname === "pl.trustpilot.com") return new Response("challenge", { status: 403 });
    if (url.hostname !== "127.0.0.1") throw new Error(`test: zapytanie poza atrapy ${url.href}`);
    if (upstashFailWhen?.(String(init.body ?? ""))) {
      return new Response(JSON.stringify({ error: "ERR atrapa: komenda odrzucona" }), { status: 400 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  for (const level of ["log", "info", "warn", "error"] as const) {
    mock.method(console, level, (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});

after(async () => {
  globalThis.fetch = realFetch;
  mock.restoreAll();
  __resetSharedRedisForTests();
  await upstash.close();
});

function installRedis() {
  __resetSharedRedisForTests();
  __resetRedisMetricsForTests({ sink: () => {} });
  __setSharedRedisForTests(
    new Redis(
      createResilientRequester({
        url: upstash.url,
        token: upstash.token,
        timeoutMs: 400,
        breaker: __getSharedBreakerForTests(),
      }),
    ),
  );
}

beforeEach(() => {
  upstash.mode = "ok";
  upstash.delayMs = 0;
  upstash.store.clear();
  upstash.resetStats();
  resetProvider();
  upstashFailWhen = undefined;
  logs = [];
  installRedis();
});

const redis = () => new Redis({ url: upstash.url, token: upstash.token });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- podsumowanie przebiegu to luźny JSON logu
type Summary = Record<string, any>;

/** Jeden przebieg crona. Atrapa nie zna EVAL, więc blokadę zwalniamy ręcznie. */
async function runCron(): Promise<Summary> {
  const summary = await runWarmRatesCron(seeds());
  upstash.store.delete("lock:warm-rates");
  return summary as Summary;
}

const nearCtx = (): RateCacheContext => {
  const w = computeWarmDateWindows()[0]!;
  return { checkin: w.checkin, checkout: w.checkout, adults: 2, children: [], rooms: 1, currency: "PLN" };
};

// ── Testy ────────────────────────────────────────────────────────────────────

test("konfiguracja trasy: żaden fetch nie idzie przez Data Cache, limit funkcji bez zmian", () => {
  // Trasy nie da się zaimportować pod node:test (seed z „server-only"), więc
  // pilnujemy tekstu eksportów — to one sterują Nextem.
  const src = readFileSync(join(process.cwd(), "src/app/api/cron/warm-rates/route.ts"), "utf8");
  assert.match(src, /^export const fetchCache = "force-no-store";$/m);
  assert.match(src, /^export const maxDuration = 300;$/m);
  assert.match(src, /^export const dynamic = "force-dynamic";$/m);
  assert.match(src, /runWarmRatesCron\(collectDestinations\(\)\)/);
});

test("ŚWIEŻE stawki na pierwszym planie: no-store + sygnał, ≤6 naraz, bez duplikatów, rotacja i plan w Redisie", async () => {
  const first = await runCron();
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.stopReason, "completed");
  assert.deepEqual(first.rotation, { from: 0, size: 8, of: first.rotation.of, next: 8 });
  // Plan: cold start → listy pobrane raz, zapisane w Redisie.
  assert.equal(first.plan.refreshed, first.destinations);
  assert.equal(first.plan.saved, true);
  assert.equal(provider.hotels, first.destinations);
  // Zadania: bliskie okna core + tanie okna partii, każde dokładnie raz.
  assert.equal(first.rateCalls, first.tasks);
  assert.equal(provider.rates.length, first.tasks);
  assert.equal(new Set(provider.rates.map((r) => r.key)).size, provider.rates.length, "brak zdublowanych zapytań");
  assert.equal(first.providerRequests, provider.rates.length + provider.hotels);
  assert.ok(provider.peak <= 6, `równoległość ${provider.peak} > 6`);
  for (const r of provider.rates) {
    assert.equal(r.init.cache, "no-store", "stawki z pominięciem Data Cache");
    assert.equal(r.init.next, undefined);
    assert.ok(r.init.signal instanceof AbortSignal, "każde zapytanie ma sygnał (limit czasu, przerwanie)");
  }
  // Snapshot tylko z partii; stan: kursor dalej, znacznik startu wyczyszczony.
  const snapshot = (await redis().get<Record<string, { hotelFromPlnPerNight: number }>>("dstprice:v1")) ?? {};
  assert.equal(Object.keys(snapshot).length, first.snapshotEntries);
  assert.ok(first.snapshotEntries > 0 && first.snapshotEntries <= 8);
  const state = await redis().get<{ cursor: number; runningSince: number | null; failStreak: number }>(WARM_STATE_KEY);
  assert.equal(state?.cursor, 8);
  assert.equal(state?.runningSince, null);
  assert.equal(state?.failStreak, 0);

  // Drugi przebieg: dostawca podniósł ceny. Cron MUSI pokazać nową cenę
  // (stary tryb oddawał wpis Data Cache sprzed cyklu), plan bez dostawcy.
  provider.rates = [];
  provider.hotels = 0;
  provider.price = 2100;
  const second = await runCron();
  assert.equal(second.ok, true);
  assert.deepEqual([second.rotation.from, second.rotation.next], [8, 16]);
  assert.equal(provider.hotels, 0, "plan z Redisa, nie od dostawcy");
  assert.equal(second.plan.hits, second.destinations);
  const ctx = nearCtx();
  const cached = await getCachedRates(
    Array.from({ length: 3 }, (_, i) => `lp-barcelona-${i}`),
    ctx,
  );
  for (const v of cached.values()) {
    assert.equal(v.state, "hit");
    if (v.state === "hit") assert.equal(v.rate.totalAmount, 2100, "świeża cena, nie sprzed cyklu");
  }
  const snapshot2 = (await redis().get<Record<string, unknown>>("dstprice:v1")) ?? {};
  assert.equal(Object.keys(snapshot2).length, first.snapshotEntries + second.snapshotEntries, "merge, nie replace");
});

test("REGRESJA cache wyników: lista wyników czyta to, co nagrzał cron (bez dostawcy); tanie okna nie piszą do cache", async () => {
  await runCron();
  const before = provider.rates.length;
  const ids = Array.from({ length: 50 }, (_, i) => `lp-barcelona-${i}`);
  const res = await resolveSlimRates(ids, nearCtx());
  assert.equal(res.cacheHits, 50);
  assert.equal(res.misses, 0);
  assert.equal(provider.rates.length, before, "zero zapytań do dostawcy");
  const cheapDates = computeSnapshotDateWindows().map((w) => `${w.checkin}:${w.checkout}`);
  const cheapKeys = [...upstash.store.keys()].filter((k) => k.startsWith("htr:") && cheapDates.some((d) => k.includes(d)));
  assert.equal(cheapKeys.length, 0, "tanie okna tylko do snapshotu");
});

test("DWIE INSTANCJE naraz: jedna pracuje, druga skipped_locked — zapytania tylko z jednej", async () => {
  const bodies = (await Promise.all([runWarmRatesCron(seeds()), runWarmRatesCron(seeds())])) as Summary[];
  const worked = bodies.filter((x) => x.stopReason === "completed");
  const locked = bodies.filter((x) => x.status === "skipped_locked");
  assert.equal(worked.length, 1);
  assert.equal(locked.length, 1);
  assert.equal(provider.rates.length, worked[0].tasks, "brak zdublowanej pracy");
});

test("REDIS niedostępny na starcie (limit planu): przebieg pominięty, ZERO zapytań do dostawcy", async () => {
  upstash.mode = "quota";
  const body = await runCron();
  assert.equal(body.status, "skipped_store_unavailable");
  assert.equal(provider.rates.length + provider.hotels, 0);
});

test("REDIS pada w trakcie: store_lost, trwające zapytania przerwane, bez dalszych zapytań", async () => {
  await runCron(); // plan w Redisie
  provider.rates = [];
  provider.onRates = (n) => {
    if (n === 20) upstash.mode = "quota";
  };
  provider.hangFrom = 21;
  const t0 = Date.now();
  const body = await runCron();
  assert.ok(Date.now() - t0 < 10_000, "nie czeka na zawieszone zapytania (limit jednego to 15 s)");
  assert.equal(body.ok, false);
  assert.equal(body.stopReason, "store_lost");
  // Ile zapytań zdążyło wystartować przed wykryciem utraty magazynu, zależy od
  // przeplotu workerów — deterministyczne jest to, że KAŻDE zawieszone zostało
  // przerwane sygnałem i policzone, a nic nie zostało w locie.
  assert.equal(body.aborted, provider.hangsAborted, "przerwane = zawieszone");
  assert.ok(provider.rates.length <= 20 + 6, `po utracie magazynu bez nowych zapytań (${provider.rates.length})`);
  assert.equal(provider.inFlight, 0, "nic nie zostaje w tle");
});

test("DOSTAWCA 5xx: bezpiecznik, jedna próba na zadanie, kursor stoi; kolejny zdrowy przebieg nadrabia partię", async () => {
  provider.mode = "500";
  const failed = await runCron();
  assert.equal(failed.ok, false);
  assert.equal(failed.stopReason, "provider_unavailable");
  assert.equal(provider.rates.length, failed.rateCalls, "bez ponowień: zapytań = zadań wysłanych");
  assert.ok(failed.rateCalls <= 12 + 6);
  assert.equal(failed.rotation.next, 0, "partia nie przepadła");
  assert.equal(failed.snapshotEntries, 0);
  assert.equal(failed.failStreak, 1);
  assert.ok(logs.filter((l) => l.includes("grzanie") && l.includes("nieudane")).length <= 3, "log błędów przycięty");

  provider.mode = "ok";
  const healed = await runCron();
  assert.equal(healed.ok, true);
  assert.deepEqual([healed.rotation.from, healed.rotation.next], [0, 8]);
  assert.equal(healed.failStreak, 0);
  assert.ok(healed.snapshotEntries > 0);
});

test("ZIMNY START przy leżącym /data/hotels: zero zadań = przebieg NIEUDANY (licznik alertu), nie „completed ok”", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/data/") && url.startsWith(LITEAPI)) return json({ error: { message: "down" } }, 500);
    return orig(input, init);
  }) as typeof fetch;
  try {
    const body = await runCron();
    assert.equal(body.tasks, 0);
    assert.equal(body.ok, false);
    assert.equal(body.failStreak, 1);
    assert.equal(body.plan.missing, body.plan.failed);
    assert.equal(provider.rates.length, 0);
  } finally {
    globalThis.fetch = orig;
  }
});

test("DOSTAWCA 429: odmowy zamykają przebieg, bez ponowień", async () => {
  provider.mode = "429";
  const body = await runCron();
  assert.equal(body.stopReason, "provider_refused");
  assert.equal(body.rateRefusal, 429);
  assert.ok(body.refused >= 3);
  assert.equal(provider.rates.length, body.rateCalls);
  assert.ok(provider.rates.length <= 9, `po trzech odmowach koniec (${provider.rates.length})`);
});

test("ZAWIESZONE zapytanie dostawcy (scenariusz incydentu): kończy się po limicie 15 s, przebieg dokończony", async () => {
  await runCron(); // plan w Redisie
  provider.rates = [];
  provider.hangNth = 5;
  const t0 = Date.now();
  const body = await runCron();
  const took = Date.now() - t0;
  assert.ok(took < 25_000, `przebieg trwał ${took} ms`);
  assert.equal(body.stopReason, "completed");
  assert.equal(body.timedOut, 1);
  assert.equal(body.failed, 1);
  assert.equal(body.ok, true);
  assert.equal(provider.inFlight, 0, "po odpowiedzi nic nie wisi w tle");
});

test("PRZEBIEG ZABITY przez platformę: wykryty na starcie następnego, seria i alert od razu", async () => {
  // Stan zostawiony przez dwa wcześniejsze zabite przebiegi: seria 2 i znacznik
  // startu trzeciego, którego nikt nie wyczyścił.
  await redis().set(WARM_STATE_KEY, {
    cursor: 16,
    failStreak: 2,
    runningSince: Date.now() - 31 * 60_000,
    lastFinishedAt: null,
    lastStopReason: "completed",
  });
  const body = await runCron();
  assert.equal(body.previousRunDied, true);
  assert.equal(body.rotation.from, 16, "kursor z punktu kontrolnego");
  assert.ok(logs.some((l) => l.includes("nie dokończył pracy")));
  assert.ok(
    logs.some((l) => l.includes("[alert][warning][cron]") && l.includes("3 nieudanych przebiegów")),
    "alert na starcie — ten przebieg też mógłby zostać zabity",
  );
  // Ten przebieg zdrowy: seria wraca do zera, znacznik wyczyszczony.
  assert.equal(body.ok, true);
  assert.equal(body.failStreak, 0);
  const state = await redis().get<{ runningSince: number | null; failStreak: number }>(WARM_STATE_KEY);
  assert.equal(state?.runningSince, null);
  assert.equal(state?.failStreak, 0);
});

test("ZNACZNIK STARTU się nie zapisał: przebieg pominięty, ZERO zapytań do dostawcy", async () => {
  upstashFailWhen = (b) => /"warmrates:v1:state"/.test(b) && /^\[\s*"set"/i.test(b);
  const body = await runCron();
  assert.equal(body.status, "skipped_store_unavailable");
  assert.equal(provider.rates.length + provider.hotels, 0);
});

test("ZAPIS SNAPSHOTU nieudany: przebieg nieudany, kursor zostaje na partii (powtórka w następnym)", async () => {
  upstashFailWhen = (b) => /^\[\s*"set"\s*,\s*"dstprice:v1"/i.test(b);
  const body = await runCron();
  assert.equal(body.snapshotSaved, false);
  assert.equal(body.snapshotEntries, 0);
  assert.equal(body.ok, false);
  assert.equal(body.failStreak, 1);
  assert.equal(body.rotation.next, body.rotation.from, "partia do powtórki");
  const state = await redis().get<{ cursor: number }>(WARM_STATE_KEY);
  assert.equal(state?.cursor, 0);

  upstashFailWhen = undefined;
  const retry = await runCron();
  assert.equal(retry.ok, true);
  assert.equal(retry.rotation.from, 0, "ta sama partia");
  assert.equal(retry.rotation.next, 8);
  assert.ok(retry.snapshotEntries > 0);
});

test("NIEUDANE zadanie kierunku z partii: jego cena nie trafia do snapshotu (stary wpis zostaje), kursor idzie dalej", async () => {
  await runCron(); // partia 0–7, snapshot zapisany
  const before = (await redis().get<Record<string, { hotelFromPlnPerNight: number }>>("dstprice:v1")) ?? {};
  upstash.store.set(WARM_STATE_KEY, { kind: "string", value: JSON.stringify({ cursor: 0, failStreak: 0 }) });
  provider.rates = [];
  provider.price = 7000;
  provider.failNth = 1; // pierwsze zadanie (bliskie okno 1. kierunku partii) → HTTP 500
  const body = await runCron();
  assert.equal(body.failed, 1);
  assert.equal(body.rotation.next, 8, "nieudane nie blokuje rotacji");
  const after = (await redis().get<Record<string, { hotelFromPlnPerNight: number }>>("dstprice:v1")) ?? {};
  assert.equal(body.snapshotEntries, Object.keys(before).length - 1, "kierunek z nieudanym zadaniem pominięty");
  const unchanged = Object.keys(after).filter((k) => after[k].hotelFromPlnPerNight === before[k]?.hotelFromPlnPerNight);
  assert.equal(unchanged.length, 1, "dokładnie jeden wpis zachował starą cenę");
});
