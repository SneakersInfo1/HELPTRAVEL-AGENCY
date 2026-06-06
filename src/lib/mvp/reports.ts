// Original-data reports (audit action D — the linkable / digital-PR asset).
//
// These are NOT scraped or AI-spun: they are computed from HelpTravel's own
// structured dataset (235+ destination profiles — multi-year climate averages,
// modelled cost index, flight times from Poland, beach/city scores). That
// makes them genuinely original research a journalist or blogger can cite,
// which is the only durable way a new domain earns backlinks + authority.
//
// Pure functions over our data — no I/O. Safe in metadata + sitemap + page.

import { getStoryBySlug } from "./destination-content";
import { getAllDestinationProfiles } from "./destinations";
import { localizeCity, localizeCountry } from "./i18n-geo";
import type { DestinationProfile } from "./types";

export interface ReportMeta {
  slug: string;
  kicker: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  dek: string;
  /** Stable publish date; the page shows dateModified = now via ISR. */
  publishedISO: string;
  methodology: string[];
}

export interface WarmValueRow {
  rank: number;
  slug: string;
  name: string;
  country: string;
  /** 0-100 composite (warmth + value), 100 = best in the set. */
  score100: number;
  /** Months in the comfortable 18-30°C band. */
  warmMonths: number;
  /** Mean June–August temperature. */
  avgSummer: number;
  /** Plain-language cost band. */
  costLabel: string;
  flightHours: number;
  beachPct: number;
}

export const reports: ReportMeta[] = [
  {
    slug: "gdzie-cieplo-i-tanio-2026",
    kicker: "Raport HelpTravel",
    title: "Gdzie ciepło i tanio: ranking kierunków z Polski",
    metaTitle: "Gdzie ciepło i tanio 2026 — ranking 30 kierunków z Polski",
    metaDescription:
      "Autorski ranking HelpTravel: które kierunki dają najwięcej ciepła za najmniejsze pieniądze i przy najkrótszym locie z Polski. Dane: 235+ kierunków, wieloletnie średnie pogodowe, indeks kosztów, czasy lotów.",
    dek:
      "Policzyliśmy, gdzie z Polski poleci się w ciepło bez przepłacania. Każdy kierunek oceniliśmy łącznie za liczbę komfortowych miesięcy (18-30°C), poziom kosztów, czas lotu i profil plażowy. Oto wynik.",
    publishedISO: "2026-06-04T00:00:00.000Z",
    methodology: [
      "Punktem wyjścia jest baza ponad 235 kierunków osiągalnych z polskich lotnisk.",
      "Komfortowe miesiące to liczba miesięcy ze średnią temperaturą w przedziale 18-30°C (wieloletnie średnie).",
      "Indeks kosztów to modelowany poziom cen na miejscu (nocleg, jedzenie, transport) względem średniej europejskiej; niższy oznacza taniej.",
      "Czas lotu liczymy jako typowy bezpośredni przelot z Polski.",
      "Wynik łączny (0-100) premiuje: więcej ciepłych miesięcy, niższe koszty, krótszy lot i mocniejszy profil plażowy. 100 to najlepszy wynik w zestawieniu.",
      "Z rankingu wyłączamy kierunki krajowe oraz dalekie (lot powyżej 6,5 h), żeby zestawienie odpowiadało realnym wyjazdom na ciepło z Polski.",
    ],
  },
];

export function getReportBySlug(slug: string): ReportMeta | undefined {
  return reports.find((r) => r.slug === slug);
}

function warmMonthsOf(d: DestinationProfile): number {
  return d.avgTempByMonth.filter((t) => t >= 18 && t <= 30).length;
}

function summerAvg(d: DestinationProfile): number {
  return Math.round((d.avgTempByMonth[5] + d.avgTempByMonth[6] + d.avgTempByMonth[7]) / 3);
}

function costLabel(costIndex: number): string {
  if (costIndex <= 0.9) return "bardzo tanio";
  if (costIndex <= 1.05) return "tanio";
  if (costIndex <= 1.25) return "średnio";
  if (costIndex <= 1.5) return "drożej";
  return "drogo";
}

function rawScore(d: DestinationProfile): number {
  const warm = warmMonthsOf(d);
  return (
    warm * 4 +
    (1.6 - d.costIndex) * 22 +
    Math.max(0, 5 - d.typicalFlightHoursFromPL) * 3 +
    d.beachScore * 12
  );
}

function isPoland(d: DestinationProfile): boolean {
  const c = d.country.toLowerCase();
  return c === "poland" || c === "polska";
}

// Eligible set for the warm-value report: realistic warm getaways from Poland
// (≤6.5 h flight, ≥4 comfortable months), excluding domestic.
function eligibleDestinations(): DestinationProfile[] {
  return getAllDestinationProfiles().filter(
    (d) => !isPoland(d) && d.typicalFlightHoursFromPL <= 6.5 && warmMonthsOf(d) >= 4,
  );
}

function nameOf(d: DestinationProfile): string {
  return getStoryBySlug(d.slug)?.name ?? localizeCity(d.city);
}

export function buildWarmValueRanking(limit = 30): WarmValueRow[] {
  const eligible = eligibleDestinations();
  const scored = eligible.map((d) => ({ d, raw: rawScore(d) }));
  const rawMax = scored.reduce((max, s) => Math.max(max, s.raw), 0) || 1;

  // Deterministic order: score desc, then warmMonths desc, then slug for ties.
  scored.sort((a, b) => b.raw - a.raw || warmMonthsOf(b.d) - warmMonthsOf(a.d) || a.d.slug.localeCompare(b.d.slug));

  return scored.slice(0, limit).map(({ d, raw }, i) => ({
    rank: i + 1,
    slug: d.slug,
    name: nameOf(d),
    country: localizeCountry(d.country),
    score100: Math.round((raw / rawMax) * 100),
    warmMonths: warmMonthsOf(d),
    avgSummer: summerAvg(d),
    costLabel: costLabel(d.costIndex),
    flightHours: Math.round(d.typicalFlightHoursFromPL * 10) / 10,
    beachPct: Math.round(d.beachScore * 100),
  }));
}

export interface WarmValueFindings {
  longestWarm: { name: string; warmMonths: number } | null;
  cheapestWarm: { name: string; costLabel: string } | null;
  shortestFlight: { name: string; flightHours: number } | null;
}

// Honest, citable soundbites computed over the eligible set — the kind of
// stat a journalist quotes (wg HelpTravel najdłużej ciepło jest na…).
export function warmValueKeyFindings(): WarmValueFindings {
  const eligible = eligibleDestinations();
  if (eligible.length === 0) {
    return { longestWarm: null, cheapestWarm: null, shortestFlight: null };
  }
  const warmSet = eligible.filter((d) => warmMonthsOf(d) >= 6);

  const longest = [...eligible].sort(
    (a, b) => warmMonthsOf(b) - warmMonthsOf(a) || a.slug.localeCompare(b.slug),
  )[0];
  const cheapest = [...(warmSet.length ? warmSet : eligible)].sort(
    (a, b) => a.costIndex - b.costIndex || a.slug.localeCompare(b.slug),
  )[0];
  const closest = [...(warmSet.length ? warmSet : eligible)].sort(
    (a, b) => a.typicalFlightHoursFromPL - b.typicalFlightHoursFromPL || a.slug.localeCompare(b.slug),
  )[0];

  return {
    longestWarm: longest ? { name: nameOf(longest), warmMonths: warmMonthsOf(longest) } : null,
    cheapestWarm: cheapest ? { name: nameOf(cheapest), costLabel: costLabel(cheapest.costIndex) } : null,
    shortestFlight: closest
      ? { name: nameOf(closest), flightHours: Math.round(closest.typicalFlightHoursFromPL * 10) / 10 }
      : null,
  };
}
