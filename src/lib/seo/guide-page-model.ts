import { tripLengthLabel, type LocalizedDestinationGuide } from "@/lib/mvp/destination-localization";
import type { DestinationGuideContent } from "@/lib/mvp/publisher-content";

import {
  canShowBudgetEstimate,
  exactFlightHours,
  flightHoursForTripLength,
  formatFlightFact,
  getDestinationSeoFacts,
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

export interface GuidePageModel {
  facts: DestinationSeoFacts;
  name: string;
  text: ReturnType<typeof guidePageText>;
  tripLength: string | null;
  flightChip: string | null;
  flightSentence: string | null;
  budgetEstimate: { min: number; max: number } | null;
  bestMonths: number[];
  metaBarItems: string[];
  structuredData: Record<string, unknown>;
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

function bestMonthsFromTemperatures(temperatures: readonly number[]) {
  return temperatures
    .map((temp, index) => ({ temp, index }))
    .filter((item) => item.temp >= 20 && item.temp <= 30)
    .slice(0, 6)
    .map((item) => item.index + 1);
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
  const budgetEstimate =
    canShowBudgetEstimate(facts) && tripLengthHours !== null
      ? estimateBudget(guide.destination.costIndex, tripLengthHours)
      : null;
  const bestMonths = facts.temperature ? bestMonthsFromTemperatures(facts.temperature.byMonth) : [];
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
      },
      {
        "@type": "TouristDestination",
        "@id": `${pageUrl}#destination`,
        name,
        description: localizedGuide.overview,
        touristType: localizedGuide.whoFor,
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
    budgetEstimate,
    bestMonths,
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
