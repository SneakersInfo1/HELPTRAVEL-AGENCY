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
      // /hotele/szukaj  — dynamic search results; rely on canonical
      //                   /kierunki/[slug] for indexing instead
      // (Note: /en/ NOT disallowed — middleware 308-redirects /en/* to the
      // PL canonical, and we want Google to keep re-crawling /en/* so it
      // discovers those 308s and drops the old URLs from its index. Adding
      // Disallow here too early would block re-crawl and FREEZE the old
      // /en/* URLs in Google's index. Revisit in ~Aug 2026 — after re-
      // verifying in GSC that /en/* impressions dropped to zero — and add
      // Disallow then as belt-and-braces.)
      disallow: ["/api/", "/admin/", "/trips/", "/hotele/rezerwacja", "/hotele/szukaj"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
