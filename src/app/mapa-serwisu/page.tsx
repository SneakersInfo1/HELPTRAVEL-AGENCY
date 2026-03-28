import type { Metadata } from "next";
import Link from "next/link";

import {
  getEditorialArticles,
  getEditorialCategories,
  getPublishedDestinations,
} from "@/lib/mvp/publisher-content";

export const metadata: Metadata = {
  title: "Mapa serwisu",
  description: "Przeglad najwazniejszych sekcji, kierunkow, przewodnikow i stron zaufania w HelpTravel Agency.",
};

export default function SiteMapPage() {
  const categories = getEditorialCategories();
  const destinations = getPublishedDestinations();
  const articles = getEditorialArticles();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Mapa serwisu</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Wszystkie najwazniejsze sekcje w jednym miejscu</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Ta strona pomaga przejsc przez glowna architekture serwisu: planer, kierunki, przewodniki, strony tematyczne
          oraz publiczne dokumenty. Jest przydatna dla czytelnikow, robotow wyszukiwarek i partnerow sprawdzajacych, czy
          projekt ma realna warstwe tresciowa.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Start i planer</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-emerald-900/78">
            <Link href="/" className="hover:text-emerald-700">Start</Link>
            <Link href="/planner" className="hover:text-emerald-700">Planer</Link>
            <Link href="/planner?mode=discovery" className="hover:text-emerald-700">Nie wiem dokad leciec</Link>
            <Link href="/planner?mode=standard" className="hover:text-emerald-700">Mam kierunek</Link>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Kategorie</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-emerald-900/78">
            {categories.map((category) => (
              <Link key={category.slug} href={`/${category.slug}`} className="hover:text-emerald-700">
                {category.title}
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Zaufanie</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-emerald-900/78">
            <Link href="/o-nas" className="hover:text-emerald-700">O nas</Link>
            <Link href="/kontakt" className="hover:text-emerald-700">Kontakt</Link>
            <Link href="/polityka-prywatnosci" className="hover:text-emerald-700">Polityka prywatnosci</Link>
            <Link href="/regulamin" className="hover:text-emerald-700">Regulamin</Link>
            <Link href="/linki-partnerskie" className="hover:text-emerald-700">Linki partnerskie</Link>
            <Link href="/dla-partnerow" className="hover:text-emerald-700">Dla partnerow</Link>
            <Link href="/standard-redakcyjny" className="hover:text-emerald-700">Standard redakcyjny</Link>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kierunki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Strony kierunkowe</h2>
          </div>
          <p className="text-sm text-emerald-900/68">{destinations.length} kierunkow</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((destination) => (
            <Link
              key={destination.slug}
              href={`/kierunki/${destination.slug}`}
              className="rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700"
            >
              {destination.city}, {destination.country}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Inspiracje</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Artykuly i scenariusze wyjazdow</h2>
          </div>
          <p className="text-sm text-emerald-900/68">{articles.length} artykulow</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/inspiracje/${article.slug}`}
              className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700"
            >
              {article.title}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
