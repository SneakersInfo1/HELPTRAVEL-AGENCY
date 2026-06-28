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
