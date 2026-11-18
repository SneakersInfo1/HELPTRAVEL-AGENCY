import { serializeJsonLd } from "@/lib/seo/jsonld-serialize";
import type { Metadata } from "next";
import { completeSocial } from "@/lib/seo/social-meta";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { ClimateSourceLine } from "@/components/editorial/climate-source-line";
import { formatClimateNumber } from "@/lib/mvp/climate-normals";
import {
  inMonthPhrase,
  polishMonthSlugs,
  seasonInflected,
  seasonMonthIndexes,
  seasonSlugs,
  type Season,
} from "@/lib/mvp/months";
import { getSiteUrl } from "@/lib/mvp/site";
import { seasonPageHeading } from "@/lib/seo/page-titles";
import {
  buildSeasonList,
  seasonListDescription,
  seasonListIntro,
} from "@/lib/seo/season-page-model";

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

// Nagłówek i tytuł: seasonPageHeading() z lib/seo/page-titles.ts. Do 2026-09
// stał tu rok wpisany na sztywno — „na wiosnę 2026" także we wrześniu 2026.

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sezon } = await params;
  if (!isSeason(sezon)) return { title: "Kierunki sezonowe" };
  const description = seasonListDescription(sezon);
  return completeSocial({
    title: seasonPageHeading(sezon),
    description,
    alternates: { canonical: `/najlepsze-kierunki/${sezon}` },
    openGraph: {
      title: seasonPageHeading(sezon),
      description,
      url: `${getSiteUrl()}/najlepsze-kierunki/${sezon}`,
      type: "article",
    },
  }, { ownImage: true });
}

export default async function SeasonListPage({ params }: PageProps) {
  const { sezon } = await params;
  if (!isSeason(sezon)) notFound();

  const months = seasonMonthIndexes[sezon];
  const entries = buildSeasonList(sezon);
  const intro = seasonListIntro(sezon);

  const baseUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: seasonPageHeading(sezon),
        description: intro,
        url: `${baseUrl}/najlepsze-kierunki/${sezon}`,
        inLanguage: "pl-PL",
        // Lista liczona z danych serwisu, więc autorem jest serwis, a nie osoba
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
            name: seasonPageHeading(sezon),
            item: `${baseUrl}/najlepsze-kierunki/${sezon}`,
          },
        ],
      },
      {
        "@type": "ItemList",
        name: seasonPageHeading(sezon),
        itemListElement: entries.map((entry, index) => ({
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
            { label: seasonPageHeading(sezon) },
          ]}
        />
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          {seasonPageHeading(sezon)}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">{intro}</p>
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
        {entries.length > 0 ? (
          entries.map((entry) => (
            <article
              key={entry.destination.slug}
              className="rounded-2xl border border-line bg-surface-raised p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="font-display text-2xl text-ink">
                    <Link href={`/kierunki/${entry.destination.slug}`}>
                      <span className="transition hover:text-brand">{entry.facts.name}</span>
                    </Link>
                    <span className="ml-2 text-sm font-normal text-ink-muted">{entry.facts.countryName}</span>
                  </h2>
                </div>
                <div className="flex gap-3 text-sm text-ink-muted">
                  <span className="rounded-full bg-surface-sunken px-3 py-1.5">
                    {formatClimateNumber(entry.averageDaytimeMaxC)}°C — średnia maksimów w dzień
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
                        {entry.facts.name} {inMonthPhrase(monthSlug)} (maks. w dzień {formatClimateNumber(entry.facts.temperature.byMonth[monthIdx])}°C)
                      </span>
                    </Link>
                  );
                })}
              </div>
              <ClimateSourceLine source={entry.facts.temperature.source} className="mt-3 text-xs leading-6 text-ink-muted" />
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-line bg-surface-raised p-5 text-base leading-7 text-ink-muted">
            W tej porze roku żaden kierunek z dostępną normą WMO nie mieści się w przedziale 22–28°C.
          </p>
        )}
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="font-display text-3xl text-ink">Jak czytać tę listę</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
          Na liście są wyłącznie kierunki z oficjalną normą WMO WWIS, w których średnia z miesięcznych średnich maksimów w dzień mieści się w przedziale 22–28°C.
          Kolejność jest alfabetyczna, nie według temperatury. Poszczególne normy pochodzą z różnych okresów referencyjnych, dlatego przy każdym kierunku podajemy jego własne źródło i okres.
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
