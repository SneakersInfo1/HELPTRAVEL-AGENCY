// Lista id hoteli kierunku do snapshotu konsjerża (`csnap:v1`).
//
// Do 2026-11-07 lista szła przez Data Cache fetcha (24 h). Przeterminowany
// wpis Next zwraca od ręki, a świeży pobiera W TLE bez sygnału wołającego
// i bez limitu czasu, i `waitUntil` trzyma funkcję do końca. To ten sam
// mechanizm, który dał timeout 300 s w warm-rates (#152).
//
// Teraz listę trzyma `unstable_cache` (te same 24 h), a w środku zapytanie
// zawsze idzie do dostawcy z NASZYMI opcjami: przy pudle na pierwszym planie,
// przy przeterminowanym wpisie w tle, i w obu przypadkach z limitem czasu
// i twardym końcem przebiegu. Wewnątrz `unstable_cache` Next traktuje każdy
// fetch jak `force-no-store` i przekazuje sygnał (next/dist/server/lib/
// patch-fetch.js, gałąź `unstable-cache`); odświeżenie w tle woła naszą
// funkcję (next/dist/server/web/spec-extension/unstable-cache.js).
//
// PUSTEJ LISTY NIE ZAPISUJEMY. `fetchHotelsForDestination` połyka błędy
// każdej strategii i zwraca `{ data: [] }`, więc timeout dostawcy wyglądałby
// jak „brak hoteli" i zostałby w cache'u na dobę. Pusta lista rzuca: wpis się
// nie zapisuje (przy odświeżeniu w tle zostaje poprzednia lista), a przebieg
// liczy kierunek jako brak hotelu, tak jak dotąd każdy błąd.

import { unstable_cache } from "next/cache";

import { fetchHotelsForDestination } from "@/lib/liteapi";

import { HOTEL_IDS_REVALIDATE_S, HOTELS_PER_DEST, METADATA_ATTEMPTS, METADATA_TIMEOUT_MS } from "./config";

export interface SnapshotHotelIdsInput {
  city: string;
  country: string;
  lat?: number;
  lng?: number;
}

export interface SnapshotHotelIdsOptions {
  /** Twardy koniec przebiegu (HARD_STOP_MS) — przerywa też odświeżanie w tle. */
  signal?: AbortSignal;
  /** Licznik realnych zapytań do dostawcy (z próbami). */
  onAttempt?: () => void;
  /** Tylko dla testów — produkcja zawsze METADATA_TIMEOUT_MS. */
  timeoutMs?: number;
}

export class EmptyHotelListError extends Error {
  constructor(city: string) {
    super(`brak listy hoteli dla '${city}' (pusta albo dostawca nie odpowiedział) — nie zapisuję`);
    this.name = "EmptyHotelListError";
  }
}

/** Lista prosto od dostawcy: bez Data Cache, z limitem czasu i sygnałem. */
export async function fetchSnapshotHotelIds(
  input: SnapshotHotelIdsInput,
  opts: SnapshotHotelIdsOptions = {},
): Promise<string[]> {
  const list = await fetchHotelsForDestination(
    { city: input.city, country: input.country, lat: input.lat, lng: input.lng, limit: HOTELS_PER_DEST },
    {
      skipDataCache: true,
      timeoutMs: opts.timeoutMs ?? METADATA_TIMEOUT_MS,
      retries: METADATA_ATTEMPTS,
      signal: opts.signal,
      onAttempt: opts.onAttempt,
    },
  );
  const ids = (list.data ?? []).map((h) => h.id).slice(0, HOTELS_PER_DEST);
  if (ids.length === 0) throw new EmptyHotelListError(input.city);
  return ids;
}

function isOutsideNextRuntime(err: unknown): boolean {
  // Testy i skrypty bez serwera Nexta: `unstable_cache` nie ma gdzie trzymać wpisu.
  return err instanceof Error && /incrementalCache missing/i.test(err.message);
}

/**
 * Czytnik list na JEDEN przebieg: sygnał i licznik należą do tego przebiegu.
 * Klucz wpisu to stałe części + argument (`JSON.stringify(input)`), więc
 * kolejne przebiegi trafiają w te same wpisy.
 */
export function createSnapshotHotelIdsReader(
  opts: SnapshotHotelIdsOptions = {},
): (input: SnapshotHotelIdsInput) => Promise<string[]> {
  const load = (input: SnapshotHotelIdsInput) => fetchSnapshotHotelIds(input, opts);
  const cached = unstable_cache(load, ["csnap-hotel-ids", "v1"], {
    revalidate: HOTEL_IDS_REVALIDATE_S,
    tags: ["liteapi", "liteapi-hotels-list"],
  });
  return async (input) => {
    try {
      return await cached(input);
    } catch (err) {
      if (isOutsideNextRuntime(err)) return load(input);
      throw err;
    }
  };
}
