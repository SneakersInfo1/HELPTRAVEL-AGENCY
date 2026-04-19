import Link from "next/link";
import Script from "next/script";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import {
  getArticlesForCategory,
  getDestinationGuideBySlug,
  getEditorialCategoryBySlug,
  getEditorialCategories,
} from "@/lib/mvp/publisher-content";
import { curatedDestinations } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";

export async function CategoryPage({ slug }: { slug: string }) {
  const category = getEditorialCategoryBySlug(slug);
  if (!category) {
    return null;
  }

  const articles = getArticlesForCategory(slug);
  const allCategories = getEditorialCategories().filter((item) => item.slug !== slug);
  const destinations = await Promise.all(
    category.destinationSlugs.map(async (destinationSlug) => {
      const destination = curatedDestinations.find((item) => item.slug === destinationSlug);
      const guide = getDestinationGuideBySlug(destinationSlug);
      if (!destination || !guide) return null;
      return {
        destination,
        guide,
        media: await resolveDestinationMedia(destination),
      };
    }),
  );
  const validDestinations = destinations.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: category.title,
        description: category.description,
        url: `${getSiteUrl()}/${category.slug}`,
        inLanguage: "pl-PL",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${getSiteUrl()}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: category.title,
            item: `${getSiteUrl()}/${category.slug}`,
          },
        ],
      },
      {
        "@type": "ItemList",
        name: `${category.title} - kierunki`,
        itemListElement: validDestinations.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${getSiteUrl()}/kierunki/${item.destination.slug}`,
          name: `${item.destination.city}, ${item.destination.country}`,
        })),
      },
      {
        "@type": "ItemList",
        name: `${category.title} - artykuly`,
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
      <Script id={`category-${slug}-jsonld`} type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)]">
        <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: category.title }]} />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{category.eyebrow}</p>
        <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] text-emerald-950">{category.title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">{category.description}</p>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-900/72">{category.hero}</p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-emerald-900/70">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{articles.length} artykulow w tej kategorii</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">
            {destinations.filter(Boolean).length} powiazanych kierunkow
          </span>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/planner?mode=discovery"
            className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            Uruchom planner dla tego scenariusza
          </Link>
          <Link
            href="/inspiracje"
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            Zobacz wszystkie inspiracje
          </Link>
        </div>
      </section>

      <EditorialMetaBar
        eyebrow="Kolekcja redakcyjna"
        title="Tematyczny hub laczacy artykuly, kierunki i przejscie do planera"
        items={[`${articles.length} artykulow`, `${destinations.filter(Boolean).length} kierunkow`, "aktualizowany hub tematyczny"]}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {articles.map((article) => (
          <EditorialArticleCard key={article.slug} article={article} />
        ))}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Powiazane kierunki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Miejsca, ktore najmocniej pasuja do tej kategorii.</h2>
          </div>
          <Link href="/kierunki" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Zobacz wszystkie kierunki
          </Link>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {destinations.filter(Boolean).map((item) =>
            item ? (
              <DestinationGuideCard
                key={item.destination.slug}
                destination={item.destination}
                media={item.media}
                summary={item.guide.overview}
              />
            ) : null,
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dalsze odkrywanie</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Powiazane huby, ktore pomagaja przejsc dalej po serwisie</h2>
          </div>
          <Link href="/mapa-serwisu" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Pelna mapa serwisu
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {allCategories.map((item) => (
            <Link
              key={item.slug}
              href={`/${item.slug}`}
              className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900 transition hover:border-emerald-500/40 hover:bg-emerald-100"
            >
              {item.title}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

