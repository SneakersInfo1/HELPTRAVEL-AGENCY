import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { AuthorByline } from "@/components/publisher/author-byline";
import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { SaveDestinationButton } from "@/components/publisher/save-destination-button";
import { LocalizedLink } from "@/components/site/localized-link";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { getComparisonsForDestination } from "@/lib/mvp/comparisons";
import { findCommercialCityByDestinationId } from "@/lib/mvp/commercial-cities";
import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
import { getDestinationStory, getStoryBySlug } from "@/lib/mvp/destination-content";
import {
  buildLocalizedAvoidNotes,
  buildLocalizedComparisonSignals,
  buildLocalizedHotelAreaGuidance,
  buildLocalizedWinningScenarios,
  formatDestinationMonth,
  getLocalizedDestinationGuide,
} from "@/lib/mvp/destination-localization";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  getArticlesForDestination,
  getCategoriesForDestination,
  getDestinationGuideBySlug,
  getSimilarDestinations,
} from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import { addDaysToIsoDate, defaultTravelStartDate, formatShortDate } from "@/lib/mvp/travel-dates";

interface DestinationGuidePageProps {
  params: Promise<{ slug: string }>;
}

function estimateBudget(costIndex: number, flightHours: number) {
  const days = 4;
  const travelers = 2;
  const flightBasePerPerson = 380 + flightHours * 70;
  const stayAndFoodPerDayPerPerson = 170 * costIndex;
  const localTransportAndTickets = 65 * costIndex;
  const total =
    travelers * flightBasePerPerson +
    travelers * days * stayAndFoodPerDayPerPerson +
    days * localTransportAndTickets;

  return {
    min: Math.round(total * 0.9),
    max: Math.round(total * 1.18),
  };
}

function bestMonthsFromTemperatures(temperatures: number[]) {
  const comfortableMonths = temperatures
    .map((temp, index) => ({ temp, index }))
    .filter((item) => item.temp >= 20 && item.temp <= 30)
    .slice(0, 6)
    .map((item) => item.index + 1);

  return comfortableMonths;
}

function idealTripLength(flightHours: number) {
  if (flightHours <= 3.5) {
    return "3-4 dni";
  }

  if (flightHours <= 5.5) {
    return "4-5 dni";
  }

  return "5-7 dni";
}

function recommendedNights(flightHours: number) {
  if (flightHours <= 3.5) {
    return 4;
  }

  if (flightHours <= 5.5) {
    return 5;
  }

  return 6;
}


export async function generateStaticParams() {
  return getAllDestinationProfiles().map((destination) => ({ slug: destination.slug }));
}

export async function generateMetadata({ params }: DestinationGuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) {
    return {
      title: "Kierunek",
      description: "Praktyczny przewodnik po kierunku i przejście do planera.",
    };
  }

  const budget = estimateBudget(guide.destination.costIndex, guide.destination.typicalFlightHoursFromPL);
  const tripLength = idealTripLength(guide.destination.typicalFlightHoursFromPL);
  // SEO title: commercial intent ("hotele od X zł") + freshness ("2026") +
  // brand tail. Replaces the old informational-only "kiedy lecieć, gdzie
  // spać" which lost SERP CTR to competitors with concrete prices.
  // Length budget: city + " 2026: hotele od X zł, loty od Y h i przewodnik" ≈ 60 chars.
  const hotelFromPln = Math.round(budget.min / (4 * 2)); // budget is per 2 osoby / 4 dni
  const year = new Date().getFullYear();
  const flightHoursFmt = guide.destination.typicalFlightHoursFromPL.toFixed(1);
  // Polish display name for title/meta/SEO. Prefer the curated editorial name
  // (so island guides read "Kreta"/"Majorka", not the airport city
  // "Heraklion"/"Palma"); otherwise fall back to the city exonym (Athens
  // Ateny). The canonical English city name stays as the LiteAPI search key.
  const cityPl = getStoryBySlug(guide.destination.slug)?.name ?? localizeCity(guide.destination.city);
  const countryPl = localizeCountry(guide.destination.country);

  return {
    title: `${cityPl} ${year}: hotele od ${hotelFromPln} zł, lot ${flightHoursFmt} h, przewodnik`,
    description: `${cityPl} ${year}: najlepsze terminy, hotele od ${hotelFromPln} zł, lot z Polski ${flightHoursFmt} h. Orientacyjny budżet dla 2 osób na ${tripLength}: ${budget.min}-${budget.max} zł. Praktyczny przewodnik + przejście do oferty w PLN.`,
    keywords: [
      `${cityPl}`,
      `${cityPl} ${year}`,
      `hotele ${cityPl}`,
      `wakacje ${cityPl}`,
      `${cityPl} przewodnik`,
      `tanie loty ${cityPl}`,
      `${countryPl}`,
    ].join(", "),
    alternates: {
      canonical: `/kierunki/${guide.destination.slug}`,
    },
    openGraph: {
      title: `${cityPl} ${year} — hotele od ${hotelFromPln} zł, lot ${flightHoursFmt} h`,
      description: `${cityPl}: najlepsze terminy, ceny w PLN, lot ${flightHoursFmt} h z Polski. Hotele, loty, przewodnik.`,
      url: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
      type: "article",
      locale: "pl_PL",
    },
    twitter: {
      card: "summary_large_image",
      title: `${cityPl} ${year}: hotele od ${hotelFromPln} zł`,
      description: `Lot ${flightHoursFmt} h, budżet od ${budget.min} zł. Sprawdź konkretne oferty w PLN.`,
    },
  };
}

export default async function DestinationGuidePage({ params }: DestinationGuidePageProps) {
  const { slug } = await params;
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) notFound();

  const media = await resolveDestinationMedia(guide.destination);
  const story = getDestinationStory({ ...guide.destination, media });
  const localizedGuide = getLocalizedDestinationGuide(guide, story, "pl");
  // Polish display name. Curated editorial name first (island guides
  // "Kreta"/"Majorka", not "Heraklion"/"Palma"), else city exonym
  // (Athens Ateny). English `guide.destination.city` stays only in the
  // LiteAPI search hrefs below (the canonical search key).
  const cityPl = getStoryBySlug(guide.destination.slug)?.name ?? localizeCity(guide.destination.city);
  const relatedArticles = getArticlesForDestination(slug).slice(0, 4);
  const relatedCategories = getCategoriesForDestination(slug).slice(0, 4);
  const similarDestinations = await Promise.all(
    getSimilarDestinations(slug, 4).map(async (destination) => ({
      destination,
      guide: getDestinationGuideBySlug(destination.slug),
      media: await resolveDestinationMedia(destination),
    })),
  );
  const budget = estimateBudget(guide.destination.costIndex, guide.destination.typicalFlightHoursFromPL);
  const bestMonths = bestMonthsFromTemperatures(guide.destination.avgTempByMonth);
  const tripLength = idealTripLength(guide.destination.typicalFlightHoursFromPL);
  const defaultStartDate = defaultTravelStartDate();
  const defaultNights = recommendedNights(guide.destination.typicalFlightHoursFromPL);
  const defaultCheckOutDate = addDaysToIsoDate(defaultStartDate, defaultNights);
  const tripProfile =
    localizedGuide.tripProfile;
  const routeComfort = localizedGuide.routeComfort;
  const visaNote = localizedGuide.visaNote;
  const avoidNotes = buildLocalizedAvoidNotes(guide, "pl");
  const hotelAreaGuidance = buildLocalizedHotelAreaGuidance(guide, "pl");
  const comparisonSignals = buildLocalizedComparisonSignals(
    guide.destination,
    similarDestinations.map((item) => item.destination),
    "pl",
  );
  const winningScenarios = buildLocalizedWinningScenarios(guide, "pl");
  // Internal links to this destination's 1:1 comparison pages (/porownanie/…).
  // Passes equity from the ~235 guide pages into the high-CTR comparison pages
  // and gives "X czy Y" searchers a direct entry. SEO master plan D6 (extended).
  const comparisonLinks = getComparisonsForDestination(slug)
    .map((pair) => {
      const otherSlug = pair.a === slug ? pair.b : pair.a;
      const otherGuide = getDestinationGuideBySlug(otherSlug);
      if (!otherGuide) return null;
      const thisLabel = (pair.a === slug ? pair.labelA : pair.labelB) ?? cityPl;
      const otherLabel =
        (pair.a === slug ? pair.labelB : pair.labelA) ??
        getStoryBySlug(otherSlug)?.name ??
        localizeCity(otherGuide.destination.city);
      return { href: `/porownanie/${pair.slug}`, thisLabel, otherLabel };
    })
    .filter((x): x is { href: string; thisLabel: string; otherLabel: string } => x !== null);
  const destinationSearchHref = `/hotele/szukaj?${new URLSearchParams({
    destination: guide.destination.city,
    country: guide.destination.country,
    origin: "Warszawa",
    checkin: defaultStartDate,
    checkout: defaultCheckOutDate,
    adults: "2",
    rooms: "1",
  }).toString()}`;
  // Model: hotele i loty obsługiwane wewnętrznie (LiteAPI).
  const internalHotelsHref = `/hotele/szukaj?${new URLSearchParams({
    destination: guide.destination.city,
    country: guide.destination.country,
    checkin: defaultStartDate,
    checkout: defaultCheckOutDate,
    adults: "2",
    rooms: "1",
  }).toString()}`;
  // If this destination has a dedicated commercial landing page
  // (/hotele/w/[miasto]), link to it — passes link equity from this guide
  // into the high-intent money page and gives the user a direct "hotele w X"
  // entry point. SEO master plan D6.
  const commercialCity = findCommercialCityByDestinationId(guide.destination.slug);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${getSiteUrl()}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${getSiteUrl()}/kierunki` },
          {
            "@type": "ListItem",
            position: 3,
            name: cityPl,
            item: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: localizedGuide.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
      {
        "@type": "Article",
        headline: `${cityPl} - przewodnik`,
        description: localizedGuide.overview,
        inLanguage: "pl-PL",
        mainEntityOfPage: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
        image: media.heroImage,
        datePublished: "2026-01-01T00:00:00.000Z",
        dateModified: new Date().toISOString(),
        author: personSchema(EDITOR_IN_CHIEF),
        publisher: { "@id": `${getSiteUrl()}/#organization` },
        about: [cityPl, localizeCountry(guide.destination.country), "city break", "planowanie podróży"],
      },
      {
        "@type": "TouristDestination",
        "@id": `${getSiteUrl()}/kierunki/${guide.destination.slug}#destination`,
        name: cityPl,
        description: localizedGuide.overview,
        touristType: Array.isArray(localizedGuide.whoFor) ? localizedGuide.whoFor : [localizedGuide.whoFor],
        url: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
        image: media.heroImage,
        address: {
          "@type": "PostalAddress",
          addressCountry: guide.destination.country,
          addressLocality: cityPl,
        },
        includesAttraction: localizedGuide.bestForTags.slice(0, 6).map((tag) => ({
          "@type": "TouristAttraction",
          name: tag,
        })),
        availableLanguage: ["pl", "en"],
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="overflow-hidden rounded-[2rem] border border-line bg-surface-raised shadow-sm">
        <div className="relative flex min-h-[24rem] flex-col justify-end sm:min-h-[26rem]">
          <Image src={media.heroImage} alt={`${cityPl}, ${localizeCountry(guide.destination.country)}`} fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.12)_0%,rgba(5,18,11,0.72)_100%)]" />
          <div className="relative z-10 p-6 text-white sm:p-8">
            <Breadcrumbs
              locale="pl"
              items={[
                { label: "Start", href: "/" },
                { label: "Kierunki", href: "/kierunki" },
                { label: cityPl },
              ]}
            />
            <h1 className="mt-3 max-w-4xl font-display text-3xl leading-[1.08] sm:text-5xl sm:leading-[0.95] md:text-6xl">{cityPl}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/86">{localizedGuide.overview}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                {tripLength}
              </span>
              <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                lot ok. {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h
              </span>
              <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                od {budget.min} PLN / 2 os.
              </span>
              {localizedGuide.bestForTags.slice(0, 4).map((item) => (
                <span key={item} className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-5">
              <SaveDestinationButton
                slug={guide.destination.slug}
                city={guide.destination.city}
                country={guide.destination.country}
                locale="pl"
              />
            </div>
          </div>
        </div>
      </section>

      {commercialCity && (
        <LocalizedLink
          href={`/hotele/w/${commercialCity.slug}`}
          className="inline-flex min-h-11 flex-wrap items-center justify-center gap-3 rounded-2xl border border-brand bg-brand px-6 py-4 shadow-sm transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span className="text-base font-bold text-white sm:text-lg">
            Zobacz najlepsze hotele w {commercialCity.cityLocative} — ceny w PLN, od ręki
          </span>
          <span className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-bold text-ink">
            Hotele w {commercialCity.cityLocative}
          </span>
        </LocalizedLink>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-raised px-5 py-3 shadow-sm">
        <AuthorByline author={EDITOR_IN_CHIEF} updatedISO={new Date().toISOString()} />
        <span className="text-xs text-ink-muted">Oparte na realnych danych o cenach, pogodzie i lotach</span>
      </div>

      <EditorialMetaBar
        eyebrow="Na start"
        title="Najważniejsze rzeczy przed decyzją o wyjeździe"
        items={[
          `${cityPl} z Polski`,
          `${guide.destination.typicalFlightHoursFromPL.toFixed(1)} h lotu`,
          localizedGuide.tripLength,
          "noclegi, loty i dalsze kroki",
        ]}
      />

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="mt-3 font-display text-4xl text-ink">Mocne strony kierunku</h2>
          <div className="mt-5 space-y-3">
            {localizedGuide.whyGo.map((reason) => (
              <div key={reason} className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm leading-7 text-ink">
                {reason}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(225,243,231,0.9))] p-6 shadow-sm">
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-surface-raised px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Najlepszy czas i tempo</p>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{localizedGuide.bestTime}</p>
              <p className="mt-2 text-sm leading-7 text-ink-muted">Najczęściej najlepiej sprawdza się tu wyjazd na {tripLength}, bez przesadnego rozciągania pobytu.</p>
            </div>
            <div className="rounded-2xl bg-surface-raised px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Orientacyjny budżet</p>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                Dla 2 osób na 4 dni zwykle warto liczyc okolice {budget.min}-{budget.max} PLN. To orientacyjny zakres
                planistyczny, a nie cena gwarantowana.
              </p>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{localizedGuide.budgetNote}</p>
            </div>
            <div className="rounded-2xl bg-surface-raised px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Dojazd i logistyka</p>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                Lot z Polski zwykle zajmuje około {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h. Kierunek
                najlepiej wygląda zwykle w miesiącach: {bestMonths.slice(0, 4).map((month) => formatDestinationMonth(month, "pl")).join(", ")}.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <ul className="mt-4 space-y-2 text-sm leading-7 text-ink-muted">
            {localizedGuide.highlights.map((item) => (
              <li key={item} className="rounded-2xl bg-surface-sunken px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          {localizedGuide.districts.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm leading-7 text-ink-muted">
              {localizedGuide.districts.map((item) => (
                <li key={item} className="rounded-2xl bg-surface-sunken px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm leading-7 text-ink-muted">
              Dla tego kierunku nie pokazujemy jeszcze sztywnej listy dzielnic, żeby nie wrzucac sztucznej listy nazw. Na pierwszy plan najlepiej filtruj nocleg po czasie dojścia do centrum, plaży albo głównej osi zwiedzania.
            </p>
          )}
        </article>

        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <div className="mt-4 flex flex-wrap gap-2">
            {localizedGuide.whoFor.map((item) => (
              <span
                key={item}
                className="rounded-full border border-line bg-surface-sunken px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink"
              >
                {item}
              </span>
            ))}
          </div>
          <p className="mt-5 text-sm leading-7 text-ink-muted">{localizedGuide.budgetNote}</p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="mt-2 font-display text-4xl text-ink">Możesz od razu przejść do pobytu, lotów i dalszego planowania.</h2>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              Startowo ustawiamy Warszawa, 2 osóby i {defaultNights} {defaultNights < 5 ? "noce" : "nocy"}:
              {" "}
              {formatShortDate(defaultStartDate, "pl-PL")} - {formatShortDate(defaultCheckOutDate, "pl-PL")}. To tylko punkt
              wyjścia, który potem zmienisz w wyszukiwarce jednym kliknięciem.
            </p>
          </div>
          <LocalizedLink
            href={destinationSearchHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">Otwórz hotele i loty</span>
          </LocalizedLink>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          <LocalizedLink href={internalHotelsHref} className="rounded-2xl border border-brand bg-brand p-5 shadow-sm transition hover:-translate-y-1 hover:bg-brand-strong motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:col-span-2 xl:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white">Hotele</p>
            <h3 className="mt-2 text-2xl font-bold text-white">Sprawdź hotele w {guide.destination.city}</h3>
            <p className="mt-3 text-sm leading-6 text-white/82">
              Konkretne ceny w PLN dla terminu {formatShortDate(defaultStartDate, "pl-PL")} – {formatShortDate(defaultCheckOutDate, "pl-PL")}. Bez wychodzenia ze strony.
            </p>
          </LocalizedLink>
          <LocalizedLink
            href="/?tab=loty"
            className="rounded-2xl border border-brand-strong bg-brand-strong p-5 shadow-sm transition hover:-translate-y-1 hover:bg-brand-strong motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:col-span-2 xl:col-span-2"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white">Loty</p>
            <h3 className="mt-2 text-2xl font-bold text-white">Sprawdź loty do {guide.destination.city}</h3>
            <p className="mt-3 text-sm leading-6 text-white/78">
              Wyszukaj loty z dowolnego lotniska w Polsce. Lot ok. {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h.
            </p>
          </LocalizedLink>
          </div>
        </section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="mt-2 font-display text-4xl text-ink">Najważniejsze sygnały przed decyzja o wyjeździe</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface-sunken px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Najlepszy format</p>
              <p className="mt-2 text-lg font-bold text-ink">{tripProfile}</p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                To kierunek, który najmocniej pracuje wtedy, gdy planujesz {tripLength} i chcesz sensownego balansu
                wysiłku do efektu.
              </p>
            </div>
            <div className="rounded-2xl bg-surface-sunken px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Dojazd z Polski</p>
              <p className="mt-2 text-lg font-bold text-ink">{routeComfort}</p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Lot zwykle zajmuje około {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h, więc łatwiej ocenić
                czy to kierunek na szybki wypad, czy na troche dłuższy pobyt.
              </p>
            </div>
            <div className="rounded-2xl bg-surface-sunken px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Najlepsza długość</p>
              <p className="mt-2 text-lg font-bold text-ink">{tripLength}</p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Ten scenariusz zwykle daje najlepszy stosunek kosztu do wygody, bez poczucia, ze wyjazd jest za krótki
                albo niepotrzebnie rozciagniety.
              </p>
            </div>
            <div className="rounded-2xl bg-surface-sunken px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Formalności i sezon</p>
              <p className="mt-2 text-lg font-bold text-ink">{visaNote}</p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Najmocniejsze miesiące dla tego kierunku to zwykle {bestMonths.slice(0, 3).map((month) => formatDestinationMonth(month, "pl")).join(", ")}.
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
          <h2 className="mt-2 font-display text-4xl text-ink">Ten kierunek dobrze łączy się z tymi potrzebami i kolejnymi klikami.</h2>
          {relatedCategories.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {relatedCategories.map((category) => (
                <LocalizedLink
                  key={category.slug}
                  href={`/${category.slug}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ink">{category.title}</span>
                </LocalizedLink>
              ))}
            </div>
          ) : null}
          <div className="mt-5 space-y-3 text-sm leading-7 text-ink-muted">
            <p>
              Ta strona ma pomoc zdecydować, czy kierunek pasuje do stylu wyjazdu, budżetu i realnej logistyki z Polski.
            </p>
            <p>
              Jeśli miasto wygląda dobrze, przechodzisz dalej do planera i gotowych przejść do pobytu, lotu, atrakcji
              i kolejnych kroków dla tego samego terminu.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <LocalizedLink
              href={destinationSearchHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold text-white">Sprawdź hotele i loty</span>
            </LocalizedLink>
            <LocalizedLink
              href="/kierunki"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-ink">Porównaj z innymi kierunkami</span>
            </LocalizedLink>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="mt-2 font-display text-4xl text-ink">Trzy sytuacje, w których {cityPl} najczęściej okazuje się dobrym wyborem.</h2>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              Ten blok ma pomoc ocenić, czy brief pasuje do kierunku zanim klikniesz w hotel albo lot.
            </p>
          </div>
          <LocalizedLink
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-4 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">Porównaj z innym kierunkiem</span>
          </LocalizedLink>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {winningScenarios.map((scenario) => (
            <article key={scenario.title} className="rounded-2xl border border-line bg-surface-sunken p-5">
              <h3 className="text-xl font-bold text-ink">{scenario.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{scenario.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="mt-2 font-display text-4xl text-ink">Najrozsądniejsze okolice na nocleg przy pierwszym planie.</h2>
          {hotelAreaGuidance.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {hotelAreaGuidance.map((item) => (
                <article key={item.district} className="rounded-2xl bg-surface-sunken px-4 py-4">
                  <h3 className="text-lg font-bold text-ink">{item.district}</h3>
                  <p className="mt-2 text-sm leading-7 text-ink-muted">{item.rationale}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-surface-sunken px-4 py-4 text-sm leading-7 text-ink-muted">
              Nie pokazujemy tu sztucznej listy dzielnic. Przy pierwszym planie najlepiej zacząć od noclegu z dobrym dojściem do centrum, plaży albo głównej osi zwiedzania, a potem zawęzić wybór po cenie i logistyce.
            </p>
          )}
        </article>

        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
          <h2 className="mt-2 font-display text-4xl text-ink">Dla kogo ten kierunek może być słabszym wyborem.</h2>
          <div className="mt-5 space-y-3">
            {avoidNotes.length > 0 ? (
              avoidNotes.map((item) => (
                <div key={item} className="rounded-2xl bg-surface-raised px-4 py-4 text-sm leading-7 text-ink-muted">
                  {item}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-surface-raised px-4 py-4 text-sm leading-7 text-ink-muted">
                Kierunek wypada bardzo równo. W praktyce słabiej sprawdzi się tylko wtedy, gdy brief jest skrajnie budżetowy albo wymaga bardzo specyficznej logistyki.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="mt-2 font-display text-4xl text-ink">Przykladowy rytm wyjazdu</h2>
          <LocalizedLink
            href={destinationSearchHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-4 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">Sprawdź hotele i loty</span>
          </LocalizedLink>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {localizedGuide.miniPlan.map((item) => (
            <article key={`${item.day}-${item.title}`} className="rounded-2xl border border-line bg-surface-sunken p-5">
              <h3 className="mt-2 text-xl font-bold text-ink">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {comparisonSignals.length > 0 ? (
        <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="mt-2 font-display text-4xl text-ink">Jak {cityPl} wypada na tle podobnych opcji</h2>
            <LocalizedLink
              href="/kierunki"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-4 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-ink">Porównaj kierunki</span>
            </LocalizedLink>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {comparisonSignals.map((item) => (
              <article key={item.slug} className="rounded-2xl border border-line bg-surface-sunken p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{item.city}</p>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{item.summary}</p>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{item.bestFor}</p>
                <LocalizedLink
                  href={`/kierunki/${item.slug}`}
                  className="group mt-4 inline-flex text-sm font-semibold"
                >
                  <span className="text-ink transition group-hover:text-brand">Otwórz ten kierunek</span>
                </LocalizedLink>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {comparisonLinks.length > 0 ? (
        <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-3xl">
              <h2 className="mt-2 font-display text-4xl text-ink">Porównaj {cityPl} z innym kierunkiem</h2>
              <p className="mt-3 text-sm leading-7 text-ink-muted">
                Wahasz się między dwoma kierunkami? Zobacz bezpośrednie porównanie obok siebie — pogoda miesiąc po miesiącu, orientacyjny budżet, plaże i dolot z Polski.
              </p>
            </div>
            <LocalizedLink
              href="/porownanie"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-4 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-ink">Wszystkie porównania</span>
            </LocalizedLink>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {comparisonLinks.map((c) => (
              <LocalizedLink
                key={c.href}
                href={c.href}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-4 transition duration-150 ease-out hover:border-brand hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-sm font-semibold text-ink">{c.thisLabel} vs {c.otherLabel}</span>
              </LocalizedLink>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <div className="mt-5 space-y-4">
            {localizedGuide.faq.map((item) => (
              <article key={item.question} className="rounded-2xl bg-surface-sunken px-4 py-4">
                <h3 className="text-base font-bold text-ink">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{item.answer}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-sm">
          <h2 className="mt-3 font-display text-4xl">Przejdź z przewodnika do konkretnego planu wyjazdu.</h2>
          <p className="mt-4 text-sm leading-7 text-white/82">
            Ten przewodnik nie kończy się na inspiracji. Od razu przechodzisz dalej do noclegów, lotów, atrakcji i
            kolejnych decyzji dopasowanych do tego konkretnego kierunku.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LocalizedLink
              href={destinationSearchHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold text-ink">Sprawdź hotele w {guide.destination.city}</span>
            </LocalizedLink>
            <LocalizedLink
              href="/kierunki"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 py-3 transition duration-150 ease-out hover:bg-white/12 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-white">Nie wiem dokąd lecieć</span>
            </LocalizedLink>
          </div>
        </article>
      </section>

      {relatedArticles.length > 0 ? (
        <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="mt-2 font-display text-4xl text-ink">Przydatne treści wokół tego kierunku</h2>
            <LocalizedLink href="/inspiracje" className="group text-sm font-semibold">
              <span className="text-ink transition group-hover:text-brand">Wszystkie inspiracje</span>
            </LocalizedLink>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {relatedArticles.map((article) => (
              <EditorialArticleCard key={article.slug} article={article} compact locale="pl" />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
        <h2 className="mt-2 font-display text-4xl text-ink">Jeśli ten kierunek pasuje, sprawdź tez te opcje.</h2>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {similarDestinations.map((item) =>
            item.guide ? (
              <DestinationGuideCard
                key={item.destination.slug}
                destination={item.destination}
                media={item.media}
                summary={getLocalizedDestinationGuide(item.guide, getDestinationStory(item.destination), "pl").overview}
                locale="pl"
              />
            ) : null,
          )}
        </div>
      </section>
    </main>
  );
}


