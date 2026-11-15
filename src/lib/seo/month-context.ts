// Kontekst miesiąca na tle roku, Polski i innych kierunków — wyłącznie z norm WMO.
//
// Sama temperatura nie odpowiada na pytanie „czy warto lecieć w styczniu”.
// Odpowiedź wymaga porównania: z resztą roku w tym miejscu, z tym, co czytelnik
// ma w tym czasie w Polsce, i z kierunkami, gdzie w tym samym miesiącu jest cieplej.
// Każda liczba tutaj jest różnicą albo pozycją policzoną z norm, więc ma to samo
// źródło co normy i nie dokłada żadnego założenia.

import normalsJson from "@/lib/mvp/climate-normals.generated.json";

interface NormalRecord {
  slug: string;
  latitude?: number | null;
  maxTempC: number[];
  minTempC: number[];
  rainDays: Array<number | null>;
  rainfallMm: Array<number | null>;
}

const NORMALS = (normalsJson as unknown as { normals: NormalRecord[] }).normals;
const BY_SLUG = new Map(NORMALS.map((normal) => [normal.slug, normal]));

/** Punkt odniesienia dla czytelnika z Polski. */
export const HOME_REFERENCE_SLUG = "warsaw-poland";

const round1 = (value: number) => Math.round(value * 10) / 10;

export interface YearPosition {
  /** 1 = najcieplejszy miesiąc roku w tym miejscu (wg średniego maksimum). */
  warmthRank: number;
  /** 1 = najwięcej dni z opadem; null, gdy źródło nie podaje kompletu. */
  rainRank: number | null;
  /** Miesiące o najmniejszej liczbie dni z opadem (indeksy 0–11); puste bez kompletu danych. */
  driestMonths: number[];
}

export function yearPosition(slug: string, monthIndex: number): YearPosition | null {
  const normal = BY_SLUG.get(slug);
  if (!normal) return null;
  const warmthRank = normal.maxTempC.filter((value) => value > normal.maxTempC[monthIndex]).length + 1;
  const rainDays = normal.rainDays;
  if (rainDays.some((value) => value === null)) return { warmthRank, rainRank: null, driestMonths: [] };
  const days = rainDays as number[];
  const minimum = Math.min(...days);
  return {
    warmthRank,
    rainRank: days.filter((value) => value > days[monthIndex]).length + 1,
    driestMonths: days.flatMap((value, index) => (value === minimum ? [index] : [])),
  };
}

export interface HomeComparison {
  /** Różnica średnich maksimów: kierunek minus Warszawa, w °C. */
  maxDiffC: number;
  homeMaxC: number;
  /** Różnica liczby dni z opadem; null bez kompletu danych po obu stronach. */
  rainDaysDiff: number | null;
}

/** Porównanie z Warszawą w tym samym miesiącu. Dla Warszawy zwraca null. */
export function homeComparison(slug: string, monthIndex: number): HomeComparison | null {
  if (slug === HOME_REFERENCE_SLUG) return null;
  const normal = BY_SLUG.get(slug);
  const home = BY_SLUG.get(HOME_REFERENCE_SLUG);
  if (!normal || !home) return null;
  const here = normal.rainDays[monthIndex];
  const there = home.rainDays[monthIndex];
  return {
    maxDiffC: round1(normal.maxTempC[monthIndex] - home.maxTempC[monthIndex]),
    homeMaxC: home.maxTempC[monthIndex],
    rainDaysDiff: here !== null && there !== null ? round1(here - there) : null,
  };
}

export interface MonthStanding {
  /** Ile kierunków z danymi ma w tym miesiącu wyższe średnie maksimum. */
  warmerCount: number;
  /** Liczba kierunków z danymi (łącznie z tym). */
  total: number;
}

export function monthStanding(slug: string, monthIndex: number): MonthStanding | null {
  const normal = BY_SLUG.get(slug);
  if (!normal) return null;
  const own = normal.maxTempC[monthIndex];
  return { warmerCount: NORMALS.filter((other) => other.maxTempC[monthIndex] > own).length, total: NORMALS.length };
}

export interface WarmerAlternative {
  slug: string;
  maxTempC: number;
  /** O ile cieplej niż na stronie, z której linkujemy. */
  diffC: number;
}

/**
 * Kierunki wyraźnie cieplejsze w tym samym miesiącu: najbliższe temperaturą
 * spośród tych, które są cieplejsze o co najmniej `minDiffC`. Najbliższe, a nie
 * najgorętsze, bo czytelnik strony o Barcelonie w styczniu szuka „trochę cieplej”,
 * nie od razu tropików. `isEligible` pozwala linkować tylko do stron, które
 * istnieją i są indeksowalne.
 */
export function warmerAlternatives(
  slug: string,
  monthIndex: number,
  options: { limit?: number; minDiffC?: number; isEligible?: (slug: string) => boolean } = {},
): WarmerAlternative[] {
  const normal = BY_SLUG.get(slug);
  if (!normal) return [];
  const { limit = 3, minDiffC = 3, isEligible = () => true } = options;
  const own = normal.maxTempC[monthIndex];
  return NORMALS.filter((other) => other.slug !== slug && other.maxTempC[monthIndex] - own >= minDiffC && isEligible(other.slug))
    .map((other) => ({ slug: other.slug, maxTempC: other.maxTempC[monthIndex], diffC: round1(other.maxTempC[monthIndex] - own) }))
    .sort((a, b) => a.diffC - b.diffC || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

/** Szerokość geograficzna stacji (do długości dnia); null, gdy źródło jej nie podało. */
export function stationLatitude(slug: string): number | null {
  const latitude = BY_SLUG.get(slug)?.latitude;
  return typeof latitude === "number" && Number.isFinite(latitude) ? latitude : null;
}
