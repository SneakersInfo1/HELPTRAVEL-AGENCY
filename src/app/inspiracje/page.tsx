import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { getEditorialArticles, getEditorialCategories, getLatestEditorialArticles } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Pomysły na wyjazd i poradniki",
  description: "Pomysły na city breaki, ciepłe wyjazdy i praktyczne poradniki, które pomagają przejść do konkretnego planu.",
  alternates: {
    canonical: "/inspiracje",
  },
  openGraph: {
    title: "Pomysły na wyjazd i poradniki - HelpTravel",
    description:
      "Praktyczne scenariusze wyjazdów, porównania kierunków i artykuły pomagające przejść do konkretnego planu.",
    url: `${getSiteUrl()}/inspiracje`,
    type: "website",
  },
};

export default function InspirationsIndexPage() {
  const articles = getEditorialArticles();
  const latestArticles = getLatestEditorialArticles(6);
  const categories = getEditorialCategories();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Pomysły na wyjazd",
        description: "Przewodniki, pomysły na wyjazdy, city breaki i praktyczne scenariusze dla polskiego odbiorcy.",
        url: `${getSiteUrl()}/inspiracje`,
        inLanguage: "pl-PL",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${getSiteUrl()}/` },
          { "@type": "ListItem", position: 2, name: "Inspiracje", item: `${getSiteUrl()}/inspiracje` },
        ],
      },
      {
        "@type": "ItemList",
        itemListElement: articles.map((article, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${getSiteUrl()}/inspiracje/${article.slug}`,
          name: article.title,
        })),
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <Script id="inspirations-index-jsonld" type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pomysły na wyjazd</p>
        <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] text-emerald-950">
          Poradniki i scenariusze, z których łatwo przejść do konkretnego planu.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Znajdziesz tu praktyczne scenariusze wyjazdów, porównania kierunków i poradniki dla osób, które chcą
          najpierw przeczytać i porównać, a dopiero potem kliknąć w planner albo ofertę.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-emerald-900/70">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{articles.length} artykułów praktycznych</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{categories.length} główne kategorie tematyczne</span>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/${category.slug}`}
              className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900 transition hover:bg-emerald-100"
            >
              {category.title}
            </Link>
          ))}
        </div>
      </section>

      <EditorialMetaBar
        eyebrow="Biblioteka treści"
        title="Artykuły, które odpowiadają na konkretne pytania przed planowaniem wyjazdu"
        items={[`${articles.length} artykułów`, `${categories.length} kategorii`, "prosty start do planera"]}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {latestArticles.map((article) => (
          <EditorialArticleCard key={article.slug} article={article} />
        ))}
      </section>
    </main>
  );
}

