import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

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
import { SHELL_DISCOVERY } from "@/lib/ui/layout";

export const revalidate = 86400;

// PRZEPISANE 2026-07-31. Usunięte stąd:
//   • plakietka „aktualizacja: maj 2026" — wpisana na sztywno, a `EditorialArticle`
//     NIE MA pola z datą, więc nie było czym jej zastąpić prawdziwą wartością.
//     Zgodnie z zasadą „brak danych = brak liczby" plakietka znika, zamiast
//     kłamać dalej (w sierpniu twierdziła, że treści są z maja).
//   • „prosty start do planera" i „plan dnia" w CTA — planera nie ma.
//   • „za 0 zł" — wyjazd kupuje się tutaj; bezpłatne jest wyszukiwanie, nie wyjazd.
//   • gradient na tekście nagłówka i nadtytuły nad każdą sekcją.

export const metadata: Metadata = {
  title: "Pomysły na wyjazd i poradniki",
  description:
    "Pomysły na city breaki, ciepłe kierunki i praktyczne poradniki — dla osób, które chcą najpierw poczytać i porównać, zanim wybiorą termin i hotel.",
  alternates: { canonical: "/inspiracje" },
  openGraph: {
    title: "Pomysły na wyjazd i poradniki — HelpTravel",
    description: "Scenariusze wyjazdów, porównania kierunków i poradniki pomagające wybrać, dokąd polecieć.",
    url: `${getSiteUrl()}/inspiracje`,
    type: "website",
  },
};

const HERO_SLUG = "athens-greece";
const TILE_SLUGS = ["barcelona-spain", "lisbon-portugal", "rome-italy", "malaga-spain"] as const;

// Ręcznie dobrane zdjęcie na kategorię — kadr ma pasować do tematu i pochodzić
// z kierunku, który do tej kategorii faktycznie należy.
const CATEGORY_IMAGE_SLUG: Record<string, string> = {
  przewodniki: "malaga-spain",
  "city-breaki": "rome-italy",
  "cieple-kierunki": "valencia-spain",
  "bez-wizy": "marrakesh-morocco",
  "tanie-podróże": "budapest-hungary",
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
    <main className={`flex w-full flex-1 flex-col gap-10 py-6 ${SHELL_DISCOVERY}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <MediaHero
        imageUrl={heroImage}
        imageAlt="Ateny — Akropol o zachodzie słońca"
        title="Najpierw poczytaj, potem wybierz termin"
        intro={`Porównania kierunków, gotowe scenariusze wyjazdów i praktyczne poradniki — ${articles.length} artykułów w ${categories.length} kategoriach. Dla tych, którzy jeszcze nie wiedzą dokąd, a nie chcą wybierać w ciemno.`}
      >
        <Link
          href="/kierunki"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span className="text-sm font-bold text-brand-strong">Katalog kierunków</span>
        </Link>
      </MediaHero>

      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Wybierz styl wyjazdu</h2>
        <div className="ht-karty mt-6 [--ht-kol-lg:3] [--ht-kol-xl:4] [--ht-odstep:1rem]">
          {categoryCards.map(({ category, image }) => (
            <Link
              key={category.slug}
              href={`/${foldCategorySlug(category.slug)}`}
              className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl border border-line shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
            >
              {image ? (
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-brand-strong" />
              )}
              {/* Scrim przypięty do bloku tekstu, nie do całego kafla — patrz
                  komentarz w media-hero.tsx. Krycie 0,72 to zmierzona podłoga
                  dla 4,5:1 bieli na najjaśniejszym zdjęciu z puli. */}
              <div className="relative z-10 mt-auto w-full text-white">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
                />
                <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-4 sm:p-5">
                  <h3 className="font-display text-xl leading-tight text-white">{category.title}</h3>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-white/90">{category.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Najnowsze poradniki</h2>
        <div className="ht-karty mt-6 [--ht-kol-lg:3] [--ht-kol-xl:4] [--ht-odstep:1rem]">
          {articleCards.map(({ article, image }) => (
            <EditorialArticleCard key={article.slug} article={article} imageUrl={image} />
          ))}
        </div>
      </section>

      {tiles.length > 0 && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">Gotowy na konkret?</h2>
            <Link href="/kierunki" className="underline underline-offset-4">
              <span className="text-sm font-semibold text-brand">Wszystkie kierunki</span>
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {tiles.map((tile) => (
              <DestinationTile key={tile.destination.slug} destination={tile.destination} heroImage={tile.heroImage} />
            ))}
          </div>
        </section>
      )}

      <FinalCtaBanner
        title="Masz już kierunek na oku?"
        body="Wpisz go w wyszukiwarce razem z terminem, a zobaczysz realne ceny w złotówkach. Bez zakładania konta."
        primaryHref="/hotele/szukaj"
        primaryLabel="Otwórz wyszukiwarkę"
        secondaryHref="/kierunki"
        secondaryLabel="Przeglądaj kierunki"
      />
    </main>
  );
}
