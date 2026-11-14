// Dane strony /porownanie/[para] — wspólne dla strony produkcyjnej i trasy
// laboratoryjnej, żeby warianty układu oglądać na dokładnie tej samej treści.

import type { SideInfo } from "@/components/editorial/comparison-blocks";
import type { ComparisonTemplateProps } from "@/components/editorial/comparison-template";
import { getEnrichment } from "@/lib/content-engine/site-content";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { getComparisonPairBySlug, isTopComparison } from "@/lib/mvp/comparisons";
import { getCityHotelStats } from "@/lib/mvp/live-hotel-stats";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getArticlesForDestination, getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";
import type { DestinationProfile } from "@/lib/mvp/types";

import { buildComparisonModel, comparisonCoverage } from "./comparison-model";
import { buildComparisonView } from "./comparison-view";
import { pairsWithLabels } from "./comparison-view-data";

function hotelHref(profile: DestinationProfile): string {
  return `/hotele/szukaj?${new URLSearchParams({ destination: profile.city, country: profile.country }).toString()}`;
}

/** Komplet danych szablonu (zdjęcia z istniejącej integracji, dane własne dla par flagowych). */
export async function loadComparisonPage(slug: string): Promise<Omit<ComparisonTemplateProps, "variant"> | null> {
  const pair = getComparisonPairBySlug(slug);
  if (!pair) return null;
  const ga = getDestinationGuideBySlug(pair.a);
  const gb = getDestinationGuideBySlug(pair.b);
  if (!ga || !gb) return null;

  const baseUrl = getSiteUrl();
  const isTop = isTopComparison(pair.slug);
  const [mediaA, mediaB, statsA, statsB] = await Promise.all([
    resolveDestinationMedia(ga.destination),
    resolveDestinationMedia(gb.destination),
    // Dane własne tylko dla par flagowych; błąd dostawcy = brak sekcji, nie błąd strony.
    isTop ? getCityHotelStats(ga.destination.city, ga.destination.country) : Promise.resolve(null),
    isTop ? getCityHotelStats(gb.destination.city, gb.destination.country) : Promise.resolve(null),
  ]);
  const images = [mediaA.heroImage, mediaB.heroImage].filter((url): url is string => Boolean(url));

  const model = buildComparisonModel({ pair, a: ga.destination, b: gb.destination, baseUrl, images, author: personSchema(EDITOR_IN_CHIEF) });
  const view = buildComparisonView({
    pair,
    model,
    enrichment: getEnrichment(`/porownanie/${pair.slug}`),
    allPairs: pairsWithLabels(),
    baseUrl,
    coverage: comparisonCoverage(ga.destination, gb.destination),
  });

  const sides: [SideInfo, SideInfo] = [
    { name: model.a.name, slug: pair.a, hotelHref: hotelHref(ga.destination), guideHref: `/kierunki/${pair.a}`, image: mediaA.heroImage ?? null, overview: ga.overview },
    { name: model.b.name, slug: pair.b, hotelHref: hotelHref(gb.destination), guideHref: `/kierunki/${pair.b}`, image: mediaB.heroImage ?? null, overview: gb.overview },
  ];

  const seen = new Set<string>();
  const articleLinks: Array<{ href: string; label: string }> = [];
  for (const destinationSlug of [pair.a, pair.b]) {
    for (const article of getArticlesForDestination(destinationSlug)) {
      if (seen.has(article.slug)) continue;
      seen.add(article.slug);
      articleLinks.push({ href: `/inspiracje/${article.slug}`, label: article.title });
    }
  }

  const liveAsOf = statsA?.asOfISO ?? statsB?.asOfISO ?? null;
  return {
    view,
    model,
    sides,
    liveStats: isTop
      ? {
          a: statsA,
          b: statsB,
          dateLabel: liveAsOf ? new Date(liveAsOf).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : null,
        }
      : null,
    articleLinks: articleLinks.slice(0, 3),
  };
}
