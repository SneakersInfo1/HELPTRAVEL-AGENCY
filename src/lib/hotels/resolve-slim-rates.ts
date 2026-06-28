// Wspólny rdzeń „pobierz najtańszą cenę na hotel + zapisz do cache" — używany
// PRZEZ DWA tory:
//   1) /api/hotels/rates/batch — progresywne ładowanie cen na liście wyników,
//   2) /api/cron/warm-rates — pre-warming (Vercel Cron) popularnych kierunków.
//
// Krytyczne: cron MUSI grzać DOKŁADNIE ten sam klucz cache, który czyta lista.
// Trzymając tę logikę w jednym miejscu, gwarantujemy identyczny klucz (keyFor
// w rate-cache.ts) i identyczny kształt SlimRate. Rozjazd = grzanie do kosza.

import { fromMinor } from "@/lib/money";
import { getRates } from "@/lib/liteapi";
import { pickCheapestRate, rateCancellationDeadline, rateCurrency, rateTotalMinor } from "@/lib/hotels/normalize";
import { getCachedRates, setCachedRates, type RateCacheContext, type SlimRate } from "@/lib/hotels/rate-cache";

export interface ResolveSlimRatesResult {
  rates: Record<string, SlimRate | null>;
  cacheHits: number;
  misses: number;
}

// Pojedyncze wywołanie LiteAPI obsługuje do 50 hotelId (cap zgodny z batch
// route i BATCH_SIZE w price-batcher). Dłuższe listy trzeba pociąć po stronie
// wołającego (cron) — tu zakładamy ≤50.
export async function resolveSlimRates(
  hotelIds: string[],
  ctx: RateCacheContext,
  opts: { guestNationality?: string; forceRefresh?: boolean } = {},
): Promise<ResolveSlimRatesResult> {
  const out: Record<string, SlimRate | null> = {};
  const missIds: string[] = [];

  // 1) Cokolwiek cache już ma — bez ruszania LiteAPI. Wyjątek: cron prewarmingu
  // woła z `forceRefresh` → pomija odczyt i ZAWSZE pobiera świeże stawki (resetuje
  // TTL), żeby popularne kierunki były stale ciepłe i aktualne dla realnych userów.
  if (opts.forceRefresh) {
    missIds.push(...hotelIds);
  } else {
    const cached = await getCachedRates(hotelIds, ctx);
    for (const hotelId of hotelIds) {
      const look = cached.get(hotelId) ?? { state: "miss" as const };
      if (look.state === "hit") out[hotelId] = look.rate;
      else if (look.state === "unavailable") out[hotelId] = null;
      else missIds.push(hotelId);
    }
  }

  const cacheHits = hotelIds.length - missIds.length;
  if (missIds.length === 0) return { rates: out, cacheHits, misses: 0 };

  // 2) Tylko cache-misy kosztują żywy call. `maxRatesPerHotel: 1` — interesuje
  // nas WYŁĄCZNIE najtańsza taryfa na hotel (zmierzone: payload 25 MB → 0,15 MB,
  // ~45% szybciej, ta sama najtańsza cena; szczegóły w resolve-slim-rates note).
  const rates = await getRates({
    hotelIds: missIds,
    checkin: ctx.checkin,
    checkout: ctx.checkout,
    currency: ctx.currency,
    guestNationality: opts.guestNationality ?? "PL",
    occupancies: Array.from({ length: ctx.rooms }, () => ({ adults: ctx.adults, children: ctx.children })),
    maxRatesPerHotel: 1,
  });

  const byHotel = new Map(rates.data.map((r) => [r.hotelId, r] as const));
  const fresh: Array<{ hotelId: string; rate: SlimRate | null }> = [];
  for (const hotelId of missIds) {
    const hr = byHotel.get(hotelId);
    const cheapest = hr ? pickCheapestRate(hr.roomTypes ?? []) : null;
    let slim: SlimRate | null = null;
    if (cheapest) {
      const minor = rateTotalMinor(cheapest.rate);
      const currency = rateCurrency(cheapest.rate);
      if (minor !== null && currency) {
        slim = {
          totalAmount: fromMinor(minor),
          currency,
          boardName: cheapest.rate.boardName,
          refundableTag: cheapest.rate.refundableTag,
          cancellationDeadline: rateCancellationDeadline(cheapest.rate) ?? undefined,
          offerId: cheapest.offerId,
          rateId: cheapest.rate.rateId,
        };
      }
    }
    out[hotelId] = slim;
    fresh.push({ hotelId, rate: slim });
  }

  // 3) Zapis do cache dla następnego odwiedzającego (best-effort).
  await setCachedRates(fresh, ctx);
  return { rates: out, cacheHits, misses: missIds.length };
}
