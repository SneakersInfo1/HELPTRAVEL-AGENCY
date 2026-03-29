import type { MetadataRoute } from "next";

import {
  getEditorialArticles,
  getEditorialCategories,
  getPublishedDestinationSlugs,
} from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const baseLastModified = new Date("2026-03-29T00:00:00.000Z");
  const staticRoutes = [
    "",
    "/planner",
    "/kierunki",
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
  const destinationRoutes = getPublishedDestinationSlugs().map((slug) => `/kierunki/${slug}`);
  const articleRoutes = getEditorialArticles().map((article) => `/inspiracje/${article.slug}`);

  return [...staticRoutes, ...categoryRoutes, ...destinationRoutes, ...articleRoutes].map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: baseLastModified,
    changeFrequency: route === "" ? "daily" : route.startsWith("/kierunki/") || route.startsWith("/inspiracje/") ? "weekly" : "monthly",
    priority: route === "" ? 1 : route.startsWith("/kierunki/") || route.startsWith("/inspiracje/") ? 0.8 : 0.65,
  }));
}
