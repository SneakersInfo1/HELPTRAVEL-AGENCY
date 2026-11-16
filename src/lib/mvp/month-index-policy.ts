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
// WARIANTY (17.11.2026): obok bazy jest przygotowany i przetestowany wariant
// „baza bez stron bez danych klimatycznych”. NIE jest aktywny. Włącza go jedna
// zmiana stałej ACTIVE_MONTH_INDEX_POLICY — wyłącznie po zgodzie właściciela
// (docs/seo/OWNER_ACTIONS.md, punkt 16). Test-strażnik pilnuje, żeby nikt nie
// włączył go mimochodem.
//
// Strony z `noindex` zostają dostępne (linki wewnętrzne, ISR) i mają `follow`.
// Sitemap bierze ten sam predykat, więc robots = sitemap = aktywny wariant.

import { getClimateNormal } from "./climate-normals";
import { getAllDestinationProfiles } from "./destinations";
import { CURRENT_INDEX_BASELINE } from "./month-index-baseline";
import { getMonthIndex, isPolishMonthSlug, polishMonthSlugs } from "./months";
import type { DestinationProfile } from "./types";

const BASELINE_KEYS: ReadonlySet<string> = new Set(
  Object.entries(CURRENT_INDEX_BASELINE).flatMap(([slug, months]) => months.map((month) => `${slug}/${month}`)),
);

/**
 * Warianty polityki indeksu stron miesięcy.
 *
 * - `baseline-1039` — zamrożona baza 1039 stron (stan produkcji).
 * - `baseline-without-climate-gap` — ta sama baza bez stron kierunków, dla których
 *   WMO nie ma normy klimatycznej (25 kierunków, 158 stron w bazie). Taka strona
 *   nie pokazuje żadnej informacji o miesiącu, więc nie odpowiada na zapytanie
 *   „pogoda w …”. Wariant tylko ODEJMUJE strony od bazy, nigdy nie dodaje.
 */
export type MonthIndexPolicyVariant = "baseline-1039" | "baseline-without-climate-gap";

export const MONTH_INDEX_POLICY_VARIANTS: readonly MonthIndexPolicyVariant[] = [
  "baseline-1039",
  "baseline-without-climate-gap",
];

/**
 * Aktywny wariant. Zmiana tej stałej przenosi strony między index i noindex
 * (oraz sitemapą) jednym deployem — tylko po zgodzie właściciela.
 */
export const ACTIVE_MONTH_INDEX_POLICY: MonthIndexPolicyVariant = "baseline-1039";

function isInBaseline(slug: string, monthIndex: number): boolean {
  const month = polishMonthSlugs[monthIndex];
  if (!month) return false;
  return BASELINE_KEYS.has(`${slug}/${month}`);
}

/** Czy strona miesiąca byłaby indeksowalna w danym wariancie. Bez I/O. */
export function isMonthIndexableUnder(
  variant: MonthIndexPolicyVariant,
  dest: Pick<DestinationProfile, "slug">,
  monthIndex: number,
): boolean {
  if (!isInBaseline(dest.slug, monthIndex)) return false;
  switch (variant) {
    case "baseline-1039":
      return true;
    case "baseline-without-climate-gap":
      return getClimateNormal(dest.slug) !== null;
  }
}

/**
 * Should `/kierunki/{dest.slug}/{month}` be indexable? `monthIndex` is 0-11.
 * Aktywny wariant polityki — bez I/O, bezpieczne w metadanych i sitemapie.
 */
export function isMonthIndexable(dest: Pick<DestinationProfile, "slug">, monthIndex: number): boolean {
  return isMonthIndexableUnder(ACTIVE_MONTH_INDEX_POLICY, dest, monthIndex);
}

/** Indeksowalne ścieżki stron miesięcy w danym wariancie, posortowane (tak jak liczy je sitemapa). */
export function monthIndexPathsUnder(variant: MonthIndexPolicyVariant): string[] {
  return getAllDestinationProfiles()
    .flatMap((dest) =>
      polishMonthSlugs.flatMap((month, monthIndex) =>
        isMonthIndexableUnder(variant, dest, monthIndex) ? [`/kierunki/${dest.slug}/${month}`] : [],
      ),
    )
    .sort();
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
