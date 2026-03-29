import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { HeroMedia } from "@/components/mvp/hero-media";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { getDestinationStory, getVideoHeroSource } from "@/lib/mvp/destination-content";
import {
  getEditorialArticles,
  getEditorialCategories,
  getLatestEditorialArticles,
  getPublishedDestinations,
} from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "HelpTravel - planer i przewodniki podrozy",
  description:
    "Planer podrozy, katalog kierunkow, inspiracje i praktyczne przewodniki dla city breakow oraz krotkich wyjazdow z Polski.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "HelpTravel - planer i przewodniki podrozy",
    description:
      "Odkrywaj kierunki, czytaj przewodniki i planuj wyjazd w jednym miejscu. Serwis travelowy dla polskiego odbiorcy.",
    url: siteUrl,
    type: "website",
  },
};

const modes = [
  {
    title: "Nie wiem dokad leciec",
    description:
      "Opisujesz potrzebe naturalnym jezykiem, a serwis uklada sensowne kierunki, wyjasnia ranking i prowadzi do realnego flow wyszukiwania.",
    href: "/planner?mode=discovery",
    cta: "Uruchom planer discovery",
  },
  {
    title: "Mam kierunek",
    description:
      "Wybierasz konkretne miasto i od razu przechodzisz do wynikow, atrakcji, tresci lokalnych i planu dalszego wyszukiwania.",
    href: "/planner?mode=standard",
    cta: "Sprawdz kierunek w planerze",
  },
];

const trustPoints = [
  "katalog kierunkow i strony destination hub",
  "publiczne przewodniki i scenariusze wyjazdow",
  "wewnetrzne linkowanie do planera i ofert",
  "polskie tresci z naciskiem na praktyczna wartosc",
];

const starterRoutes = [
  {
    title: "Cieple kierunki",
    description: "Szybkie wejscie dla osob szukajacych slonca, plaz i prostych decyzji na start.",
    href: "/cieple-kierunki",
  },
  {
    title: "Bez wizy",
    description: "Kierunki, ktore sa wygodne dla osob planujacych wyjazd bez dodatkowych formalnosci.",
    href: "/bez-wizy",
  },
  {
    title: "City breaki",
    description: "Pomysly na krotkie wyjazdy z Polski, gdy chcesz zobaczyc duzo w 3-5 dni.",
    href: "/city-breaki",
  },
  {
    title: "Weekendowe wyjazdy",
    description: "Szybkie scenariusze na krotki urlop bez przepalania budzetu i czasu.",
    href: "/weekendowe-wyjazdy",
  },
];

export default async function Home() {
  const categories = getEditorialCategories();
  const articles = getEditorialArticles();
  const latestArticles = getLatestEditorialArticles(4);
  const destinations = getPublishedDestinations();
  const featuredArticles = articles.slice(0, 6);
  const articleCount = articles.length;
  const destinationCount = destinations.length;
  const featuredDestinations = await Promise.all(
    destinations.slice(0, 6).map(async (destination) => ({
      destination,
      story: getDestinationStory(destination),
      media: await resolveDestinationMedia(destination),
    })),
  );
  const video = getVideoHeroSource();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-emerald-950 text-white shadow-[0_30px_100px_rgba(8,40,24,0.24)]">
        <div className="absolute inset-0">
          <HeroMedia src={video.src} poster={video.poster} alt="Podrozniczy klimat" className="opacity-60" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,11,0.84)_0%,rgba(8,28,16,0.64)_48%,rgba(8,28,16,0.34)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.24),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.18),transparent_24%)]" />
        </div>

        <div className="relative grid gap-8 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-white/18 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-50/90">
              Planer + przewodniki
            </span>
            <h1 className="mt-5 text-balance font-display text-5xl leading-[0.95] text-white sm:text-6xl lg:text-7xl">
              Odkrywaj kierunki, czytaj przewodniki i planuj wyjazd w jednym miejscu.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-emerald-50/82 sm:text-lg">
              HelpTravel to hybryda travelowego serwisu wydawniczego i planera: katalog kierunkow, praktyczne
              inspiracje, city breaki, cieple wyjazdy i flow prowadzacy do realnego wyszukiwania oraz partnerow zewnetrznych.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/planner?mode=discovery"
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                Zacznij planowanie
              </Link>
              <Link
                href="/inspiracje"
                className="rounded-full border border-white/15 bg-white/6 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/12"
              >
                Czytaj inspiracje
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/${category.slug}`}
                  className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/92 transition hover:bg-white/12"
                >
                  {category.title}
                </Link>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/8 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Kierunki</p>
                <p className="mt-2 text-3xl font-bold text-white">{destinationCount}</p>
                <p className="mt-1 text-sm text-white/74">stron kierunkowych z przewodnikami i przejsciem do planera.</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/8 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Artykuly</p>
                <p className="mt-2 text-3xl font-bold text-white">{articleCount}</p>
                <p className="mt-1 text-sm text-white/74">tresci scenariuszowych pod city breaki, cieplo i budzet.</p>
              </div>
            </div>
          </div>

          <div className="relative min-h-[22rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/20">
            <div className="absolute inset-0">
              <Image
                src={video.poster}
                alt="Podrozniczy klimat"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 40vw"
              />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,23,17,0.06)_0%,rgba(14,23,17,0.5)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="flex flex-wrap gap-2">
                {trustPoints.map((item) => (
                  <span
                    key={item}
                    className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {modes.map((mode) => (
          <article
            key={mode.title}
            className="rounded-[1.75rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_46px_rgba(16,84,48,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(16,84,48,0.12)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Tryby planowania</p>
            <h2 className="mt-3 text-3xl font-bold text-emerald-950">{mode.title}</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-emerald-900/78">{mode.description}</p>
            <Link
              href={mode.href}
              className="mt-5 inline-flex rounded-full bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition duration-200 hover:bg-emerald-200"
            >
              {mode.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Szybki start</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Najprostsze sciezki do klikniecia i dalszego czytania.</h2>
          </div>
          <Link href="/mapa-serwisu" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Otworz mape serwisu
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {starterRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="group rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(240,250,243,0.98),rgba(232,246,236,0.94))] p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-[0_22px_54px_rgba(16,84,48,0.12)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kliknij i przejdz</p>
              <h3 className="mt-3 text-2xl font-bold text-emerald-950">{route.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/78">{route.description}</p>
              <span className="mt-5 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-emerald-800">
                Otworz sekcje
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kierunki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Najmocniejsze destination huby na start</h2>
          </div>
          <Link href="/kierunki" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Zobacz wszystkie kierunki
          </Link>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {featuredDestinations.map((item) => (
            <DestinationGuideCard
              key={item.destination.slug}
              destination={item.destination}
              media={item.media}
              summary={item.story.summary}
            />
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Inspiracje i przewodniki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">
              Tresci, ktore wygladaja jak prawdziwy serwis travelowy.
            </h2>
          </div>
          <Link href="/inspiracje" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Wszystkie artykuly
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {featuredArticles.map((article) => (
            <EditorialArticleCard key={article.slug} article={article} compact />
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Ostatnie publikacje</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Serwis jest aktualizowany tresciowo, nie tylko technologicznie.</h2>
          </div>
          <Link href="/inspiracje" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Przejdz do biblioteki artykulow
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {latestArticles.map((article) => (
            <EditorialArticleCard key={article.slug} article={article} compact />
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dlaczego to wyglada wiarygodnie</p>
          <h2 className="mt-3 font-display text-4xl text-emerald-950">Serwis ma warstwe tresciowa, nie tylko formularz.</h2>
          <div className="mt-5 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Kierunki dostaja osobne strony z budzetem orientacyjnym, sekcjami praktycznymi, FAQ i linkowaniem do powiazanych tresci.</p>
            <p>Artykuly nie sa pustymi landingami. Kazdy scenariusz ma opis, praktyczne wskazowki, powiazane kierunki i przejscie do planera.</p>
            <p>Stopka, strony zaufania, disclosure, mapa serwisu i wewnetrzne linkowanie wzmacniaja obraz publicznego projektu travelowego.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_18px_50px_rgba(8,40,24,0.2)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Scenariusze dla afiliacji</p>
          <h2 className="mt-3 font-display text-4xl">Frazy, ktore naturalnie prowadza do decyzji wyjazdowej.</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              "cieple kraje bez wizy",
              "city break do 2000 zl",
              "gdzie poleciec zima z Polski",
              "kierunki z plaza i zwiedzaniem",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/88">
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Zaufanie i struktura</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Publiczne strony, ktore pokazuja ze to dojrzaly projekt travelowy.</h2>
          </div>
          <Link href="/dla-partnerow" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Zobacz informacje dla partnerow
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          {[
            {
              title: "Dla partnerow",
              text: "Publiczne wyjasnienie modelu dzialania projektu, warstwy contentowej i flow partnerskiego.",
              href: "/dla-partnerow",
            },
            {
              title: "Standard redakcyjny",
              text: "Opis tego, jak budowane sa przewodniki, artykuly i destination huby bez pustych landingow.",
              href: "/standard-redakcyjny",
            },
            {
              title: "Jak pracujemy",
              text: "Metodologia laczaca travel content, planner i przejscia do partnerow zewnetrznych.",
              href: "/jak-pracujemy",
            },
            {
              title: "Linki partnerskie",
              text: "Jawna informacja o przekierowaniach, mierzeniu klikniec i modelu afiliacyjnym.",
              href: "/linki-partnerskie",
            },
          ].map((item) => (
            <article key={item.title} className="rounded-[1.75rem] border border-emerald-900/10 bg-emerald-50/75 p-5">
              <h3 className="text-xl font-bold text-emerald-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.text}</p>
              <Link
                href={item.href}
                className="mt-5 inline-flex rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                Otworz strone
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Sciezki startowe</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Wejdz do serwisu od potrzeby, nie od losowej podstrony.</h2>
          </div>
          <Link href="/mapa-serwisu" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Otworz mape serwisu
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Najpierw czytam",
              text: "Dla osob, ktore chca najpierw zrozumiec kierunki, budzet i format wyjazdu przed kliknieciem w wyniki.",
              href: "/inspiracje",
              cta: "Przejdz do inspiracji",
            },
            {
              title: "Najpierw wybieram kierunek",
              text: "Dla osob, ktore porownuja konkretne miasta i chca wejsc w przewodnik, FAQ oraz dalsze wyszukiwanie.",
              href: "/kierunki",
              cta: "Przejdz do kierunkow",
            },
            {
              title: "Najpierw planuje",
              text: "Dla osob, ktore od razu chca przejsc do planera i zaczac od potrzeby zapisanej naturalnym jezykiem.",
              href: "/planner?mode=discovery",
              cta: "Uruchom planer",
            },
          ].map((item) => (
            <article key={item.title} className="rounded-[1.75rem] border border-emerald-900/10 bg-emerald-50/75 p-5">
              <h3 className="text-2xl font-bold text-emerald-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.text}</p>
              <Link
                href={item.href}
                className="mt-5 inline-flex rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                {item.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
