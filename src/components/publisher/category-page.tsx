import Link from "next/link";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: category.title }]} />
        <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] text-ink">{category.title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">{category.description}</p>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted">
          To szybki skrót do najlepszych materiałów i kierunków dla jednego scenariusza wyjazdu. Nie musisz przeklikiwać całego serwisu, żeby zacząć.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-ink-muted">
          <span className="rounded-full bg-surface-sunken px-3 py-1.5">{articles.length} artykułów w tej kategorii</span>
          <span className="rounded-full bg-surface-sunken px-3 py-1.5">
            {destinations.filter(Boolean).length} powiązanych kierunków
          </span>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {/* Primary CTA: direct to hotel search. SERP landings on category
              pages (Google sitelinks) need an immediate path to bookable
              inventory, not just to another catalog page. */}
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">Otwórz wyszukiwarkę hoteli</span>
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-5 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">Pokaż kierunki dla tego scenariusza</span>
          </Link>
          <Link
            href="/inspiracje"
            className="group inline-flex items-center text-sm font-semibold"
          >
            <span className="text-ink transition group-hover:text-brand">Wszystkie pomysły na wyjazd</span>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {articles.map((article) => (
          <EditorialArticleCard key={article.slug} article={article} />
        ))}
      </section>

      <section className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mt-2 font-display text-4xl text-ink">Kierunki, od których najłatwiej zacząć.</h2>
          </div>
          <Link href="/kierunki" className="group text-sm font-semibold">
            <span className="text-ink transition group-hover:text-brand">Zobacz wszystkie kierunki</span>
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

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mt-2 font-display text-4xl text-ink">Jeśli to jest dobry trop, sprawdź też te strony.</h2>
          </div>
          <Link href="/mapa-serwisu" className="group text-sm font-semibold">
            <span className="text-ink transition group-hover:text-brand">Pełna mapa serwisu</span>
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {allCategories.map((item) => (
            <Link
              key={item.slug}
              href={`/${item.slug}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1.5 transition duration-150 ease-out hover:border-brand hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">{item.title}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

