import type { Metadata } from "next";

import { HomeHybridHero } from "@/components/home/home-hybrid-hero";
import { HomePageSections } from "@/components/home/home-page-sections";
import { getPublishedDestinations } from "@/lib/mvp/publisher-content";
import type { SiteLocale } from "@/lib/mvp/locale";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import type { DestinationProfile } from "@/lib/mvp/types";

const siteUrl = getSiteUrl();

export function getHomeMetadata(locale: SiteLocale): Metadata {
  const isEnglish = locale === "en";

  return {
    title: isEnglish
      ? "HelpTravel - Flight + hotel and full trip plan in 3 minutes | Free"
      : "HelpTravel - Loty + hotel i plan wyjazdu w 3 minuty | 0 zl",
    description: isEnglish
      ? "Plan a full trip in 3 minutes: flight, hotel and a real day-by-day plan. 22 airports across Poland and Europe. No signup. Free to use - you only pay partners when you book."
      : "Zaplanuj wyjazd w 3 minuty: lot, hotel i gotowy plan dnia. 22 lotniska w Polsce i Europie. Bez rejestracji. 100% darmowe - placisz tylko za rezerwacje u partnerow.",
    alternates: {
      canonical: locale === "en" ? "/en" : "/",
      languages: {
        "pl-PL": "/",
        "en-US": "/en",
      },
    },
    openGraph: {
      title: isEnglish
        ? "HelpTravel - Flight + hotel and full trip plan in 3 minutes"
        : "HelpTravel - Loty + hotel i plan wyjazdu w 3 minuty",
      description: isEnglish
        ? "Plan a full trip in 3 minutes: flight, hotel and a real day-by-day plan. 22 airports PL+EU. No signup. 100% free."
        : "Zaplanuj caly wyjazd w 3 minuty: lot, hotel i plan dnia. 22 lotniska PL+EU. Bez rejestracji. 100% darmowe.",
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
      <HomePageSections locale={locale} />
    </main>
  );
}

export default async function Home() {
  return HomePageView({ locale: "pl" });
}
