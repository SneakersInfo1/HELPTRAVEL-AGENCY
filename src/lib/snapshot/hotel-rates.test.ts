// Cena hotelu do rekordu snapshotu konsjerża (`csnap:v1`).
//
// Zmierzone 2026-11-07 (metryka External APIs, ~33 h): 1024 z 3468 zapytań
// crona o stawki to były PRZETERMINOWANE trafienia Next Data Cache — zadanie
// wraca do tego samego terminu po pełnym obiegu (~10 h), a Data Cache trzyma
// stawki 900 s. Cron dostawał wtedy cenę sprzed ~10 h, a świeżą Next pobierał
// w tle bez limitu czasu (ten sam mechanizm co timeout warm-rates z 2026-11-06).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { __resetSharedRedisForTests, __setSharedRedisForTests } from "@/lib/redis/client";

import { snapshotHotelPerNight } from "./hotel-rates";

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit & { next?: unknown } }> = [];
let price = 1400;
let respond: (init: RequestInit) => Promise<Response> | Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function ratesBody(ids: string[]) {
  return {
    data: ids.map((hotelId) => ({
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
              retailRate: { total: [{ amount: price, currency: "PLN" }] },
              cancellationPolicies: { refundableTag: "NRFN" },
            },
          ],
        },
      ],
    })),
  };
}

const WINDOW = { checkin: "2027-02-01", checkout: "2027-02-08" };

beforeEach(() => {
  process.env.LITEAPI_SANDBOX_KEY = "sand_test";
  calls = [];
  price = 1400;
  respond = (init) => json(ratesBody((JSON.parse(String(init.body)) as { hotelIds: string[] }).hotelIds));
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init: init as RequestInit & { next?: unknown } });
    return respond(init);
  }) as typeof fetch;
  __setSharedRedisForTests(null);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetSharedRedisForTests();
});

test("stawki snapshotu idą z pominięciem Data Cache, z sygnałem — każda cena świeża od dostawcy", async () => {
  assert.equal(await snapshotHotelPerNight(["lp1", "lp2"], WINDOW), 200, "1400 zł / 7 nocy");
  price = 2100;
  assert.equal(await snapshotHotelPerNight(["lp1", "lp2"], WINDOW), 300, "nowa cena, nie sprzed cyklu");
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.match(c.url, /\/hotels\/rates$/);
    assert.equal(c.init.cache, "no-store");
    assert.equal(c.init.next, undefined);
    assert.ok(c.init.signal instanceof AbortSignal);
  }
});

test("zawieszony dostawca: zapytanie kończy się po limicie czasu, najwyżej 2 próby (nie 3 × 30 s)", async () => {
  respond = (init) =>
    new Promise((_, reject) =>
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }),
    );
  let attempts = 0;
  const t0 = Date.now();
  await assert.rejects(
    snapshotHotelPerNight(["lp1"], WINDOW, { timeoutMs: 40, onAttempt: () => attempts++ }),
    /Timed out after 40ms/,
  );
  assert.equal(attempts, 2);
  assert.ok(Date.now() - t0 < 1_500, "bez czekania 90 s jak przy domyślnych opcjach");
});

test("5xx: druga próba, potem błąd — bez niekontrolowanych ponowień", async () => {
  let n = 0;
  respond = () => {
    n++;
    return n === 1 ? json({ error: { code: 5000 } }, 500) : json(ratesBody(["lp1"]));
  };
  assert.equal(await snapshotHotelPerNight(["lp1"], WINDOW), 200, "przejściowy 5xx odrabia druga próba");
  respond = () => json({ error: { code: 5000 } }, 500);
  calls = [];
  await assert.rejects(snapshotHotelPerNight(["lp1"], WINDOW));
  assert.equal(calls.length, 2);
});

test("twardy koniec przebiegu: przerwany sygnał = zero zapytań; trwające zapytanie przerwane od razu", async () => {
  const done = new AbortController();
  done.abort();
  await assert.rejects(snapshotHotelPerNight(["lp1"], WINDOW, { signal: done.signal }), /aborted by caller/);
  assert.equal(calls.length, 0);

  respond = (init) =>
    new Promise((_, reject) =>
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }),
    );
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 20);
  const t0 = Date.now();
  await assert.rejects(snapshotHotelPerNight(["lp1"], WINDOW, { signal: stop.signal }), /aborted by caller/);
  assert.ok(Date.now() - t0 < 1_000);
  assert.equal(calls.length, 1, "bez drugiej próby po przerwaniu");
});

test("brak hoteli = brak ceny, zero zapytań", async () => {
  assert.equal(await snapshotHotelPerNight([], WINDOW), null);
  assert.equal(calls.length, 0);
});

test("cron snapshotu wycenia hotele WYŁĄCZNIE przez ten helper (bez gołego resolveSlimRates)", () => {
  // Trasy nie da się zaimportować pod node:test (seed z „server-only") —
  // pilnujemy tekstu, żeby nikt nie wrócił do wywołania przez Data Cache.
  const src = readFileSync(join(process.cwd(), "src/app/api/cron/build-concierge-snapshot/route.ts"), "utf8");
  assert.match(src, /snapshotHotelPerNight\(ids, window, \{\s*signal: hardStop/);
  assert.doesNotMatch(src, /resolveSlimRates\(/);
  assert.match(src, /const hardStop = AbortSignal\.timeout\(HARD_STOP_MS\)/);
});
