import type { Metadata } from "next";

import { HomeHybridHero } from "@/components/home/home-hybrid-hero";
import { HomePageSections } from "@/components/home/home-page-sections";
import {
  getEditorialCategories,
  getLatestEditorialArticles,
  getPublishedDestinations,
} from "@/lib/mvp/publisher-content";
import type { SiteLocale } from "@/lib/mvp/locale";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import type { DestinationProfile } from "@/lib/mvp/types";

const siteUrl = getSiteUrl();

export function getHomeMetadata(locale: SiteLocale): Metadata {
  const isEnglish = locale === "en";

  return {
    title: isEnglish
      ? "HelpTravel - choose a destination, stay and flight in one flow"
      : "HelpTravel - wybierz kierunek, hotel i lot w jednym flow",
    description: isEnglish
      ? "A high-impact trip planning start. Pick a destination, set dates and move straight into stays, flights and the next travel steps."
      : "Pelnoekranowy start do planowania wyjazdu. Wybierz kierunek, ustaw termin i przejdz do hoteli, lotow, atrakcji oraz kolejnych krokow w jednym flow.",
    alternates: {
      canonical: locale === "en" ? "/en" : "/",
      languages: {
        "pl-PL": "/",
        "en-US": "/en",
      },
    },
    openGraph: {
      title: isEnglish
        ? "HelpTravel - choose a destination, stay and flight in one flow"
        : "HelpTravel - wybierz kierunek, hotel i lot w jednym flow",
      description: isEnglish
        ? "A premium starting point for destination choice, stays and flights in one travel flow."
        : "Premium start do wyboru kierunku, hotelu i lotu z jednego travelowego ekranu.",
      url: locale === "en" ? `${siteUrl}/en` : siteUrl,
      locale: locale === "en" ? "en_US" : "pl_PL",
      alternateLocale: locale === "en" ? ["pl_PL"] : ["en_US"],
      type: "website",
    },
  };
}

export const metadata: Metadata = getHomeMetadata("pl");

const heroDestinationSlugs = [
  "malaga-spain",
  "barcelona-spain",
  "lisbon-portugal",
  "rome-italy",
  "valencia-spain",
  "athens-greece",
  "istanbul-turkey",
  "funchal-portugal",
] as const;

export async function HomePageView({ locale }: { locale: SiteLocale }) {
  const publishedDestinations = getPublishedDestinations();
  const latestArticles = getLatestEditorialArticles(4);
  const editorialCategories = getEditorialCategories().slice(0, 4);

  const selectedHeroDestinations = heroDestinationSlugs
    .map((slug) => publishedDestinations.find((destination) => destination.slug === slug))
    .filter((destination): destination is DestinationProfile => Boolean(destination));

  const resolvedHeroDestinations = await Promise.all(
    selectedHeroDestinations.map(async (destination) => ({
      destination,
      media: await resolveDestinationMedia(destination),
    })),
  );

  const featuredTiles = resolvedHeroDestinations.slice(0, 6).map((item) => ({
    destination: item.destination,
    heroImage: item.media.heroImage,
  }));

  const destinationOptions = publishedDestinations.map((d) => ({ city: d.city, country: d.country }));

  return (
    <main className="flex w-full flex-1 flex-col gap-8 pb-8">
      <div className="w-full sm:px-6 sm:pt-2 xl:px-8">
        <HomeHybridHero featured={featuredTiles} destinationOptions={destinationOptions} />
      </div>
      <HomePageSections
        latestArticles={latestArticles}
        editorialCategories={editorialCategories}
        locale={locale}
      />
    </main>
  );
}

export default async function Home() {
  return HomePageView({ locale: "pl" });
}
