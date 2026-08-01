import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Plane, Plus, Sun } from "lucide-react";

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
import { commercialCities } from "@/lib/mvp/commercial-cities";
import { foldCategorySlug } from "@/lib/mvp/category-slug";
import { getSiteUrl } from "@/lib/mvp/site";
import { type SiteLocale } from "@/lib/mvp/locale";
import type { DestinationProfile } from "@/lib/mvp/types";

export const revalidate = 86400;

const pageCopy = {
  pl: {
    title: "Kierunki na wakacje i city break 2026 — przewodniki, hotele, loty",
    description:
      "Ponad 235 kierunków na city break, wakacje nad morzem i ciepłe wyjazdy z Polski. Realne ceny hoteli w PLN, czas lotu, pogoda i przejście prosto do rezerwacji.",
    ogDescription:
      "Ponad 235 kierunków na krótkie wyjazdy z Polski: realne ceny hoteli w PLN, czas lotu, pogoda i jeden klik do rezerwacji.",
    eyebrow: "Katalog kierunków",
    metaDescription: "Katalog kierunków HelpTravel",
  },
  en: {
    title: "Destinations for city breaks & holidays 2026 — guides, hotels, flights",
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

// Przecinek, nie kropka — to liczba pokazywana polskiemu użytkownikowi.
const flightLabel = (h?: number) =>
  typeof h === "number" ? `~${h.toFixed(1).replace(".", ",")} h z PL` : null;

// Odmiana „kierunek" — wcześniej przy każdym regionie stało sztywne
// „N kierunków", więc region z trzema pozycjami czytał się jak błąd językowy.
// Pułapka: 2–4 to „kierunki", ale 12–14 już „kierunków".
function pluralDestinations(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (n === 1) return "1 kierunek";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} kierunki`;
  return `${n} kierunków`;
}

// Compact card for a COMMERCIAL money-page (/hotele/w/[slug]) — image + real
// data (czas lotu, pogoda teraz). This is the SEO/conversion spine: it passes
// link equity from the hub to the head-term landing pages and pulls
// commercial-intent users one click from booking. ("od X zł" removed
// 2026-06-11 — the number came from a hash, not from any real offer.)
function CommercialCityCard({
  slug,
  city,
  country,
  image,
  flightHours,
  tempNow,
}: {
  slug: string;
  city: string;
  country: string;
  image: string | null;
  flightHours?: number;
  tempNow?: number;
}) {
  return (
    <Link
      href={`/hotele/w/${slug}`}
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl border border-line shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
    >
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-brand-strong" />
      )}
      <div className="relative z-10 mt-auto w-full text-white">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
        />
        <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-4">
          <p className="text-xs text-white/85">{country}</p>
          <h3 className="mt-0.5 font-display text-xl leading-tight text-white">{city}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {flightLabel(flightHours) && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
                <Plane aria-hidden className="size-3" />
                {flightLabel(flightHours)}
              </span>
            )}
            {typeof tempNow === "number" && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
                <Sun aria-hidden className="size-3" />
                teraz ~{Math.round(tempNow)}°C
              </span>
            )}
          </div>
          <span className="mt-2.5 block text-sm font-bold text-white group-hover:underline group-hover:underline-offset-4">
            Zobacz hotele
          </span>
        </div>
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
      return {
        slug: c.slug,
        city: c.cityNominative,
        country: c.countryNominative,
        image: imageBySlug.get(c.destinationId) ?? null,
        flightHours: profile?.typicalFlightHoursFromPL,
        tempNow: profile?.avgTempByMonth?.[monthIdx],
      };
    });

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
      a: "Cena zależy od sezonu, terminu i standardu hotelu, a loty z Polski to zwykle 3–4 h. Realne, finalne ceny w PLN dla wybranych dat zobaczysz po wejściu na stronę miasta, np. hotele na Krecie czy w Barcelonie.",
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
      a: "Loty obsługujemy z ponad 80 lotnisk w Polsce, Europie i na świecie (m.in. Warszawa, Kraków, Gdańsk, Wrocław, Katowice, Poznań, a także Londyn, Dubaj czy Nowy Jork). Przy każdym kierunku podajemy orientacyjny czas lotu, a w wyszukiwarce wybierzesz lotnisko wylotu i termin.",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      {/* HERO */}
      <MediaHero
        imageUrl={heroImage}
        imageAlt="Barcelona — panorama miasta i wybrzeża"
        title="Zacznij od kierunku"
        /* Liczba z `allDestinations.length`, nie wpisana z ręki. Wcześniej
           w tym zdaniu stało „Ponad 235", podczas gdy tuż obok renderowała się
           prawdziwa wartość — dwie różne liczby o tym samym w jednym hero.
           Usunięte przy okazji: „loty z ponad 80 lotnisk" (twierdzenie bez
           źródła w danych). */
        intro={`${allDestinations.length} miast i wysp na city break, wakacje nad morzem i ciepłe ucieczki z Polski. Przy każdym kierunku znajdziesz czas lotu, pogodę i realne ceny hoteli w złotówkach.`}
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-brand-strong">Otwórz wyszukiwarkę</span>
          </Link>
          <a
            href="#style"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/35 px-6 py-3 transition duration-150 ease-out hover:bg-white/10 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-white">Przeglądaj według stylu</span>
          </a>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <LocalizedLink
              key={category.slug}
              href={`/${foldCategorySlug(category.slug)}`}
              locale={locale}
              className="inline-flex min-h-11 items-center rounded-full border border-white/30 px-4 transition duration-150 ease-out hover:bg-white/10 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-white">
                {getLocalizedCategoryTitle(category.slug, category.title, locale)}
              </span>
            </LocalizedLink>
          ))}
        </div>
      </MediaHero>

      {/* POPULARNE KIERUNKI TERAZ — tiles → hotel search */}
      {popularTiles.length > 0 && (
        <section>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">
              Popularne kierunki w {MONTHS_LOCATIVE_PL[monthIdx]}
            </h2>
            <Link href="/hotele/szukaj" className="underline underline-offset-4">
              <span className="text-sm font-semibold text-brand">Wszystkie hotele</span>
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
      <section className="rounded-[2rem] bg-brand-strong p-6 text-white [--focus-ring:#fff] sm:p-10">
        <h2 className="max-w-2xl text-balance font-display text-2xl sm:text-3xl">
          Hotele w popularnych miastach i na wyspach
        </h2>
        <p className="mt-3 max-w-[60ch] text-sm leading-7 text-white/85">
          Osobna strona dla każdego z tych kierunków: ceny w złotówkach, opis dzielnic i przejście prosto do
          wyszukiwarki z ustawionym miastem.
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
          {commercialCards.map((c) => (
            <CommercialCityCard key={c.slug} {...c} />
          ))}
        </div>
      </section>

      {/* WEDŁUG STYLU — category image tiles */}
      <section id="style" className="scroll-mt-20">
        <h2 className="mb-6 font-display text-2xl text-ink sm:text-3xl">Jaki wyjazd masz na myśli?</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const image = imageBySlug.get(CATEGORY_IMAGE_SLUG[category.slug] ?? "") ?? null;
            return (
              <LocalizedLink
                key={category.slug}
                href={`/${foldCategorySlug(category.slug)}`}
                locale={locale}
                className="group relative flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-2xl border border-line shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
              >
                {image ? (
                  <Image
                    src={image}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-brand-strong" />
                )}
                <div className="relative z-10 mt-auto w-full text-white">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
                  />
                  <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-4 sm:p-5">
                    <h3 className="font-display text-xl leading-tight text-white">
                      {getLocalizedCategoryTitle(category.slug, category.title, locale)}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-white/90">{category.description}</p>
                    <span className="mt-3 block text-sm font-bold text-white group-hover:underline group-hover:underline-offset-4">
                      Zobacz kierunki
                    </span>
                  </div>
                </div>
              </LocalizedLink>
            );
          })}
        </div>
      </section>

      {/* NAJLEPSZE NA SEZON — season image tiles */}
      <section>
        <h2 className="mb-6 font-display text-2xl text-ink sm:text-3xl">Najlepsze kierunki na sezon</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {seasonCards.map((s) => (
            <LocalizedLink
              key={s.key}
              href={`/najlepsze-kierunki/${s.key}`}
              locale={locale}
              className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border border-line shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
            >
              {s.image ? (
                <Image src={s.image} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" />
              ) : (
                <div className="absolute inset-0 bg-brand-strong" />
              )}
              <div className="relative z-10 mt-auto w-full text-white">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
                />
                <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-4">
                  <h3 className="font-display text-xl leading-tight text-white">{s.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/90">{s.hook}</p>
                </div>
              </div>
            </LocalizedLink>
          ))}
        </div>
      </section>

      {/* PEŁNE PRZEWODNIKI */}
      {guideCards.length > 0 && (
        <section>
          <h2 className="mb-6 font-display text-2xl text-ink sm:text-3xl">
            Przewodniki po najważniejszych kierunkach
          </h2>
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
      {/* Bez karty opakowującej: karta w karcie to zagnieżdżenie, którego
          system projektowy zabrania, a tu i tak nic nie wnosiła. */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h2 className="font-display text-2xl text-ink sm:text-3xl">Wszystkie kierunki według regionu</h2>
          <p className="max-w-xl text-sm leading-7 text-ink-muted">
            {allDestinations.length} miast i wysp pogrupowanych regionalnie — kliknij dowolne, by zobaczyć
            przewodnik, pogodę i ceny.
          </p>
        </div>
        <div className="mt-7 grid gap-x-10 gap-y-8 lg:grid-cols-2">
          {regionGroups.map((group) => (
            <div key={group.region} className="border-t border-line pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-bold text-ink">{group.region}</h3>
                <span className="text-sm text-ink-muted">{pluralDestinations(group.items.length)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.slice(0, 12).map((item) => (
                  <LocalizedLink
                    key={item.slug}
                    href={`/kierunki/${profileSlugByLocation.get(`${item.city}|${item.country}`) ?? item.slug}`}
                    locale={locale}
                    className="inline-flex min-h-11 items-center rounded-sm bg-surface-sunken px-3.5 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    <span className="text-sm font-semibold text-ink">{item.city}</span>
                  </LocalizedLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Zanim wybierzesz kierunek</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {faqs.map((f) => (
            <details key={f.q} className="group py-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-bold text-ink marker:content-none">
                {f.q}
                <Plus
                  aria-hidden
                  className="size-4 shrink-0 text-brand transition duration-200 ease-out group-open:rotate-45 motion-reduce:transition-none"
                />
              </summary>
              <p className="mt-3 max-w-[65ch] text-base leading-7 text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <FinalCtaBanner
        title="Sprawdź ceny dla swojego terminu"
        body="Wpisz miasto albo wybierz je z katalogu powyżej. Zobaczysz ceny hoteli w złotówkach, z podatkami i opłatami — bez zakładania konta."
        primaryHref="/hotele/szukaj"
        primaryLabel="Otwórz wyszukiwarkę"
        secondaryHref="/inspiracje"
        secondaryLabel="Zobacz pomysły na wyjazd"
      />
    </main>
  );
}

export default async function DestinationsIndexPage() {
  return DestinationsIndexPageView({ locale: "pl" });
}
