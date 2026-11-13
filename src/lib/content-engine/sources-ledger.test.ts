import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Ledger, LockHeldError, idempotencyKey } from "./ledger";
import { SourcePolicyError, assertAllowedSource, evidenceFoundIn } from "./sources";

test("klucz idempotencji normalizuje wielkość liter, query i końcowy slash", () => {
  const base = { day: "2026-11-13", operation: "refresh", policyVersion: "p1" };
  const first = idempotencyKey({ ...base, target: "https://HelpTravel.pl/Porownanie/Test/?utm=x" });
  const second = idempotencyKey({ ...base, target: "/porownanie/test" });
  assert.equal(first, second);
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
    "http://visitmadeira.com/guide",
    "https://example.com/guide",
  ];
  for (const url of denied) assert.throws(() => assertAllowedSource(url), SourcePolicyError, url);
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

