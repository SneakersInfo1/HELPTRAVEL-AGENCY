import type { Metadata } from "next";
import Script from "next/script";

import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { LocalizedLink } from "@/components/site/localized-link";
import { getDestinationCatalogByRegion } from "@/lib/mvp/destination-catalog";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { getDestinationGuideBySlug, getEditorialCategories, getPublishedDestinations } from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import { type SiteLocale } from "@/lib/mvp/locale";

const pageCopy = {
  pl: {
    title: "Kierunki",
    description:
      "Katalog 200+ kierunkow pod city break, cieple wyjazdy i praktyczne planowanie z Polski: opisy, budzety, atrakcje i przejscie do planera.",
    ogDescription:
      "Katalog 200+ kierunkow pod city break i krotkie wyjazdy z Polski. Praktyczne opisy, FAQ i przejscie do planera.",
    eyebrow: "Katalog kierunkow",
    heading: "Kierunki, ktore realnie nadaja sie na city break, krotki urlop i wyjazdy z Polski.",
    intro:
      "Kazdy kierunek ma swoja strone z praktycznym opisem, sekcjami pod SEO, lokalnym kontekstem i prostym przejsciem do planera. To nie jest lista miast bez tresci, tylko warstwa wydawnicza z realnym sensem dla uzytkownika i skalowalnym katalogiem 200+ destynacji.",
    enriched: "rozbudowanych hubow redakcyjnych",
    supported: "wspieranych destynacji",
    entryPoints: "punktow wejscia tematycznego",
    metaEyebrow: "Warstwa publishera",
    metaTitle: "Katalog kierunkow budowany jako indeksowalny hub z przejsciem do planera",
    metaItem: "tresci dla polskiego odbiorcy",
    thematicPaths: "sciezek tematycznych",
    fullCatalogEyebrow: "Pelny katalog",
    fullCatalogTitle: "Pomysly na wyjazdy pogrupowane regionalnie",
    fullCatalogBody:
      "Featured hubs sa najbardziej dopracowane redakcyjnie, ale planner i wyszukiwarka pracuja juz na szerszym katalogu. To daje wiecej punktow wejscia bez gubienia jakosci decyzji.",
    destinationsCount: "kierunkow",
  },
  en: {
    title: "Destinations",
    description:
      "A catalog of 200+ destinations for city breaks, warm escapes and practical short-trip planning from Poland: guides, budgets, highlights and planner entry points.",
    ogDescription:
      "Browse 200+ destinations for short leisure trips from Poland, with practical guides, FAQs and direct transitions into the planner.",
    eyebrow: "Destination catalog",
    heading: "Destinations that genuinely work for city breaks, short escapes and practical trips from Poland.",
    intro:
      "Each destination has its own practical guide, decision-focused sections, local context and a clear transition into the planner. This is not a thin list of cities but a scalable publishing layer built around real travel choices.",
    enriched: "editorially strengthened hubs",
    supported: "supported destinations",
    entryPoints: "thematic entry points",
    metaEyebrow: "Publisher layer",
    metaTitle: "A destination catalog built as an indexable hub with a planner transition",
    metaItem: "content for short-leisure travel decisions",
    thematicPaths: "thematic paths",
    fullCatalogEyebrow: "Full catalog",
    fullCatalogTitle: "Trip ideas grouped by region",
    fullCatalogBody:
      "Featured hubs are the most editorially developed, but the planner and discovery stack already work on a broader destination universe. That creates more entry points without sacrificing decision quality.",
    destinationsCount: "destinations",
  },
} as const;

export function getDestinationsIndexMetadata(locale: SiteLocale): Metadata {
  const text = pageCopy[locale];

  return {
    title: text.title,
    description: text.description,
    alternates: {
      canonical: locale === "en" ? "/en/kierunki" : "/kierunki",
      languages: {
        "pl-PL": "/kierunki",
        "en-US": "/en/kierunki",
      },
    },
    openGraph: {
      title: `${text.title} - HelpTravel`,
      description: text.ogDescription,
      url: `${getSiteUrl()}${locale === "en" ? "/en/kierunki" : "/kierunki"}`,
      type: "website",
    },
  };
}

export const metadata: Metadata = getDestinationsIndexMetadata("pl");

export async function DestinationsIndexPageView({ locale }: { locale: SiteLocale }) {
  const text = pageCopy[locale];
  const destinations = getPublishedDestinations();
  const allDestinations = getAllDestinationProfiles();
  const categories = getEditorialCategories();
  const regionGroups = getDestinationCatalogByRegion().slice(0, 8);
  const profileSlugByLocation = new Map(
    allDestinations.map((destination) => [`${destination.city}|${destination.country}`, destination.slug]),
  );
  const cards = await Promise.all(
    destinations.map(async (destination) => ({
      destination,
      guide: getDestinationGuideBySlug(destination.slug),
      media: await resolveDestinationMedia(destination),
    })),
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: text.title,
        description: text.description,
        url: `${getSiteUrl()}${locale === "en" ? "/en/kierunki" : "/kierunki"}`,
        inLanguage: locale === "en" ? "en-US" : "pl-PL",
      },
      {
        "@type": "ItemList",
        itemListElement: cards
          .filter((item) => item.guide)
          .map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${getSiteUrl()}/kierunki/${item.destination.slug}`,
            name: item.destination.city,
          })),
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <Script id="destinations-index-jsonld" type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.eyebrow}</p>
        <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] text-emerald-950">
          {text.heading}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">{text.intro}</p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-emerald-900/70">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{destinations.length} {text.enriched}</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{allDestinations.length}+ {text.supported}</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{categories.length} {text.entryPoints}</span>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <LocalizedLink
              key={category.slug}
              href={`/${category.slug}`}
              locale={locale}
              className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900 transition hover:bg-emerald-100"
            >
              {category.title}
            </LocalizedLink>
          ))}
        </div>
      </section>

      <EditorialMetaBar
        eyebrow={text.metaEyebrow}
        title={text.metaTitle}
        items={[`${allDestinations.length}+ ${text.destinationsCount}`, `${categories.length} ${text.thematicPaths}`, text.metaItem]}
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {cards.map((item) =>
          item.guide ? (
            <DestinationGuideCard
              key={item.destination.slug}
              destination={item.destination}
              media={item.media}
              summary={item.guide.overview}
              locale={locale}
            />
          ) : null,
        )}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.fullCatalogEyebrow}</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">{text.fullCatalogTitle}</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-emerald-900/72">
            {text.fullCatalogBody}
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {regionGroups.map((group) => (
            <article key={group.region} className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/72 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-emerald-950">{group.region}</h3>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900">
                  {group.items.length} {text.destinationsCount}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.slice(0, 10).map((item) => (
                  <LocalizedLink
                    key={item.slug}
                    href={`/kierunki/${profileSlugByLocation.get(`${item.city}|${item.country}`) ?? item.slug}`}
                    locale={locale}
                    className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:border-emerald-500/40 hover:bg-emerald-100"
                  >
                    {item.city}
                  </LocalizedLink>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default async function DestinationsIndexPage() {
  return DestinationsIndexPageView({ locale: "pl" });
}

