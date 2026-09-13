import type { CommercialCity } from "@/lib/mvp/commercial-cities";

import { cityHotelsPageText, cityLocationPhrase } from "./page-titles";

// JSON-LD i FAQ strony /hotele/w/[miasto].
//
// Bez `Offer` i bez kwot: do 2026-09 stał tu Offer z ceną „od X zł/noc"
// policzoną ze wzoru (buildBudgetEstimate), a pierwsze pytanie FAQ podawało tę
// samą liczbę jako fakt („ceny zaczynają się od około X zł"). FAQ jest też
// widoczne na stronie, więc obie wersje budują się z jednej listy pytań.

export interface FeaturedHotelForSchema {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  stars?: number | null;
  main_photo?: string | null;
}

export interface CityHotelsFaqInput {
  city: CommercialCity;
  /** Czas lotu z profilu kierunku; null, gdy miasto nie ma profilu. */
  flightHours: number | null;
  /** Nazwy miesięcy z komfortową temperaturą. */
  bestMonths: string[];
}

export interface CityHotelsSchemaInput extends CityHotelsFaqInput {
  baseUrl: string;
  featuredHotels: FeaturedHotelForSchema[];
  heroImage?: string | null;
  author: Record<string, unknown>;
  nowIso: string;
}

export function buildCityHotelsFaq({ city, flightHours, bestMonths }: CityHotelsFaqInput) {
  const inLoc = cityLocationPhrase(city);
  // Kierunek podróży: „do Barcelony" (dopełniacz) albo „na Kretę" (biernik).
  const dirPrep = city.preposition === "na" ? "na" : "do";
  const dirForm = city.preposition === "na" ? (city.cityAccusative ?? city.cityNominative) : city.cityGenitive;

  return [
    {
      question: `Kiedy najlepiej jechać ${dirPrep} ${dirForm}?`,
      answer:
        bestMonths.length > 0
          ? `Najprzyjemniejsze miesiące na wyjazd ${dirPrep} ${dirForm} to ${bestMonths.slice(0, 6).join(", ")} — temperatury 18-30°C komfortowe na zwiedzanie.`
          : `Sprawdź sezony i temperatury w naszym przewodniku po ${city.cityLocative}.`,
    },
    {
      question: "Czy ceny w HelpTravel są w PLN?",
      answer:
        "Tak — wszystkie ceny hoteli pokazujemy w PLN, bez ukrytych przeliczników. Płatność końcowa również w PLN (lub w walucie wyboru — bez zaskoczeń przy karcie).",
    },
    {
      question: "Czy mogę anulować rezerwację bezpłatnie?",
      answer:
        "Tak — większość ofert ma opcję bezpłatnej anulacji do określonego terminu (zazwyczaj 24-48 h przed przyjazdem). Anulacja jest oznaczona ikoną przy każdej cenie.",
    },
    {
      question: `Jak długi jest lot z Polski ${dirPrep} ${dirForm}?`,
      answer:
        flightHours !== null
          ? `Lot z Polski ${dirPrep} ${dirForm} zajmuje około ${flightHours.toFixed(1)} h.`
          : "Sprawdź dostępne loty z Polski w wyszukiwarce.",
    },
    {
      question: `W której okolicy ${inLoc} najlepiej szukać hotelu?`,
      answer: `Popularne okolice na nocleg ${inLoc}: ${city.neighborhoods
        .map((area) => area.name)
        .join(", ")}. Najwygodniej zatrzymać się blisko centrum — wtedy większość atrakcji obejdziesz pieszo lub komunikacją miejską.`,
    },
  ];
}

export function buildCityHotelsStructuredData(input: CityHotelsSchemaInput) {
  const { baseUrl, city, featuredHotels, heroImage } = input;
  const text = cityHotelsPageText({ city });
  const pageUrl = `${baseUrl}/hotele/w/${city.slug}`;
  const listedHotels = featuredHotels.slice(0, 6);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: text.articleHeadline,
        description: text.articleDescription,
        url: pageUrl,
        inLanguage: "pl-PL",
        datePublished: "2026-01-01T00:00:00.000Z",
        dateModified: input.nowIso,
        author: input.author,
        publisher: { "@id": `${baseUrl}/#organization` },
        ...(heroImage ? { image: heroImage } : {}),
        about: {
          "@type": "TouristDestination",
          name: `${city.cityNominative}, ${city.countryNominative}`,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
          { "@type": "ListItem", position: 3, name: text.heading, item: pageUrl },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: buildCityHotelsFaq(input).map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
      ...(listedHotels.length > 0
        ? [
            {
              "@type": "ItemList",
              numberOfItems: listedHotels.length,
              itemListElement: listedHotels.map((hotel, index) => ({
                "@type": "ListItem",
                position: index + 1,
                item: {
                  "@type": "Hotel",
                  name: hotel.name,
                  ...(hotel.address
                    ? { address: { "@type": "PostalAddress", streetAddress: hotel.address, addressLocality: hotel.city } }
                    : {}),
                  ...(hotel.stars ? { starRating: { "@type": "Rating", ratingValue: hotel.stars } } : {}),
                  ...(hotel.main_photo ? { image: hotel.main_photo } : {}),
                  url: `${baseUrl}/hotele/${encodeURIComponent(hotel.id)}`,
                },
              })),
            },
          ]
        : []),
    ],
  };
}
