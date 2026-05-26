import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/mvp/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /admin/  — wildcard so any future admin sub-route is blocked too
      //            (was: /admin/analytics, which only matched that one path)
      // /api/    — keep server endpoints out of the index
      // /trips/  — anonymous-session saved-plan pages, not for search
      // /hotele/rezerwacja  — checkout flow, indexed metadata is noindex
      //                       anyway, this is belt-and-braces
      // (Note: /en/ removed — middleware permanent-redirects, no crawl traffic)
      disallow: ["/api/", "/admin/", "/trips/", "/hotele/rezerwacja"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
