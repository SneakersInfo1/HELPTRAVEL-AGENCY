// Dane hubów /wyjazdy/[typ], które wcześniej nie istniały na stronie:
// tabela faktów o kierunkach z huba i ścieżka do porównań.
//
// Liczby wyłącznie z bramki faktów (destination-facts.ts): czas lotu jako fakt
// albo oznaczony szacunek, miesiące tylko z oficjalnej normy WMO. Kierunek
// bez przewodnika albo bez danych dostaje „brak danych", a nie liczbę z szablonu.

import { comparisonPairs } from "@/lib/mvp/comparisons";
import { polishMonthLabels, polishMonthSlugs } from "@/lib/mvp/months";
import { getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import type { TravelMood } from "@/lib/mvp/travel-moods";

import {
  destinationDisplayName,
  formatFlightFact,
  getDestinationSeoFacts,
  type ClimateFactSource,
} from "./destination-facts";

export interface HubFactRow {
  name: string;
  guideHref: string | null;
  /** „ok. 2.6 h" albo „szacunkowo ok. 2.4 h z Krakowa (liczone z odległości)"; null = brak danych. */
  flight: string | null;
  /** Zakresy miesięcy ze średnią maksymalną w dzień 18–30°C. */
  daytimeMaxMonths: string | null;
  climateSource: ClimateFactSource | null;
}

export interface HubLink {
  href: string;
  label: string;
}

const COMFORT_MIN = 18;
const COMFORT_MAX = 30;

/** Indeksy miesięcy (0–11) jako zakresy „kwiecień–czerwiec"; ciągłość przez grudzień–styczeń. */
export function monthRangesLabel(indices: readonly number[]): string | null {
  if (indices.length === 0) return null;
  if (indices.length === 12) return "cały rok";
  const set = new Set(indices);
  // Start zakresu: miesiąc w zbiorze, którego poprzednik (cyklicznie) nie jest w zbiorze.
  const starts = [...set].filter((m) => !set.has((m + 11) % 12)).sort((a, b) => a - b);
  const ranges = starts.map((start) => {
    let end = start;
    while (set.has((end + 1) % 12) && (end + 1) % 12 !== start) end = (end + 1) % 12;
    const from = polishMonthLabels[polishMonthSlugs[start]];
    const to = polishMonthLabels[polishMonthSlugs[end]];
    return start === end ? from : `${from}–${to}`;
  });
  return ranges.join(", ");
}

export function hubFactRows(mood: TravelMood): HubFactRow[] {
  return mood.picks.map((pick) => {
    const guide = pick.slug ? getDestinationGuideBySlug(pick.slug) : undefined;
    if (!guide) return { name: pick.name, guideHref: null, flight: null, daytimeMaxMonths: null, climateSource: null };
    const facts = getDestinationSeoFacts(guide.destination);
    const temps = facts.temperature?.byMonth;
    const comfortable = temps
      ? temps.map((t, i) => ({ t, i })).filter(({ t }) => t >= COMFORT_MIN && t <= COMFORT_MAX).map(({ i }) => i)
      : null;
    return {
      name: pick.name,
      guideHref: `/kierunki/${guide.destination.slug}`,
      flight: facts.flight ? formatFlightFact(facts.flight) : null,
      daytimeMaxMonths: comfortable ? (monthRangesLabel(comfortable) ?? "żaden miesiąc w przedziale 18–30°C") : null,
      climateSource: facts.temperature?.source ?? null,
    };
  });
}

/**
 * Porównania dla huba: najpierw pary, w których OBA kierunki są w hubie
 * (to dokładnie decyzja, przed którą stoi czytelnik), potem pary z jednym.
 */
export function hubComparisons(mood: TravelMood, limit = 8): HubLink[] {
  const slugs = new Set(mood.picks.map((pick) => pick.slug).filter((slug): slug is string => Boolean(slug)));
  const scored = comparisonPairs
    .map((pair) => ({ pair, overlap: Number(slugs.has(pair.a)) + Number(slugs.has(pair.b)) }))
    .filter((item) => item.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap);
  const links: HubLink[] = [];
  for (const { pair } of scored) {
    const a = getDestinationGuideBySlug(pair.a);
    const b = getDestinationGuideBySlug(pair.b);
    if (!a || !b) continue;
    const nameA = pair.labelA ?? destinationDisplayName(a.destination);
    const nameB = pair.labelB ?? destinationDisplayName(b.destination);
    links.push({ href: `/porownanie/${pair.slug}`, label: `${nameA} czy ${nameB}` });
    if (links.length >= limit) break;
  }
  return links;
}
