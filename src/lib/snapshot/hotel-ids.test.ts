// Lista hoteli kierunku do snapshotu konsjerża — patrz nagłówek ./hotel-ids.ts.
//
// `unstable_cache` nie działa pod node:test (brak incrementalCache Nexta), więc
// tu sprawdzamy funkcję, którą Next woła przy pudle i przy odświeżeniu w tle,
// oraz to, że czytnik poza Nextem idzie prosto do dostawcy. Sam cache list
// i odświeżenie przeterminowanego wpisu sprawdza /verify w `next start`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { __resetSharedRedisForTests, __setSharedRedisForTests } from "@/lib/redis/client";

import { HOTELS_PER_DEST } from "./config";
import { createSnapshotHotelIdsReader, EmptyHotelListError, fetchSnapshotHotelIds } from "./hotel-ids";

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit & { next?: unknown } }> = [];
let respond: (url: URL, init: RequestInit) => Promise<Response> | Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const hotels = (n: number) => ({
  data: Array.from({ length: n }, (_, i) => ({ id: `lp${i}`, name: `Hotel ${i}`, country: "es", city: "Malaga" })),
});

const hang = (init: RequestInit) =>
  new Promise<Response>((_, reject) =>
    init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }),
  );

const MALAGA = { city: "Malaga", country: "ES", lat: 36.72, lng: -4.42 };

beforeEach(() => {
  process.env.LITEAPI_SANDBOX_KEY = "sand_test";
  calls = [];
  respond = () => json(hotels(60));
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init: init as RequestInit & { next?: unknown } });
    return respond(new URL(String(input)), init);
  }) as typeof fetch;
  __setSharedRedisForTests(null);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetSharedRedisForTests();
});

test("lista prosto od dostawcy: no-store, z sygnałem, bez Data Cache; najwyżej HOTELS_PER_DEST id", async () => {
  let attempts = 0;
  const ids = await fetchSnapshotHotelIds(MALAGA, { onAttempt: () => attempts++ });
  assert.equal(ids.length, HOTELS_PER_DEST);
  assert.equal(ids[0], "lp0");
  assert.equal(calls.length, 1, "pierwsza strategia (cityName) wystarczyła");
  assert.equal(attempts, 1);
  const c = calls[0];
  assert.match(c.url, /\/data\/hotels\?/);
  assert.equal(c.init.cache, "no-store");
  assert.equal(c.init.next, undefined);
  assert.ok(c.init.signal instanceof AbortSignal);
});

test("pusta lista ze wszystkich strategii → wyjątek, żeby `unstable_cache` nie zapisał jej na dobę", async () => {
  respond = (url) => (url.pathname.endsWith("/data/places") ? json({ data: [] }) : json({ data: [] }));
  await assert.rejects(fetchSnapshotHotelIds(MALAGA), EmptyHotelListError);
  assert.ok(calls.some((c) => c.url.includes("/data/places")), "łańcuch doszedł do ostatniej strategii");
});

test("zawieszony dostawca: każda strategia kończy się po limicie, najwyżej 2 próby, wynik NIE jest pustą listą", async () => {
  respond = (_url, init) => hang(init);
  let attempts = 0;
  const t0 = Date.now();
  // `fetchHotelsForDestination` połyka błędy strategii i oddaje `{ data: [] }` —
  // bez wyjątku timeout zostałby zapamiętany jako „brak hoteli" na 24 h.
  await assert.rejects(
    fetchSnapshotHotelIds(MALAGA, { timeoutMs: 40, onAttempt: () => attempts++ }),
    EmptyHotelListError,
  );
  const byCity = calls.filter((c) => c.url.includes("cityName=")).length;
  const byCoords = calls.filter((c) => c.url.includes("latitude=")).length;
  const places = calls.filter((c) => c.url.includes("/data/places")).length;
  assert.deepEqual({ byCity, byCoords, places }, { byCity: 2, byCoords: 2, places: 2 });
  assert.equal(attempts, calls.length);
  assert.ok(Date.now() - t0 < 2_000, "bez czekania 3 × 30 s na strategię jak przy domyślnych opcjach");
});

test("twardy koniec przebiegu: przerwany sygnał = zero zapytań", async () => {
  const done = new AbortController();
  done.abort();
  await assert.rejects(fetchSnapshotHotelIds(MALAGA, { signal: done.signal }), EmptyHotelListError);
  assert.equal(calls.length, 0);
});

test("czytnik poza Nextem (brak incrementalCache) idzie prosto do dostawcy i nie połyka błędów", async () => {
  let attempts = 0;
  const read = createSnapshotHotelIdsReader({ onAttempt: () => attempts++ });
  assert.equal((await read(MALAGA)).length, HOTELS_PER_DEST);
  assert.equal(attempts, 1);
  respond = () => json({ data: [] });
  await assert.rejects(read(MALAGA), EmptyHotelListError);
});

test("strażnik źródła: listy przez `unstable_cache` z naszym zapytaniem; trasa bez gołego fetchHotelsForDestination", () => {
  const lib = readFileSync(join(process.cwd(), "src/lib/snapshot/hotel-ids.ts"), "utf8");
  assert.match(lib, /unstable_cache\(load, \["csnap-hotel-ids", "v1"\], \{\s*revalidate: HOTEL_IDS_REVALIDATE_S/);
  assert.match(lib, /skipDataCache: true/);

  const route = readFileSync(join(process.cwd(), "src/app/api/cron/build-concierge-snapshot/route.ts"), "utf8");
  assert.doesNotMatch(route, /fetchHotelsForDestination\(/);
  assert.match(route, /createSnapshotHotelIdsReader\(\{\s*signal: hardStop/);
  // Zegar i twardy koniec PRZED zajęciem blokady (wolny Redis nie przesuwa końca).
  const lock = route.indexOf("await zajmijBlokade(");
  assert.ok(lock > 0);
  assert.ok(route.indexOf("const startedAt = Date.now()") < lock);
  assert.ok(route.indexOf("const hardStop = AbortSignal.timeout(HARD_STOP_MS)") < lock);
});
