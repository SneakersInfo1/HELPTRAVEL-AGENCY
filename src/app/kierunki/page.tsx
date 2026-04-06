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

export const metadata: Metadata = {
  title: "Kierunki",
  description: "Katalog 200+ kierunkow pod city break, cieple wyjazdy i praktyczne planowanie z Polski: opisy, budzety, atrakcje i przejscie do planera.",
  alternates: {
    canonical: "/kierunki",
  },
  openGraph: {
    title: "Kierunki - HelpTravel",
    description:
      "Katalog 200+ kierunkow pod city break i krotkie wyjazdy z Polski. Praktyczne opisy, FAQ i przejscie do planera.",
    url: `${getSiteUrl()}/kierunki`,
    type: "website",
  },
};

export default async function DestinationsIndexPage() {
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
        name: "Kierunki",
        description: "Katalog 200+ kierunkow city break i krotkich wyjazdow z Polski.",
        url: `${getSiteUrl()}/kierunki`,
        inLanguage: "pl-PL",
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Katalog kierunkow</p>
        <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] text-emerald-950">
          Kierunki, ktore realnie nadaja sie na city break, krotki urlop i wyjazdy z Polski.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Kazdy kierunek ma swoja strone z praktycznym opisem, sekcjami pod SEO, lokalnym kontekstem i prostym przejsciem
          do planera. To nie jest lista miast bez tresci, tylko warstwa wydawnicza z realnym sensem dla uzytkownika i
          skalowalnym katalogiem 200+ destynacji.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-emerald-900/70">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{destinations.length} rozbudowanych hubow redakcyjnych</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{allDestinations.length}+ wspieranych destynacji</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{categories.length} punktow wejscia tematycznego</span>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <LocalizedLink
              key={category.slug}
              href={`/${category.slug}`}
              className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900 transition hover:bg-emerald-100"
            >
              {category.title}
            </LocalizedLink>
          ))}
        </div>
      </section>

      <EditorialMetaBar
        eyebrow="Warstwa publishera"
        title="Katalog kierunkow budowany jako indeksowalny hub z przejsciem do planera"
        items={[`${allDestinations.length}+ kierunkow`, `${categories.length} sciezek tematycznych`, "tresci dla polskiego odbiorcy"]}
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {cards.map((item) =>
          item.guide ? (
            <DestinationGuideCard
              key={item.destination.slug}
              destination={item.destination}
              media={item.media}
              summary={item.guide.overview}
            />
          ) : null,
        )}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pelny katalog</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Pomysly na wyjazdy pogrupowane regionalnie</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-emerald-900/72">
            Featured hubs sa najbardziej dopracowane redakcyjnie, ale planner i wyszukiwarka pracuja juz na szerszym
            katalogu. To daje wiecej punktow wejscia bez gubienia jakosci decyzji.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {regionGroups.map((group) => (
            <article key={group.region} className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/72 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-emerald-950">{group.region}</h3>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900">
                  {group.items.length} kierunkow
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.slice(0, 10).map((item) => (
                  <LocalizedLink
                    key={item.slug}
                    href={`/kierunki/${profileSlugByLocation.get(`${item.city}|${item.country}`) ?? item.slug}`}
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

