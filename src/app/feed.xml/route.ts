import { getEditorialArticles } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const siteUrl = getSiteUrl();
  // Bez <lastBuildDate>: do 2026-09 stała tu data wpisana na sztywno (29.03.2026),
  // a model treści nie ma dat artykułów, więc nie ma z czego jej policzyć (PR #1.5).
  const articles = getEditorialArticles();

  const items = articles
    .map((article) => {
      const url = `${siteUrl}/inspiracje/${article.slug}`;
      return `<item>
  <title>${escapeXml(article.title)}</title>
  <link>${escapeXml(url)}</link>
  <guid>${escapeXml(url)}</guid>
  <description>${escapeXml(article.description)}</description>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>HelpTravel - Inspiracje</title>
  <link>${escapeXml(siteUrl)}</link>
  <description>Praktyczne inspiracje i przewodniki podróżnicze dla polskiego odbiorcy.</description>
  <language>pl-PL</language>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

