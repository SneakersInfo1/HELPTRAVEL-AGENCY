// Najtańsza cena hotelu za noc do rekordu snapshotu konsjerża (`csnap:v1`).
//
// Osobny moduł (zamiast wywołania w trasie), bo trasa importuje seed
// z `import "server-only"`, którego nie da się załadować pod node:test —
// a opcje tego zapytania są właśnie tym, co trzeba mieć pod testem.
// Kontekst i liczby: komentarz przy RATE_TIMEOUT_MS w ./config.ts.

import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import { minPerNightFromRates } from "@/lib/prices/destination-price-snapshot";

import { RATE_ATTEMPTS, RATE_TIMEOUT_MS } from "./config";

export interface SnapshotHotelRateOptions {
  /** Licznik realnych zapytań do dostawcy (z próbami). */
  onAttempt?: () => void;
  /** Twardy koniec przebiegu (HARD_STOP_MS) — przerywa także trwające zapytanie. */
  signal?: AbortSignal;
  /** Tylko dla testów — produkcja zawsze RATE_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Minimum ceny za noc (2 dorosłych, 1 pokój, PLN) dla hoteli kierunku w oknie.
 * `null` = żaden hotel nie ma oferty. Błąd dostawcy RZUCA — wołający liczy go
 * jako brak hotelu w rekordzie (allSettled), tak jak dotąd.
 */
export async function snapshotHotelPerNight(
  hotelIds: string[],
  window: { checkin: string; checkout: string },
  opts: SnapshotHotelRateOptions = {},
): Promise<number | null> {
  if (hotelIds.length === 0) return null;
  // `forceRefresh` pomija Redis, `skipDataCache` — Next Data Cache: inaczej
  // termin, do którego zadanie wraca po ~10 h, dostawałby cenę sprzed ~10 h.
  // Bez zapisu do cache wyników: tych terminów nikt nie wyszukuje
  // (zmierzone: ~2 500 martwych zapisów na przebieg).
  const res = await resolveSlimRates(
    hotelIds,
    {
      checkin: window.checkin,
      checkout: window.checkout,
      adults: 2,
      children: [],
      rooms: 1,
      currency: "PLN",
    },
    {
      forceRefresh: true,
      writeCache: false,
      call: {
        skipDataCache: true,
        timeoutMs: opts.timeoutMs ?? RATE_TIMEOUT_MS,
        retries: RATE_ATTEMPTS,
        onAttempt: opts.onAttempt,
        signal: opts.signal,
      },
    },
  );
  return minPerNightFromRates(res.rates, window.checkin, window.checkout);
}
