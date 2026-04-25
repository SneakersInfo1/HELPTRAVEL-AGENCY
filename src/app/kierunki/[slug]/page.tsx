import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { SaveDestinationButton } from "@/components/publisher/save-destination-button";
import { PartnerPlacementSection } from "@/components/site/partner-placement-section";
import { LocalizedLink } from "@/components/site/localized-link";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildAffiliateLinksWithContext } from "@/lib/mvp/affiliate-links";
import { getDestinationStory } from "@/lib/mvp/destination-content";
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
import { buildRedirectHref } from "@/lib/mvp/providers";
import { buildPartnerPlacementCards } from "@/lib/mvp/partner-placements";
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

  const story = getDestinationStory(guide.destination);
  const localizedGuide = getLocalizedDestinationGuide(guide, story, "pl");
  const budget = estimateBudget(guide.destination.costIndex, guide.destination.typicalFlightHoursFromPL);
  const tripLength = idealTripLength(guide.destination.typicalFlightHoursFromPL);
  return {
    title: `${guide.destination.city} - kiedy lecieć, gdzie spać i czy warto`,
    description: `${localizedGuide.overview} Idealnie na ${tripLength}. Orientacyjny budżet dla 2 osób: ${budget.min}-${budget.max} PLN.`,
    alternates: {
      canonical: `/kierunki/${guide.destination.slug}`,
    },
    openGraph: {
      title: `${guide.destination.city} - kiedy lecieć, gdzie spać i jak zaplanować wyjazd`,
      description: `${localizedGuide.overview} Sprawdź najlepszy czas, budżet, noclegi i kolejne kroki do planera.`,
      url: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
      type: "article",
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
  const commercialLinks = buildAffiliateLinksWithContext({
    city: guide.destination.city,
    country: guide.destination.country,
    originCity: "Warszawa",
    departureDate: defaultStartDate,
    checkInDate: defaultStartDate,
    checkOutDate: defaultCheckOutDate,
    passengers: 2,
    rooms: 1,
  });
  const stayPartner = getAffiliateBrandLabel(commercialLinks.stays, "Hotels.com");
  const flightPartner = getAffiliateBrandLabel(commercialLinks.flights, "Partner lotniczy");
  const carPartner = getAffiliateBrandLabel(commercialLinks.cars, "Partner aut");
  const destinationPlannerHref = `/planner?${new URLSearchParams({
    mode: "standard",
    q: guide.destination.city,
    destination: guide.destination.city,
    origin: "Warszawa",
    startDate: defaultStartDate,
    endDate: defaultCheckOutDate,
    nights: String(defaultNights),
    travelers: "2",
    budget: String(budget.max),
  }).toString()}`;
  const stayRedirectHref = buildRedirectHref({
    providerKey: "stays",
    targetUrl: commercialLinks.stays,
    city: guide.destination.city,
    country: guide.destination.country,
    source: "destination_page_stays",
  });
  const flightRedirectHref = buildRedirectHref({
    providerKey: "flights",
    targetUrl: commercialLinks.flights,
    city: guide.destination.city,
    country: guide.destination.country,
    source: "destination_page_flights",
  });
  const activityRedirectHref = buildRedirectHref({
    providerKey: "attractions",
    targetUrl: commercialLinks.attractions,
    city: guide.destination.city,
    country: guide.destination.country,
    source: "destination_page_activities",
  });
  const carRedirectHref = buildRedirectHref({
    providerKey: "cars",
    targetUrl: commercialLinks.cars,
    city: guide.destination.city,
    country: guide.destination.country,
    source: "destination_page_cars",
  });
  const partnerPlacementCards = buildPartnerPlacementCards({
    city: guide.destination.city,
    country: guide.destination.country,
    originCity: "Warszawa",
    departureDate: defaultStartDate,
    checkInDate: defaultStartDate,
    checkOutDate: defaultCheckOutDate,
    passengers: 2,
    rooms: 1,
    locale: "pl",
  }).map((card, index) =>
    index === 0
      ? { ...card, href: stayRedirectHref }
      : index === 1
        ? { ...card, href: flightRedirectHref }
        : index === 2
          ? { ...card, href: activityRedirectHref }
          : { ...card, href: carRedirectHref },
  );
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
            name: guide.destination.city,
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
        headline: `${guide.destination.city} - przewodnik`,
        description: localizedGuide.overview,
        inLanguage: "pl-PL",
        mainEntityOfPage: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
        image: media.heroImage,
        datePublished: "2026-01-01T00:00:00.000Z",
        dateModified: new Date().toISOString(),
        author: {
          "@type": "Organization",
          "@id": `${getSiteUrl()}/#organization`,
          name: "HelpTravel",
        },
        publisher: { "@id": `${getSiteUrl()}/#organization` },
        about: [guide.destination.city, guide.destination.country, "city break", "planowanie podróży"],
      },
      {
        "@type": "TouristDestination",
        "@id": `${getSiteUrl()}/kierunki/${guide.destination.slug}#destination`,
        name: guide.destination.city,
        description: localizedGuide.overview,
        touristType: Array.isArray(localizedGuide.whoFor) ? localizedGuide.whoFor : [localizedGuide.whoFor],
        url: `${getSiteUrl()}/kierunki/${guide.destination.slug}`,
        image: media.heroImage,
        address: {
          "@type": "PostalAddress",
          addressCountry: guide.destination.country,
          addressLocality: guide.destination.city,
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

      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_20px_60px_rgba(16,84,48,0.08)]">
        <div className="relative h-[26rem]">
          <Image src={media.heroImage} alt={`${guide.destination.city}, ${guide.destination.country}`} fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.12)_0%,rgba(5,18,11,0.72)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <Breadcrumbs
              locale="pl"
              items={[
                { label: "Start", href: "/" },
                { label: "Kierunki", href: "/kierunki" },
                { label: guide.destination.city },
              ]}
            />
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Kierunek z Polski na prostszy plan wyjazdu</p>
            <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] sm:text-6xl">{guide.destination.city}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/86">{localizedGuide.overview}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                {tripLength}
              </span>
              <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                lot ok. {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h
              </span>
              <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                od {budget.min} PLN / 2 os.
              </span>
              {localizedGuide.bestForTags.slice(0, 4).map((item) => (
                <span key={item} className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
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

      <EditorialMetaBar
        eyebrow="Na start"
        title="Najważniejsze rzeczy przed decyzja o wyjezdzie"
        items={[
          `${guide.destination.city} z Polski`,
          `${guide.destination.typicalFlightHoursFromPL.toFixed(1)} h lotu`,
          localizedGuide.tripLength,
          "planner i przejścia do partnerów",
        ]}
      />

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dlaczego warto</p>
          <h2 className="mt-3 font-display text-4xl text-emerald-950">Mocne strony kierunku</h2>
          <div className="mt-5 space-y-3">
            {localizedGuide.whyGo.map((reason) => (
              <div key={reason} className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm leading-7 text-emerald-900">
                {reason}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(225,243,231,0.9))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Praktyczne podstawy</p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Najlepszy czas i tempo</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">{localizedGuide.bestTime}</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/72">Najczęściej najlepiej sprawdza się tu wyjazd na {tripLength}, bez przesadnego rozciągania pobytu.</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Orientacyjny budżet</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">
                Dla 2 osób na 4 dni zwykle warto liczyc okolice {budget.min}-{budget.max} PLN. To orientacyjny zakres
                planistyczny, a nie cena gwarantowana.
              </p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/72">{localizedGuide.budgetNote}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Dojazd i logistyka</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">
                Lot z Polski zwykle zajmuje okolo {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h. Kierunek
                najlepiej wyglada zwykle w miesiacach: {bestMonths.slice(0, 4).map((month) => formatDestinationMonth(month, "pl")).join(", ")}.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Co zobaczyc</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {localizedGuide.highlights.map((item) => (
              <li key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dzielnice i okolice</p>
          {localizedGuide.districts.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
              {localizedGuide.districts.map((item) => (
                <li key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">
              Dla tego kierunku nie pokazujemy jeszcze sztywnej listy dzielnic, żeby nie wrzucac sztucznej listy nazw. Na pierwszy plan najlepiej filtruj nocleg po czasie dojścia do centrum, plaży albo głównej osi zwiedzania.
            </p>
          )}
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dla kogo</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {localizedGuide.whoFor.map((item) => (
              <span
                key={item}
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-900"
              >
                {item}
              </span>
            ))}
          </div>
          <p className="mt-5 text-sm leading-7 text-emerald-900/78">{localizedGuide.budgetNote}</p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Gotowe następne kroki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Możesz od razu przejść do pobytu, lotów i dalszego planowania.</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">
              Startowo ustawiamy Warszawa, 2 osóby i {defaultNights} {defaultNights < 5 ? "noce" : "nocy"}:
              {" "}
              {formatShortDate(defaultStartDate, "pl-PL")} - {formatShortDate(defaultCheckOutDate, "pl-PL")}. To tylko punkt
              wyjscia, który potem zmienisz w plannerze jednym kliknięciem.
            </p>
          </div>
          <LocalizedLink
            href={destinationPlannerHref}
            className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            Otwórz planner z gotowym setupem
          </LocalizedLink>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          <a href={stayRedirectHref} target="_blank" rel="noreferrer" className="rounded-[1.6rem] border border-emerald-700 bg-emerald-700 p-5 text-white shadow-[0_20px_52px_rgba(21,128,61,0.18)] transition hover:-translate-y-1 hover:bg-emerald-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">Pobyt</p>
            <h3 className="mt-2 text-2xl font-bold">{stayPartner}</h3>
            <p className="mt-3 text-sm leading-6 text-white/82">Gotowe wyniki noclegów dla tego kierunku i tego samego okna pobytu.</p>
          </a>
          <a href={flightRedirectHref} target="_blank" rel="noreferrer" className="rounded-[1.6rem] border border-emerald-950 bg-emerald-950 p-5 text-white shadow-[0_20px_52px_rgba(7,31,18,0.18)] transition hover:-translate-y-1 hover:bg-emerald-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">Loty</p>
            <h3 className="mt-2 text-2xl font-bold">{flightPartner}</h3>
            <p className="mt-3 text-sm leading-6 text-white/78">Trasa i termin sa już ustawione, wiec nie wracasz do pustego startu.</p>
          </a>
          <a href={carRedirectHref} target="_blank" rel="noreferrer" className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/75 p-5 text-emerald-950 transition hover:-translate-y-1 hover:bg-emerald-100">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Mobilnosc</p>
            <h3 className="mt-2 text-2xl font-bold">{carPartner}</h3>
            <p className="mt-3 text-sm leading-6 text-emerald-900/78">Jeśli ten kierunek wymaga auta na miejscu, przechodzisz dalej bez ponownego wpisywania miasta.</p>
          </a>
          <article className="rounded-[1.6rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-5 text-emerald-950">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Jak czytac ta stronę</p>
            <h3 className="mt-2 text-2xl font-bold">Najpierw wybór, potem rezerwacja.</h3>
            <p className="mt-3 text-sm leading-6 text-emerald-900/78">
              Ten przewodnik pomaga najpierw ocenic kierunek, a dopiero potem przejść do partnera z miastem i terminem już ustawionymi.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <LocalizedLink
                href="/jak-pracujemy"
                className="rounded-full border border-emerald-900/10 bg-white px-3 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                Jak pracujemy
              </LocalizedLink>
              <LocalizedLink
                href="/linki-partnerskie"
                className="rounded-full border border-emerald-900/10 bg-white px-3 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                Linki partnerskie
              </LocalizedLink>
            </div>
          </article>
          </div>
        </section>

      <PartnerPlacementSection
        eyebrow="Partnerzy dla tego kierunku"
        title="W tym miejscu pokazujemy dokładnie, gdzie kliknąć dalej."
        body="Najpierw wybierasz kierunek, potem przechodzisz do właściwego partnera bez przepisywania wszystkiego od nowa. Każda karta pokazuje, które marki najlepiej pasują do danego kroku planu."
        cards={partnerPlacementCards}
        footerNote="To jest szybki skrót do najważniejszych partnerów dla tego miasta. Sam wybór nadal robisz tutaj, a finalna rezerwacja odbywa się po stronie partnera."
      />

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Szybka ocena kierunku</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950">Najważniejsze sygnaly przed decyzja o wyjezdzie</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Najlepszy format</p>
              <p className="mt-2 text-lg font-bold text-emerald-950">{tripProfile}</p>
              <p className="mt-2 text-sm leading-6 text-emerald-900/78">
                To kierunek, który najmocniej pracuje wtedy, gdy planujesz {tripLength} i chcesz sensownego balansu
                wysilku do efektu.
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Dojazd z Polski</p>
              <p className="mt-2 text-lg font-bold text-emerald-950">{routeComfort}</p>
              <p className="mt-2 text-sm leading-6 text-emerald-900/78">
                Lot zwykle zajmuje okolo {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h, wiec łatwiej ocenic
                czy to kierunek na szybki wypad, czy na troche dluzszy pobyt.
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Najlepsza dlugosc</p>
              <p className="mt-2 text-lg font-bold text-emerald-950">{tripLength}</p>
              <p className="mt-2 text-sm leading-6 text-emerald-900/78">
                Ten scenariusz zwykle daje najlepszy stosunek kosztu do wygody, bez poczućia, ze wyjazd jest za krótki
                albo niepotrzebnie rozciagniety.
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Formalności i sezon</p>
              <p className="mt-2 text-lg font-bold text-emerald-950">{visaNote}</p>
              <p className="mt-2 text-sm leading-6 text-emerald-900/78">
                Najmocniejsze miesiące dla tego kierunku to zwykle {bestMonths.slice(0, 3).map((month) => formatDestinationMonth(month, "pl")).join(", ")}.
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Scenariusze i dalsze kroki</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950">Ten kierunek dobrze łączy sie z tymi potrzebami i kolejnymi klikami.</h2>
          {relatedCategories.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {relatedCategories.map((category) => (
                <LocalizedLink
                  key={category.slug}
                  href={`/${category.slug}`}
                  className="rounded-full border border-emerald-900/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-950 transition hover:bg-emerald-100"
                >
                  {category.title}
                </LocalizedLink>
              ))}
            </div>
          ) : null}
          <div className="mt-5 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>
              Ta strona ma pomoc zdecydowac, czy kierunek pasuje do stylu wyjazdu, budżetu i realnej logistyki z Polski.
            </p>
            <p>
              Jeśli miasto wyglada dobrze, przechodzisz dalej do planera i gotowych przejść do pobytu, lotu, atrakcji
              i kolejnych kroków dla tego samego terminu.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <LocalizedLink
              href={destinationPlannerHref}
              className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              Otwórz planner dla tego miasta
            </LocalizedLink>
            <LocalizedLink
              href="/planner?mode=discovery"
              className="rounded-full border border-emerald-900/10 bg-white px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
            >
              Porównaj z innymi pomysłami
            </LocalizedLink>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kiedy ten kierunek wygrywa</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Trzy sytuacje, w których {guide.destination.city} najczęściej okazuje sie dobrym wybórem.</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">
              Ten blok ma pomoc ocenic, czy brief pasuje do kierunku zanim klikniesz w hotel albo lot.
            </p>
          </div>
          <LocalizedLink
            href="/planner?mode=discovery"
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            Porównaj z innym briefem
          </LocalizedLink>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {winningScenarios.map((scenario) => (
            <article key={scenario.title} className="rounded-[1.75rem] border border-emerald-900/8 bg-emerald-50/75 p-5">
              <h3 className="text-xl font-bold text-emerald-950">{scenario.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/78">{scenario.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Gdzie najlepiej spać</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950">Najrozsądniejsze okolice na nocleg przy pierwszym planie.</h2>
          {hotelAreaGuidance.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {hotelAreaGuidance.map((item) => (
                <article key={item.district} className="rounded-2xl bg-emerald-50/75 px-4 py-4">
                  <h3 className="text-lg font-bold text-emerald-950">{item.district}</h3>
                  <p className="mt-2 text-sm leading-7 text-emerald-900/78">{item.rationale}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-emerald-50/75 px-4 py-4 text-sm leading-7 text-emerald-900/78">
              Nie pokazujemy tu sztucznej listy dzielnic. Przy pierwszym planie najlepiej zacząć od noclegu z dobrym dojściem do centrum, plaży albo głównej osi zwiedzania, a potem zawęzić wybór po cenie i logistyce.
            </p>
          )}
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kiedy odpuścić</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950">Dla kogo ten kierunek może byc slabszym wybórem.</h2>
          <div className="mt-5 space-y-3">
            {avoidNotes.length > 0 ? (
              avoidNotes.map((item) => (
                <div key={item} className="rounded-2xl bg-white px-4 py-4 text-sm leading-7 text-emerald-900/78">
                  {item}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-white px-4 py-4 text-sm leading-7 text-emerald-900/78">
                Kierunek wypada bardzo rowno. W praktyce slabiej sprawdźi sie tylko wtedy, gdy brief jest skrajnie budżetowy albo wymaga bardzo specyficznej logistyki.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pomysl na 3-5 dni</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Przykladowy rytm wyjazdu</h2>
          </div>
          <LocalizedLink
            href={destinationPlannerHref}
            className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            Sprawdź ten kierunek w plannerze
          </LocalizedLink>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {localizedGuide.miniPlan.map((item) => (
            <article key={`${item.day}-${item.title}`} className="rounded-[1.75rem] border border-emerald-900/8 bg-emerald-50/75 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dzien {item.day}</p>
              <h3 className="mt-2 text-xl font-bold text-emerald-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {comparisonSignals.length > 0 ? (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Porównanie z alternatywami</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950">Jak {guide.destination.city} wypada na tle podobnych opcji</h2>
            </div>
            <LocalizedLink
              href="/planner?mode=discovery"
              className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
            >
              Porównaj w plannerze
            </LocalizedLink>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {comparisonSignals.map((item) => (
              <article key={item.slug} className="rounded-[1.75rem] border border-emerald-900/8 bg-emerald-50/75 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{item.city}</p>
                <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.summary}</p>
                <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.bestFor}</p>
                <LocalizedLink
                  href={`/kierunki/${item.slug}`}
                  className="mt-4 inline-flex text-sm font-semibold text-emerald-900 transition hover:text-emerald-700"
                >
                  Otwórz ten kierunek
                </LocalizedLink>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">FAQ</p>
          <div className="mt-5 space-y-4">
            {localizedGuide.faq.map((item) => (
              <article key={item.question} className="rounded-2xl bg-emerald-50/75 px-4 py-4">
                <h3 className="text-base font-bold text-emerald-950">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/78">{item.answer}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-[0_20px_54px_rgba(8,40,24,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Planner i partnerzy</p>
          <h2 className="mt-3 font-display text-4xl">Przejdź z przewodnika do konkretnego planu wyjazdu.</h2>
          <p className="mt-4 text-sm leading-7 text-white/82">
            Ten przewodnik nie konczy sie na inspiracji. Od razu przechodzisz dalej do noclegów, lotów, atrakcji i
            kolejnych decyzji dopasowanych do tego konkretnego kierunku.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LocalizedLink
              href={destinationPlannerHref}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
            >
              Uruchom planner dla {guide.destination.city}
            </LocalizedLink>
            <LocalizedLink
              href="/planner?mode=discovery"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Nie wiem dokąd lecieć
            </LocalizedLink>
          </div>
        </article>
      </section>

      {relatedArticles.length > 0 ? (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Powiązane artykuły</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950">Przydatne treści wokół tego kierunku</h2>
            </div>
            <LocalizedLink href="/inspiracje" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
              Wszystkie inspiracje
            </LocalizedLink>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {relatedArticles.map((article) => (
              <EditorialArticleCard key={article.slug} article={article} compact locale="pl" />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Podobne kierunki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Jeśli ten kierunek pasuje, sprawdź tez te opcje.</h2>
          </div>
        </div>
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


