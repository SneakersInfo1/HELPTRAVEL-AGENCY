"use client";

import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import type { EditorialArticle, EditorialCategory } from "@/lib/mvp/publisher-content";

interface FeaturedDirection {
  slug: string;
  city: string;
  country: string;
  heroImage: string;
  vibe: string;
  tagline: string;
  bestFor: string[];
}

interface HomePageSectionsProps {
  featuredDirections: FeaturedDirection[];
  latestArticles: EditorialArticle[];
  editorialCategories: EditorialCategory[];
  staysLabel: string;
  flightsLabel: string;
}

function buildPlannerHref(destination: string, origin = "Warszawa") {
  const params = new URLSearchParams({
    mode: "standard",
    q: destination,
    origin,
  });

  return `/planner?${params.toString()}`;
}

const copy = {
  pl: {
    commerceEyebrow: "Szybki start komercyjny",
    commerceTitle: "Jeden klik do pobytu, drugi do lotu. Bez martwych ekranow.",
    commerceBody:
      "Kierunek prowadzi od razu do wyszukiwania pobytu, lotow i noclegow alternatywnych. Hero ma prowadzic do ruchu dalej, a nie tylko opowiadac.",
    hotelLabel: "Hotele",
    hotelBody: "Najmocniej eksponowany pierwszy klik po wyborze miasta.",
    flightsLabel: "Loty",
    flightsBody: "Trasa, termin i wyjazd gotowe do klikniecia.",
    staysAltLabel: "Apartamenty",
    staysAltBody: "Dla dluzszego pobytu, grupy albo apartamentu zamiast hotelu.",
    moodEyebrow: "Start od nastroju",
    moods: [
      { title: "City break", description: "Mocne miasta na 3-5 dni.", href: "/city-breaki" },
      { title: "Cieplo i morze", description: "Kierunki pod slonce i lekki reset.", href: "/cieple-kierunki" },
      { title: "Weekendowy wypad", description: "Szybki format bez ciezkiej logistyki.", href: "/weekendowe-wyjazdy" },
      { title: "Bez wizy", description: "Prostszy start i mniej formalnosci.", href: "/bez-wizy" },
    ],
    howEyebrow: "Jak to dziala",
    howTitle: "Jedna decyzja na raz. Zero chaosu.",
    openPlanner: "Otworz planner",
    processSteps: [
      { step: "01", title: "Wybierasz miasto", text: "Autocomplete i szybkie pickery prowadza od razu do konkretnej trasy." },
      { step: "02", title: "Ustawiasz termin", text: "Ten sam termin przechodzi dalej do pobytu, lotow i dodatkow." },
      { step: "03", title: "Klikasz w oferty", text: "Najpierw pobyt, potem lot, apartamenty, atrakcje i auta." },
    ],
    categoriesEyebrow: "Kategorie contentowe",
    categoriesTitle: "Inspiracje, ktore od razu prowadza do ruchu i klikniec.",
    articlesEyebrow: "Nowe przewodniki",
    articlesTitle: "Tresci, ktore pomagaja wybrac miasto szybciej.",
    libraryCta: "Cala biblioteka",
    finalEyebrow: "Mocny final CTA",
    finalTitle: "Wybierz miasto teraz i przejdz prosto do pobytu.",
    finalBody: "Start od kierunku, potem hotel, lot i dodatki. Szybciej, czytelniej i bez zbednych ekranow.",
    chooseDestination: "Wybierz kierunek",
    describeTrip: "Opisz wyjazd",
    openCatalog: "Otworz katalog",
    readArticle: "Czytaj artykul",
    plannerDestinations: {
      hotel: "Malaga",
      flights: "Barcelona",
      apartments: "Lizbona",
    },
  },
  en: {
    commerceEyebrow: "Commercial fast lane",
    commerceTitle: "One click to stays, the next one to flights. No dead-end screens.",
    commerceBody:
      "A chosen destination should move users straight into stay search, flights and alternative lodging options. The homepage should push action, not just explain itself.",
    hotelLabel: "Stays",
    hotelBody: "The strongest first click after choosing a destination.",
    flightsLabel: "Flights",
    flightsBody: "Route, dates and traveler intent are ready to go.",
    staysAltLabel: "Apartments",
    staysAltBody: "For longer stays, larger groups or apartment-first trips.",
    moodEyebrow: "Start from the travel mood",
    moods: [
      { title: "City breaks", description: "Strong short-haul cities for 3-5 days.", href: "/city-breaki" },
      { title: "Warm escapes", description: "Sun, coast and easy reset destinations.", href: "/cieple-kierunki" },
      { title: "Weekend trips", description: "Fast formats with low planning friction.", href: "/weekendowe-wyjazdy" },
      { title: "Visa-free", description: "Simpler departures with fewer formalities.", href: "/bez-wizy" },
    ],
    howEyebrow: "How it works",
    howTitle: "One decision at a time. Zero clutter.",
    openPlanner: "Open planner",
    processSteps: [
      { step: "01", title: "Pick a city", text: "Autocomplete and quick picks move you straight into a real route." },
      { step: "02", title: "Set dates", text: "The same dates flow into stays, flights and useful extras." },
      { step: "03", title: "Open offers", text: "Start with stays, then flights, apartments, attractions and cars." },
    ],
    categoriesEyebrow: "Discovery categories",
    categoriesTitle: "Inspiration routes that can turn into real travel clicks.",
    articlesEyebrow: "Latest guides",
    articlesTitle: "Editorial content that helps people pick a destination faster.",
    libraryCta: "View all guides",
    finalEyebrow: "Final CTA",
    finalTitle: "Choose a destination now and go straight into stays.",
    finalBody: "Start with the city, then move into hotels, flights and extras without unnecessary friction.",
    chooseDestination: "Choose destination",
    describeTrip: "Describe your trip",
    openCatalog: "Open catalog",
    readArticle: "Read article",
    plannerDestinations: {
      hotel: "Malaga",
      flights: "Barcelona",
      apartments: "Lisbon",
    },
  },
} as const;

export function HomePageSections({
  featuredDirections,
  latestArticles,
  editorialCategories,
  staysLabel,
  flightsLabel,
}: HomePageSectionsProps) {
  const { locale } = useLanguage();
  const text = copy[locale];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 sm:px-6 xl:px-8">
      <section className="animate-rise-card grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_24px_80px_rgba(6,29,16,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">{text.commerceEyebrow}</p>
          <h2 className="mt-3 font-display text-4xl leading-[0.94] sm:text-5xl">{text.commerceTitle}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72">{text.commerceBody}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <LocalizedLink
              href={buildPlannerHref(text.plannerDestinations.hotel)}
              className="rounded-[1.6rem] bg-white p-4 text-emerald-950 transition duration-300 hover:-translate-y-1 hover:bg-emerald-50"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.hotelLabel}</p>
              <p className="mt-2 text-2xl font-bold">{staysLabel}</p>
              <p className="mt-2 text-sm leading-6 text-emerald-900/72">{text.hotelBody}</p>
            </LocalizedLink>
            <LocalizedLink
              href={buildPlannerHref(text.plannerDestinations.flights)}
              className="rounded-[1.6rem] border border-white/14 bg-white/8 p-4 transition duration-300 hover:-translate-y-1 hover:bg-white/12"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">{text.flightsLabel}</p>
              <p className="mt-2 text-xl font-bold">{flightsLabel}</p>
              <p className="mt-2 text-sm text-white/70">{text.flightsBody}</p>
            </LocalizedLink>
            <LocalizedLink
              href={buildPlannerHref(text.plannerDestinations.apartments)}
              className="rounded-[1.6rem] border border-white/14 bg-white/8 p-4 transition duration-300 hover:-translate-y-1 hover:bg-white/12"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">{text.staysAltLabel}</p>
              <p className="mt-2 text-xl font-bold">Vrbo</p>
              <p className="mt-2 text-sm text-white/70">{text.staysAltBody}</p>
            </LocalizedLink>
          </div>
        </article>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featuredDirections.map((item, index) => (
            <LocalizedLink
              key={item.slug}
              href={`/kierunki/${item.slug}`}
              className={`group relative overflow-hidden rounded-[2rem] border border-emerald-900/10 shadow-[0_20px_60px_rgba(16,84,48,0.1)] ${
                index === 0 ? "md:col-span-2 xl:col-span-2" : ""
              }`}
            >
              <div className={`relative ${index === 0 ? "h-[22rem]" : "h-[18rem]"}`}>
                <Image
                  src={item.heroImage}
                  alt={`${item.city}, ${item.country}`}
                  fill
                  sizes="(max-width: 1280px) 100vw, 33vw"
                  className="object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,18,10,0.04)_0%,rgba(4,18,10,0.76)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">{item.vibe}</p>
                  <h2 className="mt-2 text-3xl font-bold">{item.city}</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/78">{item.tagline}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.bestFor.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </LocalizedLink>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.moodEyebrow}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {text.moods.map((card, index) => (
              <LocalizedLink
                key={card.href}
                href={card.href}
                className={`rounded-[1.5rem] border border-emerald-900/10 px-4 py-4 transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40 ${
                  index === 0 ? "bg-emerald-900 text-white" : "bg-emerald-50/75 text-emerald-950"
                }`}
              >
                <h3 className="text-xl font-bold">{card.title}</h3>
                <p className={`mt-2 text-sm leading-6 ${index === 0 ? "text-white/74" : "text-emerald-900/72"}`}>{card.description}</p>
              </LocalizedLink>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[2.2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.howEyebrow}</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.howTitle}</h2>
          </div>
          <LocalizedLink href="/planner" className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
            {text.openPlanner}
          </LocalizedLink>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {text.processSteps.map((item) => (
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.categoriesEyebrow}</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.categoriesTitle}</h2>
          <div className="mt-6 grid gap-3">
            {editorialCategories.map((category) => (
              <LocalizedLink
                key={category.slug}
                href={`/${category.slug}`}
                className="rounded-[1.6rem] border border-emerald-900/10 bg-white px-4 py-4 transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{category.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-bold text-emerald-950">{category.title}</h3>
                <p className="mt-2 text-sm leading-6 text-emerald-900/72">{category.description}</p>
              </LocalizedLink>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.articlesEyebrow}</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.articlesTitle}</h2>
            </div>
            <LocalizedLink href="/inspiracje" className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100">
              {text.libraryCta}
            </LocalizedLink>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {latestArticles.map((article) => (
              <EditorialArticleCard key={article.slug} article={article} compact readLabel={text.readArticle} />
            ))}
          </div>
        </article>
      </section>

      <section className="relative overflow-hidden rounded-[2.3rem] border border-emerald-900/10 bg-emerald-950 px-6 py-8 text-white shadow-[0_28px_80px_rgba(6,29,16,0.18)] sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.18),transparent_26%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">{text.finalEyebrow}</p>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">{text.finalTitle}</h2>
            <p className="mt-4 text-sm leading-8 text-emerald-50/78">{text.finalBody}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <LocalizedLink
              href="/planner?mode=standard"
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300"
            >
              {text.chooseDestination}
            </LocalizedLink>
            <LocalizedLink
              href="/planner?mode=discovery"
              className="rounded-full border border-white/14 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/14"
            >
              {text.describeTrip}
            </LocalizedLink>
            <LocalizedLink
              href="/kierunki"
              className="rounded-full border border-white/14 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/14"
            >
              {text.openCatalog}
            </LocalizedLink>
          </div>
        </div>
      </section>
    </div>
  );
}
