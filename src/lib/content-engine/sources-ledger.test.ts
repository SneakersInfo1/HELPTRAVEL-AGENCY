import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Ledger, LockHeldError, idempotencyKey } from "./ledger";
import { HttpSourceFetcher, SourcePolicyError, assertAllowedSource, evidenceFoundIn } from "./sources";

test("klucz idempotencji normalizuje wielkość liter, query i końcowy slash", () => {
  const base = { day: "2026-11-13", operation: "refresh", policyVersion: "p1", modeClass: "trial" as const };
  const first = idempotencyKey({ ...base, target: "https://HelpTravel.pl/Porownanie/Test/?utm=x" });
  const second = idempotencyKey({ ...base, target: "/porownanie/test" });
  assert.equal(first, second);
});

test("klucz idempotencji rozróżnia przebieg próbny od publikującego", () => {
  const base = { day: "2026-11-13", operation: "refresh", policyVersion: "p1", target: "/porownanie/test" };
  assert.notEqual(idempotencyKey({ ...base, modeClass: "trial" }), idempotencyKey({ ...base, modeClass: "publishing" }));
});

test("dowód jest sprawdzany dosłownie po normalizacji białych znaków i wielkości liter", () => {
  assert.equal(evidenceFoundIn("Oficjalny tekst: TURIA   Garden\n follows the riverbed.", "turia garden follows the riverbed."), true);
  assert.equal(evidenceFoundIn("Turia Garden follows the riverbed.", "Garden reaches the sea."), false);
});

test("allowlista akceptuje oficjalne subdomeny i odrzuca twardą listę zakazów", () => {
  assert.equal(assertAllowedSource("https://www.visitmadeira.com/guide").hostname, "www.visitmadeira.com");
  const denied = [
    "https://api.liteapi.travel/v3.0/data/hotels",
    "https://helptravel.pl/api/flights/search",
    "https://helptravel.pl/hotele/szukaj?city=rome",
    "https://user:pass@visitmadeira.com/guide",
    "https://visitmadeira.com:8443/guide",
    "http://visitmadeira.com/guide",
    "https://example.com/guide",
  ];
  for (const url of denied) assert.throws(() => assertAllowedSource(url), SourcePolicyError, url);
  assert.equal(assertAllowedSource("https://visitmadeira.com:443/guide").hostname, "visitmadeira.com");
});

test("resolver blokuje prywatne, loopback, link-local i ULA przed fetch", async () => {
  let address = "127.0.0.1";
  let fetchCalls = 0;
  const fetcher = new HttpSourceFetcher({
    resolver: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
    fetch: async () => {
      fetchCalls += 1;
      return new Response("<p>public source</p>", { status: 200 });
    },
  });
  for (const forbidden of ["127.0.0.1", "10.0.0.8", "169.254.1.2", "192.168.1.5", "::1", "fe80::1", "fd00::1"]) {
    address = forbidden;
    await assert.rejects(fetcher.fetchText("https://visitmadeira.com/guide"), SourcePolicyError, forbidden);
  }
  assert.equal(fetchCalls, 0);

  address = "93.184.216.34";
  const fetched = await fetcher.fetchText("https://visitmadeira.com/guide");
  assert.equal(fetched.text, "public source");
  assert.equal(fetchCalls, 1);
});

test("ważna blokada odmawia drugiemu przebiegowi, a wygasła jest przejmowana", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "seo-ledger-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const first = new Ledger({ stateDir, runId: "run-one", now: () => new Date("2026-11-13T00:00:00.000Z") });
  const held = await first.acquireLock("daily", { ttlMs: 10_000, now: new Date("2026-11-13T00:00:00.000Z") });
  const second = new Ledger({ stateDir, runId: "run-two" });
  await assert.rejects(second.acquireLock("daily", { ttlMs: 10_000, now: new Date("2026-11-13T00:00:05.000Z") }), LockHeldError);
  const recovered = await second.acquireLock("daily", { ttlMs: 10_000, now: new Date("2026-11-13T00:00:11.000Z") });
  await recovered.release();
  await held.release();
});

test("nieudany wpis idempotencji można ponowić", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "seo-ledger-retry-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const first = new Ledger({ stateDir, runId: "failed-run" });
  assert.equal((await first.begin("same-key")).status, "started");
  await first.fail("same-key", new Error("awaria"));
  const retry = new Ledger({ stateDir, runId: "retry-run" });
  assert.equal((await retry.begin("same-key")).status, "started");
});

test("releasePending usuwa wyłącznie wpisy wskazanego przebiegu", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "seo-ledger-pending-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const ledger = new Ledger({ stateDir, runId: "cleanup" });
  const now = new Date("2026-11-13T00:00:00Z");
  await ledger.markPending("/porownanie/a", "run-a", now);
  await ledger.markPending("/porownanie/b", "run-b", now);
  assert.equal(await ledger.releasePending("run-a"), 1);
  assert.deepEqual(await ledger.pendingTargets(now, 14), new Set(["/porownanie/b"]));
});

