// Realny inwentarz serwisu dla silnika treści i bramki jakości.
//
// Źródłem prawdy o tym, jakie adresy istnieją, jest ta sama funkcja, która
// buduje sitemapę — inwentarz nie może się z nią rozjechać. Tytuły i leady
// bierzemy z modułów danych stron (bez renderowania i bez sieci), żeby bramka
// mogła wykryć duplikat tytułu albo wstępu wobec istniejącej treści.

import sitemap from "@/app/sitemap";
import type { ExistingContent } from "@/lib/content-quality/gate";
import { comparisonPairs } from "@/lib/mvp/comparisons";
import { getEditorialArticles, getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import { destinationDisplayName } from "@/lib/seo/destination-facts";
import { comparisonPageText } from "@/lib/seo/page-titles";

import { FixtureInventory } from "./inventory";

/** Trasy produktu, do których treść może prowadzić CTA, a których nie ma w sitemapie. */
const PRODUCT_ROUTES = ["/", "/hotele/szukaj", "/loty/wyniki"] as const;

export function siteRoutes(): string[] {
  const routes = new Set<string>(PRODUCT_ROUTES);
  for (const entry of sitemap()) {
    const path = new URL(entry.url).pathname;
    routes.add(path === "" ? "/" : path);
  }
  return [...routes].sort();
}

export function siteExistingContent(): ExistingContent[] {
  const existing: ExistingContent[] = [];

  for (const pair of comparisonPairs) {
    const a = getDestinationGuideBySlug(pair.a);
    const b = getDestinationGuideBySlug(pair.b);
    if (!a || !b) continue;
    const nameA = pair.labelA ?? destinationDisplayName(a.destination);
    const nameB = pair.labelB ?? destinationDisplayName(b.destination);
    const text = comparisonPageText({ pair, nameA, nameB });
    existing.push({
      canonicalUrl: `/porownanie/${pair.slug}`,
      title: text.title,
      h1: `${nameA} czy ${nameB}?`,
      lead: pair.intent,
    });
  }

  for (const mood of TRAVEL_MOODS) {
    existing.push({ canonicalUrl: `/wyjazdy/${mood.slug}`, title: mood.metaTitle, h1: mood.h1, lead: mood.lead });
  }

  for (const article of getEditorialArticles()) {
    existing.push({
      canonicalUrl: `/inspiracje/${article.slug}`,
      title: article.title,
      h1: article.title,
      lead: article.hero ?? article.excerpt,
    });
  }

  return existing;
}

/** Inwentarz do przebiegów na prawdziwych danych; rozszerzenia dokłada StoreBackedInventory. */
export function buildSiteInventory(): FixtureInventory {
  return new FixtureInventory({ existing: siteExistingContent(), knownRoutes: siteRoutes() });
}
