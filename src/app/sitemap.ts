import type { MetadataRoute } from "next";

import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { getEditorialArticles, getEditorialCategories } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const baseLastModified = new Date("2026-03-29T00:00:00.000Z");
  const staticRoutes = [
    "",
    "/planner",
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

  return [...new Set([...staticRoutes, ...categoryRoutes, ...destinationRoutes, ...articleRoutes])].map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: baseLastModified,
    changeFrequency:
      route === ""
        ? "daily"
        : route === "/kierunki" || route === "/inspiracje" || categoryRoutes.includes(route)
          ? "daily"
          : route.startsWith("/kierunki/") || route.startsWith("/inspiracje/")
          ? "weekly"
          : "monthly",
    priority:
      route === ""
        ? 1
        : route === "/kierunki" || route === "/inspiracje" || categoryRoutes.includes(route)
          ? 0.9
          : route.startsWith("/kierunki/") || route.startsWith("/inspiracje/")
          ? 0.8
          : 0.65,
  }));
}

