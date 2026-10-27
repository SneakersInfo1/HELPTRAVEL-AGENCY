// Odczyty stron przez cache danych Nexta — zachowanie POZA serwerem Nexta
// (testy, skrypty): `unstable_cache` nie ma tam magazynu, więc odczyt idzie
// wprost do modułu, a awaria nadal kończy się `null`, nie wyjątkiem.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  __resetDestinationPriceRedisForTests,
  __setDestinationPriceRedisForTests,
} from "@/lib/prices/destination-price-snapshot";

import { readPriceSnapshotCached } from "./cached-reads";

afterEach(() => __resetDestinationPriceRedisForTests());

test("poza runtime Nexta: dane czytane wprost z modułu", async () => {
  const snapshot = { "malaga|spain": { hotelFromPlnPerNight: 199, checkin: "a", checkout: "b", computedAt: 1 } };
  __setDestinationPriceRedisForTests({
    get: async <T>() => snapshot as T,
    set: async () => "OK",
  });
  assert.deepEqual(await readPriceSnapshotCached(), snapshot);
});

test("poza runtime Nexta: awaria Redisa = null (strona bez cen), nie wyjątek", async () => {
  __setDestinationPriceRedisForTests({
    get: async () => {
      throw new Error("ERR This database has reached current Fixed plan limits");
    },
    set: async () => "OK",
  });
  assert.equal(await readPriceSnapshotCached(), null);
});
