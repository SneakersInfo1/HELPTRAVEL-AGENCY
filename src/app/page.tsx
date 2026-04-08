import type { Metadata } from "next";

import { HomePageSections } from "@/components/home/home-page-sections";
import { PremiumHomeHero } from "@/components/home/premium-home-hero";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildAffiliateLinks } from "@/lib/mvp/affiliate-links";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { getDestinationCatalogCount } from "@/lib/mvp/destination-catalog";
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
  const destinationCount = getDestinationCatalogCount();
  const guideCount = publishedDestinations.length + latestArticles.length;

  const selectedHeroDestinations = heroDestinationSlugs
    .map((slug) => publishedDestinations.find((destination) => destination.slug === slug))
    .filter((destination): destination is DestinationProfile => Boolean(destination));

  const resolvedHeroDestinations = await Promise.all(
    selectedHeroDestinations.map(async (destination) => ({
      destination,
      story: getDestinationStory(destination),
      media: await resolveDestinationMedia(destination),
    })),
  );

  const heroSlides = resolvedHeroDestinations.slice(0, 6).map((item) => ({
    id: item.destination.slug,
    city: item.destination.city,
    country: item.destination.country,
    label: `${item.destination.city}, ${item.destination.country}`,
    title: item.destination.city,
    description: item.story.tagline,
    image: item.media.heroImage,
    href: `/kierunki/${item.destination.slug}`,
    tags: item.story.bestFor.slice(0, 3),
    meta: `lot ok. ${item.destination.typicalFlightHoursFromPL.toFixed(1)} h z Polski`,
  }));

  const featuredDirections = resolvedHeroDestinations.slice(0, 6);
  const previewLinks = buildAffiliateLinks("Malaga", "Spain");
  const featuredDirectionCards = featuredDirections.map((item) => ({
    slug: item.destination.slug,
    city: item.destination.city,
    country: item.destination.country,
    heroImage: item.media.heroImage,
    vibe: item.story.vibe,
    tagline: item.story.tagline,
    bestFor: item.story.bestFor,
  }));

  return (
    <main className="flex w-full flex-1 flex-col gap-8 pb-8">
      <div className="w-full px-4 pt-4 sm:px-6 sm:pt-6 xl:px-8">
        <PremiumHomeHero slides={heroSlides} destinationCount={destinationCount} guideCount={guideCount} locale={locale} />
      </div>
      <HomePageSections
        featuredDirections={featuredDirectionCards}
        latestArticles={latestArticles}
        editorialCategories={editorialCategories}
        staysLabel={getAffiliateBrandLabel(previewLinks.stays, "Hotels.com")}
        flightsLabel={getAffiliateBrandLabel(previewLinks.flights, "Partner lotniczy")}
        locale={locale}
      />
    </main>
  );
}

export default async function Home() {
  return HomePageView({ locale: "pl" });
}
