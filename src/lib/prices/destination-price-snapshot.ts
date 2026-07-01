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
