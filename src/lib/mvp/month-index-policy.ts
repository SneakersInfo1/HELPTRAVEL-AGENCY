// Indeksacja stron /kierunki/[slug]/[miesiac] — zamrożona baza (SEO Data Integrity, PR #1.5).
//
// HISTORIA: od „operacji odchudzanie" (czerwiec 2026) index/noindex liczył
// predykat z temperaturą: kuratorowane i komercyjne ≥ 10°C, plaża ≥ 22°C, mocny
// city break 16–32°C, grudzień dla city breaków. Audyt Faza 2.2 (14.09.2026)
// wykazał, że dla 212 z 235 kierunków ta temperatura to jedna tablica regionu:
// od szablonu zależało 1228 decyzji, szacunkowo 156–191 z nich było błędnych.
//
// TERAZ: nie przeliczamy indeksu na nowych zasadach — to zmieniłoby setki URL-i
// jednym deployem. Strona jest indeksowalna wtedy i tylko wtedy, gdy stoi
// w CURRENT_INDEX_BASELINE: dokładnym zbiorze 1039 stron z indeksem na produkcji
// cd2aaee (scripts/seo/month-index-baseline.ts, sprawdzone z sitemapą produkcji).
// Żadne dane profilu — temperatura, profil plażowy, city break — nie zmieniają
// decyzji.
//
// NASTĘPNY KROK: nowa polityka indeksu po danych klimatycznych per miasto i GSC,
// jako świadoma, przejrzana zmiana bazy — nie po cichu w kodzie.
//
// Strony z `noindex` zostają dostępne (linki wewnętrzne, ISR) i mają `follow`.
// Sitemap bierze ten sam predykat, więc robots = sitemap = baza.

import { getAllDestinationProfiles } from "./destinations";
import { CURRENT_INDEX_BASELINE } from "./month-index-baseline";
import { getMonthIndex, isPolishMonthSlug, polishMonthSlugs } from "./months";
import type { DestinationProfile } from "./types";

const BASELINE_KEYS: ReadonlySet<string> = new Set(
  Object.entries(CURRENT_INDEX_BASELINE).flatMap(([slug, months]) => months.map((month) => `${slug}/${month}`)),
);

/**
 * Should `/kierunki/{dest.slug}/{month}` be indexable? `monthIndex` is 0-11.
 * Przynależność do zamrożonej bazy — bez I/O, bezpieczne w metadanych i sitemapie.
 */
export function isMonthIndexable(dest: Pick<DestinationProfile, "slug">, monthIndex: number): boolean {
  const month = polishMonthSlugs[monthIndex];
  if (!month) return false;
  return BASELINE_KEYS.has(`${dest.slug}/${month}`);
}

/** Wszystkie indeksowalne ścieżki stron miesięcy, posortowane (weryfikacja sitemapy i crawl). */
export function currentIndexBaselinePaths(): string[] {
  return [...BASELINE_KEYS].map((key) => `/kierunki/${key}`).sort();
}

/** Slug-based convenience for callers that only have strings (e.g. sitemap dedup). */
export function isMonthPageIndexableBySlug(destinationSlug: string, monthSlug: string): boolean {
  if (!isPolishMonthSlug(monthSlug)) return false;
  const dest = getAllDestinationProfiles().find((d) => d.slug === destinationSlug);
  if (!dest) return false;
  return isMonthIndexable(dest, getMonthIndex(monthSlug));
}

/**
 * Diagnostics for tests/verification: how many month pages stay indexable.
 * Lets us confirm the "balanced ~top third" target without guessing.
 */
export function monthIndexStats(monthCount = 12): {
  total: number;
  indexable: number;
  noindexed: number;
  fraction: number;
} {
  const profiles = getAllDestinationProfiles();
  let indexable = 0;
  for (const dest of profiles) {
    for (let m = 0; m < monthCount; m += 1) {
      if (isMonthIndexable(dest, m)) indexable += 1;
    }
  }
  const total = profiles.length * monthCount;
  return {
    total,
    indexable,
    noindexed: total - indexable,
    fraction: total === 0 ? 0 : Math.round((indexable / total) * 1000) / 1000,
  };
}
