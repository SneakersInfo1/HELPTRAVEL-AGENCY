# Homepage: konwersja + zaufanie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Homepage konwertujący jak Booking (prawdziwe ceny „od zł/noc" na kafelkach, weryfikowalne sygnały zaufania) + karty `/wyjazdy/[typ]` z ceną i CTA lotów — bez wydłużania strony.

**Architecture:** Cron `/api/cron/warm-rates` (już grzeje ceny hoteli) dodatkowo zapisuje kompaktowy snapshot `dstprice:v1` w Upstash Redis (best-effort, degrade-to-miss). Homepage i strony nastrojów czytają snapshot serwerowo przy ISR i renderują cenę tylko gdy świeża (<48 h). UI: 8 kafelków z ceną, pas zaufania Trustpilot/Stripe, sekcja „Jak to działa", karty nastrojów z ceną + CTA lotów.

**Tech Stack:** Next.js 16 App Router (ISR), Upstash Redis, node:test + tsx, Tailwind v4, Impeccable (bramka jakości UI).

Spec: `docs/superpowers/specs/2026-07-01-homepage-konwersja-zaufanie-design.md`
Branch: `feat/homepage-konwersja-zaufanie`

**Mapa plików:**

| Plik | Rola |
|---|---|
| `PRODUCT.md` (nowy, root) | Kontekst produktu dla Impeccable (F0) |
| `src/lib/prices/destination-price-snapshot.ts` (nowy) | Snapshot cen: klucz, matematyka za-noc, staleness, read/merge Redis |
| `src/lib/prices/destination-price-snapshot.test.ts` (nowy) | Testy modułu |
| `src/lib/hotels/warm-config.ts` | + `HOME_TILE_DESTINATION_IDS` (8) i `WARM_EXTRA_DESTINATION_IDS` |
| `src/lib/hotels/warm-config.test.ts` | + test pokrycia kafelków przez warm-listę |
| `src/app/api/cron/warm-rates/route.ts` | Union top-10 + extras; zapis snapshotu po grzaniu |
| `src/app/page.tsx` | 8 slugów, odczyt snapshotu, cena do kafelków, nowa sekcja zamiast HomePageSections |
| `src/components/home/home-hybrid-hero.tsx` | Pas zaufania (Trustpilot/Stripe/PLN); przelot ceny do kafelka |
| `src/components/home/destination-tile.tsx` | Prop `fromPricePerNight` + linia ceny |
| `src/components/home/trust-how-it-works.tsx` (nowy) | Sekcja „Jak to działa + kto za tym stoi" |
| `src/components/home/home-page-sections.tsx` | USUNIĘTY (dublował chipy) |
| `src/lib/flights/airports.ts` | + `iataForCity(cityEn)` |
| `src/lib/flights/airports.test.ts` | + testy iataForCity |
| `src/components/publisher/mood-landing.tsx` | Snapshot + flightsHref na karty |
| `src/components/publisher/mood-destination-card.tsx` | Linia ceny + rozdzielone CTA hotele/loty |
| `src/app/wyjazdy/[typ]/page.tsx` | `revalidate` 86400 → 3600 |
| `package.json` | Rejestracja nowego pliku testowego |

---

### Task 1 (F0): Impeccable init — PRODUCT.md

**Files:**
- Create: `PRODUCT.md`
- Read: `.claude/skills/impeccable/reference/init.md`

- [ ] **Step 1: Przeczytaj instrukcję init**

Read `.claude/skills/impeccable/reference/init.md` W CAŁOŚCI. Jeśli definiuje inny format/pola PRODUCT.md niż szkic niżej — format z init.md wygrywa (szkic to treść merytoryczna do wlania).

- [ ] **Step 2: Napisz PRODUCT.md** (treść merytoryczna; dostosuj strukturę do init.md)

```markdown
# HelpTravel

## What it is
Polski serwis rezerwacji podróży: hotele + loty w jednym miejscu (dostawca:
LiteAPI; płatności: Stripe). Użytkownik wyszukuje, płaci w PLN (karta/BLIK/
Google Pay) i dostaje potwierdzenie na e-mail — bez rejestracji.

## Audience
Polski turysta wypoczynkowy (plaża, city break, słońce zimą). Szuka po polsku,
porównuje ceny, jest nieufny wobec nowych serwisów — każdy sygnał zaufania
musi być weryfikowalny (Trustpilot, Stripe, LiteAPI), zero zmyślonych liczb.

## Register
product — design SERVES the product (search-first, jak Booking). Wyjątek:
sekcje inspiracyjne (/wyjazdy) mają lekko cieplejszy, redakcyjny ton.

## Conversion goal
Użycie wyszukiwarki (hotel lub lot). Wszystko inne jest drugorzędne i ma
prowadzić do wyszukiwarki. Niezdecydowani: chipy nastrojów → /wyjazdy/[typ].

## Design language (istniejący — NIE wymyślać od nowa)
Tailwind v4. Paleta: emerald (tło/tekst marki), amber/orange (CTA), białe
karty na jasnym tle, rounded-2xl/3xl, cienie emerald-tinted. Font display
dla nagłówków. Ceny zawsze w PLN, format „od X zł/noc".

## Hard rules
- Homepage form (MiniPlannerForm/HomeSearchTabs) — dopracowany, NIE zmieniać
  logiki ani eventów GA4.
- Uczciwość cen: liczby wyłącznie z realnych wyszukań (snapshot z crona);
  brak danych = brak liczby (historia: fikcyjne „od X zł" usunięte 2026-06-11).
- `a { color: inherit }` w globals.css bije text-* na <a> — kolor etykiety
  przycisku-linku zawsze na wewnętrznym <span>.
```

- [ ] **Step 3: Zweryfikuj, że Impeccable widzi kontekst**

Run: `node .claude/skills/impeccable/scripts/context.mjs`
Expected: wypisuje treść PRODUCT.md (już NIE `NO_PRODUCT_MD`).

- [ ] **Step 4: Commit**

```bash
git add PRODUCT.md
git commit -m "docs: PRODUCT.md — kontekst produktu dla Impeccable (F0)"
```

---

### Task 2 (F1): Moduł snapshotu cen — testy najpierw

**Files:**
- Create: `src/lib/prices/destination-price-snapshot.test.ts`
- Create: `src/lib/prices/destination-price-snapshot.ts`
- Modify: `package.json` (script `test` — dopisać nowy plik)

- [ ] **Step 1: Napisz failing testy**

```ts
// src/lib/prices/destination-price-snapshot.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlimRate } from "../hotels/rate-cache";
import {
  __resetDestinationPriceRedisForTests,
  __setDestinationPriceRedisForTests,
  destinationPriceKey,
  isFreshPrice,
  mergePriceSnapshot,
  minPerNightFromRates,
  pickFreshPrice,
  pricePerNight,
  readPriceSnapshot,
  type DestinationPriceSnapshot,
} from "./destination-price-snapshot";

function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async <T>(k: string) => (store.has(k) ? (store.get(k) as T) : null),
    set: async (k: string, v: unknown) => {
      store.set(k, v);
      return "OK";
    },
  };
}

function slim(totalAmount: number): SlimRate {
  return { totalAmount, currency: "PLN", offerId: "o", rateId: "r" };
}

test("destinationPriceKey: foldowany, stabilny, diakrytyki i wielkość liter nie rozjeżdżają klucza", () => {
  assert.equal(destinationPriceKey("Malaga", "Spain"), destinationPriceKey("MALAGA", "spain"));
  assert.equal(destinationPriceKey("Málaga", "Spain"), destinationPriceKey("Malaga", "Spain"));
  assert.notEqual(destinationPriceKey("Palma", "Spain"), destinationPriceKey("Parma", "Italy"));
});

test("pricePerNight: total/noce zaokrąglone w dół; nonsensy → null", () => {
  assert.equal(pricePerNight(800, "2026-08-10", "2026-08-12"), 400); // 2 noce
  assert.equal(pricePerNight(999, "2026-08-10", "2026-08-12"), 499); // floor
  assert.equal(pricePerNight(500, "2026-08-10", "2026-08-11"), 500); // 1 noc
  assert.equal(pricePerNight(500, "2026-08-10", "2026-08-10"), null); // 0 nocy
  assert.equal(pricePerNight(500, "2026-08-12", "2026-08-10"), null); // ujemne
  assert.equal(pricePerNight(0, "2026-08-10", "2026-08-12"), null); // total 0
  assert.equal(pricePerNight(-5, "2026-08-10", "2026-08-12"), null);
});

test("isFreshPrice: świeży <48h tak, starszy nie, zepsuty wpis nie", () => {
  const now = Date.now();
  const entry = { hotelFromPlnPerNight: 300, checkin: "2026-08-10", checkout: "2026-08-12", computedAt: now - 1000 };
  assert.equal(isFreshPrice(entry, now), true);
  assert.equal(isFreshPrice({ ...entry, computedAt: now - 49 * 3600 * 1000 }, now), false);
  assert.equal(isFreshPrice({ ...entry, computedAt: Number.NaN }, now), false);
});

test("minPerNightFromRates: minimum po hotelach z ceną; null-e i puste ignorowane", () => {
  const rates = { h1: slim(900), h2: slim(600), h3: null };
  assert.equal(minPerNightFromRates(rates, "2026-08-10", "2026-08-13"), 200); // 600/3
  assert.equal(minPerNightFromRates({ h: null }, "2026-08-10", "2026-08-13"), null);
  assert.equal(minPerNightFromRates({}, "2026-08-10", "2026-08-13"), null);
});

test("merge + read: nowe wpisy dochodzą, istniejące nadpisywane, nieobecne PRZEŻYWAJĄ", async () => {
  const r = fakeRedis();
  __setDestinationPriceRedisForTests(r);
  const now = Date.now();
  const a: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: { hotelFromPlnPerNight: 300, checkin: "a", checkout: "b", computedAt: now },
  };
  await mergePriceSnapshot(a);
  const b: DestinationPriceSnapshot = {
    [destinationPriceKey("Rome", "Italy")]: { hotelFromPlnPerNight: 450, checkin: "a", checkout: "b", computedAt: now },
  };
  await mergePriceSnapshot(b);
  const snap = await readPriceSnapshot();
  assert.ok(snap);
  assert.equal(snap![destinationPriceKey("Malaga", "Spain")].hotelFromPlnPerNight, 300);
  assert.equal(snap![destinationPriceKey("Rome", "Italy")].hotelFromPlnPerNight, 450);
  __resetDestinationPriceRedisForTests();
});

test("pickFreshPrice: zwraca cenę tylko dla świeżego wpisu istniejącego kierunku", () => {
  const now = Date.now();
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: { hotelFromPlnPerNight: 300, checkin: "a", checkout: "b", computedAt: now },
    [destinationPriceKey("Rome", "Italy")]: { hotelFromPlnPerNight: 450, checkin: "a", checkout: "b", computedAt: now - 72 * 3600 * 1000 },
  };
  assert.equal(pickFreshPrice(snap, "Malaga", "Spain", now), 300);
  assert.equal(pickFreshPrice(snap, "Rome", "Italy", now), null); // stęchły
  assert.equal(pickFreshPrice(snap, "Atlantis", "Nowhere", now), null); // brak
});

test("read bez env/seama → null (degrade-to-miss, nigdy wyjątek)", async () => {
  __setDestinationPriceRedisForTests(null);
  assert.equal(await readPriceSnapshot(), null);
  await mergePriceSnapshot({}); // nie może rzucić
  __resetDestinationPriceRedisForTests();
});
```

- [ ] **Step 2: Uruchom — mają POLEC (brak modułu)**

Run: `pnpm tsx --test src/lib/prices/destination-price-snapshot.test.ts`
Expected: FAIL (Cannot find module './destination-price-snapshot')

- [ ] **Step 3: Zaimplementuj moduł**

```ts
// src/lib/prices/destination-price-snapshot.ts
// Snapshot cen kierunków „Hotel od X zł/noc" (Upstash Redis, JEDEN klucz).
//
// Pisany przez cron /api/cron/warm-rates (merge po każdym przebiegu grzania),
// czytany serwerowo przy ISR przez homepage i /wyjazdy/[typ]. Wzorzec
// best-effort jak hotels/rate-cache i flights/rates-cache: KAŻDY błąd / brak
// env = miss → strony renderują się bez cen. Cena może TYLKO pomóc.
//
// UCZCIWOŚĆ (historia 2026-06-11: fikcyjne „od X zł" z hasha zostały usunięte
// z DestinationTile): każda liczba tutaj pochodzi z realnego wyszukania
// LiteAPI (najtańsza taryfa z grzanych okien dat), a wpis starszy niż 48 h
// jest traktowany jak brak ceny.

import { Redis } from "@upstash/redis";

import { foldText } from "@/lib/flights/airports";
import type { SlimRate } from "@/lib/hotels/rate-cache";

export interface DestinationPriceEntry {
  /** Najtańsza cena hotelu za noc (PLN, pełne złote — floor). */
  hotelFromPlnPerNight: number;
  /** Okno dat, z którego pochodzi cena (transparentność/debug). */
  checkin: string;
  checkout: string;
  /** Epoch ms zapisu — staleness liczona od tego. */
  computedAt: number;
}

export type DestinationPriceSnapshot = Record<string, DestinationPriceEntry>;

const KEY = "dstprice:v1";
// TTL klucza — 7 dni (ochrona przed wiecznym śmieciem); realną świeżość
// wymusza PRICE_FRESH_MS przy odczycie.
const TTL_SECONDS = 7 * 24 * 3600;
export const PRICE_FRESH_MS = 48 * 3600 * 1000;

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
      console.warn("[dst-price] UPSTASH env brak — snapshot cen WYŁĄCZONY (strony bez linii cen).");
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }
  redis = new Redis({ url, token }) as unknown as RedisLike;
  return redis;
}

// Seam testowy (wzorzec flights/rates-cache).
export function __setDestinationPriceRedisForTests(client: RedisLike | null): void {
  injected = client;
}
export function __resetDestinationPriceRedisForTests(): void {
  injected = undefined;
  redis = undefined;
}

/** Klucz kierunku: foldowane „miasto|kraj" (EN) — wspólny dla crona, homepage i /wyjazdy. */
export function destinationPriceKey(cityEn: string, countryEn: string): string {
  return foldText(`${cityEn}|${countryEn}`);
}

function nightsBetween(checkin: string, checkout: string): number {
  const a = Date.parse(`${checkin}T00:00:00Z`);
  const b = Date.parse(`${checkout}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Cena za noc (pełne zł, floor). Nonsens (≤0 nocy, ≤0 total) → null. */
export function pricePerNight(totalPln: number, checkin: string, checkout: string): number | null {
  const nights = nightsBetween(checkin, checkout);
  if (nights <= 0 || !Number.isFinite(totalPln) || totalPln <= 0) return null;
  return Math.floor(totalPln / nights);
}

/** Świeżość wpisu: computedAt istnieje i nie starsze niż 48 h. */
export function isFreshPrice(entry: DestinationPriceEntry | undefined, now: number = Date.now()): boolean {
  if (!entry || !Number.isFinite(entry.computedAt)) return false;
  return now - entry.computedAt <= PRICE_FRESH_MS;
}

/** Minimum ceny za noc po hotelach z wyniku resolveSlimRates (null-e pomijane). */
export function minPerNightFromRates(
  rates: Record<string, SlimRate | null>,
  checkin: string,
  checkout: string,
): number | null {
  let min: number | null = null;
  for (const r of Object.values(rates)) {
    if (!r) continue;
    const pn = pricePerNight(r.totalAmount, checkin, checkout);
    if (pn !== null && (min === null || pn < min)) min = pn;
  }
  return min;
}

/** Odczyt snapshotu. null = brak env / błąd / brak klucza (miss). */
export async function readPriceSnapshot(): Promise<DestinationPriceSnapshot | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const v = await client.get<DestinationPriceSnapshot>(KEY);
    return v && typeof v === "object" ? v : null;
  } catch (err) {
    console.warn("[dst-price] read miss:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Merge (nie replace): częściowy przebieg crona nie kasuje pozostałych kierunków. */
export async function mergePriceSnapshot(entries: DestinationPriceSnapshot): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const existing = (await client.get<DestinationPriceSnapshot>(KEY)) ?? {};
    await client.set(KEY, { ...existing, ...entries }, { ex: TTL_SECONDS });
  } catch (err) {
    console.warn("[dst-price] merge skip:", err instanceof Error ? err.message : err);
  }
}

/** Wygodny odczyt dla stron: świeża cena kierunku albo null. */
export function pickFreshPrice(
  snapshot: DestinationPriceSnapshot | null,
  cityEn: string,
  countryEn: string,
  now: number = Date.now(),
): number | null {
  if (!snapshot) return null;
  const entry = snapshot[destinationPriceKey(cityEn, countryEn)];
  return isFreshPrice(entry, now) ? entry!.hotelFromPlnPerNight : null;
}
```

- [ ] **Step 4: Testy zielone**

Run: `pnpm tsx --test src/lib/prices/destination-price-snapshot.test.ts`
Expected: 7 pass, 0 fail.

- [ ] **Step 5: Zarejestruj plik testowy w package.json**

W `package.json`, w script `test`, po `src/lib/hotels/warm-config.test.ts` dopisz:
`src/lib/prices/destination-price-snapshot.test.ts`

Run: `pnpm test` → wszystkie zielone (214 + 7 nowych).

- [ ] **Step 6: Commit**

```bash
git add src/lib/prices/destination-price-snapshot.ts src/lib/prices/destination-price-snapshot.test.ts package.json
git commit -m "feat(ceny): snapshot cen kierunkow dstprice:v1 (klucz, za-noc, staleness 48h, merge) + testy"
```

---

### Task 3 (F1): Warm-lista pokrywa kafelki homepage + cron pisze snapshot

**Files:**
- Modify: `src/lib/hotels/warm-config.ts`
- Modify: `src/lib/hotels/warm-config.test.ts`
- Modify: `src/app/api/cron/warm-rates/route.ts`

- [ ] **Step 1: Failing test — warm-lista zawiera wszystkie kafelki**

Dopisz do `src/lib/hotels/warm-config.test.ts`:

```ts
import { HOME_TILE_DESTINATION_IDS, WARM_EXTRA_DESTINATION_IDS } from "./warm-config";

test("każdy kafelek homepage jest w extras crona (inaczej kafelek nigdy nie dostanie ceny)", () => {
  assert.equal(HOME_TILE_DESTINATION_IDS.length, 8);
  for (const id of HOME_TILE_DESTINATION_IDS) {
    assert.ok(WARM_EXTRA_DESTINATION_IDS.includes(id), `${id} nie jest grzany`);
  }
});
```

(Jeśli plik nie importuje jeszcze `assert`/`test`, ma je na górze — dopisz analogicznie do istniejących.)

Run: `pnpm tsx --test src/lib/hotels/warm-config.test.ts`
Expected: FAIL (brak eksportów).

- [ ] **Step 2: Dodaj eksporty w warm-config.ts** (pod `WARM_TIME_BUDGET_MS`)

```ts
// Kafelki „Popularne kierunki" na homepage (8; podzbiór zestawu właściciela
// z 2026-06-11, dobór leisure-first). ID = id z data/destinations.json ==
// slug profilu kierunku. KAŻDY kafelek MUSI być grzany (poniżej), inaczej
// nigdy nie dostanie prawdziwej ceny „od zł/noc" ze snapshotu dstprice:v1.
export const HOME_TILE_DESTINATION_IDS = [
  "malaga-spain",
  "barcelona-spain",
  "lisbon-portugal",
  "rome-italy",
  "valencia-spain",
  "athens-greece",
  "istanbul-turkey",
  "heraklion-greece",
] as const;

// Kierunki grzane DODATKOWO poza top-N popularności. Seed jest sortowany
// popularnością i top-10 to niemal sama Hiszpania — bez tej listy kafelki
// (Rzym idx 23, Ateny 48, Stambuł 64…) nie miałyby cen. Union liczony w cronie.
export const WARM_EXTRA_DESTINATION_IDS: readonly string[] = HOME_TILE_DESTINATION_IDS;
```

Run: `pnpm tsx --test src/lib/hotels/warm-config.test.ts` → PASS.

- [ ] **Step 3: Cron — union kierunków + zbieranie minimum + zapis snapshotu**

W `src/app/api/cron/warm-rates/route.ts`:

(a) importy — dodaj:

```ts
import { getDestinationById, getTopDestinations } from "@/lib/mvp/destinations-seed";
import {
  destinationPriceKey,
  mergePriceSnapshot,
  minPerNightFromRates,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";
import {
  computeWarmDateWindows,
  WARM_CONCURRENCY,
  WARM_DESTINATION_COUNT,
  WARM_EXTRA_DESTINATION_IDS,
  WARM_HOTELS_PER_DEST,
  WARM_TIME_BUDGET_MS,
} from "@/lib/hotels/warm-config";
```

(usuń stary pojedynczy import `getTopDestinations` z `destinations-seed`).

(b) budowa listy kierunków — zamień linię `const dests = getTopDestinations(WARM_DESTINATION_COUNT);` na:

```ts
  // Union: top-N popularności + jawne extras (kafelki homepage). Dedup po id.
  const byId = new Map(getTopDestinations(WARM_DESTINATION_COUNT).map((d) => [d.id, d] as const));
  for (const id of WARM_EXTRA_DESTINATION_IDS) {
    if (!byId.has(id)) {
      const d = getDestinationById(id);
      if (d) byId.set(d.id, d);
      else console.warn(`[cron/warm-rates] extra kierunek '${id}' nie istnieje w seedzie`);
    }
  }
  const dests = [...byId.values()];
```

(c) `destHotels` — dopisz klucz snapshotu (potrzebny w zadaniach). Zamień push na:

```ts
      if (ids.length) {
        destHotels.push({
          id: d.id,
          label: d.city.en,
          priceKey: destinationPriceKey(d.city.en, d.country.en),
          hotelIds: ids,
        });
      }
```

i rozszerz typ tablicy: `const destHotels: Array<{ id: string; label: string; priceKey: string; hotelIds: string[] }> = [];`

(d) `tasks` — dołóż `priceKey` do elementu: w `tasks.push({...})` dodaj pole `priceKey: dh.priceKey`, a typ tablicy rozszerz o `priceKey: string`.

(e) zbieranie minimum w workerze — w `runPool(...)`, po `warmedHotels += ...` dodaj:

```ts
      // Snapshot cen: minimum za-noc z tego zadania (kierunek × okno) vs
      // dotychczasowe minimum kierunku z innych okien.
      const pn = minPerNightFromRates(res.rates, t.ctx.checkin, t.ctx.checkout);
      if (pn !== null) {
        const prev = bestPrice.get(t.priceKey);
        if (!prev || pn < prev.hotelFromPlnPerNight) {
          bestPrice.set(t.priceKey, {
            hotelFromPlnPerNight: pn,
            checkin: t.ctx.checkin,
            checkout: t.ctx.checkout,
            computedAt: Date.now(),
          });
        }
      }
```

a PRZED `runPool` zadeklaruj: `const bestPrice = new Map<string, DestinationPriceSnapshot[string]>();`

(f) zapis po grzaniu — po `await runPool(...)`, przed `const durationMs`:

```ts
  // Snapshot „Hotel od X zł/noc" dla homepage i /wyjazdy. Błąd zapisu NIE
  // psuje crona (merge jest best-effort i sam łyka wyjątki, ale pas bezpieczeństwa).
  let snapshotEntries = 0;
  if (bestPrice.size > 0) {
    try {
      await mergePriceSnapshot(Object.fromEntries(bestPrice));
      snapshotEntries = bestPrice.size;
    } catch (err) {
      console.warn("[cron/warm-rates] snapshot cen nieudany:", err instanceof Error ? err.message : err);
    }
  }
```

(g) do `summary` dodaj pole `snapshotEntries`.

- [ ] **Step 4: Pełna suita + build**

Run: `pnpm test` → zielone. Run: `pnpm build` → "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add src/lib/hotels/warm-config.ts src/lib/hotels/warm-config.test.ts src/app/api/cron/warm-rates/route.ts
git commit -m "feat(ceny): cron grzeje union(top-10, kafelki homepage) i pisze snapshot dstprice:v1"
```

---

### Task 4 (F2): Kafelki homepage — 8 sztuk z prawdziwą ceną

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/home/home-hybrid-hero.tsx`
- Modify: `src/components/home/destination-tile.tsx`

- [ ] **Step 1: DestinationTile — prop + linia ceny**

W `destination-tile.tsx`: do `DestinationTileProps` dodaj:

```ts
  /** Prawdziwa cena „Hotel od X zł/noc" ze snapshotu dstprice:v1 (cron →
   *  realne wyszukanie LiteAPI). Brak = brak linii. NIE podawać tu żadnych
   *  liczb liczonych lokalnie — patrz historia 2026-06-11 (fikcyjne ceny). */
  fromPricePerNight?: number;
```

do destrukturyzacji parametrów dodaj `fromPricePerNight,` a w bloku copy (po linii `flightHoursLabel`) dodaj render:

```tsx
        {typeof fromPricePerNight === "number" && (
          <p className="mt-1 text-sm font-bold text-amber-300">
            Hotel od {fromPricePerNight} zł
            <span className="ml-1 text-[10px] font-medium text-white/75">/ noc</span>
          </p>
        )}
```

(umieść bezpośrednio POD `<p className="mt-1.5 text-[11px] text-white/80">{flightHoursLabel}</p>`).

- [ ] **Step 2: HomeHybridHero — przelot ceny**

W `home-hybrid-hero.tsx`: do `interface FeaturedTile` dodaj `fromPricePerNight?: number;`, a w mapowaniu kafelków przekaż prop:

```tsx
              <DestinationTile
                key={tile.destination.slug}
                destination={tile.destination}
                heroImage={tile.heroImage}
                fromPricePerNight={tile.fromPricePerNight}
                size="lg"
                badge="Polecane"
              />
```

- [ ] **Step 3: page.tsx — 8 slugów + odczyt snapshotu**

(a) zamień tablicę `heroDestinationSlugs` na (single source: warm-config — DRY):

```ts
import { HOME_TILE_DESTINATION_IDS } from "@/lib/hotels/warm-config";
```

i usuń starą tablicę 12 slugów; w `HomePageView` używaj `HOME_TILE_DESTINATION_IDS` zamiast `heroDestinationSlugs` (elementy to te same stringi-slugi profili). Komentarz przy imporcie:

```ts
// 8 kafelków = HOME_TILE_DESTINATION_IDS z warm-config (JEDNO źródło prawdy:
// dokładnie te kierunki grzeje cron, więc każdy kafelek ma szansę na cenę).
```

(b) odczyt snapshotu + cena per kafelek — w `HomePageView`, po `resolvedHeroDestinations`:

```ts
  // Prawdziwe „Hotel od X zł/noc" ze snapshotu (cron). Odczyt RAZ przy ISR;
  // brak snapshotu/wpisu → kafelek bez linii ceny (uczciwość > kompletność).
  const priceSnapshot = await readPriceSnapshot();

  const featuredTiles = resolvedHeroDestinations.slice(0, 12).map((item) => ({
    destination: item.destination,
    heroImage: item.media.heroImage,
    fromPricePerNight:
      pickFreshPrice(priceSnapshot, item.destination.city, item.destination.country) ?? undefined,
  }));
```

z importem:

```ts
import { pickFreshPrice, readPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
```

- [ ] **Step 4: Build + weryfikacja lokalna**

Run: `pnpm build` → Compiled successfully.
Run (dev, przez preview-MCP lub `Invoke-WebRequest http://localhost:3000/`): strona główna renderuje 8 kafelków (grep w HTML: `Polecane` występuje 8×). Bez zasianego Redis linia ceny NIE występuje (grep `zł / noc` → 0 trafień) — to poprawne zachowanie degrade-to-miss.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/home/home-hybrid-hero.tsx src/components/home/destination-tile.tsx
git commit -m "feat(home): 8 kafelkow z prawdziwa cena 'Hotel od X zl/noc' ze snapshotu (12->8)"
```

---

### Task 5 (F2): Pas zaufania w hero — Trustpilot / Stripe / PLN

**Files:**
- Modify: `src/components/home/home-hybrid-hero.tsx` (blok `<ul>` „Sygnały zaufania", linie ~66–75)

- [ ] **Step 1: Podmień pas zaufania**

Zamień CAŁY blok `<ul className="mt-4 flex flex-wrap ...">…</ul>` na:

```tsx
            {/* Sygnały zaufania — WYŁĄCZNIE weryfikowalne fakty (świeży projekt,
                zero ogólników typu „sprawdzeni partnerzy"): prawdziwy profil
                Trustpilot (ten sam co na checkoucie), realny procesor płatności,
                realna waluta rozliczeń. */}
            <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] font-medium text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)] sm:mt-5 sm:text-xs">
              <li>
                <a
                  href="https://pl.trustpilot.com/review/helptravel.pl"
                  target="_blank"
                  rel="noopener nofollow"
                  className="inline-flex items-center gap-1.5 underline-offset-2 transition hover:underline"
                >
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-300">
                    <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.95 2.6.94-5.5-4-3.9 5.53-.8z" />
                  </svg>
                  {/* span: globalne a{color:inherit} bije text-*, kolor na span */}
                  <span className="text-white/90">Opinie na Trustpilot</span>
                </a>
              </li>
              {["Płatności obsługuje Stripe", "Ceny finalne w PLN"].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-300">
                    <path d="M8.05 13.6 4.4 9.95l1.4-1.4 2.25 2.25 6.15-6.15 1.4 1.4z" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
```

- [ ] **Step 2: Build + commit**

Run: `pnpm build` → OK.

```bash
git add src/components/home/home-hybrid-hero.tsx
git commit -m "feat(home): pas zaufania z konkretami — Trustpilot (link), Stripe, ceny finalne w PLN"
```

---

### Task 6 (F2): Sekcja „Jak to działa + kto za tym stoi" zamiast HomePageSections

**Files:**
- Create: `src/components/home/trust-how-it-works.tsx`
- Modify: `src/app/page.tsx`
- Delete: `src/components/home/home-page-sections.tsx`

- [ ] **Step 1: Nowy komponent**

```tsx
// src/components/home/trust-how-it-works.tsx
import Link from "next/link";

// Sekcja zaufania pod kafelkami (server component, zero fetch). Zastępuje
// dawną sekcję „Zacznij od pomysłu na wyjazd" (6 kart), która DUBLOWAŁA chipy
// nastrojów z hero — homepage jest przez to netto krótszy. Treść = wyłącznie
// weryfikowalne fakty (świeży projekt: zero zmyślonych liczb — patrz
// PRODUCT.md „Hard rules").

const STEPS = [
  {
    n: "1",
    title: "Wyszukujesz",
    desc: "Hotele i loty w jednym miejscu. Ceny finalne w PLN — bez ukrytych opłat doliczanych na końcu.",
  },
  {
    n: "2",
    title: "Płacisz bezpiecznie",
    desc: "Płatność obsługuje Stripe — karta, BLIK lub Google Pay. Dane karty nie przechodzą przez nasze serwery.",
  },
  {
    n: "3",
    title: "Masz potwierdzenie",
    desc: "Rezerwacja potwierdzana od razu, szczegóły dostajesz na e-mail. Bez zakładania konta.",
  },
] as const;

export function TrustHowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works"
      className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 xl:px-8"
    >
      <div className="grid gap-6 rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        {/* Kolumna A — 3 kroki */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Jak to działa
          </p>
          <h2 id="how-it-works" className="mt-2 font-display text-2xl leading-tight text-emerald-950 sm:text-3xl">
            Rezerwujesz w trzech krokach
          </h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-emerald-50/60 p-4">
                <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-3 text-sm font-bold text-emerald-950">{s.title}</h3>
                <p className="mt-1 text-xs leading-6 text-emerald-900/75">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Kolumna B — kto za tym stoi (fakty weryfikowalne) */}
        <div className="flex flex-col rounded-2xl border border-emerald-900/10 bg-emerald-950 p-5 text-white sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
            Kto za tym stoi
          </p>
          <p className="mt-3 text-sm leading-7 text-white/85">
            Rezerwacje realizuje <strong className="font-semibold text-white">LiteAPI</strong> — globalna
            platforma rezerwacyjna, z której korzystają serwisy podróżnicze na całym świecie.
            Płatności przetwarza <strong className="font-semibold text-white">Stripe</strong>.
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <a
              href="https://pl.trustpilot.com/review/helptravel.pl"
              target="_blank"
              rel="noopener nofollow"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/20"
            >
              {/* span: globalne a{color:inherit} bije text-* na <a> */}
              <span className="text-white">★ Opinie na Trustpilot</span>
            </a>
            <Link
              href="/o-nas"
              className="inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/10"
            >
              <span className="text-white/90">Poznaj nas →</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Podmień w page.tsx i usuń stary plik**

W `src/app/page.tsx`: import `HomePageSections` → `import { TrustHowItWorks } from "@/components/home/trust-how-it-works";`, a w JSX `<HomePageSections />` → `<TrustHowItWorks />`.

```bash
git rm src/components/home/home-page-sections.tsx
```

- [ ] **Step 3: Build + weryfikacja**

Run: `pnpm build` → OK (brak wiszących importów). W HTML homepage: jest „Rezerwujesz w trzech krokach", NIE ma „Zacznij od pomysłu na wyjazd".

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/home/trust-how-it-works.tsx
git commit -m "feat(home): sekcja 'Jak to dziala + kto za tym stoi' zamiast dublujacej sekcji kolekcji"
```

---

### Task 7 (F3): `/wyjazdy/[typ]` — cena + CTA lotów na kartach

**Files:**
- Modify: `src/lib/flights/airports.ts` (+ `iataForCity`)
- Modify: `src/lib/flights/airports.test.ts`
- Modify: `src/components/publisher/mood-destination-card.tsx`
- Modify: `src/components/publisher/mood-landing.tsx`
- Modify: `src/app/wyjazdy/[typ]/page.tsx` (revalidate)

- [ ] **Step 1: Failing testy iataForCity**

Dopisz do `src/lib/flights/airports.test.ts` (import rozszerz o `iataForCity`):

```ts
test("iataForCity: EN nazwy miast z picks nastrojów trafiają w IATA", () => {
  assert.equal(iataForCity("Barcelona"), "BCN");
  assert.equal(iataForCity("Lisbon"), "LIS"); // alias EN
  assert.equal(iataForCity("Malaga"), "AGP"); // fold diakrytyków (Málaga)
  assert.equal(iataForCity("Antalya"), "AYT");
  assert.equal(iataForCity("Middle of Nowhere"), null);
  assert.equal(iataForCity(""), null);
});
```

Run: `pnpm tsx --test src/lib/flights/airports.test.ts` → FAIL (brak eksportu).

- [ ] **Step 2: Helper w airports.ts** (pod `airportLabel`)

```ts
/** IATA głównego lotniska miasta po nazwie (PL/EN/aliasy, fold). Dopasowanie
 *  TYLKO exact (nie substring — „Pary" nie może trafić w Paryż). Miasto z
 *  wieloma lotniskami → pierwsze z datasetu (główne lotnisko jest pierwsze).
 *  Używane przez karty /wyjazdy do CTA „Sprawdź loty". Brak → null (bez CTA). */
export function iataForCity(city: string): string | null {
  const q = foldText(city);
  if (!q) return null;
  for (const a of AIRPORTS) {
    if (foldText(a.city) === q) return a.code;
  }
  for (const a of AIRPORTS) {
    if (a.aliases.some((al) => foldText(al) === q)) return a.code;
  }
  return null;
}
```

Run: `pnpm tsx --test src/lib/flights/airports.test.ts` → PASS.

- [ ] **Step 3: Karta — cena + rozdzielone CTA**

W `mood-destination-card.tsx`: rozszerz propsy:

```ts
export function MoodDestinationCard({
  pick,
  media,
  hotelsHref,
  guideHref,
  fromPricePerNight,
  flightsHref,
}: {
  pick: MoodPick;
  media: DestinationMedia;
  hotelsHref: string;
  guideHref?: string;
  /** Prawdziwa cena ze snapshotu dstprice:v1 (tylko grzane kierunki). */
  fromPricePerNight?: number;
  /** CTA lotów — tylko gdy miasto ma IATA w słowniku lotnisk. */
  flightsHref?: string;
}) {
```

Nad linią „Najlepszy czas" dodaj cenę:

```tsx
        {typeof fromPricePerNight === "number" && (
          <p className="mt-3 text-sm font-bold text-emerald-700">
            Hotel od {fromPricePerNight} zł
            <span className="ml-1 text-[11px] font-medium text-emerald-900/55">/ noc</span>
          </p>
        )}
```

Blok CTA podmień na (etykieta hoteli bez „i loty" — loty mają własny przycisk):

```tsx
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          <Link
            href={hotelsHref}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold transition hover:bg-emerald-800"
          >
            {/* span keeps the label white despite the global a{color:inherit} */}
            <span className="text-white">Zobacz hotele →</span>
          </Link>
          {flightsHref && (
            <Link
              href={flightsHref}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-900/10 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-emerald-50"
            >
              <span className="text-emerald-950">Sprawdź loty</span>
            </Link>
          )}
          {guideHref && (
            <Link
              href={guideHref}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-900/10 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
            >
              Przewodnik
            </Link>
          )}
        </div>
```

- [ ] **Step 4: MoodLanding — snapshot + flightsHref**

W `mood-landing.tsx`:

(a) importy:

```ts
import { iataForCity } from "@/lib/flights/airports";
import { pickFreshPrice, readPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
```

(b) w `MoodLanding`, po wyliczeniu `checkin/checkout`, przed `cards`:

```ts
  // Prawdziwe ceny ze snapshotu (podzbiór picks — tylko grzane kierunki;
  // reszta kart bez linii ceny). Odczyt RAZ na render ISR.
  const priceSnapshot = await readPriceSnapshot();
```

(c) w mapowaniu `cards` dołóż pola:

```ts
    mood.picks.map(async (pick) => {
      const iata = iataForCity(pick.searchCity);
      return {
        pick,
        media: await resolveDestinationMedia(profileForPick(pick)),
        hotelsHref: hotelsHrefFor(pick, checkin, checkout),
        guideHref: pick.slug ? `/kierunki/${pick.slug}` : undefined,
        fromPricePerNight: pickFreshPrice(priceSnapshot, pick.searchCity, pick.country) ?? undefined,
        flightsHref: iata
          ? `/loty/wyniki?origin=WAW&destination=${iata}&depart=${checkin}&return=${checkout}&adults=2&destLabel=${encodeURIComponent(pick.name)}`
          : undefined,
      };
    }),
```

(d) w JSX karty przekaż nowe propsy:

```tsx
            <MoodDestinationCard
              key={item.pick.name}
              pick={item.pick}
              media={item.media}
              hotelsHref={item.hotelsHref}
              guideHref={item.guideHref}
              fromPricePerNight={item.fromPricePerNight}
              flightsHref={item.flightsHref}
            />
```

- [ ] **Step 5: Świeższe ISR stron nastrojów**

W `src/app/wyjazdy/[typ]/page.tsx`: `export const revalidate = 86400;` → `export const revalidate = 3600;` z komentarzem:

```ts
// 1 h (było 24 h): karty pokazują ceny ze snapshotu crona (30 min) — doba
// trzymałaby nieświeże ceny na widoku mimo świeżych danych w Redis.
export const revalidate = 3600;
```

- [ ] **Step 6: Testy + build + weryfikacja**

Run: `pnpm test` → zielone. `pnpm build` → OK.
Weryfikacja HTML `/wyjazdy/plaza`: karty mają „Sprawdź loty" (dla miast z IATA, np. Barcelona/Malaga), href zawiera `origin=WAW&destination=`; bez zasianego Redis brak linii „zł / noc" (poprawny miss).

- [ ] **Step 7: Commit**

```bash
git add src/lib/flights/airports.ts src/lib/flights/airports.test.ts src/components/publisher/mood-destination-card.tsx src/components/publisher/mood-landing.tsx src/app/wyjazdy/[typ]/page.tsx
git commit -m "feat(wyjazdy): karty z prawdziwa cena/noc + CTA 'Sprawdz loty' (iataForCity) + ISR 1h"
```

---

### Task 8 (F1-weryfikacja): Snapshot end-to-end na żywych danych

**Files:** brak zmian kodu (weryfikacja + ewentualne poprawki)

- [ ] **Step 1: Odpal crona lokalnie na prod LiteAPI** (jak przy wdrażaniu crona w PR #113)

```powershell
# dev server z .env.local (ma UPSTASH + LITEAPI prod)
# w drugim oknie:
Invoke-WebRequest -Uri "http://localhost:3000/api/cron/warm-rates" -Headers @{ Authorization = "Bearer $env:CRON_SECRET" } -TimeoutSec 300
```

Expected: JSON z `ok:true`, `destinations: ~15` (union 10 + 8 z dedupem), `snapshotEntries > 0`, `durationMs` < 250000. Jeśli `durationMs` zbliża się do budżetu → wróć do specu (fallback: mniej okien dla extras) i zgłoś właścicielowi.

- [ ] **Step 2: Sprawdź render cen**

Po przebiegu crona odśwież homepage (dev) → kafelki grzanych kierunków mają „Hotel od X zł / noc" z sensownymi wartościami (spot-check: Barcelona 200–900 zł/noc, nie 3 zł ani 50 000 zł). `/wyjazdy/plaza` → karty grzanych miast z ceną.

- [ ] **Step 3: Commit poprawek (jeśli były)** — inaczej pomiń.

---

### Task 9 (F4): Impeccable detect + polish + finalna bramka + PR

**Files:** wynikowe poprawki z detect/audit (nieznane z góry — commitowane osobno)

- [ ] **Step 1: Impeccable detect na zmienionych plikach**

```bash
npx impeccable detect src/components/home src/components/publisher/mood-destination-card.tsx src/components/publisher/mood-landing.tsx
```

Każde finding przeczytaj; napraw zasadne (kontrast, typografia, spacing wg reguł skilla); fałszywe pozytywy zignoruj świadomie (odnotuj w opisie commita).

- [ ] **Step 2: Audit wg skilla** — przeczytaj `.claude/skills/impeccable/reference/audit.md` i wykonaj audyt homepage + `/wyjazdy/plaza` zgodnie z instrukcją (register: product; kontekst: PRODUCT.md). Wdroż zasadne poprawki, commit:

```bash
git add -A -- src/
git commit -m "polish(home): poprawki z impeccable detect/audit"
```

- [ ] **Step 3: Finalna bramka**

Run: `pnpm test` → 100% pass. Run: `pnpm build` → Compiled successfully.
Checklist DOM (dev/preview): 8 kafelków; pas zaufania z linkiem Trustpilot; sekcja „Rezerwujesz w trzech krokach"; BRAK starej sekcji kolekcji; `/wyjazdy/plaza` z cenami (po cronie) i CTA lotów; formularz wyszukiwarki działa (hotel search → nawigacja).

- [ ] **Step 4: Push + PR (BEZ merge — decyzja właściciela)**

```bash
git push -u origin feat/homepage-konwersja-zaufanie
gh pr create --title "feat(home): konwersja + zaufanie — prawdziwe ceny, Trustpilot/Stripe, krotszy homepage, karty /wyjazdy" --body-file <plik z opisem>
```

Opis PR: link do specu i planu, lista zmian per faza, instrukcja weryfikacji na preview (ceny pojawią się po pierwszym przebiegu prod-crona LUB ręcznym odpaleniu z CRON_SECRET), wyraźne „czeka na Twoje »merge«".
