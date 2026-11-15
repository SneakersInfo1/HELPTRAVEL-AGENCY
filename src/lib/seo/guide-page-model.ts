import { tripLengthLabel, type LocalizedDestinationGuide } from "@/lib/mvp/destination-localization";
import type { DestinationGuideContent } from "@/lib/mvp/publisher-content";

import {
  exactFlightHours,
  flightHoursForTripLength,
  formatFlightFact,
  getDestinationSeoFacts,
  type ClimateFactSource,
  type DestinationSeoFacts,
} from "./destination-facts";
import { guidePageText } from "./page-titles";

export interface GuidePageModelInput {
  guide: DestinationGuideContent;
  localizedGuide: LocalizedDestinationGuide;
  baseUrl: string;
  heroImage: string;
  author: Record<string, unknown>;
}

export interface GuideClimateSummary {
  /** Miesiące, w których średnia maksymalna w dzień mieści się w 18–30°C. */
  daytimeMaxMonths: number[];
  lowestDaytimeMaxC: number;
  highestDaytimeMaxC: number;
  source: ClimateFactSource;
}

export interface GuidePageModel {
  facts: DestinationSeoFacts;
  name: string;
  text: ReturnType<typeof guidePageText>;
  tripLength: string | null;
  flightChip: string | null;
  flightSentence: string | null;
  climate: GuideClimateSummary | null;
  metaBarItems: string[];
  structuredData: Record<string, unknown>;
}

function daytimeMaxMonths(temperatures: readonly number[]) {
  return temperatures
    .map((temperature, index) => ({ temperature, month: index + 1 }))
    .filter(({ temperature }) => temperature >= 18 && temperature <= 30)
    .slice(0, 6)
    .map(({ month }) => month);
}

export function buildGuidePageModel(input: GuidePageModelInput): GuidePageModel {
  const { guide, localizedGuide, baseUrl, heroImage, author } = input;
  const facts = getDestinationSeoFacts(guide.destination);
  const name = facts.name;
  const exactHours = exactFlightHours(facts);
  const tripLengthHours = flightHoursForTripLength(facts);
  const tripLength = tripLengthHours === null ? null : tripLengthLabel(tripLengthHours, "pl");
  const flightChip = facts.flight
    ? facts.flight.kind === "exact"
      ? `lot ok. ${facts.flight.hours.toFixed(1)} h`
      : `lot ~${facts.flight.hours.toFixed(1)} h (szacunek)`
    : null;
  const flightSentence = facts.flight
    ? facts.flight.kind === "exact"
      ? `Lot z Polski zwykle zajmuje około ${facts.flight.hours.toFixed(1)} h.`
      : `Lot ${formatFlightFact(facts.flight)}.`
    : null;
  const climate = facts.temperature
    ? {
        daytimeMaxMonths: daytimeMaxMonths(facts.temperature.byMonth),
        lowestDaytimeMaxC: Math.min(...facts.temperature.byMonth),
        highestDaytimeMaxC: Math.max(...facts.temperature.byMonth),
        source: facts.temperature.source,
      }
    : null;
  const pageUrl = `${baseUrl}/kierunki/${facts.slug}`;
  const faqNode =
    localizedGuide.faq.length > 0
      ? {
          "@type": "FAQPage",
          mainEntity: localizedGuide.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }
      : null;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
          { "@type": "ListItem", position: 3, name, item: pageUrl },
        ],
      },
      ...(faqNode ? [faqNode] : []),
      {
        "@type": "Article",
        headline: `${name} - przewodnik`,
        description: localizedGuide.overview,
        inLanguage: "pl-PL",
        mainEntityOfPage: pageUrl,
        image: heroImage,
        author,
        publisher: { "@id": `${baseUrl}/#organization` },
        about: [name, facts.countryName, "city break", "planowanie podróży"],
        ...(climate ? { citation: climate.source.url } : {}),
      },
      {
        "@type": "TouristDestination",
        "@id": `${pageUrl}#destination`,
        name,
        description: localizedGuide.overview,
        ...(localizedGuide.whoFor.length > 0 ? { touristType: localizedGuide.whoFor } : {}),
        url: pageUrl,
        image: heroImage,
        address: {
          "@type": "PostalAddress",
          addressCountry: facts.countryName,
          addressLocality: name,
        },
      },
    ],
  };

  return {
    facts,
    name,
    text: guidePageText({ cityPl: name, flightHours: exactHours, tripLength }),
    tripLength,
    flightChip,
    flightSentence,
    climate,
    metaBarItems: [
      facts.isDomestic ? name : `${name} z Polski`,
      ...(facts.flight?.kind === "exact" ? [`${facts.flight.hours.toFixed(1)} h lotu`] : []),
      ...(facts.flight?.kind === "estimate" ? [`ok. ${facts.flight.hours.toFixed(1)} h lotu (szacunek)`] : []),
      ...(tripLength ? [tripLength] : []),
      "noclegi, loty i dalsze kroki",
    ],
    structuredData,
  };
}
