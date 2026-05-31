import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";

import { MediaHero } from "@/components/site/media-hero";
import { FinalCtaBanner } from "@/components/site/final-cta-banner";
import { DestinationTile } from "@/components/home/destination-tile";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { LocalizedLink } from "@/components/site/localized-link";
import { getDestinationCatalogByRegion } from "@/lib/mvp/destination-catalog";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { getLocalizedCategoryTitle, getLocalizedDestinationGuide } from "@/lib/mvp/destination-localization";
import { getAllDestinationProfiles, getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { getDestinationGuideBySlug, getEditorialCategories, getPublishedDestinations } from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getDestinationSocialProof, formatPricePLN } from "@/lib/mvp/destination-social-proof";
import { commercialCities } from "@/lib/mvp/commercial-cities";
import { foldCategorySlug } from "@/lib/mvp/category-slug";
import { getSiteUrl } from "@/lib/mvp/site";
import { type SiteLocale } from "@/lib/mvp/locale";
import type { DestinationProfile } from "@/lib/mvp/types";

export const revalidate = 86400;

const pageCopy = {
  pl: {
    title: "Kierunki na wakacje i city break 2026 — hotele od 499 zł",
    description:
      "Ponad 235 kierunków na city break, wakacje nad morzem i ciepłe wyjazdy z Polski. Realne ceny hoteli w PLN, czas lotu, pogoda i przejście prosto do rezerwacji.",
    ogDescription:
      "Ponad 235 kierunków na krótkie wyjazdy z Polski: realne ceny hoteli w PLN, czas lotu, pogoda i jeden klik do rezerwacji.",
    eyebrow: "Katalog kierunków",
    metaDescription: "Katalog kierunków HelpTravel",
  },
  en: {
    title: "Destinations for city breaks & holidays 2026 — hotels from 499 zł",
    description:
      "200+ destinations for city breaks, beach holidays and warm escapes from Poland: real hotel prices in PLN, flight time, weather and a one-click path to booking.",
    ogDescription:
      "200+ destinations for short trips from Poland: real hotel prices in PLN, flight time, weather and one click to booking.",
    eyebrow: "Destination catalog",
    metaDescription: "HelpTravel destination catalog",
  },
} as const;

export function getDestinationsIndexMetadata(locale: SiteLocale): Metadata {
  const text = pageCopy[locale];

  return {
    title: text.title,
    description: text.description,
    alternates: {
      canonical: "/kierunki",
    },
    robots: locale === "en" ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${text.title} - HelpTravel`,
      description: text.ogDescription,
      url: `${getSiteUrl()}${locale === "en" ? "/en/kierunki" : "/kierunki"}`,
      type: "website",
    },
  };
}

export const metadata: Metadata = getDestinationsIndexMetadata("pl");

// Flagship mix (city + beach) for the "popularne teraz" tiles — links into the
// hotel search (conversion path). Order = visual rhythm, not ranking.
const TILE_SLUGS = [
  "barcelona-spain",
  "heraklion-greece",
  "rome-italy",
  "palma-spain",
  "lisbon-portugal",
  "antalya-turkey",
  "athens-greece",
  "malaga-spain",
] as const;

const HERO_SLUG = "barcelona-spain";

// Hand-picked, on-theme photo per editorial category (a real member of it).
const CATEGORY_IMAGE_SLUG: Record<string, string> = {
  przewodniki: "malaga-spain",
  "city-breaki": "rome-italy",
  "cieple-kierunki": "valencia-spain",
  "bez-wizy": "marrakesh-morocco",
  "tanie-podróże": "budapest-hungary",
  "weekendowe-wyjazdy": "prague-czechia",
};

// Season → representative destination photo + a short, true hook.
const SEASONS: Array<{ key: "wiosna" | "lato" | "jesien" | "zima"; label: string; slug: string; hook: string }> = [
  { key: "wiosna", label: "Na wiosnę", slug: "lisbon-portugal", hook: "Ciepło bez upału, taniej niż latem" },
  { key: "lato", label: "Na lato", slug: "heraklion-greece", hook: "Wyspy, plaże i ciepłe morze" },
  { key: "jesien", label: "Na jesień", slug: "barcelona-spain", hook: "Miasta bez tłumów, świetne ceny" },
  { key: "zima", label: "Na zimę", slug: "antalya-turkey", hook: "Słońce i +20°C w zasięgu lotu" },
];

// Locative ("w …") — Polish month names are irregular, so a fixed table
// (not a "+u" hack) keeps headings like "Popularne kierunki w czerwcu" correct.
const MONTHS_LOCATIVE_PL = [
  "styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu",
  "lipcu", "sierpniu", "wrześniu", "październiku", "listopadzie", "grudniu",
];

const flightLabel = (h?: number) => (typeof h === "number" ? `~${h.toFixed(1)} h z PL` : null);

// Compact card for a COMMERCIAL money-page (/hotele/w/[slug]) — image + real
// data (od X zł, czas lotu, pogoda teraz). This is the SEO/conversion spine:
// it passes link equity from the hub to the head-term landing pages and pulls
// commercial-intent users one click from booking.
function CommercialCityCard({
  slug,
  city,
  country,
  image,
  priceFrom,
  flightHours,
  tempNow,
}: {
  slug: string;
  city: string;
  country: string;
  image: string | null;
  priceFrom: number;
  flightHours?: number;
  tempNow?: number;
}) {
  return (
    <Link
      href={`/hotele/w/${slug}`}
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-[1.5rem] border border-emerald-900/10 shadow-[0_12px_34px_rgba(16,84,48,0.10)] transition hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(16,84,48,0.18)]"
    >
      {image ? (
        <Image
          src={image}
          alt={`Hotele — ${city}, ${country}`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-[1.05]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-950" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0)_30%,rgba(5,18,11,0.6)_64%,rgba(5,18,11,0.94)_100%)]" />
      <div className="relative z-10 p-4 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">{country}</p>
        <h3 className="mt-0.5 font-display text-2xl leading-tight">{city}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <span className="rounded-full bg-amber-300/95 px-2 py-0.5 text-emerald-950">
            od {formatPricePLN(priceFrom)} zł
          </span>
          {flightLabel(flightHours) && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-white backdrop-blur-sm">
              ✈ {flightLabel(flightHours)}
            </span>
          )}
          {typeof tempNow === "number" && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-white backdrop-blur-sm">
              ☀ teraz ~{Math.round(tempNow)}°C
            </span>
          )}
        </div>
        <span className="mt-2.5 inline-flex items-center gap-1 text-sm font-semibold text-amber-200">
          Zobacz hotele <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}

export async function DestinationsIndexPageView({ locale }: { locale: SiteLocale }) {
  const text = pageCopy[locale];
  const monthIdx = new Date().getMonth();

  const destinations = getPublishedDestinations();
  const allDestinations = getAllDestinationProfiles();
  const categories = getEditorialCategories();
  const regionGroups = getDestinationCatalogByRegion().slice(0, 8);
  const profileSlugByLocation = new Map(
    allDestinations.map((destination) => [`${destination.city}|${destination.country}`, destination.slug]),
  );

  // Resolve every hero image we need ONCE (the media cache dedups by slug).
  const heroNeeded = new Set<string>([
    HERO_SLUG,
    ...TILE_SLUGS,
    ...SEASONS.map((s) => s.slug),
    ...commercialCities.map((c) => c.destinationId),
    ...Object.values(CATEGORY_IMAGE_SLUG),
  ]);
  const mediaPairs = await Promise.all(
    [...heroNeeded].map(async (slug) => {
      const profile = getDestinationProfileBySlug(slug);
      if (!profile) return [slug, null] as const;
      const media = await resolveDestinationMedia(profile);
      return [slug, media.heroImage ?? null] as const;
    }),
  );
  const imageBySlug = new Map<string, string | null>(mediaPairs);

  // Full editorial guide cards (need the full media object).
  const guideCards = (
    await Promise.all(
      destinations.map(async (destination) => {
        const guide = getDestinationGuideBySlug(destination.slug);
        if (!guide) return null;
        const story = getDestinationStory(destination);
        return {
          destination,
          guide,
          summary: getLocalizedDestinationGuide(guide, story, locale)?.overview ?? guide.overview,
          media: await resolveDestinationMedia(destination),
        };
      }),
    )
  ).filter((c): c is NonNullable<typeof c> => c !== null);

  // Popular flagship tiles (image + price + flight → hotel search).
  const popularTiles = TILE_SLUGS.map((slug) => {
    const destination = getDestinationProfileBySlug(slug);
    const heroImage = imageBySlug.get(slug) ?? null;
    if (!destination || !heroImage) return null;
    return { destination, heroImage };
  }).filter((t): t is { destination: DestinationProfile; heroImage: string } => t !== null);

  // Commercial money-page cards, highest PL search volume first.
  const commercialCards = [...commercialCities]
    .sort((a, b) => b.monthlySearchVolumePL - a.monthlySearchVolumePL)
    .slice(0, 12)
    .map((c) => {
      const profile = getDestinationProfileBySlug(c.destinationId);
      const sp = getDestinationSocialProof(c.destinationId);
      return {
        slug: c.slug,
        city: c.cityNominative,
        country: c.countryNominative,
        image: imageBySlug.get(c.destinationId) ?? null,
        priceFrom: sp.priceFromPLN,
        flightHours: profile?.typicalFlightHoursFromPL,
        tempNow: profile?.avgTempByMonth?.[monthIdx],
      };
    });

  const priceFloor = Math.min(...commercialCards.map((c) => c.priceFrom));
  const heroImage = imageBySlug.get(HERO_SLUG) ?? null;

  // Season tiles.
  const seasonCards = SEASONS.map((s) => ({ ...s, image: imageBySlug.get(s.slug) ?? null }));

  const baseUrl = `${getSiteUrl()}${locale === "en" ? "/en" : ""}`;

  // High-intent FAQ (visible + FAQPage schema; schema answers are plain text).
  const faqs: Array<{ q: string; a: string }> = [
    {
      q: "Jaki kierunek wybrać na city break z Polski?",
      a: "Na krótki wypad miejski najlepiej sprawdzają się Barcelona, Rzym, Lizbona, Praga i Budapeszt — krótki lot, dużo do zwiedzania pieszo i hotele w każdym budżecie. Pełną listę miejskich kierunków znajdziesz w sekcji city breaki, a ceny i terminy sprawdzisz w wyszukiwarce hoteli.",
    },
    {
      q: "Gdzie jest ciepło zimą w zasięgu krótkiego lotu?",
      a: "Zimą najpewniejsze słońce mają Wyspy Kanaryjskie (Teneryfa, Gran Canaria), Madera, Malta, Cypr oraz Maroko (Marrakesz, Agadir) — temperatury ok. 18–24°C i 3–5 h lotu z Polski. Zobacz kierunki na zimę i ciepłe kierunki.",
    },
    {
      q: "Ile kosztują wakacje w Grecji albo Hiszpanii?",
      a: `Hotele na popularnych kierunkach zaczynają się od ok. ${formatPricePLN(priceFloor)} zł, a loty z Polski to zwykle 3–4 h. Realne, finalne ceny w PLN dla wybranych dat zobaczysz po wejściu na stronę miasta, np. hotele na Krecie czy w Barcelonie.`,
    },
    {
      q: "Które kierunki są bez wizy dla obywateli Polski?",
      a: "Cała strefa Schengen (Hiszpania, Włochy, Grecja, Portugalia i in.) jest bez wizy w ramach UE, a popularne kierunki spoza UE jak Turcja, Maroko, Albania czy Czarnogóra wpuszczają Polaków bez wizy na pobyt turystyczny do 90 dni. Zawsze sprawdź aktualne zasady przed wyjazdem.",
    },
    {
      q: "Najlepszy kierunek na wakacje nad morzem latem?",
      a: "Latem najwięcej dają wyspy i wybrzeża: Kreta, Rodos, Majorka, Teneryfa oraz turecka Antalya — ciepłe morze, długi sezon i dużo lotów czarterowych z Polski. Porównaj je w katalogu i wybierz termin w wyszukiwarce.",
    },
    {
      q: "Skąd wylatują loty na te kierunki?",
      a: "Loty obsługujemy z 22 lotnisk w Polsce i regionie (m.in. Warszawa, Kraków, Gdańsk, Wrocław, Katowice, Poznań). Przy każdym kierunku podajemy orientacyjny czas lotu, a w wyszukiwarce wybierzesz lotnisko wylotu i termin.",
    },
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: text.title,
        description: text.description,
        url: `${baseUrl}/kierunki`,
        inLanguage: locale === "en" ? "en-US" : "pl-PL",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: locale === "en" ? "Home" : "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: locale === "en" ? "Destinations" : "Kierunki", item: `${baseUrl}/kierunki` },
        ],
      },
      {
        "@type": "ItemList",
        name: locale === "en" ? "Destinations" : "Kierunki",
        itemListElement: [
          ...commercialCards.map((c, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${getSiteUrl()}/hotele/w/${c.slug}`,
            name: `Hotele — ${c.city}`,
          })),
          ...guideCards.map((item, index) => ({
            "@type": "ListItem",
            position: commercialCards.length + index + 1,
            url: `${baseUrl}/kierunki/${item.destination.slug}`,
            name: item.destination.city,
          })),
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8">
      <Script id="destinations-index-jsonld" type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>

      {/* HERO */}
      <MediaHero
        imageUrl={heroImage}
        imageAlt="Barcelona — panorama miasta i wybrzeża"
        eyebrow={text.eyebrow}
        title={
          <>
            Twój następny wyjazd zaczyna się od{" "}
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
              kierunku
            </span>
            .
          </>
        }
        intro="Ponad 235 miast i wysp na city break, wakacje nad morzem i ciepłe ucieczki z Polski. Przy każdym podajemy realne ceny hoteli w PLN, czas lotu i pogodę — i przechodzisz prosto do rezerwacji."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-6 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
          >
            Otwórz wyszukiwarkę →
          </Link>
          <a
            href="#style"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Przeglądaj według stylu
          </a>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90">
          <span className="rounded-full bg-white/12 px-3 py-1">{allDestinations.length}+ kierunków</span>
          <span className="rounded-full bg-white/12 px-3 py-1">hotele od {formatPricePLN(priceFloor)} zł</span>
          <span className="rounded-full bg-white/12 px-3 py-1">loty z 22 lotnisk w PL</span>
          <span className="rounded-full bg-white/12 px-3 py-1">ceny finalne w PLN</span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {categories.map((category) => (
            <LocalizedLink
              key={category.slug}
              href={`/${foldCategorySlug(category.slug)}`}
              locale={locale}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-white/20"
            >
              {getLocalizedCategoryTitle(category.slug, category.title, locale)}
            </LocalizedLink>
          ))}
        </div>
      </MediaHero>

      {/* POPULARNE KIERUNKI TERAZ — tiles → hotel search */}
      {popularTiles.length > 0 && (
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Gorące teraz</p>
              <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Popularne kierunki w {MONTHS_LOCATIVE_PL[monthIdx]}</h2>
            </div>
            <Link href="/hotele/szukaj" className="rounded-full border border-emerald-900/10 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50">
              Wszystkie hotele →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {popularTiles.map((tile) => (
              <DestinationTile key={tile.destination.slug} destination={tile.destination} heroImage={tile.heroImage} />
            ))}
          </div>
        </section>
      )}

      {/* HOTELE W POPULARNYCH MIASTACH — commercial money pages */}
      <section className="relative overflow-hidden rounded-[2rem] border border-emerald-900/20 bg-emerald-950 p-6 text-white shadow-[0_28px_80px_rgba(6,29,16,0.22)] sm:p-8">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(110,231,183,0.18),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.12),transparent_34%)]"
        />
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">Najczęściej wyszukiwane</p>
              <h2 className="mt-2 max-w-2xl font-display text-3xl leading-tight sm:text-4xl">
                Hotele w popularnych miastach i na wyspach
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/80">
                Gotowe strony z realnymi cenami w PLN, najlepszymi dzielnicami i terminami — wejdź i rezerwuj.
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {commercialCards.map((c) => (
              <CommercialCityCard key={c.slug} {...c} />
            ))}
          </div>
        </div>
      </section>

      {/* WEDŁUG STYLU — category image tiles */}
      <section id="style" className="scroll-mt-20">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Przeglądaj według stylu</p>
          <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Jaki wyjazd masz na myśli?</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const image = imageBySlug.get(CATEGORY_IMAGE_SLUG[category.slug] ?? "") ?? null;
            return (
              <LocalizedLink
                key={category.slug}
                href={`/${foldCategorySlug(category.slug)}`}
                locale={locale}
                className="group relative flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-[1.5rem] border border-emerald-900/10 shadow-[0_12px_34px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(16,84,48,0.16)]"
              >
                {image ? (
                  <Image
                    src={image}
                    alt={getLocalizedCategoryTitle(category.slug, category.title, locale)}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.05]"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-900" />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0)_35%,rgba(5,18,11,0.55)_70%,rgba(5,18,11,0.9)_100%)]" />
                <div className="relative z-10 p-5 text-white">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">{category.eyebrow}</p>
                  <h3 className="mt-1 font-display text-2xl leading-tight">
                    {getLocalizedCategoryTitle(category.slug, category.title, locale)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-white/82 line-clamp-2">{category.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-200">
                    Zobacz kierunki <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
              </LocalizedLink>
            );
          })}
        </div>
      </section>

      {/* NAJLEPSZE NA SEZON — season image tiles */}
      <section>
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kiedy jedziesz?</p>
          <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Najlepsze kierunki na sezon</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {seasonCards.map((s) => (
            <LocalizedLink
              key={s.key}
              href={`/najlepsze-kierunki/${s.key}`}
              locale={locale}
              className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[1.5rem] border border-emerald-900/10 shadow-[0_12px_34px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(16,84,48,0.16)]"
            >
              {s.image ? (
                <Image
                  src={s.image}
                  alt={s.label}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover transition duration-500 group-hover:scale-[1.05]"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-900" />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0)_30%,rgba(5,18,11,0.6)_70%,rgba(5,18,11,0.94)_100%)]" />
              <div className="relative z-10 p-4 text-white">
                <h3 className="font-display text-2xl leading-tight">{s.label}</h3>
                <p className="mt-1 text-[12px] leading-5 text-white/85">{s.hook}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-200">
                  Zobacz <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
                </span>
              </div>
            </LocalizedLink>
          ))}
        </div>
      </section>

      {/* PEŁNE PRZEWODNIKI */}
      {guideCards.length > 0 && (
        <section>
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pełne przewodniki</p>
            <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Przewodniki po najważniejszych kierunkach</h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {guideCards.map((item) => (
              <DestinationGuideCard
                key={item.destination.slug}
                destination={item.destination}
                media={item.media}
                summary={item.summary}
                locale={locale}
              />
            ))}
          </div>
        </section>
      )}

      {/* PEŁNY KATALOG WG REGIONU */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pełny katalog</p>
            <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Wszystkie kierunki według regionu</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-emerald-900/72">
            Ponad {allDestinations.length} miast i wysp pogrupowanych regionalnie — kliknij dowolne, by zobaczyć przewodnik, pogodę i ceny.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {regionGroups.map((group) => (
            <article key={group.region} className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/72 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-emerald-950">{group.region}</h3>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900">
                  {group.items.length} kierunków
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.slice(0, 12).map((item) => (
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

      {/* FAQ */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Najczęstsze pytania</p>
        <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Zanim wybierzesz kierunek</h2>
        <div className="mt-6 divide-y divide-emerald-900/10">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-emerald-950">
                {f.q}
                <span aria-hidden className="shrink-0 text-emerald-600 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-7 text-emerald-900/80">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <FinalCtaBanner
        eyebrow="Masz już kierunek?"
        title="Sprawdź ceny i zarezerwuj w kilka minut"
        body="Wpisz miasto albo wybierz z katalogu. Hotel z finalną ceną w PLN, czas lotu i terminy ułożysz w jednym miejscu — za 0 zł i bez rejestracji."
        primaryHref="/hotele/szukaj"
        primaryLabel="Zaplanuj wyjazd"
        secondaryHref="/inspiracje"
        secondaryLabel="Zobacz pomysły na wyjazd"
      />
    </main>
  );
}

export default async function DestinationsIndexPage() {
  return DestinationsIndexPageView({ locale: "pl" });
}
