import type { MetadataRoute } from "next";

import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { getEditorialArticles, getEditorialCategories } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const baseLastModified = new Date("2026-03-29T00:00:00.000Z");
  const staticRoutes = [
    "",
    "/en",
    "/planner",
    "/en/planner",
    "/kierunki",
    "/en/kierunki",
    "/inspiracje",
    "/mapa-serwisu",
    "/jak-pracujemy",
    "/dla-partnerow",
    "/standard-redakcyjny",
    "/o-nas",
    "/kontakt",
    "/polityka-prywatnosci",
    "/regulamin",
    "/linki-partnerskie",
  ];

  const categoryRoutes = getEditorialCategories().map((category) => `/${category.slug}`);
  const destinationRoutes = getAllDestinationProfiles().map((destination) => `/kierunki/${destination.slug}`);
  const englishDestinationRoutes = getAllDestinationProfiles().map((destination) => `/en/kierunki/${destination.slug}`);
  const articleRoutes = getEditorialArticles().map((article) => `/inspiracje/${article.slug}`);

  return [...staticRoutes, ...categoryRoutes, ...destinationRoutes, ...englishDestinationRoutes, ...articleRoutes].map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: baseLastModified,
    changeFrequency:
      route === "" || route === "/en"
        ? "daily"
        : route.startsWith("/kierunki/") || route.startsWith("/en/kierunki/") || route.startsWith("/inspiracje/")
          ? "weekly"
          : "monthly",
    priority:
      route === "" || route === "/en"
        ? 1
        : route.startsWith("/kierunki/") || route.startsWith("/en/kierunki/") || route.startsWith("/inspiracje/")
          ? 0.8
          : 0.65,
  }));
}
