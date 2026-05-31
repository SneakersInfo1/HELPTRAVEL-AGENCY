import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";

import { MediaHero } from "@/components/site/media-hero";
import { FinalCtaBanner } from "@/components/site/final-cta-banner";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { DestinationTile } from "@/components/home/destination-tile";
import { getEditorialArticles, getEditorialCategories, getLatestEditorialArticles } from "@/lib/mvp/publisher-content";
import { foldCategorySlug } from "@/lib/mvp/category-slug";
import { getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import type { DestinationProfile } from "@/lib/mvp/types";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Pomysły na wyjazd i poradniki",
  description: "Pomysły na city breaki, ciepłe wyjazdy i praktyczne poradniki, które pomagają przejść od luźnego pomysłu do konkretnego planu z lotem i hotelem.",
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

const HERO_SLUG = "athens-greece";
const TILE_SLUGS = ["barcelona-spain", "lisbon-portugal", "rome-italy", "malaga-spain"] as const;

// Hand-picked, recipe-backed photo per category so each tile shows a crisp,
// on-theme destination that is actually a member of that category.
const CATEGORY_IMAGE_SLUG: Record<string, string> = {
  przewodniki: "malaga-spain",
  "city-breaki": "rome-italy",
  "cieple-kierunki": "valencia-spain",
  "bez-wizy": "marrakesh-morocco",
  "tanie-podroze": "budapest-hungary",
  "weekendowe-wyjazdy": "prague-czechia",
};

async function heroImageFor(slug?: string): Promise<string | null> {
  if (!slug) return null;
  const profile = getDestinationProfileBySlug(slug);
  if (!profile) return null;
  const media = await resolveDestinationMedia(profile);
  return media.heroImage;
}

async function resolveTile(slug: string): Promise<{ destination: DestinationProfile; heroImage: string } | null> {
  const destination = getDestinationProfileBySlug(slug);
  if (!destination) return null;
  const media = await resolveDestinationMedia(destination);
  return { destination, heroImage: media.heroImage };
}

export default async function InspirationsIndexPage() {
  const articles = getEditorialArticles();
  const latestArticles = getLatestEditorialArticles(6);
  const categories = getEditorialCategories();

  const [heroImage, categoryCards, articleCards, tiles] = await Promise.all([
    heroImageFor(HERO_SLUG),
    Promise.all(
      categories.map(async (category) => ({
        category,
        image: await heroImageFor(CATEGORY_IMAGE_SLUG[category.slug] ?? category.destinationSlugs[0]),
      })),
    ),
    Promise.all(
      latestArticles.map(async (article) => ({
        article,
        image: (await heroImageFor(article.destinationSlugs[0])) ?? undefined,
      })),
    ),
    Promise.all(TILE_SLUGS.map(resolveTile)).then((list) =>
      list.filter((tile): tile is { destination: DestinationProfile; heroImage: string } => tile !== null),
    ),
  ]);

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

      <MediaHero
        imageUrl={heroImage}
        imageAlt="Ateny — Akropol o zachodzie słońca"
        eyebrow="Pomysły na wyjazd"
        title={
          <>
            Od luźnego pomysłu do{" "}
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
              konkretnego planu
            </span>
            .
          </>
        }
        intro="Praktyczne scenariusze wyjazdów, porównania kierunków i poradniki dla osób, które chcą najpierw przeczytać i porównać, a potem płynnie przejść do planera i oferty."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-6 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
          >
            Otwórz wyszukiwarkę →
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Katalog kierunków
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90">
          <span className="rounded-full bg-white/12 px-3 py-1">{articles.length} artykułów praktycznych</span>
          <span className="rounded-full bg-white/12 px-3 py-1">{categories.length} kategorie tematyczne</span>
          <span className="rounded-full bg-white/12 px-3 py-1">prosty start do planera</span>
        </div>
      </MediaHero>

      {/* KATEGORIE — kafelki ze zdjęciami */}
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Przeglądaj według tematu</p>
            <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Wybierz styl wyjazdu</h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categoryCards.map(({ category, image }) => (
            <Link
              key={category.slug}
              href={`/${foldCategorySlug(category.slug)}`}
              className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-[1.5rem] border border-emerald-900/10 shadow-[0_16px_40px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(16,84,48,0.16)]"
            >
              {image ? (
                <Image
                  src={image}
                  alt={category.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-[1.05]"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-900" />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0)_35%,rgba(5,18,11,0.55)_70%,rgba(5,18,11,0.9)_100%)]" />
              <div className="relative z-10 p-5 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">{category.eyebrow}</p>
                <h3 className="mt-1 font-display text-2xl leading-tight">{category.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-white/82 line-clamp-2">{category.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-200">
                  Zobacz pomysły <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* NAJNOWSZE PORADNIKI — karty ze zdjęciami */}
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Biblioteka treści</p>
            <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Najnowsze poradniki i scenariusze</h2>
          </div>
          <span className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900">
            aktualizacja: maj 2026
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articleCards.map(({ article, image }) => (
            <EditorialArticleCard key={article.slug} article={article} imageUrl={image} />
          ))}
        </div>
      </section>

      {/* POPULARNE KIERUNKI — realne zdjęcia + przejście do oferty */}
      {tiles.length > 0 && (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Gotowy na konkret?</p>
              <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Popularne kierunki teraz</h2>
            </div>
            <Link
              href="/kierunki"
              className="rounded-full border border-emerald-900/10 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
            >
              Wszystkie kierunki →
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((tile) => (
              <DestinationTile key={tile.destination.slug} destination={tile.destination} heroImage={tile.heroImage} />
            ))}
          </div>
        </section>
      )}

      <FinalCtaBanner
        eyebrow="Masz już pomysł?"
        title="Zamień inspirację w gotowy wyjazd"
        body="Wpisz kierunek albo opisz, czego szukasz. Hotel, lot i plan dnia ułożysz w jednym miejscu — za 0 zł i bez rejestracji."
        primaryHref="/hotele/szukaj"
        primaryLabel="Zaplanuj wyjazd"
        secondaryHref="/kierunki"
        secondaryLabel="Przeglądaj kierunki"
      />
    </main>
  );
}
