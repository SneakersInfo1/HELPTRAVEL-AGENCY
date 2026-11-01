// Gubernator wyszukiwań lotów — na atrapie Upstash (prawdziwy klient, HTTP)
// i podstawionym dostawcy. Liczymy WYŁĄCZNIE zapytania do LiteAPI.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { Redis } from "@upstash/redis";

import { __getSharedBreakerForTests, __resetSharedRedisForTests, __setSharedRedisForTests } from "@/lib/redis/client";
import { createResilientRequester } from "@/lib/redis/requester";
import { startMockUpstash, type MockUpstash } from "@/lib/redis/testing/mock-upstash";

import { FlightApiError, searchFlightRates } from "./client";
import { __flushGovernorWritesForTests, __resetGovernorForTests, governorSnapshot, utcDay } from "./search-governor";
import { searchFlightOffers } from "./search-offers";
import { FlightSearchInputSchema } from "./types";

const INPUT = FlightSearchInputSchema.parse({
  legs: [
    { origin: "WAW", destination: "BCN", date: "2031-07-15", direction: "OUTBOUND" },
    { origin: "BCN", destination: "WAW", date: "2031-07-22", direction: "INBOUND" },
  ],
  adults: 1,
});

const ENV: Record<string, string | undefined> = {
  LITEAPI_PROD_PRIVATE_KEY: "prod_test_private",
  LITEAPI_ENV: "production",
  FLIGHTS_BACKGROUND_SEARCH: undefined,
  FLIGHTS_SEARCH_DAILY_LIMIT: undefined,
  FLIGHTS_BACKGROUND_DAILY_LIMIT: undefined,
  ALERT_WEBHOOK_URL: undefined,
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
};
const saved: Record<string, string | undefined> = {};

let mock: MockUpstash;
const realFetch = globalThis.fetch;
let providerCalls = 0;
let provider: () => Promise<Response> = async () => okResponse();

function okResponse(): Response {
  return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
}
function errorResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

before(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  mock = await startMockUpstash();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(mock.url)) return realFetch(input, init);
    providerCalls += 1;
    return provider();
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  __resetSharedRedisForTests();
  await mock.close();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

beforeEach(async () => {
  await __flushGovernorWritesForTests(); // liczniki z poprzedniego testu nie mogą wpaść do świeżego magazynu
  mock.mode = "ok";
  mock.store.clear();
  __resetSharedRedisForTests();
  __resetGovernorForTests();
  __setSharedRedisForTests(
    new Redis(createResilientRequester({ url: mock.url, token: mock.token, timeoutMs: 400, breaker: __getSharedBreakerForTests() })),
  );
  providerCalls = 0;
  provider = async () => okResponse();
  delete process.env.FLIGHTS_BACKGROUND_SEARCH;
  delete process.env.FLIGHTS_SEARCH_DAILY_LIMIT;
  delete process.env.FLIGHTS_BACKGROUND_DAILY_LIMIT;
});

function rejectsWithReason(reason: string) {
  return (err: unknown) => {
    assert.ok(err instanceof FlightApiError, `oczekiwany FlightApiError, jest ${String(err)}`);
    assert.equal(err.reason, reason);
    return true;
  };
}

test("429 z Retry-After → pauza dla wszystkich instancji: kolejne wyszukiwania bez zapytania do dostawcy", async () => {
  provider = async () => errorResponse(429, { error: { code: 429, message: "too many requests" } }, { "retry-after": "120" });
  await assert.rejects(searchFlightRates(INPUT, { source: "user" }));
  assert.equal(providerCalls, 1);

  // Ta sama instancja — pamięć procesu.
  await assert.rejects(searchFlightRates(INPUT, { source: "user" }), rejectsWithReason("PROVIDER_THROTTLED"));
  // „Inna instancja” — bez pamięci procesu, pauza z magazynu; Retry-After przeniesiony.
  __resetGovernorForTests();
  await assert.rejects(searchFlightRates(INPUT, { source: "chat" }), (err: unknown) => {
    rejectsWithReason("PROVIDER_THROTTLED")(err);
    const ms = (err as FlightApiError).retryAfterMs ?? 0;
    assert.ok(ms > 100_000 && ms <= 120_000, `retryAfterMs=${ms}`);
    return true;
  });
  assert.equal(providerCalls, 1, "w pauzie zero zapytań do dostawcy");
});

test("403 / 40301 → pauza „odmowa dostępu” (15 min); wyszukiwania stoją", async () => {
  provider = async () =>
    errorResponse(403, { error: { code: 40301, message: "Flights API for this account is limited to sandbox API keys only" } });
  await assert.rejects(searchFlightRates(INPUT, { source: "user" }));
  __resetGovernorForTests();
  await assert.rejects(searchFlightRates(INPUT, { source: "user" }), (err: unknown) => {
    rejectsWithReason("PROVIDER_ACCESS_DENIED")(err);
    const ms = (err as FlightApiError).retryAfterMs ?? 0;
    assert.ok(ms > 14 * 60_000 && ms <= 15 * 60_000, `retryAfterMs=${ms}`);
    return true;
  });
  assert.equal(providerCalls, 1);
});

test("dzienny budżet: po limicie bez zapytania do dostawcy; tło liczone osobno i wyczerpuje się niezależnie", async () => {
  process.env.FLIGHTS_SEARCH_DAILY_LIMIT = "2";
  process.env.FLIGHTS_BACKGROUND_SEARCH = "on";
  process.env.FLIGHTS_BACKGROUND_DAILY_LIMIT = "1";
  await searchFlightRates(INPUT, { source: "user" });
  await searchFlightRates(INPUT, { source: "chat" });
  await assert.rejects(searchFlightRates(INPUT, { source: "user" }), rejectsWithReason("SEARCH_BUDGET_EXHAUSTED"));
  await searchFlightRates(INPUT, { source: "background" });
  await assert.rejects(searchFlightRates(INPUT, { source: "background" }), rejectsWithReason("SEARCH_BUDGET_EXHAUSTED"));
  assert.equal(providerCalls, 3);
  const snap = await governorSnapshot();
  assert.equal(snap.day, utcDay());
  assert.deepEqual(snap.used, { user: 3, background: 2 });
  assert.equal(snap.outcomes.ok, 3);
});

test("magazyn niedostępny: użytkownik szuka dalej (licznik procesu), tło stoi", async () => {
  process.env.FLIGHTS_BACKGROUND_SEARCH = "on";
  mock.mode = "quota";
  await searchFlightRates(INPUT, { source: "user" });
  await assert.rejects(searchFlightRates(INPUT, { source: "background" }), rejectsWithReason("SEARCH_BUDGET_EXHAUSTED"));
  assert.equal(providerCalls, 1);
});

test("identyczne zapytania w locie → JEDNO wywołanie dostawcy", async () => {
  provider = async () => {
    await new Promise((r) => setTimeout(r, 50));
    return okResponse();
  };
  await Promise.all([1, 2, 3].map(() => searchFlightOffers(INPUT, { source: "user" })));
  assert.equal(providerCalls, 1);
});

test("liczniki wyników: ok i 429 widoczne w stanie doby", async () => {
  await searchFlightRates(INPUT, { source: "user" });
  provider = async () => errorResponse(429, { error: { code: 429 } });
  await assert.rejects(searchFlightRates(INPUT, { source: "user" }));
  await __flushGovernorWritesForTests(); // liczniki zapisują się w tle
  const snap = await governorSnapshot();
  assert.equal(snap.outcomes.ok, 1);
  assert.equal(snap.outcomes.throttled, 1);
  assert.equal(snap.pause?.reason, "throttled");
  assert.equal(snap.storeAvailable, true);
});
