// Test integracyjny: PRAWDZIWE SDK @upstash/redis + prawdziwe moduły aplikacji
// + atrapa serwera Upstash po HTTP na localhost (./testing/mock-upstash.ts).
//
// Symulujemy dokładnie awarię z 2026-10-25 (komunikat limitu planu Fixed),
// zawieszony serwer (timeout) i normalną pracę. Bez sieci zewnętrznej, bez
// produkcyjnego magazynu (klient wstrzyknięty, env Upstash pusty).

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";

import {
  bookingStoreMayBeAvailable,
  reserveBookingSession,
  saveSession,
  type SessionRecord,
} from "@/lib/booking/session";
import { odpowiedzBezBlokady, zajmijBlokade } from "@/lib/cron/lock";
import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  getCachedFlightSummary,
  setCachedFlightOffers,
} from "@/lib/flights/rates-cache";
import type { DisplayOffer } from "@/lib/flights/display";
import { lowestPrice30dAndRecord } from "@/lib/hotels/price-history";
import { getCachedRates, setCachedRates, type RateCacheContext, type SlimRate } from "@/lib/hotels/rate-cache";
import { readPriceSnapshot, readPriceSnapshotStrict } from "@/lib/prices/destination-price-snapshot";
import { __resetLimitersForTests, enforceRateLimit } from "@/lib/rate-limit";

import {
  __getSharedBreakerForTests,
  __resetSharedRedisForTests,
  __setSharedRedisForTests,
  redisMayBeAvailable,
} from "./client";
import { __resetRedisMetricsForTests } from "./metrics";
import { createResilientRequester, RedisUnavailableError } from "./requester";
import { startMockUpstash, type MockUpstash } from "./testing/mock-upstash";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let mock: MockUpstash;

before(async () => {
  mock = await startMockUpstash();
});
after(async () => {
  __resetSharedRedisForTests();
  await mock.close();
});

/** Świeży wyłącznik + klient wspólny wskazujący atrapę. */
function install(timeoutMs = 400): void {
  __resetSharedRedisForTests();
  __resetLimitersForTests();
  __resetRedisMetricsForTests({ sink: () => {} });
  const client = new Redis(
    createResilientRequester({ url: mock.url, token: mock.token, timeoutMs, breaker: __getSharedBreakerForTests() }),
  );
  __setSharedRedisForTests(client);
}

beforeEach(() => {
  mock.mode = "ok";
  mock.delayMs = 0;
  mock.store.clear();
  mock.resetStats();
  install();
});

const CTX: RateCacheContext = { checkin: "2026-11-20", checkout: "2026-11-22", adults: 2, children: [], rooms: 1, currency: "PLN" };

// Kształt jak z produkcji (log 2026-10-27): offerId ~1100 znaków, rateId ~550.
const LEGACY_IDS = { offerId: "A".repeat(1100), rateId: "I".repeat(550) };

function rate(total: number): SlimRate {
  return {
    totalAmount: total,
    currency: "PLN",
    roomName: "Cozy Room City View",
    boardName: "Breakfast Included",
    refundableTag: "NRFN",
    taxesIncluded: false,
    taxExtraAmount: 12.5,
    // Gdyby ktoś przekazał obiekt z dawnymi polami — NIE mogą trafić do Redisa.
    ...(LEGACY_IDS as object),
  } as SlimRate;
}

test("cache stawek: zapis BEZ offerId/rateId (v5), odczyt jednym MGET", async () => {
  await setCachedRates(
    [
      { hotelId: "lp1", rate: rate(1000) },
      { hotelId: "lp2", rate: null },
    ],
    CTX,
  );
  const stored = [...mock.store.entries()].find(([k]) => k.endsWith(":lp1"));
  assert.ok(stored, "wpis zapisany");
  assert.match(stored[0], /^htr:v5:/);
  const raw = stored[1].kind === "string" ? stored[1].value : "";
  assert.doesNotMatch(raw, /offerId|rateId/);
  assert.ok(raw.length < 300, `wpis ma ${raw.length} B (był ~1 850 B)`);

  mock.resetStats();
  const got = await getCachedRates(["lp1", "lp2", "lp3"], CTX);
  assert.deepEqual(got.get("lp1"), {
    state: "hit",
    rate: {
      totalAmount: 1000,
      currency: "PLN",
      roomName: "Cozy Room City View",
      boardName: "Breakfast Included",
      refundableTag: "NRFN",
      taxesIncluded: false,
      taxExtraAmount: 12.5,
    },
  });
  assert.deepEqual(got.get("lp2"), { state: "unavailable" });
  assert.deepEqual(got.get("lp3"), { state: "miss" });
  assert.equal(mock.stats.requests, 1, "jedno żądanie HTTP na paczkę");
  assert.equal(mock.stats.base64Requests, 0, "odpowiedzi bez kodowania base64");
});

test("LIMIT PLANU: cache stawek degraduje do pudeł, po pierwszej odmowie ZERO żądań do Upstash", async () => {
  mock.mode = "quota";
  const first = await getCachedRates(["lp1"], CTX);
  assert.deepEqual(first.get("lp1"), { state: "miss" });
  assert.equal(mock.stats.requests, 1);
  assert.equal(redisMayBeAvailable(), false, "wyłącznik otwarty po komunikacie limitu planu");

  for (let i = 0; i < 20; i++) {
    await getCachedRates(["lp1", "lp2"], CTX);
    await setCachedRates([{ hotelId: "lp1", rate: rate(10) }], CTX);
    assert.equal(await readPriceSnapshot(), null);
  }
  assert.equal(mock.stats.requests, 1, "60 kolejnych operacji — żadna nie poszła do sieci");
});

test("LIMIT PLANU: limiter NIE rzuca (było: 500 na /api/hotels/rates/batch) — liczy lokalnie i nadal odcina nadużycie", async () => {
  mock.mode = "quota";
  const req = () =>
    new NextRequest("https://helptravel.pl/api/flights/rates", { headers: { "x-forwarded-for": "203.0.113.7" } });
  // flights-search: 20/min, polityka awaryjna „local".
  for (let i = 0; i < 20; i++) {
    assert.equal(await enforceRateLimit(req(), "flights-search"), null, `żądanie ${i + 1} przepuszczone`);
  }
  const blocked = await enforceRateLimit(req(), "flights-search");
  assert.ok(blocked, "dwudzieste pierwsze odcięte");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
  assert.ok(mock.stats.requests <= 1, `limiter odpytał Upstash ${mock.stats.requests}× (wyłącznik)`);
});

test("LIMIT PLANU: klucze ZAMKNIĘTE (czat = płatne LLM, prebook, e-maile operatora) → 503, nie limit lokalny", async () => {
  mock.mode = "quota";
  for (const key of ["concierge", "booking-prebook", "admin-email-test"] as const) {
    const res = await enforceRateLimit(
      new NextRequest("https://helptravel.pl/api/x", { headers: { "x-forwarded-for": "203.0.113.8" } }),
      key,
    );
    assert.equal(res?.status, 503, key);
    assert.equal(((await res!.json()) as { error: string }).error, "TEMPORARILY_UNAVAILABLE", key);
  }
  assert.ok(mock.stats.requests <= 1, `Upstash odpytany ${mock.stats.requests}× (wyłącznik)`);
});

test("LIMIT PLANU: zapis sesji rezerwacji → BookingError LITEAPI_DOWN (503), komunikat bez danych gościa", async () => {
  mock.mode = "quota";
  const rec: SessionRecord = {
    prebookId: "pb_1",
    transactionId: "tr_secret_1",
    secretKey: "pi_123_secret_456",
    offerId: "offer",
    hotelSummary: { name: "Hotel" },
    rateSummary: { checkin: "2026-11-20", checkout: "2026-11-22" },
    holder: { firstName: "Jan", lastName: "Kowalski", email: "jan.kowalski@example.com" },
    createdAt: Date.now(),
  };
  await assert.rejects(
    () => saveSession("sid-1", rec),
    (err: unknown) => {
      const e = err as { name?: string; code?: string; httpStatus?: number; message?: string };
      assert.equal(e.name, "BookingError");
      assert.equal(e.code, "LITEAPI_DOWN");
      assert.equal(e.httpStatus, 503);
      assert.doesNotMatch(String(e.message), /jan\.kowalski|secret|tr_secret/);
      return true;
    },
  );
  assert.equal(bookingStoreMayBeAvailable(), false, "prebook zostanie odcięty PRZED wywołaniem dostawcy");
});

test("PRZED prebookiem: znacznik sesji jako dowód zapisu — przy limicie planu odmowa (bez kontaktu z dostawcą)", async () => {
  // Zdrowy magazyn: znacznik zapisany z krótkim TTL.
  await reserveBookingSession("sid-ok");
  const marker = [...mock.store.keys()].find((k) => k.endsWith(":pending:sid-ok"));
  assert.ok(marker, "znacznik zapisany");

  // Stan z produkcji: wyłącznik jeszcze ZAMKNIĘTY (nic nie wie), magazyn już leży.
  mock.mode = "quota";
  assert.equal(bookingStoreMayBeAvailable(), true, "szybka ścieżka nie wie o awarii");
  await assert.rejects(
    () => reserveBookingSession("sid-2"),
    (err: unknown) => (err as { code?: string }).code === "LITEAPI_DOWN",
  );
  assert.equal(bookingStoreMayBeAvailable(), false, "po odmowie wyłącznik otwarty");
});

test("LIMIT PLANU: blokada crona → przebieg pominięty (bez palenia LiteAPI), odpowiedź 200 skipped_store_unavailable", async () => {
  mock.mode = "quota";
  const lock = await zajmijBlokade("test-job", 60);
  assert.equal(lock.zdobyta, false);
  assert.equal(lock.powod, "magazyn_niedostepny");
  assert.deepEqual(odpowiedzBezBlokady("test-job", lock), { ok: true, status: "skipped_store_unavailable" });
  const before = mock.stats.requests;
  const again = await zajmijBlokade("test-job", 60);
  assert.equal(again.powod, "magazyn_niedostepny");
  assert.equal(mock.stats.requests, before, "przy otwartym obwodzie nawet próba blokady nie idzie do sieci");
});

test("blokada crona działa normalnie przy zdrowym magazynie (zajęta = skipped_locked)", async () => {
  const a = await zajmijBlokade("job-x", 60);
  assert.equal(a.zdobyta, true);
  const b = await zajmijBlokade("job-x", 60);
  assert.equal(b.zdobyta, false);
  assert.equal(b.powod, "zajeta");
  assert.equal(odpowiedzBezBlokady("job-x", b).status, "skipped_locked");
});

test("ZAWIESZONY serwer: odczyt kończy się po limicie czasu, strona dostaje null zamiast wisieć", async () => {
  install(250);
  mock.mode = "hang";
  const t0 = Date.now();
  await assert.rejects(() => readPriceSnapshotStrict(), (err: unknown) => {
    assert.ok(err instanceof RedisUnavailableError);
    assert.equal(err.reason, "timeout");
    return true;
  });
  assert.equal(await readPriceSnapshot(), null);
  assert.ok(Date.now() - t0 < 2_000, "dwa odczyty w < 2 s (domyślny klient SDK nie miał limitu czasu)");
});

test("historia cen: JEDEN odczyt HGETALL, zapis dzisiejszego minimum w tle jednym potokiem", async () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const lowest = await lowestPrice30dAndRecord("lp9", CTX, 900, now);
  assert.equal(lowest, null, "brak historii = nie wiemy");
  await new Promise((r) => setTimeout(r, 50)); // zapis w tle
  assert.equal(mock.stats.commandNames.hgetall, 1);
  assert.equal(mock.stats.commandNames.hget ?? 0, 0, "bez osobnego HGET");
  assert.equal(mock.stats.commandNames.hset, 1);
  assert.equal(mock.stats.commandNames.expire, 1);
  assert.equal(mock.stats.requests, 2, "HGETALL + jeden potok HSET/EXPIRE");

  mock.resetStats();
  await lowestPrice30dAndRecord("lp9", CTX, 950, now); // drożej niż dzisiejsze minimum
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(mock.stats.requests, 1, "droższa cena tego samego dnia = sam odczyt");

  const nextDay = new Date("2026-10-28T12:00:00Z");
  const deferred: Array<() => Promise<void>> = [];
  assert.equal(
    await lowestPrice30dAndRecord("lp9", CTX, 990, nextDay, (task) => deferred.push(task)),
    900,
    "wczorajsze minimum wchodzi do okna",
  );
  // Zapis przekazany do `defer` (na stronie: after() Nexta), nie puszczony luzem.
  assert.equal(deferred.length, 1);
  await Promise.all(deferred.map((task) => task()));
});

test("loty: zapis listy + skrótu ceny; cron czyta SAM skrót (≈100 B zamiast całej listy)", async () => {
  // offerId jak u dostawcy: losowy token (~1 200 znaków base64) — powtarzalny
  // tekst gzip ścisnąłby do zera i pomiar nie miałby sensu.
  const offers: DisplayOffer[] = Array.from({ length: 200 }, (_, i) => ({
    offerId: `X${i}-${randomBytes(900).toString("base64")}`,
    total: 600 + i,
    currency: "PLN",
    legs: [],
    maxDurationMinutes: 180,
    hasCheckedBag: false,
    hasCarryOnBag: true,
    fares: [],
  }));
  const key = flightRatesCacheKey({
    legs: [
      { origin: "WAW", destination: "BCN", date: "2026-12-05", direction: "OUTBOUND" },
      { origin: "BCN", destination: "WAW", date: "2026-12-12", direction: "INBOUND" },
    ],
    adults: 2,
    children: 0,
    infants: 0,
    cabinClass: "ECONOMY",
    currency: "PLN",
    country: "PL",
  });
  mock.resetStats();
  await setCachedFlightOffers(key, offers, "warm");
  assert.ok(mock.store.has(key));
  assert.ok(mock.store.has(key.replace(/^flrt:v2:/, "flmin:v1:")));
  assert.equal(mock.stats.requests, 1, "lista i skrót w JEDNEJ transakcji MULTI/EXEC");
  assert.equal(mock.stats.commandNames.set, 2);

  mock.resetStats();
  const summary = await getCachedFlightSummary(key);
  assert.equal(summary?.min, 600);
  assert.equal(summary?.count, 200);
  const summaryBytes = mock.stats.bytesOut;

  mock.resetStats();
  const full = await getCachedFlightOffers(key);
  assert.equal(full?.length, 200);
  const fullBytes = mock.stats.bytesOut;
  assert.ok(summaryBytes < 200, `skrót ${summaryBytes} B`);
  assert.ok(fullBytes > 50 * summaryBytes, `lista ${fullBytes} B vs skrót ${summaryBytes} B`);
});
