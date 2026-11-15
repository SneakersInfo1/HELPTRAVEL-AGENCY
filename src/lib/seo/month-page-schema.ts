import { formatClimateNumber } from "@/lib/mvp/climate-normals";
import { inMonthPhrase, type PolishMonthSlug } from "@/lib/mvp/months";

import type { ClimateFactSource } from "./destination-facts";
import { monthPageText } from "./page-titles";

export interface MonthPageWeatherSchema {
  maxTempC: number;
  minTempC: number;
  rainDays: number | null;
  rainfallMm: number;
  source: ClimateFactSource;
}

export interface MonthPageSchemaInput {
  baseUrl: string;
  destinationSlug: string;
  month: PolishMonthSlug;
  name: string;
  countryName: string;
  weather: MonthPageWeatherSchema | null;
  exactFlightHours: number | null;
  author: Record<string, unknown>;
}

function question(name: string, text: string) {
  return { "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } };
}

export interface MonthQuestion {
  question: string;
  answer: string;
}

/** Ta sama lista trafia do widocznej sekcji FAQ i do węzła FAQPage. */
export function monthPageQuestions(
  input: Pick<MonthPageSchemaInput, "month" | "name" | "weather" | "exactFlightHours">,
): MonthQuestion[] {
  const { month, name, weather, exactFlightHours } = input;
  const inMonth = inMonthPhrase(month);
  const questions: MonthQuestion[] = [];

  if (weather) {
    questions.push({
      question: `${name} ${inMonth} — jaka jest temperatura w dzień i w nocy?`,
      answer: `Średnia maksymalna temperatura w dzień wynosi ${formatClimateNumber(weather.maxTempC)}°C, a średnia minimalna w nocy ${formatClimateNumber(weather.minTempC)}°C. To ${weather.source.periodLabel} z ${weather.source.name}.`,
    });
    const precipitation = weather.rainDays === null
      ? `${formatClimateNumber(weather.rainfallMm)} mm opadu`
      : `${formatClimateNumber(weather.rainDays)} dnia z opadem i ${formatClimateNumber(weather.rainfallMm)} mm opadu`;
    questions.push({
      question:
        weather.rainDays === null
          ? `${name} ${inMonth} — jaka jest suma opadu?`
          : `${name} ${inMonth} — ile jest dni z opadem?`,
      answer: `Norma wieloletnia wskazuje ${precipitation}. Źródło: ${weather.source.name}.`,
    });
  }

  if (exactFlightHours !== null) {
    questions.push({
      question: `${name} — jak długo trwa lot z Polski?`,
      answer: `Lot z Polski trwa około ${exactFlightHours.toFixed(1).replace(".", ",")} h.`,
    });
  }
  return questions;
}

export function buildMonthPageStructuredData(input: MonthPageSchemaInput) {
  const { baseUrl, destinationSlug, month, name, countryName, weather, author } = input;
  const inMonth = inMonthPhrase(month);
  const pageUrl = `${baseUrl}/kierunki/${destinationSlug}/${month}`;
  const headline = monthPageText({
    name,
    month,
    maxTempC: weather?.maxTempC ?? null,
    minTempC: weather?.minTempC ?? null,
  }).headline;
  const questions = monthPageQuestions(input).map((item) => question(item.question, item.answer));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline,
        description: weather
          ? `${name} ${inMonth}: średnia maksymalna temperatura w dzień ${formatClimateNumber(weather.maxTempC)}°C i średnia minimalna w nocy ${formatClimateNumber(weather.minTempC)}°C. Aktualne ceny hoteli pokazuje wyszukiwarka.`
          : `${name} ${inMonth}: hotele i loty w PLN na ten termin.`,
        url: pageUrl,
        inLanguage: "pl-PL",
        author,
        publisher: { "@id": `${baseUrl}/#organization` },
        about: { "@type": "TouristDestination", name: `${name}, ${countryName}` },
        ...(weather ? { citation: weather.source.url } : {}),
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
