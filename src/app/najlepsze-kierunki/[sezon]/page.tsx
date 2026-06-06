import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  polishMonthInflected,
  polishMonthSlugs,
  seasonInflected,
  seasonMonthIndexes,
  seasonSlugs,
  type Season,
} from "@/lib/mvp/months";
import { getSiteUrl } from "@/lib/mvp/site";

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ sezon: string }>;
}

export async function generateStaticParams() {
  return seasonSlugs.map((sezon) => ({ sezon }));
}

function isSeason(value: string): value is Season {
  return (seasonSlugs as readonly string[]).includes(value);
}

function avgSeasonalTemp(temps: number[], months: number[]) {
  return months.reduce((sum, m) => sum + temps[m], 0) / months.length;
}

const seasonIntro: Record<Season, string> = {
  wiosna:
    "Wiosna to najlepszy moment na cieplejsze miasta południa Europy bez letnich tłumów i przed wzrostem cen sezonowych.",
  lato:
    "Latem szukamy klimatu plażowego i komfortowej temperatury, ale rezerwujemy z wyprzedzeniem — to pełnia sezonu.",
  jesien:
    "Jesień daje ciepłe kierunki z drugiego rzędu i krótkie wyjazdy bez letnich kolejek, często za rozsądne pieniądze.",
  zima:
    "Zima to czas na ucieczki w ciepło (południowa Hiszpania, Wyspy Kanaryjskie) lub atmosferyczne city breaki w Europie.",
};

const seasonHeading: Record<Season, string> = {
  wiosna: "Najlepsze kierunki na wiosnę 2026 — ranking pod krótki wyjazd",
  lato: "Najlepsze kierunki na lato 2026 — gdzie ciepło i sensownie",
  jesien: "Najlepsze kierunki na jesień 2026 — ciepła pogoda, mniej tłumów",
  zima: "Najlepsze kierunki na zimę 2026 — ciepłe ucieczki i city break",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sezon } = await params;
  if (!isSeason(sezon)) return { title: "Najlepsze kierunki" };
  return {
    title: seasonHeading[sezon],
    description: `Ranking kierunków na ${seasonInflected[sezon]} — pogoda, koszty i charakter wyjazdu. Praktyczna lista pod decyzję city break i krótki urlop z Polski.`,
    alternates: { canonical: `/najlepsze-kierunki/${sezon}` },
    openGraph: {
      title: seasonHeading[sezon],
      description: `Praktyczny ranking destynacji na ${seasonInflected[sezon]} oparty o realne dane pogodowe i kosztowe.`,
      url: `${getSiteUrl()}/najlepsze-kierunki/${sezon}`,
      type: "article",
    },
  };
}

export default async function SeasonRankingPage({ params }: PageProps) {
  const { sezon } = await params;
  if (!isSeason(sezon)) notFound();

  const months = seasonMonthIndexes[sezon];
  const all = getAllDestinationProfiles();
  const ranked = all
    .map((destination) => {
      const temp = avgSeasonalTemp(destination.avgTempByMonth, months);
      // Score: temperatura w komfortowym przedziale 18-28 + access + value
      const tempScore =
        temp >= 22 && temp <= 28
          ? 1
          : temp >= 18 && temp < 22
            ? 0.85
            : temp > 28 && temp <= 31
              ? 0.75
              : temp >= 14 && temp < 18
                ? 0.6
                : 0.3;
      const accessScore = destination.accessScore ?? 0.7;
      const valueScore = 1 / Math.max(0.6, destination.costIndex);
      const composite = tempScore * 0.6 + accessScore * 0.25 + valueScore * 0.15;
      return { destination, temp: Math.round(temp), composite };
    })
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 12);

  const baseUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: seasonHeading[sezon],
        description: seasonIntro[sezon],
        url: `${baseUrl}/najlepsze-kierunki/${sezon}`,
        inLanguage: "pl-PL",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: `Najlepsze kierunki na ${seasonInflected[sezon]}`,
            item: `${baseUrl}/najlepsze-kierunki/${sezon}`,
          },
        ],
      },
      {
        "@type": "ItemList",
        name: seasonHeading[sezon],
        itemListElement: ranked.map((entry, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${baseUrl}/kierunki/${entry.destination.slug}`,
          name: `${entry.destination.city}, ${entry.destination.country}`,
        })),
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)]">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: `Najlepsze kierunki na ${seasonInflected[sezon]}` },
          ]}
        />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Ranking sezonowy
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-emerald-950 sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          {seasonHeading[sezon]}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">{seasonIntro[sezon]}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            Otwórz wyszukiwarkę hoteli →
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {seasonSlugs
            .filter((s) => s !== sezon)
            .map((s) => (
              <Link
                key={s}
                href={`/najlepsze-kierunki/${s}`}
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 font-semibold uppercase tracking-[0.12em] text-emerald-900 transition hover:bg-emerald-100"
              >
                Na {seasonInflected[s]}
              </Link>
            ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {ranked.map((entry, index) => (
          <article
            key={entry.destination.slug}
            className="rounded-[1.6rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_12px_32px_rgba(16,84,48,0.05)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-emerald-700">#{index + 1}</span>
                <h2 className="font-display text-2xl text-emerald-950">
                  <Link href={`/kierunki/${entry.destination.slug}`} className="hover:text-emerald-700">
                    {entry.destination.city}
                  </Link>
                  <span className="ml-2 text-sm font-normal text-emerald-900/70">{entry.destination.country}</span>
                </h2>
              </div>
              <div className="flex gap-3 text-sm text-emerald-900/80">
                <span className="rounded-full bg-emerald-50 px-3 py-1.5">{entry.temp}°C średnio</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5">
                  Lot ~{entry.destination.typicalFlightHoursFromPL}h
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {months.map((monthIdx) => {
                const monthSlug = polishMonthSlugs[monthIdx];
                return (
                  <Link
                    key={monthIdx}
                    href={`/kierunki/${entry.destination.slug}/${monthSlug}`}
                    className="rounded-full border border-emerald-900/10 bg-emerald-50/72 px-3 py-1 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                  >
                    {entry.destination.city} w {polishMonthInflected[monthSlug]} ({entry.destination.avgTempByMonth[monthIdx]}°C)
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="font-display text-3xl text-emerald-950">Jak czytać ten ranking</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-900/72">
          Pozycja w rankingu liczy się z trzech rzeczy: średnia temperatura w sezonie (komfort 22-28°C dostaje najwięcej punktów),
          dostępność lotów z Polski oraz indeks kosztów. Ranking ma orientować szybko, a finalną decyzję warto sprawdzić
          w wyszukiwarce hoteli i lotów — uwzględnia ona długość wyjazdu, budżet i preferencje stylu.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            Otwórz wyszukiwarkę hoteli →
          </Link>
          <Link
            href="/kierunki"
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            Pełny katalog kierunków
          </Link>
        </div>
      </section>
    </main>
  );
}
