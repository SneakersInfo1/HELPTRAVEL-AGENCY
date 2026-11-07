// Opcje wywołania klienta LiteAPI (`LiteApiCallOptions`) — sygnał, limit
// czasu, liczba prób, pominięcie Data Cache, licznik prób.
//
// Kontekst: incydent warm-rates 2026-11-06. Stawki szły przez Next Data Cache;
// przeterminowany wpis Next oddaje od ręki, a dostawcę pyta w tle BEZ naszego
// sygnału, więc bez limitu czasu. Cron musi umieć pytać na pierwszym planie,
// a ścieżki użytkowników mają zostać dokładnie takie jak były.

import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { afterEach, beforeEach, test } from "node:test";

import { getRates } from "./rates";
import { fetchHotelsForDestination } from "./search";
import { LiteApiNetworkError, LiteApiTimeoutError } from "./errors";
import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import { __setSharedRedisForTests, __resetSharedRedisForTests } from "@/lib/redis/client";

interface Call {
  url: string;
  init: RequestInit & { next?: { revalidate?: number; tags?: string[] } };
}

const realFetch = globalThis.fetch;
let calls: Call[] = [];
let respond: (call: Call) => Promise<Response> | Response;

const RATES_BODY = {
  data: [
    {
      hotelId: "lp1",
      roomTypes: [
        {
          offerId: "oferta-lp1",
          rates: [
            {
              rateId: "stawka-lp1",
              occupancyNumber: 1,
              name: "Pokój",
              maxOccupancy: 2,
              adultCount: 2,
              childCount: 0,
              boardType: "RO",
              boardName: "Room Only",
              retailRate: { total: [{ amount: 900, currency: "PLN" }] },
              cancellationPolicies: { refundableTag: "NRFN" },
            },
          ],
        },
      ],
    },
  ],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const RATES_INPUT = {
  hotelIds: ["lp1"],
  occupancies: [{ adults: 2 }],
  checkin: "2026-12-01",
  checkout: "2026-12-03",
  currency: "PLN",
  maxRatesPerHotel: 1,
};

beforeEach(() => {
  process.env.LITEAPI_SANDBOX_KEY = "sand_test";
  calls = [];
  respond = () => json(RATES_BODY);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: (init ?? {}) as Call["init"] };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  // Bez Redisa: resolveSlimRates traktuje cache jako pusty.
  __setSharedRedisForTests(null);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetSharedRedisForTests();
});

test("REGRESJA ścieżki użytkownika: domyślnie stawki dalej idą przez Data Cache (900 s)", async () => {
  await getRates(RATES_INPUT);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.cache, "force-cache");
  assert.equal(calls[0].init.next?.revalidate, 900);
  assert.ok(calls[0].init.next?.tags?.includes("liteapi-rates"));
});

test("skipDataCache: no-store, bez opcji `next` — zapytanie na pierwszym planie z sygnałem", async () => {
  const ctl = new AbortController();
  await getRates(RATES_INPUT, { skipDataCache: true, signal: ctl.signal });
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.next, undefined);
  assert.ok(calls[0].init.signal instanceof AbortSignal, "fetch dostaje sygnał (limit czasu + przerwanie)");
});

test("resolveSlimRates przekazuje opcje wywołania do getRates (cron: forceRefresh + skipDataCache)", async () => {
  const res = await resolveSlimRates(
    ["lp1"],
    { checkin: "2026-12-01", checkout: "2026-12-03", adults: 2, children: [], rooms: 1, currency: "PLN" },
    { forceRefresh: true, writeCache: false, call: { skipDataCache: true, retries: 1 } },
  );
  assert.equal(res.rates.lp1?.totalAmount, 900);
  assert.equal(calls[0].init.cache, "no-store");
  // Bez `call` (lista wyników) — jak dotąd przez Data Cache.
  await resolveSlimRates(["lp1"], {
    checkin: "2026-12-01",
    checkout: "2026-12-03",
    adults: 2,
    children: [],
    rooms: 1,
    currency: "PLN",
  });
  assert.equal(calls[1].init.cache, "force-cache");
});

test("plan hoteli: opcje wywołania docierają do /data/hotels", async () => {
  respond = () => json({ data: [{ id: "lp1", name: "Hotel", city: "Lisbon" }] });
  await fetchHotelsForDestination({ city: "Lisbon", country: "PT", limit: 150 }, { skipDataCache: true });
  assert.match(calls[0].url, /\/data\/hotels\?/);
  assert.equal(calls[0].init.cache, "no-store");
});

test("sygnał przerwany przed startem: zero zapytań do dostawcy", async () => {
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(getRates(RATES_INPUT, { signal: ctl.signal, skipDataCache: true }), LiteApiTimeoutError);
  assert.equal(calls.length, 0);
});

test("przerwanie w trakcie: trwające zapytanie kończy się od razu i NIE jest ponawiane", async () => {
  const ctl = new AbortController();
  respond = (call) =>
    new Promise((_, reject) =>
      call.init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
        once: true,
      }),
    );
  const p = getRates(RATES_INPUT, { signal: ctl.signal, skipDataCache: true, retries: 3 });
  setTimeout(() => ctl.abort(), 10);
  const t0 = Date.now();
  await assert.rejects(p, /aborted by caller/);
  assert.ok(Date.now() - t0 < 1_000);
  assert.equal(calls.length, 1, "bez kolejnych prób po przerwaniu przez wołającego");
});

test("limit czasu próby: zawieszony dostawca kończy się po timeoutMs (nie po 300 s)", async () => {
  respond = (call) =>
    new Promise((_, reject) =>
      call.init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
        once: true,
      }),
    );
  const t0 = Date.now();
  await assert.rejects(getRates(RATES_INPUT, { skipDataCache: true, timeoutMs: 50, retries: 1 }), /Timed out after 50ms/);
  assert.ok(Date.now() - t0 < 1_000);
  assert.equal(calls.length, 1);
});

test("retries: 1 = jedna próba także przy 5xx; onAttempt liczy każdą próbę HTTP", async () => {
  respond = () => json({ error: { code: 5000, message: "internal" } }, 500);
  let attempts = 0;
  await assert.rejects(
    getRates(RATES_INPUT, { skipDataCache: true, retries: 1, onAttempt: () => attempts++ }),
    LiteApiNetworkError,
  );
  assert.equal(attempts, 1);
  assert.equal(calls.length, 1);

  // Domyślnie (ścieżki użytkownika) nadal 3 próby — zachowanie bez zmian.
  calls = [];
  attempts = 0;
  await assert.rejects(getRates(RATES_INPUT, { onAttempt: () => attempts++ }), LiteApiNetworkError);
  assert.equal(attempts, 3);
});

test("jeden sygnał na setki wywołań: nasłuch zdejmowany po każdej próbie (bez wycieku)", async () => {
  const ctl = new AbortController();
  for (let i = 0; i < 25; i++) await getRates(RATES_INPUT, { signal: ctl.signal, skipDataCache: true });
  assert.equal(getEventListeners(ctl.signal, "abort").length, 0);
});
