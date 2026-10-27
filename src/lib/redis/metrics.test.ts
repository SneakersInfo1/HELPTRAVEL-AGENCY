import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  __resetRedisMetricsForTests,
  checkCronRedisBudget,
  commandFamily,
  flushRedisMetrics,
  keyFamily,
  recordCacheLookup,
  recordRequest,
  recordShortCircuit,
  usageMark,
  usageSince,
} from "./metrics";

let lines: string[] = [];
beforeEach(() => {
  lines = [];
  __resetRedisMetricsForTests({ sink: (l) => lines.push(l) });
});

test("rodzina klucza: stała lista prefiksów, nic z treści klucza", () => {
  assert.equal(keyFamily("htr:v5:2026-11-20:2026-11-22:2--1:PLN:lp1"), "htr");
  assert.equal(keyFamily("booking:v1:session:abc"), "booking");
  assert.equal(keyFamily("helptravel:ratelimit:stays-search:1.2.3.4:123"), "ratelimit");
  assert.equal(keyFamily("cos-nowego:1"), "other");
  assert.equal(commandFamily(["evalsha", "sha", 2, "helptravel:ratelimit:x:ip:1", "y"]), "ratelimit");
  assert.equal(commandFamily(["ping"]), "meta");
  assert.equal(commandFamily(["mget", "flrt:v2:a", "flrt:v2:b"]), "flrt");
});

test("zużycie przebiegu i linia metryk bez kluczy/wartości", () => {
  const mark = usageMark();
  recordRequest({ family: "htr", commands: 50, bytesOut: 10_000, bytesIn: 1_000, ms: 120, outcome: "ok" });
  recordRequest({ family: "dstprice", commands: 1, bytesOut: 50, bytesIn: 20_000, ms: 80, outcome: "ok" });
  recordShortCircuit("htr", 50);
  recordCacheLookup("htr", 30, 20);
  const used = usageSince(mark);
  assert.equal(used.commands, 51);
  assert.equal(used.requests, 2);
  assert.equal(used.shortCircuited, 50);
  assert.equal(used.kb, 30.3);
  flushRedisMetrics("test");
  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0].replace("[redis-metrics] ", ""));
  assert.equal(payload.reason, "test");
  assert.equal(payload.families.htr.cmd, 50);
  assert.equal(payload.families.htr.short, 50);
  assert.equal(payload.cache.htr.hitRatio, 0.6);
  assert.doesNotMatch(lines[0], /lp1|2026-11-20|1\.2\.3\.4/);
});

test("budżet crona: w budżecie = true, przekroczenie = false + ostrzeżenie", () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => warns.push(a.join(" "));
  try {
    assert.equal(checkCronRedisBudget("warm-rates", { commands: 3450, requests: 69, bytesOut: 700_000, bytesIn: 5_000, shortCircuited: 0, kb: 688 }), true);
    // Stary kształt wpisu (z offerId/rateId) — 13,6 MB na przebieg:
    assert.equal(
      checkCronRedisBudget("warm-rates", { commands: 12500, requests: 250, bytesOut: 13_600_000, bytesIn: 200_000, shortCircuited: 0, kb: 13_477 }),
      false,
    );
    assert.ok(warns.some((w) => w.includes("[redis-budget] 'warm-rates'")));
    assert.equal(checkCronRedisBudget("nieznany-job", { commands: 1, requests: 1, bytesOut: 1, bytesIn: 1, shortCircuited: 0, kb: 999_999 }), true);
  } finally {
    console.warn = orig;
  }
});

test("okno bez aktywności nie produkuje linii", () => {
  flushRedisMetrics("pusto");
  assert.equal(lines.length, 0);
});
