import type { MetadataRoute } from "next";

import { getTopDestinations } from "@/lib/mvp/destinations-seed";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { getEditorialArticles, getEditorialCategories } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

// Sesja C2 — sitemap now sources verified destinations from
// data/destinations.json. Up to 500 top destinations get their own
// /hotele/szukaj URL so Google can index the search-results page per
// destination. Above 5k URLs we'd split into a sitemap-index — at pilot
// scale (161) we stay under that limit comfortably.
const SEARCH_URL_LIMIT = 500;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const baseLastModified = new Date("2026-03-29T00:00:00.000Z");
  const staticRoutes = [
    "",
    "/hotele",
    "/kierunki",
    "/inspiracje",
    "/przewodniki",
    "/oferta",
    "/faq",
    "/cennik",
    "/city-breaki",
    "/cieple-kierunki",
    "/bez-wizy",
    "/tanie-podroze",
    "/weekendowe-wyjazdy",
    "/mapa-serwisu",
    "/jak-pracujemy",
    "/standard-redakcyjny",
    "/o-nas",
    "/kontakt",
    "/polityka-prywatnosci",
    "/regulamin",
    "/linki-partnerskie",
    "/feed.xml",
  ];

  const categoryRoutes = getEditorialCategories().map((category) => `/${category.slug}`);
  const destinationRoutes = getAllDestinationProfiles().map((destination) => `/kierunki/${destination.slug}`);
  const articleRoutes = getEditorialArticles().map((article) => `/inspiracje/${article.slug}`);

  // Per-destination search URLs. We URL-encode the city+country pair so
  // the live page renders without an extra resolve round-trip.
  const seedSearchRoutes = getTopDestinations(SEARCH_URL_LIMIT).map((d) => {
    const params = new URLSearchParams({
      destination: d.city.en,
      country: d.country.en,
    });
    return `/hotele/szukaj?${params.toString()}`;
  });

  const seenUrls = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];
  for (const route of [...staticRoutes, ...categoryRoutes, ...destinationRoutes, ...articleRoutes, ...seedSearchRoutes]) {
    if (seenUrls.has(route)) continue;
    seenUrls.add(route);
    const isSearchRoute = route.startsWith("/hotele/szukaj");
    entries.push({
      url: `${siteUrl}${route}`,
      lastModified: baseLastModified,
      changeFrequency:
        route === ""
          ? "daily"
          : route === "/kierunki" || route === "/inspiracje" || categoryRoutes.includes(route)
            ? "daily"
            : route.startsWith("/kierunki/") || route.startsWith("/inspiracje/") || isSearchRoute
              ? "weekly"
              : "monthly",
      priority:
        route === ""
          ? 1
          : route === "/kierunki" || route === "/inspiracje" || categoryRoutes.includes(route)
            ? 0.9
            : route.startsWith("/kierunki/")
              ? 0.8
              : isSearchRoute
                ? 0.7
                : route.startsWith("/inspiracje/")
                  ? 0.75
                  : 0.65,
    });
  }
  return entries;
}

