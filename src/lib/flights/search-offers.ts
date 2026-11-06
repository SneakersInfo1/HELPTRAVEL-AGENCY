// Wspólny rdzeń „wyszukaj loty → znormalizuj → posortuj po cenie → przytnij".
// Używany przez wszystkie tory wyszukiwania lotów:
//   1) /api/flights/rates — wyszukiwanie na żądanie (cache miss),
//   2) czat (konsjerż) — najtańszy lot do oferty,
//   3) crony prewarmingu — tylko przy świadomie włączonym tle (search-policy.ts).
//
// Dzięki jednemu helperowi każdy tor zapisuje DOKŁADNIE ten sam kształt ofert
// (i pod tym samym kluczem `flightRatesCacheKey`).
//
// DEDUPLIKACJA I STAMPEDE (od 2026-11-03). Każde wyszukiwanie u dostawcy idzie
// przez bramkę slotów (provider-slot.ts): najwyżej jedno naraz na wszystkich
// instancjach. Po zajęciu slotu kod zawsze najpierw jeszcze raz czyta cache —
// jeśli w tym czasie inna instancja wyszukała to samo, dostaje jej wynik bez
// zapytania do dostawcy. Także bez widocznego czekania: opóźniony SET wygląda
// jak slot zajęty od ręki. Pudło to kilkadziesiąt bajtów, a trafienie oszczędza
// zapytanie. Żeby to działało, zapis do cache dzieje się WEWNĄTRZ slotu
// (`opts.cache`), zanim następny w kolejce go przejmie.

import { searchFlightRates, withFlightProviderSlot, assertFlightSearchAllowed, type FlightSearchOptions } from "./client";
import { normalizeRatesResponse, type DisplayOffer } from "./display";
import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  setCachedFlightOffers,
  type FlightCacheKind,
} from "./rates-cache";
import { singleFlight } from "./search-governor";
import type { FlightSearchInput } from "./types";

// Cap ofert. Sort po cenie PRZED capem → najtańsze zawsze zostają; klient
// re-sortuje wg wyboru i renderuje po 20 („Pokaż więcej"). 500 pokrywa w
// praktyce komplet realnych tras po dedupe; wartość w cache jest gzipowana
// (rates-cache v2), więc 500 ofert ≈ 180 KB.
export const FLIGHT_OFFERS_CAP = 500;

export interface FlightOffersCacheOptions {
  /** TTL zapisu (`on-demand` — użytkownik/czat, `warm` — cron). Pusta lista = negatywny cache. */
  kind?: FlightCacheKind;
  /** `?fresh=1` (recovery po wygaśnięciu oferty): bez odczytu cache, także po czekaniu na slot. */
  skipRead?: boolean;
}

export interface SearchFlightOffersOptions extends FlightSearchOptions {
  /** Zapis wyniku do cache wewnątrz slotu bramki (patrz nagłówek pliku). */
  cache?: FlightOffersCacheOptions;
}

/** Wyszukanie + normalizacja + sort po cenie rosnąco + cap. Z `opts.cache`
 *  wynik trafia do cache, zanim slot dostanie następny w kolejce; bez niego
 *  wołający sam decyduje, czy i z jakim TTL zapisać. Sort po cenie gwarantuje,
 *  że po capie ZAWSZE zostają najtańsze oferty — kluczowe dla „jak najtańsze loty".
 *
 *  `opts` przepuszcza limit czasu i liczbę prób do klienta: konsjerż ma twardy
 *  budżet tury (50 s na WSZYSTKO), więc nie może użyć domyślnych wartości
 *  lejka lotów. `opts.source` jest obowiązkowe (`search-policy.ts`). */
export async function searchFlightOffers(
  input: FlightSearchInput,
  opts: SearchFlightOffersOptions,
): Promise<DisplayOffer[]> {
  // Tło wyłączone / pauza po odmowie dostawcy → od razu, bez kolejki do slotu.
  await assertFlightSearchAllowed(opts.source);
  const cacheKey = flightRatesCacheKey(input);
  const { cache, ...searchOpts } = opts;
  // Identyczne zapytania w locie (ten sam rodzaj źródła, ta sama instancja) —
  // jedno wywołanie. `fresh` osobno: nie może dostać wyniku z cache.
  const flightKey = `${opts.source}:${cacheKey}${cache?.skipRead ? ":fresh" : ""}`;
  return singleFlight(flightKey, () =>
    withFlightProviderSlot(searchOpts, async (slot) => {
      if (cache && !cache.skipRead) {
        const hit = await getCachedFlightOffers(cacheKey);
        if (hit !== null) return hit;
      }
      const res = await searchFlightRates(input, { ...searchOpts, slot });
      const offers = normalizeRatesResponse(res)
        .slice()
        .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
        .slice(0, FLIGHT_OFFERS_CAP);
      if (cache) await setCachedFlightOffers(cacheKey, offers, cache.kind ?? "on-demand");
      return offers;
    }),
  );
}
