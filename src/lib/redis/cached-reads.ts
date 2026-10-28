// Odczyty snapshotów dla STRON i czatu — przez cache danych Nexta.
//
// DLACZEGO TO ISTNIEJE. Strona główna ma `revalidate = 3600` (ISR), a mimo to
// na produkcji renderowała się przy KAŻDYM żądaniu: odpowiedź
// `Cache-Control: private, no-cache, no-store` i `X-Vercel-Cache: MISS`
// (zmierzone 2026-10-27). Przyczyna: SDK Upstash wysyła każde zapytanie
// z `fetch(…, { cache: "no-store" })`, a taki fetch podczas renderu statycznego
// ustawia `revalidate = 0` i przełącza całą trasę na render dynamiczny
// (next/dist/server/app-render/dynamic-rendering.js, markCurrentScopeAsDynamic).
// Każde wejście — także boty i monitory robiące HEAD — kosztowało więc cztery
// odczyty Redisa, a w czasie awarii ~1,1 s czekania na każdy z nich.
//
// `unstable_cache` tworzy granicę cache: `no-store` wewnątrz niej NIE oznacza
// strony jako dynamicznej (ten sam plik Nexta, gałąź `unstable-cache`), a wynik
// trafia do cache danych na `revalidate` sekund — wspólny dla strony głównej,
// /wyjazdy/* i czatu.
//
// AWARIE NIE SĄ CACHE'OWANE. Funkcja „strict" rzuca przy błędzie Redisa, więc
// `unstable_cache` niczego nie zapisuje, a wywołujący dostaje `null` (strona
// renderuje się bez cen — dokładnie jak dotąd przy braku danych). Brak klucza
// to co innego: `null` z „strict" jest poprawną odpowiedzią i może być
// zapamiętany na okno rewalidacji.

import { unstable_cache } from "next/cache";

import { readFeaturedHotelsStrict, type FeaturedHotelsSnapshot } from "@/lib/hotels/featured-hotels";
import { readFlightDealsStrict, type FlightDealsSnapshot } from "@/lib/flights/flight-deals";
import {
  readPriceSnapshotStrict,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";
import { readActiveSnapshotStrict } from "@/lib/snapshot/store";
import type { ConciergeSnapshot } from "@/lib/snapshot/types";
import { readTrustpilotSnapshotStrict, type TrustpilotEntry } from "@/lib/trust/trustpilot-snapshot";

import { warnRedisFallback } from "./client";

function isOutsideNextRuntime(err: unknown): boolean {
  // Skrypty i testy bez serwera Nexta: unstable_cache nie ma gdzie trzymać danych.
  return err instanceof Error && /incrementalCache missing/i.test(err.message);
}

function cachedRedisRead<T>(
  name: string,
  strict: () => Promise<T | null>,
  revalidateSeconds: number,
): () => Promise<T | null> {
  const cached = unstable_cache(strict, ["redis-read", name], {
    revalidate: revalidateSeconds,
    tags: [`redis:${name}`],
  });
  return async () => {
    try {
      return await cached();
    } catch (err) {
      if (isOutsideNextRuntime(err)) {
        try {
          return await strict();
        } catch (inner) {
          warnRedisFallback(name, inner);
          return null;
        }
      }
      warnRedisFallback(name, err);
      return null;
    }
  };
}

// Okna rewalidacji dobrane do tego, jak często pisze odpowiedni cron, i do
// progu świeżości, który i tak egzekwuje odczyt (`pickFresh*`):
//   • dstprice:v1   — cron co 30 min, świeżość 48 h → 10 min,
//   • fltdeal:v1    — cron co 30 min, świeżość 7 h  → 10 min,
//   • hotfeat:v1    — cron co 6 h,    świeżość 13 h → 30 min,
//   • trustpilot:v1 — odświeżane raz na dobę        → 6 h,
//   • csnap:v1      — publikacja co 30 min          → 5 min.

/** „Hotel od X zł/noc" + loty + pakiety (strona główna, /wyjazdy, czat). */
export const readPriceSnapshotCached = cachedRedisRead<DestinationPriceSnapshot>(
  "dstprice:v1",
  readPriceSnapshotStrict,
  600,
);

/** Pas „Polecane hotele" na stronie głównej. */
export const readFeaturedHotelsCached = cachedRedisRead<FeaturedHotelsSnapshot>(
  "hotfeat:v1",
  readFeaturedHotelsStrict,
  1800,
);

/** Pas „Tanie loty" na stronie głównej. */
export const readFlightDealsCached = cachedRedisRead<FlightDealsSnapshot>(
  "fltdeal:v1",
  readFlightDealsStrict,
  600,
);

/** Ocena Trustpilot w pasach zaufania. */
export const readTrustpilotSnapshotCached = cachedRedisRead<TrustpilotEntry>(
  "trustpilot:v1",
  readTrustpilotSnapshotStrict,
  6 * 3600,
);

/** Opublikowany snapshot konsjerża (odczyt raz na turę czatu). */
export const readActiveSnapshotCached = cachedRedisRead<ConciergeSnapshot>(
  "csnap:v1:active",
  readActiveSnapshotStrict,
  300,
);
