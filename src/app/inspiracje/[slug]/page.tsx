import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import {
  getDestinationGuideBySlug,
  getEditorialArticleBySlug,
  getEditorialArticles,
  getEditorialCategories,
  getRelatedArticles,
} from "@/lib/mvp/publisher-content";
import { curatedDestinations } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";

export const revalidate = 86400;

interface InspirationPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getEditorialArticles().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: InspirationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getEditorialArticleBySlug(slug);
  if (!article) {
    return {
      title: "Inspiracje",
      description: "Praktyczne treści o kierunkach i wyjazdach.",
    };
  }

  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical: `/inspiracje/${article.slug}`,
    },
    openGraph: {
      title: `${article.title} | HelpTravel`,
      description: article.description,
      url: `${getSiteUrl()}/inspiracje/${article.slug}`,
      type: "article",
    },
  };
}

export default async function InspirationPage({ params }: InspirationPageProps) {
  const { slug } = await params;
  const article = getEditorialArticleBySlug(slug);
  if (!article) notFound();

  const relatedArticles = getRelatedArticles(article, 3);
  const categoryLabels = getEditorialCategories()
    .filter((category) => article.categorySlugs.includes(category.slug))
    .map((category) => category.title)
    .slice(0, 3);
  const destinationCards = await Promise.all(
    article.destinationSlugs.map(async (destinationSlug) => {
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
  const heroDestination = destinationCards.find(Boolean);
  const heroImage = heroDestination?.media.heroImage ?? "/branding/helptravel-logo.svg";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.title,
        description: article.description,
        mainEntityOfPage: `${getSiteUrl()}/inspiracje/${article.slug}`,
        inLanguage: "pl-PL",
        articleSection: categoryLabels,
        keywords: [...article.categorySlugs, ...article.destinationSlugs].join(", "),
        about: article.destinationSlugs.map((destinationSlug) => destinationSlug.replace(/-/g, " ")),
      },
      {
        "@type": "FAQPage",
        mainEntity: article.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_20px_60px_rgba(16,84,48,0.08)]">
        <div className="relative h-[26rem]">
          <Image src={heroImage} alt={article.title} fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.16)_0%,rgba(5,18,11,0.76)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <Breadcrumbs
              items={[
                { label: "Start", href: "/" },
                { label: "Inspiracje", href: "/inspiracje" },
                { label: article.title },
              ]}
            />
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              Artykuł praktyczny
            </p>
            <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] sm:text-6xl">{article.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/86">{article.hero}</p>
          </div>
        </div>
      </section>

      <EditorialMetaBar
        eyebrow="Artykuł redakcyjny"
        title="Scenariusz wyjazdu przygotowany jako treść wydawnicza i punkt wejscia do planera"
        items={[...categoryLabels, `${article.destinationSlugs.length} powiazanych kierunków`]}
      />

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Wprowadzenie</p>
          <h2 className="mt-3 font-display text-4xl text-emerald-950">{article.excerpt}</h2>
          <p className="mt-4 text-base leading-8 text-emerald-900/78">{article.description}</p>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Jak wykorzystac ten scenariusz
          </p>
          <div className="mt-4 space-y-3">
            {article.practicalBullets.map((item) => (
              <div key={item} className="rounded-2xl bg-white px-4 py-3 text-sm leading-7 text-emerald-900/78">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5">
            <Link
              href={`/planner?mode=discovery&q=${encodeURIComponent(article.plannerPrompt)}`}
              className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              Uruchom planner dla tego scenariusza
            </Link>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {article.sections.map((section) => (
          <article
            key={section.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Sekcja praktyczna</p>
            <h2 className="mt-3 text-2xl font-bold text-emerald-950">{section.title}</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {section.bullets?.length ? (
              <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Polecane kierunki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">
              Miejsca, które najlepiej pasuja do tego tematu.
            </h2>
          </div>
          <Link href="/kierunki" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Zobacz wszystkie kierunki
          </Link>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {destinationCards.filter(Boolean).slice(0, 6).map((item) =>
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

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">FAQ</p>
          <div className="mt-5 space-y-4">
            {article.faq.map((item) => (
              <article key={item.question} className="rounded-2xl bg-emerald-50/75 px-4 py-4">
                <h3 className="text-base font-bold text-emerald-950">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/78">{item.answer}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-[0_20px_54px_rgba(8,40,24,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Nastepny krok</p>
          <h2 className="mt-3 font-display text-4xl">Przejdź z artykułu do konkretnego wyszukiwania.</h2>
          <p className="mt-4 text-sm leading-7 text-white/82">
            Artykuł daje kontekst i porzadkuje scenariusz, ale finalnie najważniejsze jest przejście do realnego planu:
            wybranych kierunków, lotów, noclegów i linkow partnerskich.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/planner?mode=discovery&q=${encodeURIComponent(article.plannerPrompt)}`}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
            >
              Uruchom planner
            </Link>
            <Link
              href="/planner?mode=standard"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Mam już kierunek
            </Link>
          </div>
        </article>
      </section>

      {relatedArticles.length > 0 ? (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Powiązane artykuły</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950">Czytaj dalej w podobnym temacie.</h2>
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {relatedArticles.map((item) => (
              <EditorialArticleCard key={item.slug} article={item} compact />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}


