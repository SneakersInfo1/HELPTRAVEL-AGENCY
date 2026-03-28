import type { Metadata } from "next";
import Link from "next/link";

import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { getEditorialArticles, getEditorialCategories } from "@/lib/mvp/publisher-content";

export const metadata: Metadata = {
  title: "Inspiracje",
  description: "Przewodniki, pomysly na wyjazdy, city breaki i praktyczne scenariusze dla polskiego odbiorcy.",
};

export default function InspirationsIndexPage() {
  const articles = getEditorialArticles();
  const categories = getEditorialCategories();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Warstwa wydawnicza</p>
        <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] text-emerald-950">
          Inspiracje, przewodniki i praktyczne tresci, ktore prowadza do realnego planu wyjazdu.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Serwis nie konczy sie na samym plannerze. Tutaj zbieramy konkretne scenariusze wyjazdow, porownania kierunkow i
          tresci z wysoka intencja, ktore mozna czytac jak dojrzaly serwis travelowy, a potem od razu przejsc do planowania.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-emerald-900/70">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{articles.length} artykulow praktycznych</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{categories.length} glowne kategorie tematyczne</span>
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

      <section className="grid gap-4 lg:grid-cols-2">
        {articles.map((article) => (
          <EditorialArticleCard key={article.slug} article={article} />
        ))}
      </section>
    </main>
  );
}
