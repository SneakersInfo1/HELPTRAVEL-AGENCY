// Tiery kierunków i lotnisk wylotu — kogo grzejemy często, kogo rzadko (§18, §22).
//
// ŹRÓDŁO SYGNAŁU — i dlaczego akurat takie. Master prompt kazał sprawdzić, czy
// repo ma dane o realnym popycie (analityka, popularne wyszukania, rezerwacje).
// Ma, ale nieużywalne: `/api/events` wyrzuca wszystko (brak DATABASE_URL),
// Vercel Analytics jest wyłączone, a logi runtime są zdominowane przez boty.
// Zostaje GA4 tylko przez ręczny eksport CSV — czyli nic, na czym mógłby stanąć
// deterministyczny kod.
//
// Kuszące `popularity` z seedu NIE jest popytem polskim i nie wolno go użyć
// jako głównego sygnału: 640 z 796 kierunków ma wartość 50–59 (czyli brak
// rozróżnienia), a cała czołówka to Hiszpania — bo ta liczba opisuje raczej
// wielkość/rozpoznawalność miasta niż to, dokąd lata Polak na wakacje.
//
// Dlatego tier A stoi na LISTACH KURATOROWANYCH przez właściciela, które już
// istnieją w repo i były świadomie dobierane pod polski ruch leisure:
// kafelki homepage, sekcja pakietów, picki motywów oraz trasy lotów wybrane
// do prewarmingu. Tier B dobieramy z `popularity`, ale Z LIMITEM NA KRAJ,
// żeby nie dostać trzydziestu hiszpańskich miast pod rząd.
//
// To jest JAWNA HEURYSTYKA, nie pomiar. Gdy pomiar ruchu zacznie działać,
// ta funkcja jest jedynym miejscem, które trzeba wymienić.

import { iataForCity } from "@/lib/flights/airports";
import {
  HOME_TILE_DESTINATION_IDS,
  PACKAGE_DESTINATION_IDS,
  FEATURED_DESTINATION_POOL,
  WARM_FLIGHT_DEST_IATAS,
} from "@/lib/hotels/warm-config";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

export type DestinationTier = "A" | "B" | "C";

/** Minimalny kształt rekordu seedu potrzebny do tierowania. */
export interface TierSeedRecord {
  id: string;
  city: { en: string; pl: string };
  country: { en: string; pl: string; code?: string | null };
  airports?: string[];
  popularity?: number;
  lat?: number;
  lng?: number;
}

export interface TieredDestination {
  id: string;
  cityEn: string;
  cityPl: string;
  countryEn: string;
  countryPl: string;
  /** Lotnisko docelowe — z seedu, z fallbackiem do słownika lotnisk. */
  iata: string | null;
  tier: DestinationTier;
  popularity: number;
  /** Kod kraju i współrzędne — potrzebne cronowi do pobrania metadanych hoteli. */
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Wagi do POKRYCIA WAŻONEGO (§46). Snapshot ma być użyteczny produktowo,
 * a nie po prostu duży: brak Barcelony boli dużo bardziej niż brak Trapani.
 */
export const TIER_WEIGHT: Record<DestinationTier, number> = { A: 6, B: 2, C: 1 };

/**
 * Lotniska wylotu — tier A grzany zawsze, tier B rotacyjnie (§22).
 * WAW dominuje polski ruch leisure, a grupa „Warszawa — wszystkie lotniska"
 * i tak robi fan-out [WAW, WMI, RDO], więc grzane WAW trafia też w leg
 * takiego użytkownika. KRK to drugi realny hub wylotowy.
 */
export const ORIGIN_TIER_A = ["WAW"] as const;
export const ORIGIN_TIER_B = ["KRK", "KTW", "GDN", "WRO"] as const;

/** Ile kierunków z jednego kraju wolno wpuścić do tieru B (anty-Hiszpania). */
const TIER_B_PER_COUNTRY_CAP = 4;
/** Górny limit tieru B — cron musi go realnie obrócić w dobę. */
const TIER_B_MAX = 130;
/** Poniżej tej popularności nie ma sensu szukać kandydatów do tieru B. */
const TIER_B_MIN_POPULARITY = 60;

/** Kierunki wskazane ręcznie przez właściciela w którejkolwiek sekcji produktu. */
function curatedIds(seed: readonly TierSeedRecord[]): Set<string> {
  const ids = new Set<string>([
    ...HOME_TILE_DESTINATION_IDS,
    ...PACKAGE_DESTINATION_IDS,
    ...FEATURED_DESTINATION_POOL,
  ]);
  // Picki motywów są nazwami miast, nie id — rozwiązujemy je przez seed
  // (ten sam wzorzec co resolveThemeCities: pick „Palma de Mallorca" vs seed
  // „Palma", więc dopasowanie po obu nazwach i po kraju).
  for (const mood of TRAVEL_MOODS) {
    for (const pick of mood.picks) {
      const city = pick.searchCity.trim().toLowerCase();
      const country = pick.country.trim().toLowerCase();
      const hit = seed.find(
        (d) =>
          (d.city.en.toLowerCase() === city || d.city.pl.toLowerCase() === city) &&
          d.country.en.toLowerCase() === country,
      );
      if (hit) ids.add(hit.id);
    }
  }
  return ids;
}

function iataOf(d: TierSeedRecord): string | null {
  const fromSeed = d.airports?.[0];
  if (typeof fromSeed === "string" && /^[A-Z]{3}$/.test(fromSeed)) return fromSeed;
  return iataForCity(d.city.en);
}

/**
 * Przydział tierów dla CAŁEGO seedu. Deterministyczny: ta sama lista wejściowa
 * (w dowolnej kolejności) daje ten sam podział, bo sortujemy jawnie po
 * (popularność malejąco, id rosnąco).
 */
export function buildDestinationTiers(seed: readonly TierSeedRecord[]): TieredDestination[] {
  const curated = curatedIds(seed);
  const warmFlightIatas = new Set<string>(WARM_FLIGHT_DEST_IATAS);

  // DEDUP PO ID. Seed ma 10 par rekordow o tym samym `id` i roznym zapisie
  // nazwy — warianty diakrytyczne wygenerowane przy budowie pliku
  // (np. „Malaga"/„Málaga" oba jako `malaga-spain`, „Krakow"/„Kraków" jako
  // `krakow-poland`). Kanoniczny jest ten o WYZSZEJ popularnosci: to on nosi
  // realna wartosc (Malaga 100 vs Málaga 50) i to jego uzywa reszta produktu.
  // Rozstrzygniecie remisow po nazwie miasta trzyma wynik deterministycznym
  // niezaleznie od kolejnosci wejscia.
  const byId = new Map<string, TierSeedRecord>();
  for (const d of seed) {
    const prev = byId.get(d.id);
    if (
      !prev ||
      (d.popularity ?? 0) > (prev.popularity ?? 0) ||
      ((d.popularity ?? 0) === (prev.popularity ?? 0) && d.city.en < prev.city.en)
    ) {
      byId.set(d.id, d);
    }
  }
  const enriched = [...byId.values()].map((d) => ({
    record: d,
    iata: iataOf(d),
    popularity: d.popularity ?? 0,
  }));

  const tierOf = new Map<string, DestinationTier>();

  // ── TIER A: kuratorowane przez właściciela + trasy wybrane do prewarmingu.
  for (const e of enriched) {
    const isCurated = curated.has(e.record.id);
    const isWarmRoute = e.iata !== null && warmFlightIatas.has(e.iata);
    if ((isCurated || isWarmRoute) && e.iata !== null) tierOf.set(e.record.id, "A");
  }

  // ── TIER B: reszta popularnych, ale z limitem na kraj. Bez limitu ta lista
  // byłaby w praktyce spisem hiszpańskich miast (patrz nagłówek pliku).
  const perCountry = new Map<string, number>();
  const candidates = enriched
    .filter((e) => !tierOf.has(e.record.id) && e.iata !== null && e.popularity >= TIER_B_MIN_POPULARITY)
    .sort((a, b) =>
      b.popularity !== a.popularity ? b.popularity - a.popularity : a.record.id.localeCompare(b.record.id),
    );
  let tierBCount = 0;
  for (const e of candidates) {
    if (tierBCount >= TIER_B_MAX) break;
    const country = e.record.country.en;
    const used = perCountry.get(country) ?? 0;
    if (used >= TIER_B_PER_COUNTRY_CAP) continue;
    perCountry.set(country, used + 1);
    tierOf.set(e.record.id, "B");
    tierBCount += 1;
  }

  return enriched
    .map((e) => ({
      id: e.record.id,
      cityEn: e.record.city.en,
      cityPl: e.record.city.pl,
      countryEn: e.record.country.en,
      countryPl: e.record.country.pl,
      iata: e.iata,
      tier: tierOf.get(e.record.id) ?? ("C" as DestinationTier),
      popularity: e.popularity,
      countryCode: e.record.country.code ?? null,
      lat: typeof e.record.lat === "number" ? e.record.lat : null,
      lng: typeof e.record.lng === "number" ? e.record.lng : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
