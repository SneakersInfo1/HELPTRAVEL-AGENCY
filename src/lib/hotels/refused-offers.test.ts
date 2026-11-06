// Znacznik martwej oferty i celowane odświeżenie stawek, na atrapie Upstash
// (prawdziwy klient, HTTP). Nic nie wychodzi z maszyny.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { Redis } from "@upstash/redis";

import {
  __getSharedBreakerForTests,
  __resetSharedRedisForTests,
  __setSharedRedisForTests,
} from "@/lib/redis/client";
import { createResilientRequester } from "@/lib/redis/requester";
import { startMockUpstash, type MockUpstash } from "@/lib/redis/testing/mock-upstash";

import {
  INVALIDATION_COOLDOWN_SECONDS,
  REFUSAL_TTL_SECONDS,
  __setRatesInvalidatorForTests,
  knownRefusal,
  ratesStayTag,
  refreshStayRates,
  rememberRefusal,
} from "./refused-offers";

const SCOPE = { hotelId: "lp1a2b", checkin: "2026-12-01", checkout: "2026-12-05" };
const COOLDOWN_KEY = "offerref:v1:cd:lp1a2b:2026-12-01:2026-12-05";

let mock: MockUpstash;
let invalidated: string[] = [];

before(async () => {
  mock = await startMockUpstash();
});
after(async () => {
  __setRatesInvalidatorForTests(null);
  __resetSharedRedisForTests();
  await mock.close();
});

beforeEach(() => {
  mock.mode = "ok";
  mock.store.clear();
  invalidated = [];
  __setRatesInvalidatorForTests((tag) => invalidated.push(tag));
  __resetSharedRedisForTests();
  __setSharedRedisForTests(
    new Redis(
      createResilientRequester({
        url: mock.url,
        token: mock.token,
        timeoutMs: 400,
        breaker: __getSharedBreakerForTests(),
      }),
    ),
  );
});

const ttlOf = (key: string) => {
  const expireAt = mock.store.get(key)?.expireAt;
  assert.ok(expireAt, `klucz ${key} musi mieć TTL`);
  return Math.round((expireAt - Date.now()) / 1000);
};

test("znacznik dotyczy dokładnie tej oferty i wygasa sam, a każda odmowa ma własny TTL", async () => {
  await rememberRefusal("OFFER_A", "RATE_UNAVAILABLE", SCOPE);

  assert.deepEqual(await knownRefusal("OFFER_A"), { code: "RATE_UNAVAILABLE", scope: SCOPE });
  assert.equal(await knownRefusal("OFFER_NOWY"), null, "świeża oferta tego pokoju idzie do dostawcy");

  const [key, ...rest] = [...mock.store.keys()];
  assert.deepEqual(rest, []);
  assert.ok(Math.abs(ttlOf(key!) - REFUSAL_TTL_SECONDS) <= 1);
  assert.ok(REFUSAL_TTL_SECONDS > 900, "znacznik musi przeżyć wpis w Data Cache (900 s)");
});

test("wygasła oferta też jest pamiętana, z własnym kodem; stary klient nie podaje terminu", async () => {
  await rememberRefusal("OFFER_A", "PREBOOK_EXPIRED", null);
  assert.deepEqual(await knownRefusal("OFFER_A"), { code: "PREBOOK_EXPIRED", scope: null });
});

test("offerId nie trafia do Redisa w całości (~1300 znaków to transfer)", async () => {
  await rememberRefusal("X".repeat(1300), "RATE_UNAVAILABLE", SCOPE);
  const [key] = [...mock.store.keys()];
  assert.match(key!, /^offerref:v1:o:[0-9a-f]{32}$/);
});

test("odświeżenie unieważnia tylko ten hotel i termin, a cooldown trwa 60 s", async () => {
  await refreshStayRates(SCOPE);

  assert.deepEqual(invalidated, ["rates-stay:lp1a2b:2026-12-01:2026-12-05"]);
  assert.equal(ratesStayTag(SCOPE), invalidated[0]);
  assert.ok(Math.abs(ttlOf(COOLDOWN_KEY) - INVALIDATION_COOLDOWN_SECONDS) <= 1);
});

test("równoległe odświeżenia tego samego terminu: unieważnienie DOKŁADNIE jedno", async () => {
  await Promise.all(Array.from({ length: 20 }, () => refreshStayRates(SCOPE)));
  assert.equal(invalidated.length, 1, "seria odmów nie może wywołać serii świeżych zapytań");
});

test("po upływie cooldownu kolejne odświeżenie działa (samoleczenie po spóźnionym zapisie cache)", async () => {
  await refreshStayRates(SCOPE);
  await refreshStayRates(SCOPE);
  assert.equal(invalidated.length, 1);

  mock.store.delete(COOLDOWN_KEY);
  await refreshStayRates(SCOPE);
  assert.equal(invalidated.length, 2);
});

test("cooldown jest per termin: inny hotel lub inne daty odświeżają tylko swój wpis", async () => {
  const otherDates = { ...SCOPE, checkout: "2026-12-06" };
  const otherHotel = { ...SCOPE, hotelId: "lp9f" };
  await Promise.all([refreshStayRates(SCOPE), refreshStayRates(otherDates), refreshStayRates(otherHotel)]);

  assert.deepEqual(
    [...invalidated].sort(),
    [ratesStayTag(SCOPE), ratesStayTag(otherDates), ratesStayTag(otherHotel)].sort(),
  );
  assert.ok(!invalidated.includes("liteapi-rates"), "nigdy wspólny tag wszystkich stawek");
});

test("awaria Redisa: nic nie rzuca, brak wiedzy o odmowach i brak unieważnienia", async () => {
  mock.mode = "http500";
  await rememberRefusal("OFFER_A", "RATE_UNAVAILABLE", SCOPE);
  await refreshStayRates(SCOPE);
  assert.equal(await knownRefusal("OFFER_A"), null);
  assert.deepEqual(invalidated, []);
});

test("brak Redisa w konfiguracji: wszystkie operacje to puste przebiegi", async () => {
  __setSharedRedisForTests(null);
  await rememberRefusal("OFFER_A", "RATE_UNAVAILABLE", SCOPE);
  await refreshStayRates(SCOPE);
  assert.equal(await knownRefusal("OFFER_A"), null);
  assert.deepEqual(invalidated, []);
});

test("błąd unieważnienia nie wychodzi poza moduł", async () => {
  __setRatesInvalidatorForTests(() => {
    throw new Error("revalidateTag poza kontekstem żądania");
  });
  await refreshStayRates(SCOPE);
});
