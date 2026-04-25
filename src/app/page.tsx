import type { Metadata } from "next";

import { HomeHybridHero } from "@/components/home/home-hybrid-hero";
import { HomePageSections } from "@/components/home/home-page-sections";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import {
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
  const canonicalPath = "/";

  return {
    title: isEnglish
      ? "HelpTravel - short trip planner for people who want a clear start"
      : "HelpTravel - planer krótkich wyjazdów bez chaosu",
    description: isEnglish
      ? "Pick a destination or describe the trip you want. Then move into stays, flights and the next travel steps."
      : "Wybierz kierunek albo opisz, jakiego wyjazdu szukasz. Potem przejdź do noclegów, lotów i dalszych kroków.",
    alternates: {
      canonical: canonicalPath,
    },
    robots: isEnglish
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    openGraph: {
      title: isEnglish
        ? "HelpTravel - short trip planner with a clear start"
        : "HelpTravel - planer krótkich wyjazdów z prostym startem",
      description: isEnglish
        ? "Choose a destination or describe the trip you want, then move into stays and flights."
        : "Wybierz kierunek albo opisz wyjazd, a potem przejdź do noclegów i lotów.",
      url: locale === "en" ? `${siteUrl}/en` : siteUrl,
      locale: locale === "en" ? "en_US" : "pl_PL",
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

  const featuredTiles = resolvedHeroDestinations.slice(0, 6).map((item) => ({
    destination: item.destination,
    heroImage: item.media.heroImage,
  }));

  const featuredDirections = resolvedHeroDestinations.slice(0, 6);
  const featuredDirectionCards = featuredDirections.map((item) => ({
    slug: item.destination.slug,
    city: item.destination.city,
    country: item.destination.country,
    heroImage: item.media.heroImage,
    vibe: item.story.vibe,
    tagline: item.story.tagline,
    bestFor: item.story.bestFor,
  }));
  const destinationOptions = publishedDestinations.map((destination) => ({
    city: destination.city,
    country: destination.country,
  }));

  return (
    <main className="flex w-full flex-1 flex-col gap-8 pb-8">
      <div className="w-full sm:px-6 sm:pt-2 xl:px-8">
        <HomeHybridHero featured={featuredTiles} destinationOptions={destinationOptions} />
      </div>
      <HomePageSections
        featuredDirections={featuredDirectionCards}
        latestArticles={latestArticles}
        locale={locale}
      />
    </main>
  );
}

export default async function Home() {
  return HomePageView({ locale: "pl" });
}

