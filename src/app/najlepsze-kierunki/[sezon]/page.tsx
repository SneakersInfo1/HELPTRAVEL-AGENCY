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

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: `Najlepsze kierunki na ${seasonInflected[sezon]}` },
          ]}
        />
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          {seasonHeading[sezon]}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">{seasonIntro[sezon]}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">Otwórz wyszukiwarkę hoteli</span>
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {seasonSlugs
            .filter((s) => s !== sezon)
            .map((s) => (
              <Link
                key={s}
                href={`/najlepsze-kierunki/${s}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1.5 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="font-semibold uppercase tracking-[0.12em] text-ink">Na {seasonInflected[s]}</span>
              </Link>
            ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {ranked.map((entry, index) => (
          <article
            key={entry.destination.slug}
            className="rounded-2xl border border-line bg-surface-raised p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-brand">#{index + 1}</span>
                <h2 className="font-display text-2xl text-ink">
                  <Link href={`/kierunki/${entry.destination.slug}`}>
                    <span className="transition hover:text-brand">{entry.destination.city}</span>
                  </Link>
                  <span className="ml-2 text-sm font-normal text-ink-muted">{entry.destination.country}</span>
                </h2>
              </div>
              <div className="flex gap-3 text-sm text-ink-muted">
                <span className="rounded-full bg-surface-sunken px-3 py-1.5">{entry.temp}°C średnio</span>
                <span className="rounded-full bg-surface-sunken px-3 py-1.5">
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
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    <span className="text-xs font-semibold text-ink">
                      {entry.destination.city} w {polishMonthInflected[monthSlug]} ({entry.destination.avgTempByMonth[monthIdx]}°C)
                    </span>
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="font-display text-3xl text-ink">Jak czytać ten ranking</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
          Pozycja w rankingu liczy się z trzech rzeczy: średnia temperatura w sezonie (komfort 22-28°C dostaje najwięcej punktów),
          dostępność lotów z Polski oraz indeks kosztów. Ranking ma orientować szybko, a finalną decyzję warto sprawdzić
          w wyszukiwarce hoteli i lotów — uwzględnia ona długość wyjazdu, budżet i preferencje stylu.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">Otwórz wyszukiwarkę hoteli</span>
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-5 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">Pełny katalog kierunków</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
