// Safety contract for the slim-rate cache. This sits on the revenue path
// (hotel pricing), so the non-negotiable guarantee is: when Redis is
// unavailable or misconfigured, the cache must degrade to a transparent
// no-op — never throw, never block, never poison results. A regression
// here would take pricing down in production.

import assert from "node:assert/strict";
import { test } from "node:test";

import { getCachedRates, setCachedRates, type RateCacheContext, type SlimRate } from "./rate-cache";

// Ensure the "no Upstash env" path (the production failure mode we must
// survive) is what we exercise here.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const ctx: RateCacheContext = {
  checkin: "2026-06-10",
  checkout: "2026-06-14",
  adults: 2,
  children: [],
  rooms: 1,
  currency: "PLN",
};

test("getCachedRates without Redis env → every hotel is a miss, never throws", async () => {
  const ids = ["lp1", "lp2", "lp3"];
  const result = await getCachedRates(ids, ctx);
  assert.equal(result.size, 3);
  for (const id of ids) {
    assert.deepEqual(result.get(id), { state: "miss" });
  }
});

test("getCachedRates with empty input returns an empty map", async () => {
  const result = await getCachedRates([], ctx);
  assert.equal(result.size, 0);
});

test("setCachedRates without Redis env resolves silently (best-effort)", async () => {
  const rate: SlimRate = {
    totalAmount: 1234.5,
    currency: "PLN",
    offerId: "o1",
    rateId: "r1",
  };
  await assert.doesNotReject(
    setCachedRates([{ hotelId: "lp1", rate }, { hotelId: "lp2", rate: null }], ctx),
  );
});

test("setCachedRates with no entries is a no-op", async () => {
  await assert.doesNotReject(setCachedRates([], ctx));
});
