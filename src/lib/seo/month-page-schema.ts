import { inMonthPhrase, type PolishMonthSlug } from "@/lib/mvp/months";

import { monthPageText } from "./page-titles";

// JSON-LD strony /kierunki/[slug]/[miesiac].
//
// Bez `Offer`: do 2026-09 stał tu Offer z ceną z modelu budżetu (estimateBudget)
// i `priceValidUntil` na koniec przyszłego roku — na 1747 stronach. To nie była
// oferta: brak terminu, brak dostępności, kwota policzona ze wzoru. Bez kwot
// także w opisie i FAQ — dane strukturalne mówią o cenie maszynie, która
// pokazuje ją użytkownikowi przed kliknięciem.
//
// Bez sezonu, tłumów i cen w FAQ: pytanie „kiedy jest najmniej turystów?"
// odpowiadało heurystyką z samej temperatury („najwyższe ceny", „ceny
// najniższe") bez źródła o ruchu i cenach — na Teneryfie wskazywało styczeń
// jako najtańszy, choć to szczyt sezonu zimowego słońca.

export interface MonthPageSchemaInput {
  baseUrl: string;
  destinationSlug: string;
  month: PolishMonthSlug;
  name: string;
  countryName: string;
  weather: {
    tempC: number;
    description: string;
    verdict: string;
  } | null;
  exactFlightHours: number | null;
  author: Record<string, unknown>;
}

function question(name: string, text: string) {
  return { "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } };
}

export function buildMonthPageStructuredData(input: MonthPageSchemaInput) {
  const { baseUrl, destinationSlug, month, name, countryName, weather, exactFlightHours, author } = input;
  const inMonth = inMonthPhrase(month);
  const pageUrl = `${baseUrl}/kierunki/${destinationSlug}/${month}`;
  const headline = monthPageText({ name, month, tempC: weather?.tempC ?? null }).headline;
  const questions = [];

  if (weather) {
    questions.push(
      question(
        `${name} ${inMonth} — jaka jest pogoda?`,
        `Średnia temperatura: ${weather.tempC}°C — ${weather.description}. ${weather.verdict}`,
      ),
      question(`${name} ${inMonth} — czy warto lecieć?`, weather.verdict),
    );
  }

  if (exactFlightHours !== null) {
    questions.push(
      question(`${name} — jak długo trwa lot z Polski?`, `Lot z Polski trwa około ${exactFlightHours.toFixed(1)} h.`),
    );
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline,
        description: weather
          ? `Pogoda: ${name} ${inMonth} (śr. ${weather.tempC}°C) i temperatury w ciągu roku. Bezpośrednie przejście do hoteli i lotów w PLN.`
          : `${name} ${inMonth}: hotele i loty w PLN na ten termin.`,
        url: pageUrl,
        inLanguage: "pl-PL",
        author,
        publisher: { "@id": `${baseUrl}/#organization` },
        about: { "@type": "TouristDestination", name: `${name}, ${countryName}` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
          { "@type": "ListItem", position: 3, name, item: `${baseUrl}/kierunki/${destinationSlug}` },
          { "@type": "ListItem", position: 4, name: `${name} ${inMonth}`, item: pageUrl },
        ],
      },
      ...(questions.length > 0 ? [{ "@type": "FAQPage", mainEntity: questions }] : []),
    ],
  };
}
