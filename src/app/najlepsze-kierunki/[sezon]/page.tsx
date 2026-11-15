import { serializeJsonLd } from "@/lib/seo/jsonld-serialize";
import type { Metadata } from "next";
import { completeSocial } from "@/lib/seo/social-meta";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { ClimateSourceLine } from "@/components/editorial/climate-source-line";
import { formatClimateNumber } from "@/lib/mvp/climate-normals";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  inMonthPhrase,
  polishMonthSlugs,
  seasonInflected,
  seasonMonthIndexes,
  seasonSlugs,
  type Season,
} from "@/lib/mvp/months";
import { getSiteUrl } from "@/lib/mvp/site";
import type { DestinationProfile } from "@/lib/mvp/types";
import {
  exactFlightHours,
  getDestinationSeoFacts,
  type DestinationSeoFacts,
  type TemperatureFact,
} from "@/lib/seo/destination-facts";
import { seasonPageHeading } from "@/lib/seo/page-titles";

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

function avgSeasonalDaytimeMax(temps: readonly number[], months: number[]) {
  return months.reduce((sum, m) => sum + temps[m], 0) / months.length;
}

type RankingCandidate = {
  destination: DestinationProfile;
  facts: DestinationSeoFacts & { temperature: TemperatureFact };
};

// Ranking korzysta wyłącznie z oficjalnych norm WMO WWIS. Kierunki bez normy
// oraz kierunki w Polsce nie trafiają do rankingu.
function rankingCandidates(): RankingCandidate[] {
  return getAllDestinationProfiles()
    .map((destination) => ({ destination, facts: getDestinationSeoFacts(destination) }))
    .filter((entry): entry is RankingCandidate => entry.facts.temperature !== null && !entry.facts.isDomestic);
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

// Nagłówek i tytuł: seasonPageHeading() z lib/seo/page-titles.ts. Do 2026-09
// stał tu rok wpisany na sztywno — „na wiosnę 2026" także we wrześniu 2026.

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sezon } = await params;
  if (!isSeason(sezon)) return { title: "Najlepsze kierunki" };
  return completeSocial({
    title: seasonPageHeading(sezon),
    description: `Ranking kierunków na ${seasonInflected[sezon]} z normami WMO: średnie maksymalne temperatury w dzień, dolot i charakter wyjazdu.`,
    alternates: { canonical: `/najlepsze-kierunki/${sezon}` },
    openGraph: {
      title: seasonPageHeading(sezon),
      // Do 2026-09: „oparty o realne dane pogodowe i kosztowe" — przy temperaturach z szablonu regionu.
      description: `Ranking kierunków na ${seasonInflected[sezon]}: normy WMO, dostępność lotów z Polski i redakcyjny indeks kosztów.`,
      url: `${getSiteUrl()}/najlepsze-kierunki/${sezon}`,
      type: "article",
    },
  }, { ownImage: true });
}

export default async function SeasonRankingPage({ params }: PageProps) {
  const { sezon } = await params;
  if (!isSeason(sezon)) notFound();

  const months = seasonMonthIndexes[sezon];
  const ranked = rankingCandidates()
    .map(({ destination, facts }) => {
      const temp = avgSeasonalDaytimeMax(facts.temperature.byMonth, months);
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
      return { destination, facts, temp, composite };
    })
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 12);

  const baseUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: seasonPageHeading(sezon),
        description: seasonIntro[sezon],
        url: `${baseUrl}/najlepsze-kierunki/${sezon}`,
        inLanguage: "pl-PL",
        // Ranking liczony z danych serwisu, więc autorem jest serwis, a nie osoba
        // (tak jak na /inspiracje/[slug]). Bez tych pól węzeł był niekompletny.
        author: { "@type": "Organization", "@id": `${baseUrl}/#organization`, name: "HelpTravel" },
        publisher: { "@id": `${baseUrl}/#organization` },
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
        name: seasonPageHeading(sezon),
        itemListElement: ranked.map((entry, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${baseUrl}/kierunki/${entry.destination.slug}`,
          name: `${entry.facts.name}, ${entry.facts.countryName}`,
        })),
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: `Najlepsze kierunki na ${seasonInflected[sezon]}` },
          ]}
        />
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          {seasonPageHeading(sezon)}
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
        {ranked.map((entry, index) => {
          const flightHours = exactFlightHours(entry.facts);
          return (
            <article
              key={entry.destination.slug}
              className="rounded-2xl border border-line bg-surface-raised p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-brand">#{index + 1}</span>
                  <h2 className="font-display text-2xl text-ink">
                    <Link href={`/kierunki/${entry.destination.slug}`}>
                      <span className="transition hover:text-brand">{entry.facts.name}</span>
                    </Link>
                    <span className="ml-2 text-sm font-normal text-ink-muted">{entry.facts.countryName}</span>
                  </h2>
                </div>
                <div className="flex gap-3 text-sm text-ink-muted">
                  <span className="rounded-full bg-surface-sunken px-3 py-1.5">
                    {formatClimateNumber(entry.temp)}°C — średnia maksimów w dzień
                  </span>
                  {flightHours !== null && (
                    <span className="rounded-full bg-surface-sunken px-3 py-1.5">Lot ~{flightHours}h</span>
                  )}
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
                        {entry.facts.name} {inMonthPhrase(monthSlug)} (maks. w dzień {formatClimateNumber(entry.facts.temperature.byMonth[monthIdx])}°C)
                      </span>
                    </Link>
                  );
                })}
              </div>
              <ClimateSourceLine source={entry.facts.temperature.source} className="mt-3 text-xs leading-6 text-ink-muted" />
            </article>
          );
        })}
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="font-display text-3xl text-ink">Jak czytać ten ranking</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
          Pozycja w rankingu liczy się z trzech rzeczy: średnia z miesięcznych temperatur maksymalnych w dzień (przedział 22–28°C dostaje najwięcej punktów),
          dostępność lotów z Polski oraz indeks kosztów. Ranking obejmuje wyłącznie kierunki z oficjalnymi normami WMO WWIS —
          bez nich pozycja byłaby zgadywaniem. Finalną decyzję warto sprawdzić w wyszukiwarce hoteli i lotów —
          uwzględnia ona długość wyjazdu, budżet i preferencje stylu.
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
