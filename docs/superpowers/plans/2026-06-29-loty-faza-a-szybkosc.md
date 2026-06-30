# Loty — Faza A (Szybkość) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przyspieszyć wyszukiwanie lotów — slim cache ofert w Redis (powtórne/cofnięte = instant), normalizacja serwerowa + cap (payload 4,7 MB → ~0,45 MB), progresywny fan-out, negatywny cache martwych tras.

**Architecture:** Nowy best-effort moduł cache (`flights/rates-cache.ts`, Upstash, degraduje do miss). `/api/flights/rates` normalizuje serwerowo, sortuje po cenie, tnie do 150, cache'uje i zwraca `{offers, count, cached}`. Klient (`flight-results.tsx`) czyta gotowe `offers` i renderuje progresywnie w miarę napływu z lotnisk.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Zod, Upstash Redis (`@upstash/redis`), node:test + tsx.

**Spec:** `docs/superpowers/specs/2026-06-28-loty-faza-a-szybkosc-design.md`

---

### Task 1: Moduł cache ofert lotów (`flights/rates-cache.ts`)

**Files:**
- Create: `src/lib/flights/rates-cache.ts`
- Test: `src/lib/flights/rates-cache.test.ts`
- Modify: `package.json` (rejestr testu w skrypcie `test`)

- [ ] **Step 1: Napisz failujący test**

Create `src/lib/flights/rates-cache.test.ts`:

```ts
import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  setCachedFlightOffers,
  __setFlightRatesRedisForTests,
  __resetFlightRatesRedisForTests,
} from "./rates-cache";
import type { FlightSearchInput } from "./types";
import type { DisplayOffer } from "./display";

afterEach(() => __resetFlightRatesRedisForTests());

const baseInput: FlightSearchInput = {
  legs: [{ origin: "WAW", destination: "BCN", date: "2026-08-10", direction: "OUTBOUND" }],
  adults: 1, children: 0, infants: 0, cabinClass: "ECONOMY", currency: "PLN", country: "PL",
};

const sampleOffer: DisplayOffer = {
  offerId: "o1", total: 500, currency: "PLN", legs: [], maxDurationMinutes: 120,
  hasCheckedBag: false, hasCarryOnBag: true, fares: [],
};

function mapRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    client: {
      async get<T = unknown>(k: string): Promise<T | null> { return (store.get(k) as T) ?? null; },
      async set(k: string, v: unknown): Promise<unknown> { store.set(k, v); return "OK"; },
    },
  };
}

test("klucz: deterministyczny i stabilny", () => {
  assert.equal(flightRatesCacheKey(baseInput), flightRatesCacheKey({ ...baseInput }));
});

test("klucz: round-trip (2 legi) różny od one-way", () => {
  const rt: FlightSearchInput = {
    ...baseInput,
    legs: [...baseInput.legs, { origin: "BCN", destination: "WAW", date: "2026-08-17", direction: "INBOUND" }],
  };
  assert.notEqual(flightRatesCacheKey(baseInput), flightRatesCacheKey(rt));
});

test("klucz: inna liczba pasażerów → inny klucz", () => {
  assert.notEqual(flightRatesCacheKey(baseInput), flightRatesCacheKey({ ...baseInput, adults: 2 }));
});

test("brak Redis → get=null, set nie rzuca", async () => {
  __setFlightRatesRedisForTests(null);
  assert.equal(await getCachedFlightOffers("k"), null);
  await setCachedFlightOffers("k", [sampleOffer]); // nie może rzucić
});

test("round-trip z mock Redis: set → get zwraca te same oferty", async () => {
  const { client } = mapRedis();
  __setFlightRatesRedisForTests(client);
  await setCachedFlightOffers("k1", [sampleOffer]);
  assert.deepEqual(await getCachedFlightOffers("k1"), [sampleOffer]);
});

test("pusta lista (negatywny cache) zapisana i odczytana jako []", async () => {
  const { client } = mapRedis();
  __setFlightRatesRedisForTests(client);
  await setCachedFlightOffers("empty", []);
  assert.deepEqual(await getCachedFlightOffers("empty"), []);
});

test("błąd klienta Redis → miss (get=null), set połknięty", async () => {
  __setFlightRatesRedisForTests({
    async get() { throw new Error("boom"); },
    async set() { throw new Error("boom"); },
  });
  assert.equal(await getCachedFlightOffers("k"), null);
  await setCachedFlightOffers("k", [sampleOffer]); // nie może rzucić
});
```

- [ ] **Step 2: Uruchom test — ma FAILOWAĆ (moduł nie istnieje)**

Run: `node --import tsx --test src/lib/flights/rates-cache.test.ts`
Expected: FAIL — `Cannot find module './rates-cache'`.

- [ ] **Step 3: Napisz moduł**

Create `src/lib/flights/rates-cache.ts`:

```ts
// Best-effort cache ofert lotów (Upstash Redis). Wzorzec jak hotelowy
// src/lib/hotels/rate-cache.ts: KAŻDY błąd / brak env → traktowane jak miss.
// Cache MOŻE tylko pomóc, NIGDY nie wywala wyszukiwania.
//
// Przechowujemy CHUDE DisplayOffer[] (znormalizowane serwerowo, przycięte w
// route do ≤150) — wartość <0,5 MB, bezpieczna dla Upstash. TTL krótki, bo
// offerId i tak re-weryfikujemy przy wyborze (verify na /loty/dodatki).

import { Redis } from "@upstash/redis";

import type { DisplayOffer } from "./display";
import type { FlightSearchInput } from "./types";

const KEY_VERSION = "v1";
const TTL_OFFERS_SECONDS = 180; // 3 min — oferty
const TTL_EMPTY_SECONDS = 600; // 10 min — negatywny cache martwych tras

interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

let redis: RedisLike | null | undefined;
let injected: RedisLike | null | undefined;
let warnedMissingEnv = false;

function getRedis(): RedisLike | null {
  if (injected !== undefined) return injected;
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingEnv) {
      console.warn("[flights/rates-cache] UPSTASH env brak — cache lotów WYŁĄCZONY (każdy search live).");
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }
  redis = new Redis({ url, token }) as unknown as RedisLike;
  return redis;
}

// Seam testowy (jak w flights/session.ts).
export function __setFlightRatesRedisForTests(client: RedisLike | null): void {
  injected = client;
}
export function __resetFlightRatesRedisForTests(): void {
  injected = undefined;
  redis = undefined;
}

/** Deterministyczny klucz z legs (origin/destination/date) + pax + klasa + waluta. */
export function flightRatesCacheKey(input: FlightSearchInput): string {
  const legs = input.legs.map((l) => `${l.origin}-${l.destination}-${l.date}`).join("_");
  const pax = `${input.adults}.${input.children}.${input.infants}`;
  return `flrt:${KEY_VERSION}:${legs}:${pax}:${input.cabinClass}:${input.currency}`;
}

/** Odczyt. null = miss (brak env, błąd, brak wpisu). [] = trafiony negatywny cache. */
export async function getCachedFlightOffers(key: string): Promise<DisplayOffer[] | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const v = await client.get<DisplayOffer[]>(key);
    return Array.isArray(v) ? v : null;
  } catch (err) {
    console.warn("[flights/rates-cache] read miss:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Zapis (best-effort). Pusta lista → krótszy TTL (negatywny cache martwych tras). */
export async function setCachedFlightOffers(key: string, offers: DisplayOffer[]): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const ex = offers.length > 0 ? TTL_OFFERS_SECONDS : TTL_EMPTY_SECONDS;
    await client.set(key, offers, { ex });
  } catch (err) {
    console.warn("[flights/rates-cache] write skip:", err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 4: Zarejestruj test w `package.json`**

W skrypcie `"test"` dodaj `src/lib/flights/rates-cache.test.ts` zaraz po `src/lib/flights/flights.test.ts`:

```
... src/lib/flights/flights.test.ts src/lib/flights/rates-cache.test.ts ...
```

- [ ] **Step 5: Uruchom test — ma PRZEJŚĆ**

Run: `node --import tsx --test src/lib/flights/rates-cache.test.ts`
Expected: PASS — 7 testów zielonych.

- [ ] **Step 6: Commit**

```bash
git add src/lib/flights/rates-cache.ts src/lib/flights/rates-cache.test.ts package.json
git commit -m "feat(loty): best-effort cache ofert w Redis (rates-cache)"
```

---

### Task 2: Normalizacja serwerowa + cap + cache w route

**Files:**
- Modify: `src/app/api/flights/rates/route.ts`

- [ ] **Step 1: Podmień importy i dodaj stałą capa**

W `src/app/api/flights/rates/route.ts` zmień blok importów (linie ~9–13) na:

```ts
import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/rate-limit";
import { searchFlightRates, toFlightApiError } from "@/lib/flights/client";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import { normalizeRatesResponse } from "@/lib/flights/display";
import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  setCachedFlightOffers,
} from "@/lib/flights/rates-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lista pokazuje setki ofert; cap utrzymuje payload <0,5 MB i Redis-friendly.
// Sort po cenie PRZED capem → najtańsze zawsze zostają; klient re-sortuje wg wyboru.
const FLIGHT_OFFERS_CAP = 150;
```

- [ ] **Step 2: Zamień ciało `try` (wywołanie + odpowiedź)**

Zamień obecny blok (od `const parsed = ...` do końca funkcji) na:

```ts
  const parsed = FlightSearchInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // Cache-hit → instant (oferty już chude i przycięte). [] = trafiony negatywny
  // cache (martwa trasa) — też zwracamy bez ruszania LiteAPI.
  const cacheKey = flightRatesCacheKey(input);
  const cached = await getCachedFlightOffers(cacheKey);
  if (cached !== null) {
    return NextResponse.json({ offers: cached, count: cached.length, cached: true }, { status: 200 });
  }

  try {
    const res = await searchFlightRates(input);
    const offers = normalizeRatesResponse(res)
      .slice()
      .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
      .slice(0, FLIGHT_OFFERS_CAP);
    await setCachedFlightOffers(cacheKey, offers);
    return NextResponse.json({ offers, count: offers.length, cached: false }, { status: 200 });
  } catch (err) {
    const e = toFlightApiError(err, "search");
    console.warn(`[flights][rates] ${e.code} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode}`);
    return NextResponse.json(
      { error: e.code, message: e.message, debug: { liteApiStatus: e.liteApiStatus, liteApiCode: e.liteApiCode } },
      { status: e.httpStatus },
    );
  }
```

Uwaga: odpowiedź zmienia kształt `{data,count}` → `{offers,count,cached}`. Jedyny konsument to `flight-results.tsx` (Task 3) — aktualizowany w tym samym branchu.

- [ ] **Step 3: Sanity — typecheck route przez build (szybki) lub tsc**

Run: `node --import tsx -e "import('./src/app/api/flights/rates/route.ts').then(()=>console.log('import OK'))"`
Expected: `import OK` (brak błędów modułu/typów w czasie importu).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/flights/rates/route.ts
git commit -m "perf(loty): route normalizuje serwerowo + cap 150 + cache (payload 4,7MB->~0,45MB)"
```

---

### Task 3: Klient — konsumpcja slim + progresywny fan-out

**Files:**
- Modify: `src/app/loty/wyniki/_components/flight-results.tsx`

- [ ] **Step 1: Usuń nieużywany import `normalizeRatesResponse`**

W imporcie z `@/lib/flights/display` usuń `normalizeRatesResponse` (zostaje reszta):

```ts
import {
  fmtDuration,
  fmtMoneyPln,
  fmtTime,
  stopsLabel,
  type DisplayLeg,
  type DisplayOffer,
} from "@/lib/flights/display";
```

- [ ] **Step 2: Dodaj stan „wszystko rozstrzygnięte" obok istniejących useState**

Pod `const [drawerOpen, setDrawerOpen] = useState(false);` dodaj:

```ts
  const [allSettled, setAllSettled] = useState(false);
```

- [ ] **Step 3: Zamień efekt pobierania na progresywny**

Zamień cały `useEffect(() => { ... }, [...])` (blok „Pobranie ofert (raz)") na:

```ts
  // Pobranie ofert (raz). Fan-out po lotniskach (metro=1 kod) RÓWNOLEGLE, ale
  // wyniki POKAZUJEMY W MIARĘ NAPŁYWU (nie czekamy aż wszystkie odpowiedzą):
  // najszybsze lotnisko pojawia się pierwsze. Scalanie + dedup po offerId.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const seen = new Set<string>();
    const merged: DisplayOffer[] = [];
    let anyOk = false;
    let firstMessage: string | undefined;

    void Promise.all(
      origins.map(async (o) => {
        const legs: Leg[] = [{ origin: o, destination, date: depart, direction: "OUTBOUND" }];
        if (ret) legs.push({ origin: destination, destination: o, date: ret, direction: "INBOUND" });
        try {
          const res = await fetch("/api/flights/rates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ legs, adults, children: childrenCount, infants, cabinClass: "ECONOMY" }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (!firstMessage) firstMessage = json.message as string | undefined;
            return;
          }
          anyOk = true;
          const got = (json.offers ?? []) as DisplayOffer[];
          for (const off of got) {
            if (seen.has(off.offerId)) continue;
            seen.add(off.offerId);
            merged.push(off);
          }
          // Progresywny render: po każdym lotnisku odśwież widoczną listę.
          setOffers([...merged]);
        } catch {
          /* to lotnisko padło — inne mogą się udać */
        }
      }),
    ).finally(() => {
      setAllSettled(true);
      if (!anyOk) {
        setError(firstMessage || "Nie udało się pobrać ofert. Spróbuj ponownie.");
        setOffers([]);
      } else {
        // anyOk: upewnij się, że stan jest ustawiony nawet gdy 0 ofert (pusta trasa).
        setOffers([...merged]);
        track("flight_results_view", { origin: originsKey, destination, results_count: merged.length });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originsKey, destination, depart, ret, adults, childrenCount, infants]);
```

- [ ] **Step 4: Dodaj subtelny wskaźnik „szukam w pozostałych lotniskach"**

Tuż przed listą wyników (`{visible.length > 0 && (`), dodaj nad nią baner widoczny gdy są już jakieś oferty, ale nie wszystkie lotniska odpowiedziały (dotyczy tylko grup „wszystkie lotniska"):

```tsx
          {offers !== null && offers.length > 0 && !allSettled && origins.length > 1 && (
            <p className="mb-3 inline-flex items-center gap-2 text-xs text-neutral-500">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              Szukam w pozostałych lotniskach…
            </p>
          )}
```

- [ ] **Step 5: Sanity — import komponentu**

Run: `node --import tsx -e "import('./src/lib/flights/display.ts').then(()=>console.log('display OK'))"`
Expected: `display OK` (komponent kliencki zweryfikujemy buildem w Task 4).

- [ ] **Step 6: Commit**

```bash
git add "src/app/loty/wyniki/_components/flight-results.tsx"
git commit -m "perf(loty): klient czyta slim offers + progresywny fan-out wynikow"
```

---

### Task 4: Weryfikacja (testy + build + pomiar live)

**Files:** brak zmian kodu (gate).

- [ ] **Step 1: Pełny zestaw testów**

Run: `npm test`
Expected: wszystkie zielone (poprzednie 186 + 7 nowych z rates-cache = 193), `fail 0`.

- [ ] **Step 2: Build produkcyjny**

Run: `npm run build`
Expected: `Compiled successfully`, brak błędów typów; `/api/flights/rates` obecne jako `ƒ`.

- [ ] **Step 3: Pomiar live (sonda) — warm→hit + rozmiar slim**

Stwórz `tmp/flights-cache-verify.ts`:

```ts
import { flightRatesCacheKey, getCachedFlightOffers, setCachedFlightOffers, __resetFlightRatesRedisForTests } from "../src/lib/flights/rates-cache";
import { searchFlightRates } from "../src/lib/flights/client";
import { normalizeRatesResponse } from "../src/lib/flights/display";

function iso(d: number) { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); }

async function main() {
  __resetFlightRatesRedisForTests();
  const input = {
    adults: 1, children: 0, infants: 0, cabinClass: "ECONOMY" as const, currency: "PLN" as const, country: "PL" as const,
    legs: [
      { origin: "WAW", destination: "BCN", date: iso(30), direction: "OUTBOUND" as const },
      { origin: "BCN", destination: "WAW", date: iso(37), direction: "INBOUND" as const },
    ],
  };
  const key = flightRatesCacheKey(input);

  const t0 = performance.now();
  const res = await searchFlightRates(input);
  const offers = normalizeRatesResponse(res).sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity)).slice(0, 150);
  await setCachedFlightOffers(key, offers);
  console.log(`live+normalize+cache: ${Math.round(performance.now() - t0)} ms, ${offers.length} ofert, ${(Buffer.byteLength(JSON.stringify(offers))/1024).toFixed(0)} KB`);

  const t1 = performance.now();
  const hit = await getCachedFlightOffers(key);
  console.log(`cache HIT: ${Math.round(performance.now() - t1)} ms, ${hit?.length ?? "MISS"} ofert`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

Run: `pnpm tsx --env-file=.env.local tmp/flights-cache-verify.ts` (z `$env:LITEAPI_ENV="production"`)
Expected: live ~5–6 s + rozmiar ~0,2–0,45 MB; cache HIT <300 ms z tą samą liczbą ofert.

- [ ] **Step 4: Preview smoke (opcjonalnie, jeśli dostępny dev server)**

`preview_start` → nawiguj `/loty/wyniki?origin=WAW&destination=BCN&depart=<+30d>&adults=1` → sprawdź, że karty się renderują, druga nawigacja jest szybsza, brak błędów w konsoli.

- [ ] **Step 5: Commit porządkowy (jeśli sonda została)**

```bash
git add -A
git commit -m "test(loty): sonda weryfikacyjna cache lotow (tmp)"
```

(tmp/ jest untracked w repo — pomiń, jeśli nie chcesz commitować sond.)

---

## Self-Review

**1. Spec coverage:**
- Cache `rates-cache.ts` (best-effort, klucz, TTL pozytywny/negatywny, seam) → Task 1. ✅
- Normalizacja serwerowa + sort + cap 150 + cache + kształt `{offers,count,cached}` → Task 2. ✅
- Klient: konsumpcja slim + progresja → Task 3. ✅
- Testy (klucz determinizm, miss bez Redis, round-trip, empty, błąd) → Task 1 testy. ✅
- Build + pełne testy + live probe (warm→hit, rozmiar) → Task 4. ✅
- Negatywny cache martwych tras: `setCachedFlightOffers([])` z TTL_EMPTY + route zwraca `cached:[]` jako hit → Task 1 + Task 2. ✅

**2. Placeholder scan:** brak TBD/TODO; każdy krok ma realny kod/komendę. ✅

**3. Type consistency:** `flightRatesCacheKey`/`getCachedFlightOffers`/`setCachedFlightOffers` użyte identycznie w Task 1/2/4; `DisplayOffer` z `display.ts`; `FlightSearchInput` z `types.ts`; kształt odpowiedzi `{offers,count,cached}` spójny między Task 2 (produkcja) a Task 3 (konsumpcja). ✅
