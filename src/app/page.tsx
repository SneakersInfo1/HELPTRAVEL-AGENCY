import type { Metadata } from "next";

import { HomeHybridHero } from "@/components/home/home-hybrid-hero";
import { TrustHowItWorks } from "@/components/home/trust-how-it-works";
// 8 kafelków = HOME_TILE_DESTINATION_IDS z warm-config (JEDNO źródło prawdy:
// dokładnie te kierunki grzeje cron, więc każdy kafelek ma szansę na cenę).
import { HOME_TILE_DESTINATION_IDS } from "@/lib/hotels/warm-config";
import { PackageDeals, type PackageDeal } from "@/components/home/package-deals";
import { ThemeTiles, type ThemeTile } from "@/components/home/theme-tiles";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import { listAllDestinations } from "@/lib/mvp/destinations-seed";
import {
  pickFreshFlightPrice,
  pickFreshPackage,
  pickFreshPrice,
  readPriceSnapshot,
  type FreshPackage,
} from "@/lib/prices/destination-price-snapshot";
import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
import { isFreshTrustpilot, readTrustpilotSnapshot } from "@/lib/trust/trustpilot-snapshot";
import { getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import type { SiteLocale } from "@/lib/mvp/locale";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import type { DestinationProfile } from "@/lib/mvp/types";

const siteUrl = getSiteUrl();

// Homepage perf: ISR. Without this the page does `await Promise.all(12×
// resolveDestinationMedia)` (12 blocking Pexels calls) on every request,
// which dominated TTFB and pushed LCP to ~7s. Serving from the static
// cache and regenerating hourly removes Pexels from the critical path.
export const revalidate = 3600;

export function getHomeMetadata(locale: SiteLocale): Metadata {
  const isEnglish = locale === "en";

  return {
    title: isEnglish
      ? "HelpTravel - Flight + hotel and full trip plan in 3 minutes | Free"
      : "HelpTravel - Loty + hotel i plan wyjazdu w 3 minuty | 0 zł",
    description: isEnglish
      ? "Plan a full trip in 3 minutes: flight, hotel and a real day-by-day plan. 22 airports across Poland and Europe. No signup. Free to use - you only pay partners when you book."
      : "Zaplanuj wyjazd w 3 minuty: lot, hotel i gotowy plan dnia. Ponad 80 lotnisk w Polsce, Europie i na świecie. Bez rejestracji. 100% darmowe - płacisz tylko za rezerwacje u partnerów.",
    alternates: {
      canonical: locale === "en" ? "/en" : "/",
      // hreflang.languages omitted — /en/* paths 308-redirect to Polish root,
      // hreflang to redirect chains is dropped by Google. Restore when real
      // EN content ships.
    },
    openGraph: {
      title: isEnglish
        ? "HelpTravel - Flight + hotel and full trip plan in 3 minutes"
        : "HelpTravel - Loty + hotel i plan wyjazdu w 3 minuty",
      description: isEnglish
        ? "Plan a full trip in 3 minutes: flight, hotel and a real day-by-day plan. 22 airports PL+EU. No signup. 100% free."
        : "Zaplanuj cały wyjazd w 3 minuty: lot, hotel i plan dnia. Ponad 80 lotnisk PL, EU i świat. Bez rejestracji. 100% darmowe.",
      url: locale === "en" ? `${siteUrl}/en` : siteUrl,
      locale: locale === "en" ? "en_US" : "pl_PL",
      alternateLocale: locale === "en" ? ["pl_PL"] : ["en_US"],
      type: "website",
    },
  };
}

export const metadata: Metadata = getHomeMetadata("pl");

// Kafelki „Popularne kierunki" — 8 sztuk (2026-07-01, redesign konwersji:
// mniej scrollu, każdy kafelek z prawdziwą ceną). Zestaw i kolejność
// EDYTORSKIE (podzbiór zestawu właściciela z 2026-06-11), zdefiniowane w
// warm-config obok crona, który grzeje dla nich ceny.

export async function HomePageView() {
  // Tiles link to the search results, not to publisher guides — so they only
  // need a destination PROFILE (photo recipe, flight time), not membership in
  // the curated publishedDestinationSlugs list. Resolving profiles directly
  // lets the 12-tile set include cities without a guide (Paris, Porto,
  // Heraklion), which the previous published-only filter silently dropped.
  const selectedHeroDestinations = HOME_TILE_DESTINATION_IDS
    .map((slug) => getDestinationProfileBySlug(slug))
    .filter((destination): destination is DestinationProfile => Boolean(destination));

  const resolvedHeroDestinations = await Promise.all(
    selectedHeroDestinations.map(async (destination) => ({
      destination,
      media: await resolveDestinationMedia(destination),
    })),
  );

  // Prawdziwe „Hotel od X zł/noc" ze snapshotu (cron). Odczyt RAZ przy ISR;
  // brak snapshotu/wpisu → kafelek bez linii ceny (uczciwość > kompletność).
  const priceSnapshot = await readPriceSnapshot();

  // Kafle tematyczne „Nie wiesz, dokąd jechać?" — 4 moody z /wyjazdy.
  // Zdjęcie = media pierwszego picka moodu (ten sam resolver co kafelki;
  // pick bez profilu w seedzie → kafel pomijany, nie pusty obrazek).
  const THEME_SLUGS = ["plaza", "city-break", "slonce-zima", "kultura"] as const;
  const themeTiles: ThemeTile[] = (
    await Promise.all(
      THEME_SLUGS.map(async (slug): Promise<ThemeTile | null> => {
        const mood = TRAVEL_MOODS.find((m) => m.slug === slug);
        const pickSlug = mood?.picks[0]?.slug;
        const profile = pickSlug ? getDestinationProfileBySlug(pickSlug) : undefined;
        if (!mood || !profile) return null;
        const media = await resolveDestinationMedia(profile);
        return {
          slug: mood.slug,
          label: mood.label,
          tagline: mood.eyebrow,
          heroImage: media.heroImage,
          imageAlt: mood.h1,
        };
      }),
    )
  ).filter((t): t is ThemeTile => t !== null);

  // Ocena Trustpilot (cron odświeża ~1×/dobę). Nieświeża (>14 dni) lub brak
  // → komponenty pokazują sam link bez liczby — liczba NIGDY nie jest
  // hardkodowana (uczciwość jak przy cenach).
  const trustpilotEntry = await readTrustpilotSnapshot();
  const trustpilot = isFreshTrustpilot(trustpilotEntry)
    ? { score: trustpilotEntry!.score, reviewCount: trustpilotEntry!.reviewCount }
    : null;

  const featuredTiles = resolvedHeroDestinations.map((item) => ({
    destination: item.destination,
    heroImage: item.media.heroImage,
    fromPricePerNight:
      pickFreshPrice(priceSnapshot, item.destination.city, item.destination.country) ?? undefined,
    flightFromPln:
      pickFreshFlightPrice(priceSnapshot, item.destination.city, item.destination.country) ?? undefined,
  }));

  // Pakiety „Cały wyjazd w jednej cenie" — pula = WSZYSTKIE grzane kierunki
  // SPOZA kafelków (rozłączność sekcji z definicji), które mają świeży pakiet
  // w snapshocie. To ODPORNE na zmienność dostępności lotów GDS: zamiast
  // sztywnej listy 6-12 wysp (gdzie w danym przebiegu crona lot bywa tylko
  // dla 1-2), pokazujemy NAJTAŃSZE realnie policzone pakiety z całego seeda.
  // Klucz pakietu match po rekordzie seedu (city.en|country.en — jak w cronie);
  // karta/CTA po PROFILU. Media (Pexels) tylko dla top-N (koszt ISR).
  const tileIdSet = new Set<string>(HOME_TILE_DESTINATION_IDS);
  const packageCandidates = listAllDestinations()
    .filter((d) => !tileIdSet.has(d.id))
    .map((d) => {
      const pkg = pickFreshPackage(priceSnapshot, d.city.en, d.country.en);
      const profile = pkg ? getDestinationProfileBySlug(d.id) : undefined;
      return pkg && profile ? { profile, pkg } : null;
    })
    .filter((x): x is { profile: DestinationProfile; pkg: FreshPackage } => x !== null)
    .sort((a, b) => a.pkg.perPersonPln - b.pkg.perPersonPln)
    .slice(0, 10);
  const packageDeals: PackageDeal[] = await Promise.all(
    packageCandidates.map(async ({ profile, pkg }): Promise<PackageDeal> => {
      const media = await resolveDestinationMedia(profile);
      // BEZ checkin/checkout w CTA (właściciel 2026-07-04) — termin ceny
      // zostaje NA KARCIE, daty user wybiera sam w formularzu wyników.
      const params = new URLSearchParams({
        destination: profile.city,
        country: profile.country,
        adults: "2",
        rooms: "1",
      });
      return {
        slug: profile.slug,
        cityLabel: localizeCity(profile.city),
        countryLabel: localizeCountry(profile.country),
        heroImage: media.heroImage,
        perPersonPln: pkg.perPersonPln,
        checkin: pkg.checkin,
        checkout: pkg.checkout,
        href: `/hotele/szukaj?${params.toString()}`,
      };
    }),
  );

  return (
    <main className="flex w-full flex-1 flex-col gap-8 pb-10 lg:gap-10">
      <div className="w-full sm:px-6 sm:pt-2 xl:px-8">
        <HomeHybridHero featured={featuredTiles} trustpilot={trustpilot} />
      </div>
      <PackageDeals deals={packageDeals} />
      <ThemeTiles tiles={themeTiles} />
      <TrustHowItWorks trustpilot={trustpilot} />
    </main>
  );
}

export default async function Home() {
  return HomePageView();
}
