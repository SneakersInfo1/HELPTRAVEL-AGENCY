// Best-effort cache ofert lotów (Upstash Redis). Wzorzec jak hotelowy
// src/lib/hotels/rate-cache.ts: KAŻDY błąd / brak env → traktowane jak miss.
// Cache MOŻE tylko pomóc, NIGDY nie wywala wyszukiwania.
//
// Przechowujemy CHUDE DisplayOffer[] (znormalizowane serwerowo, przycięte w
// route do ≤500) — od v2 GZIPOWANE (base64), bo 500 ofert ≈ 1,6 MB JSON
// przekraczałoby limit wartości Upstash; po gzipie ≈ 150-200 KB. TTL krótki,
// bo offerId i tak re-weryfikujemy przy wyborze (verify na /loty/dodatki).

import { gunzipSync, gzipSync } from "node:zlib";

import { Redis } from "@upstash/redis";

import type { DisplayOffer } from "./display";
import type { FlightSearchInput } from "./types";

// v2 = wartości gzip+base64 (cap 500). Bump wersji zamiast czytać oba
// formaty: stare wpisy v1 mają TTL ≤10 min, po wdrożeniu same znikną.
const KEY_VERSION = "v2";
// TTL ofert podbite 180 → 600 s (2026-07-11, „maksymalnie przyśpiesz wyniki"):
// zimny call LiteAPI to ~6 s (zmierzone), a oferty realnie żyją >10 min. Dłuższe
// okno = więcej trafień dla drugiego/trzeciego użytkownika tej samej trasy.
// Ryzyko wygaśnięcia offerId pokrywa recovery (?fresh=1 → OFFER_UNAVAILABLE
// obsłużone w /loty/dodatki), więc trade-off jest bezpieczny.
const TTL_OFFERS_SECONDS = 600; // 10 min — oferty (on-demand)
// Cron prewarmingu pisze z DŁUŻSZYM TTL — wpis musi przeżyć cykl crona (30 min),
// żeby grzana trasa była CIEPŁA także tuż przed kolejnym runem (i gdy jeden run
// padnie). 40 min = 30 min cyklu + margines.
const TTL_WARM_SECONDS = 2400; // 40 min — wpisy z crona
const TTL_EMPTY_SECONDS = 600; // 10 min — negatywny cache martwych tras

/** Rodzaj wpisu do cache — steruje TTL. `on-demand` (użytkownik) vs `warm` (cron). */
export type FlightCacheKind = "on-demand" | "warm";

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

/** gzip+base64 — wartości w Redis jako string (patrz nagłówek pliku). */
function packOffers(offers: DisplayOffer[]): string {
  return gzipSync(Buffer.from(JSON.stringify(offers), "utf8")).toString("base64");
}

function unpackOffers(value: unknown): DisplayOffer[] | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const json = gunzipSync(Buffer.from(value, "base64")).toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as DisplayOffer[]) : null;
  } catch {
    return null;
  }
}

/** Odczyt. null = miss (brak env, błąd, brak wpisu). [] = trafiony negatywny cache. */
export async function getCachedFlightOffers(key: string): Promise<DisplayOffer[] | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const v = await client.get<string>(key);
    return unpackOffers(v);
  } catch (err) {
    console.warn("[flights/rates-cache] read miss:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Zapis (best-effort). Pusta lista → krótszy TTL (negatywny cache martwych tras).
 *  `kind="warm"` (cron) → dłuższy TTL, żeby grzana trasa przeżyła cykl crona. */
export async function setCachedFlightOffers(
  key: string,
  offers: DisplayOffer[],
  kind: FlightCacheKind = "on-demand",
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const ex =
      offers.length === 0
        ? TTL_EMPTY_SECONDS
        : kind === "warm"
          ? TTL_WARM_SECONDS
          : TTL_OFFERS_SECONDS;
    await client.set(key, packOffers(offers), { ex });
  } catch (err) {
    console.warn("[flights/rates-cache] write skip:", err instanceof Error ? err.message : err);
  }
}
