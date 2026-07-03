// Ocena Trustpilot na homepage MUSI pochodzić z ich strony (uczciwość jak
// przy cenach: żadnych liczb na sztywno w UI). Testujemy: parser HTML
// profilu (JSON-LD + fallbacki), świeżość (14 dni — źródło bywa kapryśne,
// Cloudflare), throttle odświeżania (24 h) i degrade-keep-old przy porażce.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  __resetTrustpilotRedisForTests,
  __setTrustpilotRedisForTests,
  isFreshTrustpilot,
  parseTrustpilotRating,
  readTrustpilotSnapshot,
  refreshTrustpilotSnapshot,
  TRUSTPILOT_FRESH_MS,
  type TrustpilotEntry,
} from "./trustpilot-snapshot";

afterEach(() => __resetTrustpilotRedisForTests());

// ── Parser ────────────────────────────────────────────────────────────────

const JSONLD_PAGE = `<!DOCTYPE html><html><head>
<script type="application/ld+json">{"@context":"http://schema.org","@graph":[
 {"@type":"BreadcrumbList","itemListElement":[]},
 {"@type":"LocalBusiness","name":"HelpTravel",
  "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.2","bestRating":"5","reviewCount":"38"}}
]}</script></head><body>ok</body></html>`;

test("parser: JSON-LD z @graph → score i reviewCount", () => {
  assert.deepEqual(parseTrustpilotRating(JSONLD_PAGE), { score: 4.2, reviewCount: 38 });
});

test("parser: wiele bloków, zepsuty JSON w pierwszym — drugi ratuje", () => {
  const html = `<script type="application/ld+json">{nie-json</script>
<script type="application/ld+json">{"@type":"LocalBusiness","aggregateRating":{"ratingValue":4.5,"reviewCount":12}}</script>`;
  assert.deepEqual(parseTrustpilotRating(html), { score: 4.5, reviewCount: 12 });
});

test("parser: fallback trustScore/numberOfReviews z osadzonego JSON (Next data)", () => {
  const html = `<script id="__NEXT_DATA__">{"props":{"businessUnit":{"trustScore":4.2,"numberOfReviews":38}}}</script>`;
  assert.deepEqual(parseTrustpilotRating(html), { score: 4.2, reviewCount: 38 });
});

test("parser: fallback z tytułu „z 4,2 / 5” (bez liczby opinii)", () => {
  const html = `<title>HelpTravel została oceniona "Dobra" z 4,2 / 5 na portalu Trustpilot</title>`;
  assert.deepEqual(parseTrustpilotRating(html), { score: 4.2, reviewCount: null });
});

test("parser: challenge Cloudflare / brak danych → null (nigdy zmyślona liczba)", () => {
  assert.equal(parseTrustpilotRating("<html>Verifying your connection…</html>"), null);
  assert.equal(parseTrustpilotRating(""), null);
});

test("parser: score poza zakresem 1-5 odrzucony", () => {
  const html = `<script type="application/ld+json">{"aggregateRating":{"ratingValue":"42","reviewCount":"5"}}</script>`;
  assert.equal(parseTrustpilotRating(html), null);
});

// ── Świeżość ──────────────────────────────────────────────────────────────

test("isFreshTrustpilot: <14 dni tak, starsze nie, brak wpisu nie", () => {
  const now = Date.now();
  const fresh: TrustpilotEntry = { score: 4.2, reviewCount: 38, fetchedAt: now - 1000 };
  const stale: TrustpilotEntry = { score: 4.2, reviewCount: 38, fetchedAt: now - TRUSTPILOT_FRESH_MS - 1 };
  assert.equal(isFreshTrustpilot(fresh, now), true);
  assert.equal(isFreshTrustpilot(stale, now), false);
  assert.equal(isFreshTrustpilot(undefined, now), false);
});

// ── Refresh (throttle + degrade) ─────────────────────────────────────────

type Store = Record<string, unknown>;
function fakeRedis(store: Store) {
  return {
    async get<T>(key: string): Promise<T | null> {
      return (store[key] as T) ?? null;
    },
    async set(key: string, value: unknown): Promise<unknown> {
      store[key] = value;
      return "OK";
    },
  };
}

test("refresh: świeższy niż 24 h → fetch NIE jest wołany (throttle)", async () => {
  const store: Store = { "trustpilot:v1": { score: 4.2, reviewCount: 38, fetchedAt: Date.now() - 1000 } };
  __setTrustpilotRedisForTests(fakeRedis(store));
  let calls = 0;
  const res = await refreshTrustpilotSnapshot(async () => {
    calls += 1;
    return new Response(JSONLD_PAGE);
  });
  assert.equal(res, "skipped");
  assert.equal(calls, 0);
});

test("refresh: stary wpis + udany fetch → nadpisany świeżymi danymi", async () => {
  const old = { score: 3.9, reviewCount: 10, fetchedAt: Date.now() - 25 * 3600 * 1000 };
  const store: Store = { "trustpilot:v1": old };
  __setTrustpilotRedisForTests(fakeRedis(store));
  const res = await refreshTrustpilotSnapshot(async () => new Response(JSONLD_PAGE));
  assert.equal(res, "refreshed");
  const entry = await readTrustpilotSnapshot();
  assert.equal(entry?.score, 4.2);
  assert.equal(entry?.reviewCount, 38);
  assert.ok((entry?.fetchedAt ?? 0) > old.fetchedAt);
});

test("refresh: porażka fetcha → stary wpis ZOSTAJE (degrade-keep-old)", async () => {
  const old = { score: 4.2, reviewCount: 38, fetchedAt: Date.now() - 25 * 3600 * 1000 };
  const store: Store = { "trustpilot:v1": old };
  __setTrustpilotRedisForTests(fakeRedis(store));
  const res = await refreshTrustpilotSnapshot(async () => {
    throw new Error("blocked");
  });
  assert.equal(res, "failed");
  assert.deepEqual(await readTrustpilotSnapshot(), old);
});

test("refresh: challenge (parser null) → stary wpis zostaje", async () => {
  const old = { score: 4.2, reviewCount: 38, fetchedAt: Date.now() - 25 * 3600 * 1000 };
  const store: Store = { "trustpilot:v1": old };
  __setTrustpilotRedisForTests(fakeRedis(store));
  const res = await refreshTrustpilotSnapshot(async () => new Response("Verifying your connection…"));
  assert.equal(res, "failed");
  assert.deepEqual(await readTrustpilotSnapshot(), old);
});

test("read: brak env/seama → null (degrade-to-miss, nigdy wyjątek)", async () => {
  __setTrustpilotRedisForTests(null);
  assert.equal(await readTrustpilotSnapshot(), null);
});
