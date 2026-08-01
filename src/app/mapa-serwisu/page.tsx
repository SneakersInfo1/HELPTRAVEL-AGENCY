import type { Metadata } from "next";
import Link from "next/link";

import {
  getEditorialArticles,
  getEditorialCategories,
  getPublishedDestinations,
} from "@/lib/mvp/publisher-content";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";

export const metadata: Metadata = {
  title: "Mapa serwisu",
  description: "Przeglad najwazniejszych sekcji, kierunków, przewodników i stron zaufania w HelpTravel.",
  alternates: {
    canonical: "/mapa-serwisu",
  },
  openGraph: {
    title: "Mapa serwisu - HelpTravel",
    description: "Najważniejsze sekcje, katalog kierunków, przewodniki i strony zaufania w jednym miejscu.",
    url: "/mapa-serwisu",
    type: "website",
  },
};

export default function SiteMapPage() {
  const categories = getEditorialCategories();
  const featuredDestinations = getPublishedDestinations();
  const destinations = getAllDestinationProfiles();
  const articles = getEditorialArticles();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h1 className="mt-3 font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">Wszystkie najważniejsze sekcje w jednym miejscu</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">
          Ta strona pomaga szybko znaleźć planner, katalog kierunków, poradniki i strony zaufania. Przydaje się wtedy,
          gdy chcesz przejść do konkretnej sekcji bez szukania po całym serwisie.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-ink">Start i planner</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-ink-muted">
            <Link href="/" className="group"><span className="transition group-hover:text-brand">Start</span></Link>
          <Link href="/hotele/szukaj" className="group"><span className="transition group-hover:text-brand">Wyszukiwarka hoteli</span></Link>
          <Link href="/kierunki" className="group"><span className="transition group-hover:text-brand">Mam kierunek</span></Link>
            <Link href="/kierunki" className="group"><span className="transition group-hover:text-brand">Katalog kierunków</span></Link>
            <Link href="/inspiracje" className="group"><span className="transition group-hover:text-brand">Pomysły na wyjazd</span></Link>
          </div>
        </article>

        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-ink">Kategorie</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-ink-muted">
            {categories.map((category) => (
              <Link key={category.slug} href={`/${category.slug}`} className="group">
                <span className="transition group-hover:text-brand">{category.title}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-ink">Zaufanie</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-ink-muted">
            <Link href="/o-nas" className="group"><span className="transition group-hover:text-brand">O serwisie</span></Link>
            <Link href="/oferta" className="group"><span className="transition group-hover:text-brand">Oferta</span></Link>
            <Link href="/faq" className="group"><span className="transition group-hover:text-brand">FAQ</span></Link>
            <Link href="/cennik" className="group"><span className="transition group-hover:text-brand">Cennik</span></Link>
            <Link href="/polityka-prywatnosci" className="group"><span className="transition group-hover:text-brand">Polityka prywatnosci</span></Link>
            <Link href="/regulamin" className="group"><span className="transition group-hover:text-brand">Regulamin</span></Link>
            <Link href="/dla-partnerow" className="group"><span className="transition group-hover:text-brand">Dla partnerów</span></Link>
            <Link href="/standard-redakcyjny" className="group"><span className="transition group-hover:text-brand">Standard redakcyjny</span></Link>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mt-2 font-display text-4xl text-ink">Strony kierunkowe</h2>
          </div>
          <p className="text-sm text-ink-muted">{destinations.length} kierunków</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featuredDestinations.map((destination) => (
            <Link
              key={destination.slug}
              href={`/kierunki/${destination.slug}`}
              className="group inline-flex min-h-11 items-center justify-center rounded-2xl bg-surface-raised px-4 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm text-ink-muted transition group-hover:text-brand">
                {destination.city}, {destination.country}
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-line bg-white/80 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Pełny katalog</p>
              <h3 className="mt-2 text-2xl font-bold text-ink">Dodatkowe strony kierunkowe do odkrywania i porównywania</h3>
            </div>
            <Link href="/kierunki" className="group text-sm font-semibold">
              <span className="text-ink transition group-hover:text-brand">Otwórz katalog 200+</span>
            </Link>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {destinations.map((destination) => (
              <Link
                key={`all-${destination.slug}`}
                href={`/kierunki/${destination.slug}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1.5 transition duration-150 ease-out hover:border-brand hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-xs font-semibold text-ink">{destination.city}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mt-2 font-display text-4xl text-ink">Artykuły i scenariusze wyjazdów</h2>
          </div>
          <p className="text-sm text-ink-muted">{articles.length} artykułów</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/inspiracje/${article.slug}`}
              className="group inline-flex min-h-11 items-center justify-center rounded-2xl bg-surface-sunken px-4 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm text-ink-muted transition group-hover:text-brand">{article.title}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
