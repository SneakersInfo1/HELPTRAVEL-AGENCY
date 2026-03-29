import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { getDestinationGuideBySlug, getEditorialCategories, getPublishedDestinations } from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";

export const metadata: Metadata = {
  title: "Kierunki",
  description: "Katalog kierunkow city break i krotkich wyjazdow z Polski: opisy, budzety, atrakcje i przejscie do planera.",
  alternates: {
    canonical: "/kierunki",
  },
  openGraph: {
    title: "Kierunki - HelpTravel",
    description:
      "Katalog kierunkow pod city break i krotkie wyjazdy z Polski. Praktyczne opisy, FAQ i przejscie do planera.",
    url: `${getSiteUrl()}/kierunki`,
    type: "website",
  },
};

export default async function DestinationsIndexPage() {
  const destinations = getPublishedDestinations();
  const categories = getEditorialCategories();
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
        description: "Katalog kierunkow city break i krotkich wyjazdow z Polski.",
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
          do planera. To nie jest lista miast bez tresci, tylko warstwa wydawnicza z realnym sensem dla uzytkownika.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-emerald-900/70">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{destinations.length} hubow kierunkowych</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">{categories.length} punktow wejscia tematycznego</span>
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

      <EditorialMetaBar
        eyebrow="Warstwa publishera"
        title="Katalog kierunkow budowany jako indeksowalny hub z przejsciem do planera"
        items={[`${destinations.length} kierunkow`, `${categories.length} sciezek tematycznych`, "tresci dla polskiego odbiorcy"]}
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
    </main>
  );
}

