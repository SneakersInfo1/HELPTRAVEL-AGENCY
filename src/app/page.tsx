import type { Metadata } from "next";

import { HomeHybridHero } from "@/components/home/home-hybrid-hero";
import { TrustHowItWorks } from "@/components/home/trust-how-it-works";
// 8 kafelków = HOME_TILE_DESTINATION_IDS z warm-config (JEDNO źródło prawdy:
// dokładnie te kierunki grzeje cron, więc każdy kafelek ma szansę na cenę).
import { HOME_TILE_DESTINATION_IDS } from "@/lib/hotels/warm-config";
import { PackageDeals, type PackageDeal } from "@/components/home/package-deals";
import { ThemeTiles, type ThemeTile } from "@/components/home/theme-tiles";
import { HOME_COPY } from "@/lib/home/copy";
import { nightsBetween, totalFor, type DealCard } from "@/lib/home/deal-card";
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
    // TYLKO METADANE, układ strony głównej nietknięty. To jest tekst, który
    // Google pokazuje jako główny wynik dla marki, a obiecywał „plan wyjazdu
    // w 3 minuty" i „0 zł". Planera nie ma od zwrotu na rezerwacje własne,
    // „3 minuty" i „ponad 80 lotnisk" nie mają źródła w danych, a „płacisz
    // tylko za rezerwacje u partnerów" jest nieprawdą: rezerwacja i płatność
    // odbywają się na helptravel.pl (BOOKING_FLOW_MODE=live), rozlicza je
    // Nuitee Travel. Root layout został poprawiony wcześniej, ale ta funkcja
    // NADPISUJE go dla „/" — więc na produkcji dalej szła stara wersja.
    title: isEnglish
      ? "HelpTravel - hotels and flights in one place, prices in PLN"
      : "HelpTravel — hotele i loty w jednym miejscu, ceny w złotówkach",
    description: isEnglish
      ? "Book hotels and flights in one place. Prices in PLN including taxes and fees, e-mail confirmation, no account needed."
      : "Rezerwuj hotel i lot w jednym miejscu. Ceny w złotówkach, z podatkami i opłatami, potwierdzenie e-mailem od razu. Bez zakładania konta.",
    alternates: {
      canonical: locale === "en" ? "/en" : "/",
      // hreflang.languages omitted — /en/* paths 308-redirect to Polish root,
      // hreflang to redirect chains is dropped by Google. Restore when real
      // EN content ships.
    },
    openGraph: {
      title: isEnglish
        ? "HelpTravel - hotels and flights in one place"
        : "HelpTravel — hotele i loty w jednym miejscu",
      description: isEnglish
        ? "Book hotels and flights in one place. Prices in PLN with taxes and fees, e-mail confirmation, no account needed."
        : "Rezerwuj hotel i lot bez skakania po serwisach. Ceny w PLN z podatkami i opłatami, potwierdzenie e-mailem, bez zakładania konta.",
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
  // KOMPLET 6 kategorii. Wcześniej były tu 4, a „Góry" i „Budżet" żyły
  // wyłącznie w chipach pod hero — po scaleniu duplikatu (redesign 2026-07)
  // te dwie ścieżki zniknęłyby z serwisu, więc dochodzą tutaj.
  const THEME_SLUGS = ["plaza", "city-break", "slonce-zima", "kultura", "gory", "budzet"] as const;
  const themeTiles: ThemeTile[] = (
    await Promise.all(
      THEME_SLUGS.map(async (slug): Promise<ThemeTile | null> => {
        const mood = TRAVEL_MOODS.find((m) => m.slug === slug);
        // PIERWSZY pick Z PROFILEM, nie ślepo picks[0]: część picków to wpisy
        // czysto redakcyjne bez `slug` (np. Innsbruck w moodzie „gory"), więc
        // sztywne picks[0] wywalało CAŁY kafel kategorii — „Góry" znikały ze
        // strony, mimo że mood ma dalej kierunki z kompletnym profilem.
        const profile = mood?.picks
          .map((pick) => (pick.slug ? getDestinationProfileBySlug(pick.slug) : undefined))
          .find((candidate): candidate is DestinationProfile => Boolean(candidate));
        if (!mood || !profile) return null;
        const media = await resolveDestinationMedia(profile);
        // Najtańszy ŚWIEŻY pakiet wśród kierunków tej kategorii. Kafle
        // kategorii były jedynym wejściem na stronie bez ceny — a to właśnie
        // one obsługują niezdecydowanych, czyli tych, którzy najbardziej
        // potrzebują punktu odniesienia („czy mnie na to stać?").
        //
        // Liczba pochodzi z tego samego snapshotu dstprice:v1 co reszta strony
        // (cron, realne wyszukania LiteAPI). Kategoria bez ani jednego
        // świeżego pakietu NIE dostaje ceny — kafel zostaje bez linii, tak jak
        // kafelki kierunków. Zero doliczania, zero „od” z sufitu.
        const fromPerPersonPln = mood.picks.reduce<number | null>((min, pick) => {
          const pkg = pickFreshPackage(priceSnapshot, pick.searchCity, pick.country);
          if (!pkg) return min;
          return min === null || pkg.perPersonPln < min ? pkg.perPersonPln : min;
        }, null);
        return {
          slug: mood.slug,
          label: mood.label,
          tagline: mood.eyebrow,
          heroImage: media.heroImage,
          imageAlt: mood.h1,
          fromPerPersonPln: fromPerPersonPln ?? undefined,
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
    // JEDNA cena całego wyjazdu (lot + noclegi) na osobę — ten sam odczyt,
    // z którego korzysta sekcja pakietów. Gdy jest, kafelek pokazuje ją
    // ZAMIAST rozbicia hotel/lot (koniec sumowania w głowie). Gdy jej nie ma
    // (kierunek bez świeżego pakietu), kafelek zostaje przy tym, co realnie
    // wiadomo — nic nie jest doliczane lokalnie.
    packagePerPerson:
      pickFreshPackage(priceSnapshot, item.destination.city, item.destination.country) ?? undefined,
  }));

  // Pakiety „Cały wyjazd w jednej cenie" — pula = WSZYSTKIE grzane kierunki
  // SPOZA kafelków (rozłączność sekcji z definicji), które mają świeży pakiet
  // w snapshocie. To ODPORNE na zmienność dostępności lotów GDS: zamiast
  // sztywnej listy 6-12 wysp (gdzie w danym przebiegu crona lot bywa tylko
  // dla 1-2), pokazujemy NAJTAŃSZE realnie policzone pakiety z całego seeda.
  // Klucz pakietu match po rekordzie seedu (city.en|country.en — jak w cronie);
  // karta/CTA po PROFILU. Media (Pexels) tylko dla top-N (koszt ISR).
  const tileIdSet = new Set<string>(HOME_TILE_DESTINATION_IDS);

  // PEŁNA pula kierunków ze świeżym pakietem — bez odejmowania kafelków hero
  // i bez obcinania do 10. Ta pula zasila licznik dobieracza („Mamy N wyjazdów
  // od X zł"), więc MUSI odpowiadać temu, co użytkownik realnie może znaleźć.
  // Licznik liczony z przyciętej listy pokazywałby mniej, niż serwis ma.
  const allFreshDeals: DealCard[] = listAllDestinations()
    .map((d) => {
      const pkg = pickFreshPackage(priceSnapshot, d.city.en, d.country.en);
      const profile = pkg ? getDestinationProfileBySlug(d.id) : undefined;
      if (!pkg || !profile) return null;
      const nights = nightsBetween(pkg.checkin, pkg.checkout);
      const params = new URLSearchParams({
        destination: profile.city,
        country: profile.country,
        adults: "2",
        rooms: "1",
      });
      return {
        // Klucz z PROFILU, nie z rekordu seeda. Seed potrafi mieć dwa wpisy
        // wskazujące na ten sam profil kierunku (zmierzone: Malaga wychodziła
        // dwa razy na liście wyników dobieracza), a przy `d.id` obie wersje
        // przechodziły dalej jako osobne oferty i zawyżały licznik. Profilowy
        // slug jest też kluczem, którego używa TRAVEL_MOODS, więc filtr typu
        // wyjazdu trafia w te same kierunki, które liczy licznik.
        id: profile.slug,
        city: profile.city,
        cityLabel: localizeCity(profile.city),
        country: profile.country,
        countryLabel: localizeCountry(profile.country),
        // Zdjęcie dociągamy TYLKO dla kart, które realnie renderujemy (koszt
        // ISR) — pula licznika go nie potrzebuje, bo nic nie wyświetla.
        imageUrl: "",
        imageAlt: `${localizeCity(profile.city)}, ${localizeCountry(profile.country)}`,
        pricePerPersonPln: pkg.perPersonPln,
        priceTotalPln: totalFor(pkg.perPersonPln),
        nights,
        dateFrom: pkg.checkin,
        dateTo: pkg.checkout,
        departureAirport: "WAW",
        searchUrl: `/hotele/szukaj?${params.toString()}`,
        // hotelName / hotelStars / hotelReviewScore / isDirect / competitorPricePln
        // ŚWIADOMIE puste — snapshot dstprice:v1 ich nie zawiera, a wypełnienie
        // przykładowymi byłoby zmyślaniem danych. Patrz lib/home/deal-card.ts.
      } satisfies DealCard;
    })
    .filter((x): x is DealCard => x !== null)
    // Deduplikacja po kierunku, z zachowaniem NAJTAŃSZEJ oferty. Bez tego ten
    // sam kierunek pokazywał się dwa razy na liście wyników, a licznik nad nią
    // liczył go podwójnie — czyli obiecywał więcej, niż serwis ma.
    .reduce<DealCard[]>((acc, card) => {
      const istniejacy = acc.findIndex((x) => x.id === card.id);
      if (istniejacy === -1) return [...acc, card];
      if (card.pricePerPersonPln < acc[istniejacy].pricePerPersonPln) acc[istniejacy] = card;
      return acc;
    }, []);

  const packageCandidates = allFreshDeals
    .filter((d) => !tileIdSet.has(d.id))
    .map((d) => {
      const profile = getDestinationProfileBySlug(d.id);
      return profile
        ? { profile, pkg: { perPersonPln: d.pricePerPersonPln, checkin: d.dateFrom, checkout: d.dateTo } }
        : null;
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
      {/* SEKCJA C — ścieżka dla niezdecydowanych: cztery kafle klimatów
          plus kafel asystenta.
          2026-07-27, decyzja właściciela: panel z pytaniami (budżet → typ →
          licznik) ZDJĘTY ze strony. Komponent `TripPicker` i jego testy
          zostają w repo — gdyby miał wrócić, wraca jedną linią. */}
      <section
        aria-labelledby="trip-picker"
        className="mx-auto w-full max-w-[2160px] px-4 sm:px-6 xl:px-8"
      >
        <h2 id="trip-picker" className="font-display text-2xl leading-tight text-ink sm:text-3xl">
          {HOME_COPY.picker.heading}
        </h2>
        <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-muted">
          {HOME_COPY.picker.subheading}
        </p>
        <div className="mt-4">
          <ThemeTiles tiles={themeTiles.slice(0, 4)} />
        </div>
      </section>
      <TrustHowItWorks trustpilot={trustpilot} />
    </main>
  );
}

export default async function Home() {
  return HomePageView();
}
