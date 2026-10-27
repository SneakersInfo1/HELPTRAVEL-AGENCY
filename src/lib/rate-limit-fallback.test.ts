// Limit ZASTĘPCZY limitera: gdy Redis nie odpowiada, trasa dostaje albo
// przepuszczenie, albo uczciwe 429 — nigdy wyjątek (był: HTTP 500 na
// /api/hotels/rates/batch od 2026-10-25).

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { Ratelimit } from "@upstash/ratelimit";
import { NextRequest } from "next/server";

import { __resetLimitersForTests, __setLimiterForTests, enforceRateLimit, LocalSlidingWindow } from "./rate-limit";

afterEach(() => __resetLimitersForTests());

const req = (ip = "198.51.100.9") =>
  new NextRequest("https://helptravel.pl/api/hotels/meta", { headers: { "x-forwarded-for": ip } });

function throwingLimiter(): Ratelimit {
  return {
    limit: async () => {
      throw new Error("ERR This database has reached current Fixed plan limits");
    },
  } as unknown as Ratelimit;
}

function timeoutLimiter(): Ratelimit {
  return {
    limit: async () => ({ success: true, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve(), reason: "timeout" }),
  } as unknown as Ratelimit;
}

test("okno lokalne: dokładnie `limit` przepuszczeń w oknie, potem odmowa z czasem resetu", () => {
  const w = new LocalSlidingWindow(3, 60_000);
  const t = 1_000_020_000; // początek okna + 20 s
  assert.equal(w.hit("a", t).success, true);
  assert.equal(w.hit("a", t).success, true);
  assert.equal(w.hit("a", t).success, true);
  const denied = w.hit("a", t);
  assert.equal(denied.success, false);
  assert.ok(denied.reset > t);
  assert.equal(w.hit("b", t).success, true, "inny adres ma własny licznik");
});

test("okno lokalne jest PRZESUWNE: poprzednie okno waży ułamkiem nakładania", () => {
  const w = new LocalSlidingWindow(4, 60_000);
  const start = 1_000_000_000 - (1_000_000_000 % 60_000);
  for (let i = 0; i < 4; i++) assert.equal(w.hit("x", start + 59_000).success, true);
  // 15 s w następne okno: poprzednie waży 75% × 4 = 3 → zostaje 1 miejsce
  assert.equal(w.hit("x", start + 75_000).success, true);
  assert.equal(w.hit("x", start + 75_000).success, false);
  // dwa okna później poprzednie nie waży nic
  assert.equal(w.hit("x", start + 180_000).success, true);
});

test("okno lokalne ma ograniczoną pamięć", () => {
  const w = new LocalSlidingWindow(1, 60_000, 100);
  for (let i = 0; i < 1_000; i++) w.hit(`ip-${i}`, 5_000_000);
  assert.ok(w.size <= 100, `rozmiar ${w.size}`);
  assert.equal(w.hit("nowy", 5_000_000).success, true);
});

test("zalanie tysiącami adresów NIE zeruje licznika aktywnego napastnika (LRU, nie czyszczenie)", () => {
  const w = new LocalSlidingWindow(3, 60_000, 100);
  const t = 7_200_000;
  for (let i = 0; i < 3; i++) assert.equal(w.hit("napastnik", t).success, true);
  for (let i = 0; i < 1_000; i++) {
    w.hit(`rotacja-${i}`, t);
    // napastnik dalej uderza — jest „świeży", więc nie wypada z LRU
    if (i % 50 === 0) assert.equal(w.hit("napastnik", t).success, false, `odcięty także po ${i} obcych adresach`);
  }
});

test("brak konfiguracji Upstash NA WDROŻENIU → limit lokalny zamiast zerowej ochrony", async () => {
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    // Bez UPSTASH_* i bez wstrzykniętego limitera `getLimiter` zwraca null.
    for (let i = 0; i < 5; i++) assert.equal(await enforceRateLimit(req("203.0.113.50"), "admin-email-test"), null);
    assert.equal((await enforceRateLimit(req("203.0.113.50"), "admin-email-test"))?.status, 429);
  } finally {
    if (prev === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prev;
  }
});

test("lokalnie (dev/testy) bez Upstash limiter nadal nic nie blokuje — zachowanie jak dotąd", async () => {
  const prev = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  try {
    for (let i = 0; i < 20; i++) assert.equal(await enforceRateLimit(req("203.0.113.51"), "admin-email-test"), null);
  } finally {
    if (prev !== undefined) process.env.VERCEL_ENV = prev;
  }
});

test("limiter RZUCA (limit planu) → trasa NIE dostaje wyjątku; 320/min dla stays-search liczone lokalnie", async () => {
  __setLimiterForTests("stays-search", throwingLimiter());
  for (let i = 0; i < 320; i++) {
    assert.equal(await enforceRateLimit(req(), "stays-search"), null);
  }
  const res = await enforceRateLimit(req(), "stays-search");
  assert.equal(res?.status, 429);
  assert.equal(await enforceRateLimit(req("192.0.2.1"), "stays-search"), null, "inny adres przechodzi");
});

test("timeout limitera (reason=timeout) → limit lokalny zamiast cichego przepuszczania wszystkiego", async () => {
  __setLimiterForTests("admin-email-test", timeoutLimiter());
  for (let i = 0; i < 5; i++) assert.equal(await enforceRateLimit(req(), "admin-email-test"), null);
  assert.equal((await enforceRateLimit(req(), "admin-email-test"))?.status, 429);
});
