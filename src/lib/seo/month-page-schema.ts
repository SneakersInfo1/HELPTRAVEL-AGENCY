import { inMonthPhrase, polishMonthLabels, type PolishMonthSlug } from "@/lib/mvp/months";

import { monthPageText } from "./page-titles";

// JSON-LD strony /kierunki/[slug]/[miesiac].
//
// Bez `Offer`: do 2026-09 stał tu Offer z ceną z modelu budżetu (estimateBudget)
// i `priceValidUntil` na koniec przyszłego roku — na 1747 stronach. To nie była
// oferta: brak terminu, brak dostępności, kwota policzona ze wzoru. Bez kwot
// także w opisie i FAQ — dane strukturalne mówią o cenie maszynie, która
// pokazuje ją użytkownikowi przed kliknięciem.

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
    season: { label: string; crowd: string; price: string };
    warmestMonth: PolishMonthSlug;
    coldestMonth: PolishMonthSlug;
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
  const monthLabel = polishMonthLabels[month];
  const headline = monthPageText({ name, month, tempC: weather?.tempC ?? null }).headline;
  const questions = [];

  if (weather) {
    questions.push(
      question(
        `${name} ${inMonth} — jaka jest pogoda?`,
        `Średnia temperatura: ${weather.tempC}°C — ${weather.description}. ${weather.verdict}`,
      ),
      question(`${name} ${inMonth} — czy warto lecieć?`, weather.verdict),
      question(
        `${name} — kiedy jest najmniej turystów?`,
        `Najwięcej turystów i najwyższe ceny przypadają na najcieplejsze miesiące (${polishMonthLabels[weather.warmestMonth]}). Najspokojniej i zwykle najtaniej jest ${inMonthPhrase(weather.coldestMonth)}. ${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} to ${weather.season.label.toLowerCase()} — ${weather.season.crowd}, ${weather.season.price}.`,
      ),
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
          ? `Pogoda: ${name} ${inMonth} (śr. ${weather.tempC}°C), sezon i najlepszy termin. Bezpośrednie przejście do hoteli i lotów w PLN.`
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
