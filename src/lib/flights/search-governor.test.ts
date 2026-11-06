// Gubernator wyszukiwań lotów — na atrapie Upstash (prawdziwy klient, HTTP)
// i podstawionym dostawcy. Liczymy WYŁĄCZNIE zapytania do LiteAPI.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/flights/rates/route";
import { __resetLimitersForTests, __setLimiterForTests } from "@/lib/rate-limit";

import { __getSharedBreakerForTests, __resetSharedRedisForTests, __setSharedRedisForTests } from "@/lib/redis/client";
import { createResilientRequester } from "@/lib/redis/requester";
import { startMockUpstash, type MockUpstash } from "@/lib/redis/testing/mock-upstash";

import { FlightApiError, attemptTimeoutMs, searchFlightRates, toFlightApiError, withFlightProviderSlot } from "./client";
import { __resetProviderGateForTests, acquireProviderSlot, releaseProviderSlot } from "./provider-slot";
import { flightRatesCacheKey, setCachedFlightOffers } from "./rates-cache";
import { __flushGovernorWritesForTests, __resetGovernorForTests, governorSnapshot, pauseProvider, utcDay } from "./search-governor";
import { errorStatusFromResponse, runOriginFanout, summarizeFanout, type OriginStatus } from "./search-fanout";
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
  // Odstęp bramki w testach = 0 (domyślne 1500 ms tylko wydłużałoby przebieg);
  // sam odstęp ma własne testy w provider-slot.test.ts.
  FLIGHTS_PROVIDER_MIN_INTERVAL_MS: "0",
  FLIGHTS_PROVIDER_CONCURRENCY: undefined,
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
  __resetProviderGateForTests();
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

// ── Bramka slotów (provider-slot.ts) — incydent 2026-11-03 ──────────────────
// Fan-out „Warszawa — wszystkie lotniska” wysyłał WAW/WMI/RDO w tej samej
// milisekundzie i dwa razy z rzędu dostawał 1 × 200 + 2 × 429 (kod 4290).

function inputFrom(origin: string) {
  return FlightSearchInputSchema.parse({
    legs: [
      { origin, destination: "FNC", date: "2031-07-15", direction: "OUTBOUND" },
      { origin: "FNC", destination: origin, date: "2031-07-22", direction: "INBOUND" },
    ],
    adults: 2,
  });
}

function trackConcurrency(delayMs: number, respond: (n: number) => Response = () => okResponse()) {
  const stats = { inFlight: 0, max: 0 };
  let n = 0;
  provider = async () => {
    n += 1;
    const call = n;
    stats.inFlight += 1;
    stats.max = Math.max(stats.max, stats.inFlight);
    await new Promise((r) => setTimeout(r, delayMs));
    stats.inFlight -= 1;
    return respond(call);
  };
  return stats;
}

test("fan-out po trzech lotniskach naraz → u dostawcy najwyżej JEDNO zapytanie w locie, wszystkie udane", async () => {
  const stats = trackConcurrency(40);
  const results = await Promise.all(["WAW", "WMI", "RDO"].map((o) => searchFlightOffers(inputFrom(o), { source: "user" })));
  assert.equal(results.length, 3);
  assert.equal(providerCalls, 3);
  assert.equal(stats.max, 1);
});

test("czekający na slot czyta cache: czat po trwającym wyszukiwaniu użytkownika tej samej trasy → jedno zapytanie", async () => {
  trackConcurrency(60);
  // Różne źródła = różne klucze singleFlight — jak dwie instancje Vercela.
  const [a, b] = await Promise.all([
    searchFlightOffers(INPUT, { source: "user", cache: { kind: "on-demand" } }),
    searchFlightOffers(INPUT, { source: "chat", timeoutMs: 15_000, retries: 1, cache: { kind: "on-demand" } }),
  ]);
  assert.deepEqual(a, b);
  assert.equal(providerCalls, 1, "drugie wyszukiwanie wzięło wynik z cache po zwolnieniu slotu");
});

test("fresh (recovery) nie bierze wyniku z cache, nawet po czekaniu na slot", async () => {
  trackConcurrency(30);
  await Promise.all([
    searchFlightOffers(INPUT, { source: "user", cache: { kind: "on-demand" } }),
    searchFlightOffers(INPUT, { source: "user", cache: { kind: "on-demand", skipRead: true } }),
  ]);
  assert.equal(providerCalls, 2);
});

test("429 u pierwszego, drugi czekał na slot → po zajęciu widzi pauzę i NIE pyta dostawcy", async () => {
  trackConcurrency(30, (n) => (n === 1 ? errorResponse(429, { error: { code: 4290, message: "Too many requests" } }) : okResponse()));
  const [first, second] = await Promise.allSettled([
    searchFlightOffers(inputFrom("WAW"), { source: "user" }),
    searchFlightOffers(inputFrom("WMI"), { source: "user" }),
  ]);
  assert.equal(first.status, "rejected");
  assert.equal(second.status, "rejected");
  rejectsWithReason("PROVIDER_THROTTLED")((second as PromiseRejectedResult).reason);
  assert.equal(providerCalls, 1);
});

test("slot zajęty dłużej niż wolno czekać → PROVIDER_BUSY (503 + Retry-After) bez zapytania", async () => {
  const held = await acquireProviderSlot({ maxWaitMs: 1_000, leaseMs: 20_000 });
  try {
    await assert.rejects(
      withFlightProviderSlot({ source: "user", maxWaitMs: 200 }, async () => "nie powinno się wykonać"),
      (err: unknown) => {
        rejectsWithReason("PROVIDER_BUSY")(err);
        assert.equal((err as FlightApiError).httpStatus, 503);
        assert.ok(((err as FlightApiError).retryAfterMs ?? 0) > 0);
        return true;
      },
    );
  } finally {
    await releaseProviderSlot(held);
  }
  assert.equal(providerCalls, 0);
});

test("szybkie 5xx → JEDNO ponowienie (użytkownik); 429 i czat bez ponowienia", async () => {
  trackConcurrency(5, (n) => (n === 1 ? errorResponse(500, { error: { code: 5000, message: "unable to process request" } }) : okResponse()));
  await searchFlightRates(INPUT, { source: "user" });
  assert.equal(providerCalls, 2);

  providerCalls = 0;
  __resetGovernorForTests();
  trackConcurrency(5, () => errorResponse(500, { error: { code: 5000 } }));
  await assert.rejects(searchFlightRates(INPUT, { source: "chat", timeoutMs: 15_000, retries: 1 }));
  assert.equal(providerCalls, 1, "czat ponawia sam (searchWithDeadline), klient nie dokłada prób");
});

test("klucz slotu przez prawdziwy klient HTTP: po wyszukiwaniu skrócony do końca odstępu, a nie wiszący do końca dzierżawy", async () => {
  process.env.FLIGHTS_PROVIDER_MIN_INTERVAL_MS = "2000";
  try {
    await searchFlightOffers(inputFrom("WAW"), { source: "user" });
    const left = (mock.store.get("flgov:v1:slot:0")?.expireAt ?? 0) - Date.now();
    assert.ok(left > 0 && left <= 2_000, `zostało ${left} ms`);
  } finally {
    process.env.FLIGHTS_PROVIDER_MIN_INTERVAL_MS = "0";
  }
  __resetProviderGateForTests();
  mock.store.clear();
  await searchFlightOffers(inputFrom("WMI"), { source: "user" });
  assert.equal(mock.store.has("flgov:v1:slot:0"), false, "bez odstępu klucz znika od razu");
});

test("429 bez Retry-After od dostawcy → błąd niesie czas NASZEJ pauzy (przeglądarka ma odliczać, nie klikać w próżnię)", async () => {
  provider = async () => errorResponse(429, { error: { code: 4290, message: "Too many requests" } });
  await assert.rejects(searchFlightOffers(INPUT, { source: "user" }), (err: unknown) => {
    const e = toFlightApiError(err, "search");
    assert.equal(e.reason, "PROVIDER_THROTTLED");
    assert.ok((e.retryAfterMs ?? 0) >= 55_000 && (e.retryAfterMs ?? 0) <= 60_000, `retryAfterMs=${e.retryAfterMs}`);
    return true;
  });
});

test("5xx z Retry-After to pauza dla wszystkich: bez ponowienia, termin idzie do przeglądarki, kolejne bez zapytania", async () => {
  provider = async () => errorResponse(503, { error: { code: 5030, message: "overloaded" } }, { "retry-after": "30" });
  await assert.rejects(searchFlightOffers(INPUT, { source: "user" }), (err: unknown) => {
    const after = toFlightApiError(err, "search").retryAfterMs ?? 0;
    assert.ok(after > 25_000 && after <= 30_000, `retryAfterMs=${after}`);
    return true;
  });
  assert.equal(providerCalls, 1);
  await assert.rejects(searchFlightOffers(inputFrom("KRK"), { source: "chat", timeoutMs: 15_000 }), rejectsWithReason("PROVIDER_THROTTLED"));
  assert.equal(providerCalls, 1);
});

test("po zajęciu slotu zawsze czytamy cache: opóźniony SET nie ma prawa powtórzyć cudzego wyszukiwania", async () => {
  await setCachedFlightOffers(flightRatesCacheKey(INPUT), []);
  const offers = await searchFlightOffers(INPUT, { source: "user", cache: { kind: "on-demand" } });
  assert.deepEqual(offers, []);
  assert.equal(providerCalls, 0);
});

test("po zajęciu slotu zawsze sprawdzamy pauzę: slot bez czekania nie omija świeżej pauzy", async () => {
  const slot = await acquireProviderSlot({ maxWaitMs: 200, leaseMs: 5_000 });
  assert.equal(slot.contended, false);
  await pauseProvider("throttled", 30_000);
  try {
    await assert.rejects(searchFlightRates(INPUT, { source: "user", slot }), rejectsWithReason("PROVIDER_THROTTLED"));
  } finally {
    await releaseProviderSlot(slot);
  }
  assert.equal(providerCalls, 0);
});

test("błąd sieci bez statusu: bez automatycznego ponowienia (nie wiemy, czy dostawca skończył pracę)", async () => {
  provider = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(searchFlightOffers(INPUT, { source: "user" }));
  assert.equal(providerCalls, 1);
});

test("timeout: następne zapytanie czeka ponad odstęp, bo dostawca może jeszcze pracować nad porzuconym", async () => {
  provider = async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  };
  await assert.rejects(searchFlightOffers(INPUT, { source: "user" }));
  const left = (mock.store.get("flgov:v1:slot:0")?.expireAt ?? 0) - Date.now();
  assert.ok(left > 1_000 && left <= 3_000, `slot trzymany jeszcze ${left} ms`);
});

test("budżet czasu: druga próba jest krótsza, a czat odlicza czekanie na slot", () => {
  assert.equal(attemptTimeoutMs({ source: "user" }, 1, 5_000), 30_000);
  assert.equal(attemptTimeoutMs({ source: "user" }, 2, 5_000), 20_000);
  assert.equal(attemptTimeoutMs({ source: "chat", timeoutMs: 15_000 }, 1, 5_000), 10_000);
  assert.equal(attemptTimeoutMs({ source: "chat", timeoutMs: 3_000 }, 1, 5_000), 2_500, "minimum próby");
});

// ── Jedna akcja użytkownika: prawdziwa trasa + przebieg jak w przeglądarce ──
// Górna granica ruchu do dostawcy dla kliknięcia „Szukaj”. Bez niej wystarczy
// jedna awaria, żeby jedno wyszukiwanie mnożyło zapytania do limitu konta.

const WARSAW = ["WAW", "WMI", "RDO"];
const POLAND = ["WAW", "KRK", "KTW", "GDN", "WRO", "POZ"];

async function userAction(origins: string[], destination = "FNC") {
  __setLimiterForTests("flights-search", {
    limit: async () => ({ success: true, limit: 20, remaining: 19, reset: Date.now() + 60_000 }),
  } as unknown as Parameters<typeof __setLimiterForTests>[1]);
  const statuses: Record<string, OriginStatus> = {};
  try {
    await runOriginFanout(origins, {
      isActive: () => true,
      onStatuses: (patch) => Object.assign(statuses, patch),
      search: async (origin) => {
        const res = await POST(
          new NextRequest("https://helptravel.test/api/flights/rates", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              legs: [
                { origin, destination, date: "2031-07-15", direction: "OUTBOUND" },
                { origin: destination, destination: origin, date: "2031-07-22", direction: "INBOUND" },
              ],
              adults: 2,
              cabinClass: "ECONOMY",
            }),
          }),
        );
        const json = await res.json();
        return res.ok
          ? { state: "ok", count: (json.offers as unknown[]).length }
          : errorStatusFromResponse(res.status, json, res.headers.get("Retry-After"));
      },
    });
  } finally {
    __resetLimitersForTests();
  }
  return summarizeFanout(origins, statuses, 0);
}

for (const [name, destination] of [["Madera", "FNC"], ["Malta", "MLA"], ["Madryt", "MAD"]] as const) {
  test(`Warszawa → ${name}: po jednym zapytaniu na lotnisko, nigdy równolegle; drugie kliknięcie w ciągu TTL = zero zapytań`, async () => {
    const stats = trackConcurrency(5);
    const first = await userAction(WARSAW, destination);
    assert.equal(first.outcome, "empty");
    assert.equal(providerCalls, 3);
    assert.equal(stats.max, 1);

    const again = await userAction(WARSAW, destination);
    assert.equal(again.outcome, "empty", "prawdziwy brak lotów z negatywnego cache");
    assert.equal(providerCalls, 3, "bez nowych zapytań do dostawcy");
  });
}

test("akcja użytkownika przy 429: JEDNO zapytanie, a powtórka w czasie pauzy nie dociera do dostawcy", async () => {
  provider = async () => errorResponse(429, { error: { code: 4290, message: "Too many requests" } });
  const first = await userAction(WARSAW);
  assert.equal(first.outcome, "error");
  assert.equal(first.failed.length, 3);
  assert.ok(first.retryAt !== null && first.retryAt > Date.now(), "przeglądarka zna termin ponowienia");
  assert.equal(providerCalls, 1);

  const again = await userAction(WARSAW);
  assert.equal(again.outcome, "error");
  assert.equal(providerCalls, 1);
});

test("akcja użytkownika przy awarii 5xx na 6 lotniskach: najwyżej 4 zapytania (2 lotniska × 2 próby), potem stop", async () => {
  provider = async () => errorResponse(500, { error: { code: 5000, message: "unable to process request" } });
  const s = await userAction(POLAND);
  assert.equal(s.outcome, "error");
  assert.equal(s.failed.length, 6);
  assert.equal(providerCalls, 4);
});

test("najgorszy układ na 6 lotniskach (awarie przeplatane sukcesami): górna granica jednej akcji to 10 zapytań", async () => {
  // Sukces zeruje licznik błędów z rzędu, a każde szybkie 5xx ma jedno ponowienie:
  // WAW 2 + KRK 1 + KTW 2 + GDN 1 + WRO 2 + POZ 2, po czym przebieg i tak się kończy.
  const down = new Set([1, 2, 4, 5, 7, 8, 9, 10]);
  let call = 0;
  provider = async () => {
    call += 1;
    return down.has(call) ? errorResponse(500, { error: { code: 5000, message: "unable to process request" } }) : okResponse();
  };
  await userAction(POLAND);
  assert.equal(providerCalls, 10);
});

test("akcja użytkownika przy timeoucie dostawcy na 6 lotniskach: 2 zapytania, bez ponowień (porzucone zapytanie i tak się liczy)", async () => {
  provider = async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  };
  const s = await userAction(POLAND);
  assert.equal(s.outcome, "error");
  assert.equal(providerCalls, 2);
});
