// Wspólny rdzeń „wyszukaj loty → znormalizuj → posortuj po cenie → przytnij".
// Używany PRZEZ DWA tory (jak resolveSlimRates przy hotelach):
//   1) /api/flights/rates — wyszukiwanie na żądanie (cache miss),
//   2) /api/cron/warm-flights — prewarming cache popularnych tras.
//
// Dzięki jednemu helperowi cron zapisuje DOKŁADNIE ten sam kształt ofert co
// route (i pod tym samym kluczem `flightRatesCacheKey`), więc grzana trasa =
// natychmiastowy cache-hit dla realnego użytkownika. Rozjazd = grzanie do kosza.

import { searchFlightRates } from "./client";
import { normalizeRatesResponse, type DisplayOffer } from "./display";
import type { FlightSearchInput } from "./types";

// Cap ofert. Sort po cenie PRZED capem → najtańsze zawsze zostają; klient
// re-sortuje wg wyboru i renderuje po 20 („Pokaż więcej"). 500 pokrywa w
// praktyce komplet realnych tras po dedupe; wartość w cache jest gzipowana
// (rates-cache v2), więc 500 ofert ≈ 180 KB.
export const FLIGHT_OFFERS_CAP = 500;

/** Wyszukanie + normalizacja + sort po cenie rosnąco + cap. Bez cache (caller
 *  decyduje, czy i z jakim TTL zapisać). Sort po cenie gwarantuje, że po capie
 *  ZAWSZE zostają najtańsze oferty — kluczowe dla „jak najtańsze loty". */
export async function searchFlightOffers(input: FlightSearchInput): Promise<DisplayOffer[]> {
  const res = await searchFlightRates(input);
  return normalizeRatesResponse(res)
    .slice()
    .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
    .slice(0, FLIGHT_OFFERS_CAP);
}
