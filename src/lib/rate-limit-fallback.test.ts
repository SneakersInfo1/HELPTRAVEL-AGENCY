// Limit ZASTĘPCZY limitera: gdy Redis nie odpowiada, trasa dostaje albo
// przepuszczenie, albo uczciwe 429 — nigdy wyjątek (był: HTTP 500 na
// /api/hotels/rates/batch od 2026-10-25).

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { Ratelimit } from "@upstash/ratelimit";
import { NextRequest } from "next/server";

import {
  __resetLimitersForTests,
  __setLimiterForTests,
  degradedPolicyFor,
  enforceRateLimit,
  LocalSlidingWindow,
} from "./rate-limit";

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
    for (let i = 0; i < 20; i++) assert.equal(await enforceRateLimit(req("203.0.113.50"), "flights-search"), null);
    assert.equal((await enforceRateLimit(req("203.0.113.50"), "flights-search"))?.status, 429);
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
  __setLimiterForTests("flights-search", timeoutLimiter());
  for (let i = 0; i < 20; i++) assert.equal(await enforceRateLimit(req(), "flights-search"), null);
  assert.equal((await enforceRateLimit(req(), "flights-search"))?.status, 429);
});

// ── Codex, przegląd 2 (B1): koszt O(1) przy pełnej mapie ────────────────────

test("pełna pamięć: wypada adres, który zamilkł — aktywny (także odrzucany) zostaje ze swoim licznikiem", () => {
  const w = new LocalSlidingWindow(2, 60_000, 4); // dwie generacje po 2 wpisy
  const t = 9_000_000;
  w.hit("b", t);
  w.hit("b", t); // „b” na progu
  w.hit("a", t);
  w.hit("a", t); // „a” na progu; bieżąca pełna → staje się starszą
  assert.equal(w.hit("a", t).success, false); // odrzucone, ale „a” wraca do bieżącej
  w.hit("c", t); // bieżąca pełna → starsza z samym „b” wypada w całości
  assert.ok(w.size <= 4, `rozmiar ${w.size}`);
  assert.equal(w.hit("a", t).success, false, "aktywny adres na progu NIE wypadł");
  assert.equal(w.hit("b", t).success, true, "wypadł adres, który zamilkł (nowy licznik)");
});

test("zalanie unikalnymi adresami przy pełnej mapie nie zjada CPU (200 tys. adresów, mapa 10 tys.)", () => {
  // Pierwsza implementacja przeglądała całą mapę (10 tys.) przy KAŻDYM nowym
  // adresie (zmierzone: 50 tys. adresów 5,2 s), druga usuwała najstarszy przez
  // `keys().next()` i też rosła szybciej niż liniowo (200 tys. — 2,3 s).
  // Generacje: stały koszt na adres.
  const w = new LocalSlidingWindow(20, 60_000);
  const t = 12_000_000;
  const t0 = performance.now();
  for (let i = 0; i < 200_000; i++) w.hit(`10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`, t);
  const ms = performance.now() - t0;
  assert.ok(w.size <= 10_000, `rozmiar ${w.size}`);
  assert.ok(ms < 1_500, `200 tys. nowych adresów w ${Math.round(ms)} ms`);
});

// ── Polityka awaryjna: klucze kosztowe są ZAMKNIĘTE bez Redisa ─────────────

test("polityka awaryjna: czat (płatne LLM), prebook i e-maile operatora — 503; wyszukiwanie, ceny i book — limit lokalny", () => {
  assert.equal(degradedPolicyFor("concierge"), "closed");
  assert.equal(degradedPolicyFor("booking-prebook"), "closed");
  assert.equal(degradedPolicyFor("admin-email-test"), "closed", "Codex, przegląd 3: wysyłka e-maili na dowolny adres");
  for (const k of ["stays-search", "stays-rates-batch", "flights-search", "destination-suggest", "booking-lookup"] as const) {
    assert.equal(degradedPolicyFor(k), "local", k);
  }
  assert.equal(degradedPolicyFor("booking-book"), "local", "dokończenie OPŁACONEJ transakcji nie może zależeć od limitera");
});

test("czat przy limicie planu Redisa → 503 (bez wywołania modelu), nigdy limit lokalny", async () => {
  __setLimiterForTests("concierge", throwingLimiter());
  for (let i = 0; i < 3; i++) {
    const res = await enforceRateLimit(req(`203.0.113.${60 + i}`), "concierge");
    assert.equal(res?.status, 503, `adres ${i}: zamknięte niezależnie od licznika`);
    assert.equal(res?.headers.get("Retry-After"), "60");
    const body = (await res!.json()) as { error: string; message: string };
    assert.equal(body.error, "TEMPORARILY_UNAVAILABLE");
    assert.doesNotMatch(body.message, /redis|upstash|quota/i, "bez szczegółów infrastruktury");
  }
});

test("czat przy TIMEOUT limitera → 503, a przy działającym Redisie — zwykły limit", async () => {
  __setLimiterForTests("concierge", timeoutLimiter());
  assert.equal((await enforceRateLimit(req(), "concierge"))?.status, 503);
  __resetLimitersForTests();
  let calls = 0;
  const healthy = {
    limit: async () => {
      calls += 1;
      return { success: true, limit: 10, remaining: 9, reset: Date.now() + 60_000, pending: Promise.resolve() };
    },
  } as unknown as Ratelimit;
  __setLimiterForTests("concierge", healthy);
  assert.equal(await enforceRateLimit(req(), "concierge"), null, "Redis odpowiada → czat działa");
  assert.equal(calls, 1);
});

test("czat bez konfiguracji Upstash NA WDROŻENIU → 503 (brak globalnego sufitu kosztu)", async () => {
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    assert.equal((await enforceRateLimit(req("203.0.113.70"), "concierge"))?.status, 503);
  } finally {
    if (prev === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prev;
  }
});

test("prebook przy awarii Redisa → 503 zanim trasa dotknie dostawcy; book → limit lokalny (nie blokuje opłaconych)", async () => {
  __setLimiterForTests("booking-prebook", throwingLimiter());
  assert.equal((await enforceRateLimit(req("203.0.113.80"), "booking-prebook"))?.status, 503);
  __setLimiterForTests("booking-book", throwingLimiter());
  for (let i = 0; i < 10; i++) assert.equal(await enforceRateLimit(req("203.0.113.81"), "booking-book"), null);
  assert.equal((await enforceRateLimit(req("203.0.113.81"), "booking-book"))?.status, 429, "próg 10/min liczony lokalnie");
});

test("e-maile operatora przy awarii Redisa → 503 (próg 5/min nie rozmywa się na N instancji)", async () => {
  __setLimiterForTests("admin-email-test", throwingLimiter());
  assert.equal((await enforceRateLimit(req("203.0.113.90"), "admin-email-test"))?.status, 503);
});

test("komunikat 503 zależy od funkcji: czat i rezerwacje mówią, co nie działa", async () => {
  __setLimiterForTests("concierge", throwingLimiter());
  __setLimiterForTests("booking-prebook", throwingLimiter());
  const chat = (await (await enforceRateLimit(req("203.0.113.91"), "concierge"))!.json()) as { message: string };
  const pre = (await (await enforceRateLimit(req("203.0.113.92"), "booking-prebook"))!.json()) as { message: string };
  assert.match(chat.message, /Czat/);
  assert.match(pre.message, /Rezerwacje/);
  assert.match(pre.message, /nic nie zostało zarezerwowane ani pobrane/i);
});
