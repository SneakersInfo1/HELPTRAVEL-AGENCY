import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PremiumHomeHero } from "@/components/home/premium-home-hero";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildAffiliateLinks } from "@/lib/mvp/affiliate-links";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { getDestinationCatalogCount } from "@/lib/mvp/destination-catalog";
import {
  getEditorialCategories,
  getLatestEditorialArticles,
  getPublishedDestinations,
} from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import type { DestinationProfile } from "@/lib/mvp/types";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "HelpTravel - wybierz kierunek i przejdz do pobytu oraz lotow",
  description:
    "Pelnoekranowy start do planowania wyjazdu. Wybierz kierunek, ustaw termin i przejdz do hoteli, lotow, atrakcji oraz dodatkow w jednym flow.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "HelpTravel - wybierz kierunek i przejdz do pobytu oraz lotow",
    description:
      "Premium homepage do wyboru kierunku, szybkiego wyszukiwania i przejscia do hoteli, lotow oraz dodatkow wyjazdowych.",
    url: siteUrl,
    type: "website",
  },
};

const heroDestinationSlugs = [
  "malaga-spain",
  "barcelona-spain",
  "lisbon-portugal",
  "rome-italy",
  "valencia-spain",
  "athens-greece",
  "istanbul-turkey",
  "funchal-portugal",
] as const;

const moodCards = [
  {
    title: "City break",
    description: "Mocne miasta na 3-5 dni.",
    href: "/city-breaki",
  },
  {
    title: "Cieplo i morze",
    description: "Kierunki pod slonce i lekki reset.",
    href: "/cieple-kierunki",
  },
  {
    title: "Weekendowy wypad",
    description: "Szybki format bez ciezkiej logistyki.",
    href: "/weekendowe-wyjazdy",
  },
  {
    title: "Bez wizy",
    description: "Prostszy start i mniej formalnosci.",
    href: "/bez-wizy",
  },
];

const processSteps = [
  {
    step: "01",
    title: "Wybierasz miasto",
    text: "Autocomplete i szybkie pickery prowadza od razu do konkretnej trasy.",
  },
  {
    step: "02",
    title: "Ustawiasz termin",
    text: "Ten sam termin przechodzi dalej do pobytu, lotow i dodatkow.",
  },
  {
    step: "03",
    title: "Klikasz w oferty",
    text: "Najpierw pobyt, potem lot, apartamenty, atrakcje i auta.",
  },
];

export default async function Home() {
  const publishedDestinations = getPublishedDestinations();
  const latestArticles = getLatestEditorialArticles(4);
  const editorialCategories = getEditorialCategories().slice(0, 4);
  const destinationCount = getDestinationCatalogCount();
  const guideCount = publishedDestinations.length + latestArticles.length;

  const selectedHeroDestinations = heroDestinationSlugs
    .map((slug) => publishedDestinations.find((destination) => destination.slug === slug))
    .filter((destination): destination is DestinationProfile => Boolean(destination));

  const resolvedHeroDestinations = await Promise.all(
    selectedHeroDestinations.map(async (destination) => ({
      destination,
      story: getDestinationStory(destination),
      media: await resolveDestinationMedia(destination),
    })),
  );

  const heroSlides = resolvedHeroDestinations.slice(0, 6).map((item) => ({
    id: item.destination.slug,
    city: item.destination.city,
    country: item.destination.country,
    label: `${item.destination.city}, ${item.destination.country}`,
    title: item.destination.city,
    description: item.story.tagline,
    image: item.media.heroImage,
    href: `/kierunki/${item.destination.slug}`,
    tags: item.story.bestFor.slice(0, 3),
    meta: `lot ok. ${item.destination.typicalFlightHoursFromPL.toFixed(1)} h z Polski`,
  }));

  const featuredDirections = resolvedHeroDestinations.slice(0, 6);
  const previewLinks = buildAffiliateLinks("Malaga", "Spain");

  return (
    <main className="flex w-full flex-1 flex-col gap-8 pb-8">
      <div className="w-full px-4 pt-4 sm:px-6 sm:pt-6 xl:px-8">
        <PremiumHomeHero slides={heroSlides} destinationCount={destinationCount} guideCount={guideCount} />
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 sm:px-6 xl:px-8">
        <section className="animate-rise-card grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_24px_80px_rgba(6,29,16,0.18)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">Szybki start komercyjny</p>
            <h2 className="mt-3 font-display text-4xl leading-[0.94] sm:text-5xl">Jeden klik do pobytu, drugi do lotu. Bez martwych ekranow.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72">
              Kierunek prowadzi od razu do wyszukiwania pobytu, lotow i noclegow alternatywnych. Hero ma sprzedawac ruch dalej, a nie tylko opowiadac.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Link
                href="/planner?mode=standard&q=Malaga&origin=Warszawa"
                className="rounded-[1.6rem] bg-white p-4 text-emerald-950 transition duration-300 hover:-translate-y-1 hover:bg-emerald-50"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Hotele</p>
                <p className="mt-2 text-2xl font-bold">{getAffiliateBrandLabel(previewLinks.stays, "Hotels.com")}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-900/72">Najmocniej eksponowany pierwszy klik po wyborze miasta.</p>
              </Link>
              <Link
                href="/planner?mode=standard&q=Barcelona&origin=Warszawa"
                className="rounded-[1.6rem] border border-white/14 bg-white/8 p-4 transition duration-300 hover:-translate-y-1 hover:bg-white/12"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Loty</p>
                <p className="mt-2 text-xl font-bold">{getAffiliateBrandLabel(previewLinks.flights, "Partner lotniczy")}</p>
                <p className="mt-2 text-sm text-white/70">Trasa, termin i wyjazd gotowe do klikniecia.</p>
              </Link>
              <Link
                href="/planner?mode=standard&q=Lisbon&origin=Warszawa"
                className="rounded-[1.6rem] border border-white/14 bg-white/8 p-4 transition duration-300 hover:-translate-y-1 hover:bg-white/12"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Apartamenty</p>
                <p className="mt-2 text-xl font-bold">Vrbo i alternatywy</p>
                <p className="mt-2 text-sm text-white/70">Dla dluzszego pobytu, grupy albo apartamentu zamiast hotelu.</p>
              </Link>
            </div>
          </article>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredDirections.map((item, index) => (
              <Link
                key={item.destination.slug}
                href={`/kierunki/${item.destination.slug}`}
                className={`group relative overflow-hidden rounded-[2rem] border border-emerald-900/10 shadow-[0_20px_60px_rgba(16,84,48,0.1)] ${
                  index === 0 ? "md:col-span-2 xl:col-span-2" : ""
                }`}
              >
                <div className={`relative ${index === 0 ? "h-[22rem]" : "h-[18rem]"}`}>
                  <Image
                    src={item.media.heroImage}
                    alt={`${item.destination.city}, ${item.destination.country}`}
                    fill
                    sizes="(max-width: 1280px) 100vw, 33vw"
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,18,10,0.04)_0%,rgba(4,18,10,0.76)_100%)]" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">{item.story.vibe}</p>
                    <h2 className="mt-2 text-3xl font-bold">{item.destination.city}</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/78">{item.story.tagline}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.story.bestFor.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Start od nastroju</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {moodCards.map((card, index) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className={`rounded-[1.5rem] border border-emerald-900/10 px-4 py-4 transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40 ${
                    index === 0 ? "bg-emerald-900 text-white" : "bg-emerald-50/75 text-emerald-950"
                  }`}
                >
                  <h3 className="text-xl font-bold">{card.title}</h3>
                  <p className={`mt-2 text-sm leading-6 ${index === 0 ? "text-white/74" : "text-emerald-900/72"}`}>{card.description}</p>
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-[2.2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Jak to dziala</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">Jedna decyzja na raz. Zero chaosu.</h2>
          </div>
          <Link href="/planner" className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
            Otworz planner
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {processSteps.map((item) => (
            <article
              key={item.step}
              className="rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(245,252,247,0.98),rgba(234,247,239,0.92))] p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_52px_rgba(16,84,48,0.1)]"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-extrabold text-emerald-950 shadow-sm">
                {item.step}
              </span>
              <h3 className="mt-4 text-2xl font-bold text-emerald-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/72">{item.text}</p>
            </article>
          ))}
        </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(235,248,239,0.98),rgba(225,242,232,0.92))] p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kategorie contentowe</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">Inspiracje, ktore od razu prowadza do ruchu i klikniec.</h2>
          <div className="mt-6 grid gap-3">
            {editorialCategories.map((category) => (
              <Link
                key={category.slug}
                href={`/${category.slug}`}
                className="rounded-[1.6rem] border border-emerald-900/10 bg-white px-4 py-4 transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{category.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-bold text-emerald-950">{category.title}</h3>
                <p className="mt-2 text-sm leading-6 text-emerald-900/72">{category.description}</p>
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Nowe przewodniki</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">Tresci, ktore pomagaja wybrac miasto szybciej.</h2>
            </div>
            <Link href="/inspiracje" className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100">
              Cala biblioteka
            </Link>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {latestArticles.map((article) => (
              <EditorialArticleCard key={article.slug} article={article} compact />
            ))}
          </div>
        </article>
        </section>

        <section className="relative overflow-hidden rounded-[2.3rem] border border-emerald-900/10 bg-emerald-950 px-6 py-8 text-white shadow-[0_28px_80px_rgba(6,29,16,0.18)] sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.18),transparent_26%)]" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">Mocny final CTA</p>
              <h2 className="mt-3 font-display text-4xl sm:text-5xl">Wybierz miasto teraz i przejdz prosto do pobytu.</h2>
              <p className="mt-4 text-sm leading-8 text-emerald-50/78">Start od kierunku, potem hotel, lot i dodatki. Szybciej, czytelniej i bez zbednych ekranow.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/planner?mode=standard"
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                Wybierz kierunek
              </Link>
              <Link
                href="/planner?mode=discovery"
                className="rounded-full border border-white/14 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/14"
              >
                Opisz wyjazd
              </Link>
              <Link
                href="/kierunki"
                className="rounded-full border border-white/14 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/14"
              >
                Otworz katalog
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
