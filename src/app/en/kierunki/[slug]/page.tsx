import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { SaveDestinationButton } from "@/components/publisher/save-destination-button";
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
import { getDestinationGuideBySlug, getSimilarDestinations } from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { getSiteUrl } from "@/lib/mvp/site";
import { addDaysToIsoDate, defaultTravelStartDate, formatShortDate } from "@/lib/mvp/travel-dates";

interface DestinationGuidePageProps {
  params: Promise<{ slug: string }>;
}

function estimateBudget(costIndex: number, flightHours: number) {
  const days = 4;
  const travelers = 2;
  const total =
    travelers * (380 + flightHours * 70) +
    travelers * days * 170 * costIndex +
    days * 65 * costIndex;

  return { min: Math.round(total * 0.9), max: Math.round(total * 1.18) };
}

function bestMonthsFromTemperatures(temperatures: number[]) {
  return temperatures
    .map((temp, index) => ({ temp, month: index + 1 }))
    .filter((item) => item.temp >= 20 && item.temp <= 30)
    .slice(0, 4)
    .map((item) => item.month);
}

function recommendedNights(flightHours: number) {
  if (flightHours <= 3.5) return 4;
  if (flightHours <= 5.5) return 5;
  return 6;
}

export async function generateStaticParams() {
  return getAllDestinationProfiles().map((destination) => ({ slug: destination.slug }));
}

export async function generateMetadata({ params }: DestinationGuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) {
    return { title: "Destination guide", description: "Practical destination guide with planner-ready next steps." };
  }

  const story = getDestinationStory(guide.destination);
  const localizedGuide = getLocalizedDestinationGuide(guide, story, "en");
  const budget = estimateBudget(guide.destination.costIndex, guide.destination.typicalFlightHoursFromPL);

  return {
    title: `${guide.destination.city} guide - where it wins, where to stay and how to plan it`,
    description: `${localizedGuide.overview} A practical budget frame for two travelers is usually ${budget.min}-${budget.max} PLN.`,
    alternates: {
      canonical: `/en/kierunki/${guide.destination.slug}`,
      languages: {
        "pl-PL": `/kierunki/${guide.destination.slug}`,
        "en-US": `/en/kierunki/${guide.destination.slug}`,
      },
    },
    openGraph: {
      title: `${guide.destination.city} guide - a decision-first trip page`,
      description: `${localizedGuide.overview} Compare fit, budget, hotel areas and next travel actions.`,
      url: `${getSiteUrl()}/en/kierunki/${guide.destination.slug}`,
      type: "article",
      locale: "en_US",
      alternateLocale: ["pl_PL"],
    },
  };
}

export default async function EnglishDestinationGuidePage({ params }: DestinationGuidePageProps) {
  const { slug } = await params;
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) notFound();

  const media = await resolveDestinationMedia(guide.destination);
  const story = getDestinationStory(guide.destination);
  const localizedGuide = getLocalizedDestinationGuide(guide, story, "en");
  const similarDestinations = await Promise.all(
    getSimilarDestinations(slug, 4).map(async (destination) => {
      const similarGuide = getDestinationGuideBySlug(destination.slug);
      const similarStory = getDestinationStory(destination);
      return {
        destination,
        guide: similarGuide,
        localizedGuide: similarGuide ? getLocalizedDestinationGuide(similarGuide, similarStory, "en") : null,
        media: await resolveDestinationMedia(destination),
      };
    }),
  );
  const budget = estimateBudget(guide.destination.costIndex, guide.destination.typicalFlightHoursFromPL);
  const bestMonths = bestMonthsFromTemperatures(guide.destination.avgTempByMonth);
  const bestMonthsLabel =
    bestMonths.length > 0 ? bestMonths.map((month) => formatDestinationMonth(month, "en")).join(", ") : "a wider year-round window";
  const defaultStartDate = defaultTravelStartDate();
  const defaultNights = recommendedNights(guide.destination.typicalFlightHoursFromPL);
  const defaultCheckOutDate = addDaysToIsoDate(defaultStartDate, defaultNights);
  const avoidNotes = buildLocalizedAvoidNotes(guide, "en");
  const hotelAreaGuidance = buildLocalizedHotelAreaGuidance(guide, "en");
  const comparisonSignals = buildLocalizedComparisonSignals(
    guide.destination,
    similarDestinations.map((item) => item.destination),
    "en",
  );
  const winningScenarios = buildLocalizedWinningScenarios(guide, "en");
  const commercialLinks = buildAffiliateLinksWithContext({
    city: guide.destination.city,
    country: guide.destination.country,
    originCity: "Warsaw",
    departureDate: defaultStartDate,
    checkInDate: defaultStartDate,
    checkOutDate: defaultCheckOutDate,
    passengers: 2,
    rooms: 1,
  });
  const stayPartner = getAffiliateBrandLabel(commercialLinks.stays, "Hotels.com");
  const flightPartner = getAffiliateBrandLabel(commercialLinks.flights, "Flight partner");
  const carPartner = getAffiliateBrandLabel(commercialLinks.cars, "Car partner");
  const destinationPlannerHref = `/planner?${new URLSearchParams({
    mode: "standard",
    q: guide.destination.city,
    destination: guide.destination.city,
    origin: "Warsaw",
    startDate: defaultStartDate,
    nights: String(defaultNights),
    travelers: "2",
    budget: String(budget.max),
  }).toString()}`;
  const stayRedirectHref = buildRedirectHref({ providerKey: "stays", targetUrl: commercialLinks.stays, city: guide.destination.city, country: guide.destination.country, source: "destination_page_stays" });
  const flightRedirectHref = buildRedirectHref({ providerKey: "flights", targetUrl: commercialLinks.flights, city: guide.destination.city, country: guide.destination.country, source: "destination_page_flights" });
  const carRedirectHref = buildRedirectHref({ providerKey: "cars", targetUrl: commercialLinks.cars, city: guide.destination.city, country: guide.destination.country, source: "destination_page_cars" });
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${getSiteUrl()}/en` },
          { "@type": "ListItem", position: 2, name: "Destinations", item: `${getSiteUrl()}/en/kierunki` },
          { "@type": "ListItem", position: 3, name: guide.destination.city, item: `${getSiteUrl()}/en/kierunki/${guide.destination.slug}` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: localizedGuide.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
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
            <Breadcrumbs locale="en" items={[{ label: "Home", href: "/" }, { label: "Destinations", href: "/kierunki" }, { label: guide.destination.city }]} />
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Decision-first destination guide</p>
            <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[0.95] sm:text-6xl">{guide.destination.city}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/86">{localizedGuide.overview}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {localizedGuide.bestForTags.slice(0, 4).map((item) => (
                <span key={item} className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-5">
              <SaveDestinationButton slug={guide.destination.slug} city={guide.destination.city} country={guide.destination.country} locale="en" />
            </div>
          </div>
        </div>
      </section>

      <EditorialMetaBar eyebrow="Decision layer" title="A destination page built to help you choose, not just browse" items={[`${guide.destination.city} from Poland`, `${guide.destination.typicalFlightHoursFromPL.toFixed(1)} h flight`, localizedGuide.tripLength, "planner handoff ready"]} />

      <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Why it works</p>
          <h2 className="mt-3 font-display text-4xl text-emerald-950">Where this destination wins</h2>
          <div className="mt-5 space-y-3">
            {localizedGuide.whyGo.map((reason) => (
              <div key={reason} className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm leading-7 text-emerald-900">{reason}</div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {localizedGuide.whoFor.map((item) => (
              <span key={item} className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-900">{item}</span>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(225,243,231,0.9))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Practical frame</p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Best time</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">{localizedGuide.bestTime}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Budget frame</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">{localizedGuide.budgetNote}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Route and season</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">
                Flights from Poland usually take around {guide.destination.typicalFlightHoursFromPL.toFixed(1)} hours. The strongest months are often {bestMonthsLabel}.
              </p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Hotel areas</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">{hotelAreaGuidance.map((item) => item.district).join(", ")}.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Top highlights</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {localizedGuide.highlights.map((item) => (
              <li key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Districts to know</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {localizedGuide.districts.map((item) => (
              <li key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Best for</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {localizedGuide.bestForTags.map((item) => (
              <span
                key={item}
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-900"
              >
                {item}
              </span>
            ))}
          </div>
          <p className="mt-5 text-sm leading-7 text-emerald-900/78">
            A defensible trip frame for two travelers usually lands around {budget.min}-{budget.max} PLN, depending on
            season, hotel area and how tightly you optimize the route.
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Commercial next step</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Move straight into stays, flights and the next trip actions.</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">
              A sensible starting point is already prepared for Warsaw, two travelers and a {defaultNights}-night setup from {formatShortDate(defaultStartDate, "en-US")} to {formatShortDate(defaultCheckOutDate, "en-US")}.
            </p>
          </div>
          <LocalizedLink href={destinationPlannerHref} locale="en" className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">
            Open planner with this setup
          </LocalizedLink>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          <a href={stayRedirectHref} target="_blank" rel="noreferrer" className="rounded-[1.6rem] border border-emerald-700 bg-emerald-700 p-5 text-white shadow-[0_20px_52px_rgba(21,128,61,0.18)] transition hover:-translate-y-1 hover:bg-emerald-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">Stay</p>
            <h3 className="mt-2 text-2xl font-bold">{stayPartner}</h3>
            <p className="mt-3 text-sm leading-6 text-white/82">Ready-made accommodation results for the same destination and trip window.</p>
          </a>
          <a href={flightRedirectHref} target="_blank" rel="noreferrer" className="rounded-[1.6rem] border border-emerald-950 bg-emerald-950 p-5 text-white shadow-[0_20px_52px_rgba(7,31,18,0.18)] transition hover:-translate-y-1 hover:bg-emerald-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">Flights</p>
            <h3 className="mt-2 text-2xl font-bold">{flightPartner}</h3>
            <p className="mt-3 text-sm leading-6 text-white/78">The route and date context are already set, so you do not restart from an empty search.</p>
          </a>
          <a href={carRedirectHref} target="_blank" rel="noreferrer" className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/75 p-5 text-emerald-950 transition hover:-translate-y-1 hover:bg-emerald-100">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Mobility</p>
            <h3 className="mt-2 text-2xl font-bold">{carPartner}</h3>
            <p className="mt-3 text-sm leading-6 text-emerald-900/78">If this destination works better with a car on the ground, the city context carries through.</p>
          </a>
          <article className="rounded-[1.6rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-5 text-emerald-950">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Methodology</p>
            <h3 className="mt-2 text-2xl font-bold">Decision first, booking immediately after.</h3>
            <p className="mt-3 text-sm leading-6 text-emerald-900/78">This page combines editorial signals, climate, cost and Polish-market logistics before it sends users into partner flows.</p>
          </article>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Decision snapshot</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950">Three reasons this destination most often wins</h2>
          <div className="mt-5 grid gap-3">
            {winningScenarios.map((scenario) => (
              <article key={scenario.title} className="rounded-2xl bg-emerald-50/75 px-4 py-4">
                <h3 className="text-lg font-bold text-emerald-950">{scenario.title}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/78">{scenario.body}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Tradeoffs</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950">Best hotel areas and who may want a different pick.</h2>
          <div className="mt-5 space-y-3">
            {hotelAreaGuidance.map((item) => (
              <div key={item.district} className="rounded-2xl bg-white px-4 py-4 text-sm leading-7 text-emerald-900/78">
                <strong className="text-emerald-950">{item.district}:</strong> {item.rationale}
              </div>
            ))}
            {(avoidNotes.length > 0 ? avoidNotes : ["This destination is broadly balanced and usually weakens only under very budget-led or highly specific logistics briefs."]).map((item) => (
              <div key={item} className="rounded-2xl bg-white px-4 py-4 text-sm leading-7 text-emerald-900/78">{item}</div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Trip rhythm</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950">A simple 3-5 day structure</h2>
          <div className="mt-5 grid gap-3">
            {localizedGuide.miniPlan.map((item) => (
              <article key={`${item.day}-${item.title}`} className="rounded-2xl bg-emerald-50/75 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Day {item.day}</p>
                <h3 className="mt-2 text-lg font-bold text-emerald-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/78">{item.description}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-[0_20px_54px_rgba(8,40,24,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Planner handoff</p>
          <h2 className="mt-3 font-display text-4xl">Move from guide to a concrete trip plan.</h2>
          <p className="mt-4 text-sm leading-7 text-white/82">Once the destination passes the decision test, you can move straight into stays, flights and practical extras with the same travel context.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LocalizedLink href={destinationPlannerHref} locale="en" className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300">
              Launch planner for {guide.destination.city}
            </LocalizedLink>
            <LocalizedLink href="/planner?mode=discovery" locale="en" className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12">
              I do not know where to go yet
            </LocalizedLink>
          </div>
        </article>
      </section>

      {comparisonSignals.length > 0 ? (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Alternative comparison</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950">How {guide.destination.city} compares to similar picks</h2>
            </div>
            <LocalizedLink href="/planner?mode=discovery" locale="en" className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100">
              Compare in planner
            </LocalizedLink>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {comparisonSignals.map((item) => (
              <article key={item.slug} className="rounded-[1.75rem] border border-emerald-900/8 bg-emerald-50/75 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{item.city}</p>
                <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.summary}</p>
                <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.bestFor}</p>
                <LocalizedLink href={`/kierunki/${item.slug}`} locale="en" className="mt-4 inline-flex text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
                  Open this destination
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

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Similar destinations</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950">If this fits, these guides are worth a second look too.</h2>
          <div className="mt-5 grid gap-4">
            {similarDestinations.map((item) =>
              item.guide && item.localizedGuide ? (
                <DestinationGuideCard key={item.destination.slug} destination={item.destination} media={item.media} summary={item.localizedGuide.overview} locale="en" />
              ) : null,
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
