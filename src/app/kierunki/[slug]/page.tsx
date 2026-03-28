import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import {
  getArticlesForDestination,
  getDestinationGuideBySlug,
  getPublishedDestinationSlugs,
  getSimilarDestinations,
} from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";

interface DestinationGuidePageProps {
  params: Promise<{ slug: string }>;
}

function estimateBudget(costIndex: number, flightHours: number) {
  const days = 4;
  const travelers = 2;
  const flightBasePerPerson = 380 + flightHours * 70;
  const stayAndFoodPerDayPerPerson = 170 * costIndex;
  const localTransportAndTickets = 65 * costIndex;
  const total =
    travelers * flightBasePerPerson +
    travelers * days * stayAndFoodPerDayPerPerson +
    days * localTransportAndTickets;

  return {
    min: Math.round(total * 0.9),
    max: Math.round(total * 1.18),
  };
}

function bestMonthsFromTemperatures(temperatures: number[]) {
  const comfortableMonths = temperatures
    .map((temp, index) => ({ temp, index }))
    .filter((item) => item.temp >= 20 && item.temp <= 30)
    .slice(0, 6)
    .map((item) => item.index + 1);

  return comfortableMonths;
}

const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "long" });

function monthLabel(month: number) {
  return monthFormatter.format(new Date(Date.UTC(2026, month - 1, 1)));
}

export async function generateStaticParams() {
  return getPublishedDestinationSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DestinationGuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) {
    return {
      title: "Kierunek",
      description: "Praktyczny przewodnik po kierunku i przejscie do planera.",
    };
  }

  return {
    title: `${guide.destination.city} - przewodnik`,
    description: guide.overview,
    alternates: {
      canonical: `/kierunki/${guide.destination.slug}`,
    },
    openGraph: {
      title: `${guide.destination.city} - przewodnik HelpTravel Agency`,
      description: guide.overview,
      url: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
    },
  };
}

export default async function DestinationGuidePage({ params }: DestinationGuidePageProps) {
  const { slug } = await params;
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) notFound();

  const media = await resolveDestinationMedia(guide.destination);
  const story = getDestinationStory({ ...guide.destination, media });
  const relatedArticles = getArticlesForDestination(slug).slice(0, 4);
  const similarDestinations = await Promise.all(
    getSimilarDestinations(slug, 4).map(async (destination) => ({
      destination,
      guide: getDestinationGuideBySlug(destination.slug),
      media: await resolveDestinationMedia(destination),
    })),
  );
  const budget = estimateBudget(guide.destination.costIndex, guide.destination.typicalFlightHoursFromPL);
  const bestMonths = bestMonthsFromTemperatures(guide.destination.avgTempByMonth);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${getSiteUrl()}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${getSiteUrl()}/kierunki` },
          {
            "@type": "ListItem",
            position: 3,
            name: guide.destination.city,
            item: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: guide.faq.map((item) => ({
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
          <Image src={media.heroImage} alt={`${guide.destination.city}, ${guide.destination.country}`} fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.12)_0%,rgba(5,18,11,0.72)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <Breadcrumbs
              items={[
                { label: "Start", href: "/" },
                { label: "Kierunki", href: "/kierunki" },
                { label: guide.destination.city },
              ]}
            />
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              Kierunek dla polskiego odbiorcy
            </p>
            <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] sm:text-6xl">{guide.destination.city}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/86">{guide.overview}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {story.bestFor.slice(0, 4).map((item) => (
                <span key={item} className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <EditorialMetaBar
        eyebrow="Sygnał redakcyjny"
        title="Przewodnik kierunkowy przygotowany pod realne planowanie wyjazdu"
        items={[
          `${guide.destination.city} z Polski`,
          `${guide.destination.typicalFlightHoursFromPL.toFixed(1)} h lotu`,
          "plan 3-5 dni",
          "linkowanie do planera",
        ]}
      />

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dlaczego warto</p>
          <h2 className="mt-3 font-display text-4xl text-emerald-950">Mocne strony kierunku</h2>
          <div className="mt-5 space-y-3">
            {guide.whyGo.map((reason) => (
              <div key={reason} className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm leading-7 text-emerald-900">
                {reason}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(225,243,231,0.9))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Praktyczne podstawy</p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Najlepszy czas</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">{guide.bestTime}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Orientacyjny budzet</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">
                Dla 2 osob na 4 dni zwykle warto liczyc okolice {budget.min}-{budget.max} PLN. To orientacyjny zakres
                planistyczny, a nie cena gwarantowana.
              </p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Dojazd i klimat</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">
                Lot z Polski zwykle zajmuje okolo {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h. Kierunek
                najlepiej wyglada zwykle w miesiacach: {bestMonths.slice(0, 4).map(monthLabel).join(", ")}.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Co zobaczyc</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {guide.highlights.map((item) => (
              <li key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dzielnice i okolice</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {guide.districts.map((item) => (
              <li key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dla kogo</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {guide.whoFor.map((item) => (
              <span
                key={item}
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-900"
              >
                {item}
              </span>
            ))}
          </div>
          <p className="mt-5 text-sm leading-7 text-emerald-900/78">{guide.budgetNote}</p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pomysl na 3-5 dni</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Przykladowy rytm wyjazdu</h2>
          </div>
          <Link
            href={`/planner?mode=standard&q=${encodeURIComponent(guide.destination.city)}`}
            className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            Sprawdz ten kierunek w plannerze
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {story.miniPlan.map((item) => (
            <article key={`${item.day}-${item.title}`} className="rounded-[1.75rem] border border-emerald-900/8 bg-emerald-50/75 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dzien {item.day}</p>
              <h3 className="mt-2 text-xl font-bold text-emerald-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">FAQ</p>
          <div className="mt-5 space-y-4">
            {guide.faq.map((item) => (
              <article key={item.question} className="rounded-2xl bg-emerald-50/75 px-4 py-4">
                <h3 className="text-base font-bold text-emerald-950">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/78">{item.answer}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-[0_20px_54px_rgba(8,40,24,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Powiazane oferty i planner</p>
          <h2 className="mt-3 font-display text-4xl">Przejdz z przewodnika do konkretnego planu wyjazdu.</h2>
          <p className="mt-4 text-sm leading-7 text-white/82">
            To miejsce ma juz warstwe tresciowa, ale kolejny krok to realny wynik: loty, noclegi, atrakcje i kontekst
            pod ten konkretny kierunek.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/planner?mode=standard&q=${encodeURIComponent(guide.destination.city)}`}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
            >
              Uruchom planner dla {guide.destination.city}
            </Link>
            <Link
              href="/planner?mode=discovery"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Nie wiem dokad leciec
            </Link>
          </div>
        </article>
      </section>

      {relatedArticles.length > 0 ? (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Powiazane artykuly</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950">Przydatne tresci wokol tego kierunku</h2>
            </div>
            <Link href="/inspiracje" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
              Wszystkie inspiracje
            </Link>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {relatedArticles.map((article) => (
              <EditorialArticleCard key={article.slug} article={article} compact />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Podobne kierunki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Jesli ten kierunek pasuje, sprawdz tez te opcje.</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {similarDestinations.map((item) =>
            item.guide ? (
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
    </main>
  );
}
