// Server-side slim-rate cache (Upstash Redis).
//
// Why this exists: LiteAPI /hotels/rates runs ~1-2s per hotel and returns
// ~0.5MB/hotel, so pricing is the dominant latency on the results list.
// Next's Data Cache can't help (rate payloads exceed its 2MB cap). This
// caches ONLY the slim cheapest-rate-per-hotel we actually display, keyed
// by (hotel, dates, occupancy), so the first visitor for a given
// (hotel,date) pays the LiteAPI cost once and everyone after — including
// the same user re-sorting/filtering/paginating — gets it in <50ms.
//
// Hard rule: this layer must NEVER make a request fail. Missing env or any
// Redis error degrades to "cache miss" and the caller falls back to a
// live LiteAPI call exactly as before.

import { Redis } from "@upstash/redis";

export interface SlimRate {
  totalAmount: number;
  currency: string;
  roomName?: string;
  boardName?: string;
  refundableTag?: string;
  cancellationDeadline?: string;
  freeCancellationDeadline?: string;
  offerId: string;
  rateId: string;
  // Podatki — DWA pola zamiast pełnego rozbicia. Wożenie całej tablicy
  // `taxesAndFees` przez Redis dla ~2000 hoteli byłoby marnotrawstwem, a karta
  // wyniku potrzebuje tylko odpowiedzi „czy coś dopłacę i ile".
  //
  // `undefined` znaczy NIE WIEMY (dostawca nie podał rozbicia) — i to jest
  // istotne: karta ma wtedy MILCZEĆ o podatkach, zamiast twierdzić, że są
  // w cenie. Bezwarunkowe „wł. podatków i opłat" było nieprawdą dla ~52%
  // taryf (209/400 pozycji ma `included: false`).
  /** true = wszystko w cenie · false = coś dopłacisz na miejscu · undefined = brak danych */
  taxesIncluded?: boolean;
  /** Suma dopłat spoza ceny, w jednostkach głównych. Tylko gdy dało się policzyć. */
  taxExtraAmount?: number;
}

export interface RateCacheContext {
  checkin: string;
  checkout: string;
  adults: number;
  children: number[];
  rooms: number;
  currency: string;
}

// Bump KEY_VERSION whenever the cached shape changes (instant global
// invalidation without touching Redis).
// v3 (2026-08-06): SlimRate dostał `taxesIncluded` / `taxExtraAmount`. Wpisy v2
// nie mają tych pól, a `undefined` znaczy „nie wiemy" — bez podbicia wersji
// karty przez godzinę pokazywałyby „brak danych o podatkach" dla hoteli, dla
// których dane są. Podbicie unieważnia globalnie, bez ruszania Redisa.
const KEY_VERSION = "v3";
// 60 min — cena DO WYŚWIETLENIA (re-weryfikowana przy prebooku). Podbite 30→60
// min, bo cron prewarmingu (/api/cron/warm-rates) odświeża co 30 min: dłuższy
// TTL daje margines (wpis przeżywa 2 cykle crona), więc popularne kierunki są
// stale ciepłe nawet gdy jeden run crona padnie. Stawki nie zmieniają się na
// tyle szybko, by 60 min było problemem; prebook i tak pobiera aktualną cenę.
const TTL_PRICED_SECONDS = 3600;
const TTL_UNAVAILABLE_SECONDS = 600; // 10 min — availability can return sooner

type CachedValue = SlimRate | { unavailable: true };

let redis: Redis | null | undefined;
let warnedMissingEnv = false;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingEnv) {
      console.warn(
        "[rate-cache] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — slim-rate cache DISABLED (falling back to live LiteAPI every time).",
      );
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

function keyFor(hotelId: string, ctx: RateCacheContext): string {
  const occ = `${ctx.adults}-${[...ctx.children].sort((a, b) => a - b).join(".")}-${ctx.rooms}`;
  return `htr:${KEY_VERSION}:${ctx.checkin}:${ctx.checkout}:${occ}:${ctx.currency}:${hotelId}`;
}

export type CacheLookup =
  | { state: "hit"; rate: SlimRate }
  | { state: "unavailable" }
  | { state: "miss" };

/**
 * Look up cached slim rates for a batch of hotelIds. Returns a Map keyed
 * by hotelId. On any failure every entry is "miss" so the caller fetches
 * live — the cache can only ever help, never break a request.
 */
export async function getCachedRates(
  hotelIds: string[],
  ctx: RateCacheContext,
): Promise<Map<string, CacheLookup>> {
  const result = new Map<string, CacheLookup>();
  for (const id of hotelIds) result.set(id, { state: "miss" });
  if (hotelIds.length === 0) return result;

  const client = getRedis();
  if (!client) return result;

  try {
    const keys = hotelIds.map((id) => keyFor(id, ctx));
    const values = await client.mget<CachedValue[]>(...keys);
    hotelIds.forEach((id, i) => {
      const v = values[i];
      if (v == null) return; // miss (already set)
      if ("unavailable" in v) {
        result.set(id, { state: "unavailable" });
      } else {
        result.set(id, { state: "hit", rate: v });
      }
    });
  } catch (err) {
    console.warn("[rate-cache] read failed, falling back to live:", err instanceof Error ? err.message : err);
  }
  return result;
}

/**
 * Persist freshly fetched results. `rate === null` means "no availability"
 * and is cached (briefly) so we don't re-hammer LiteAPI for known-empty
 * hotels. Failures are swallowed — caching is best-effort.
 */
export async function setCachedRates(
  entries: Array<{ hotelId: string; rate: SlimRate | null }>,
  ctx: RateCacheContext,
): Promise<void> {
  if (entries.length === 0) return;
  const client = getRedis();
  if (!client) return;
  try {
    const pipeline = client.pipeline();
    for (const { hotelId, rate } of entries) {
      const key = keyFor(hotelId, ctx);
      if (rate) {
        pipeline.set(key, rate satisfies CachedValue, { ex: TTL_PRICED_SECONDS });
      } else {
        pipeline.set(key, { unavailable: true } satisfies CachedValue, { ex: TTL_UNAVAILABLE_SECONDS });
      }
    }
    await pipeline.exec();
  } catch (err) {
    console.warn("[rate-cache] write failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}
