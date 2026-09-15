import { isMonthIndexable } from "@/lib/mvp/month-index-policy";
import { getMonthIndex, inMonthPhrase, polishMonthSlugs, type PolishMonthSlug } from "@/lib/mvp/months";
import type { DestinationProfile } from "@/lib/mvp/types";

import {
  canShowBudgetEstimate,
  exactFlightHours,
  formatFlightFact,
  getDestinationSeoFacts,
  monthTemperature,
  type DestinationSeoFacts,
} from "./destination-facts";
import { buildMonthPageStructuredData } from "./month-page-schema";
import { monthPageText } from "./page-titles";

export interface MonthPageModelInput {
  profile: DestinationProfile;
  /** `guide.overview` z `getDestinationGuideBySlug(slug)`. */
  overview: string;
  month: PolishMonthSlug;
  baseUrl: string;
  author: Record<string, unknown>;
}

export interface MonthWeather {
  tempC: number;
  description: string;
  verdict: string;
  positionInYear: "wysokie" | "średnie" | "niskie";
  yearMin: number;
  yearMax: number;
  yearTemps: readonly number[];
  warmestMonth: PolishMonthSlug;
  coldestMonth: PolishMonthSlug;
  season: { label: string; crowd: string; price: string };
  /** Tylko dla `beachScore >= 0.6`; model z temperatur powietrza. */
  seaTempEstimate: number | null;
}

export interface MonthPageModel {
  slug: string;
  month: PolishMonthSlug;
  monthIndex: number;
  indexable: boolean;
  facts: DestinationSeoFacts;
  text: { title: string; description: string; ogTitle: string; h1: string; lead: string };
  weather: MonthWeather | null;
  budgetEstimate: { min: number; max: number } | null;
  flightText: string | null;
  structuredData: Record<string, unknown>;
}

function estimateBudgetForMonth(costIndex: number, flightHours: number, monthIndex: number) {
  const days = 4;
  const travelers = 2;
  const peakMonths = [5, 6, 7];
  const seasonalMultiplier = peakMonths.includes(monthIndex)
    ? 1.18
    : monthIndex === 11 || monthIndex === 0
      ? 1.06
      : 0.96;
  const flightBasePerPerson = (380 + flightHours * 70) * seasonalMultiplier;
  const stayPerDayPerPerson = 170 * costIndex * (peakMonths.includes(monthIndex) ? 1.12 : 1);
  const localPerDay = 65 * costIndex;
  const total = travelers * flightBasePerPerson + travelers * days * stayPerDayPerPerson + days * localPerDay;
  return { min: Math.round(total * 0.9), max: Math.round(total * 1.18) };
}

function describeWeather(temp: number) {
  if (temp >= 27) return "bardzo ciepło, często upały w środku dnia";
  if (temp >= 22) return "ciepło, komfortowo na zwiedzanie i plażę";
  if (temp >= 17) return "łagodnie, idealnie na chodzenie i tarasy";
  if (temp >= 12) return "chłodno, ale przyjemnie na spacer i kawiarnie";
  if (temp >= 6) return "zimno, warto mieć cieplejszą warstwę";
  return "zimno, często wymaga kurtki zimowej";
}

function suitabilityVerdict(temp: number, beachScore: number) {
  if (temp >= 22 && beachScore >= 0.7) return "Tak — to jeden z lepszych terminów na ten kierunek.";
  if (temp >= 18) return "Tak — komfortowy termin na city break i sensowne zwiedzanie.";
  if (temp >= 12) return "Warto, jeśli akceptujesz chłodniejszą pogodę i nie liczysz na plażę.";
  return "Możliwe, ale to nie najmocniejszy termin — lepiej traktować jako city break poza sezonem.";
}

// Morze reaguje na temperaturę powietrza z opóźnieniem, dlatego model waży
// bieżący i dwa poprzednie miesiące. To szacunek, nie pomiar.
function estimateSeaTemperature(avgTempByMonth: readonly number[], monthIndex: number): number {
  const m0 = avgTempByMonth[monthIndex];
  const m1 = avgTempByMonth[(monthIndex + 11) % 12];
  const m2 = avgTempByMonth[(monthIndex + 10) % 12];
  const modeled = m0 * 0.45 + m1 * 0.33 + m2 * 0.22;
  return Math.min(29, Math.max(10, Math.round(modeled)));
}

type SeasonTier = "peak" | "shoulder" | "low";

function classifySeason(temp: number, monthIndex: number, beachScore: number): SeasonTier {
  const highSummer = monthIndex >= 5 && monthIndex <= 8;
  if (beachScore >= 0.6) {
    if (temp >= 24 && highSummer) return "peak";
    if (temp >= 20) return "shoulder";
    return "low";
  }
  if ((monthIndex >= 4 && monthIndex <= 8) || monthIndex === 11) {
    return temp >= 18 ? "peak" : "shoulder";
  }
  return temp >= 14 ? "shoulder" : "low";
}

const seasonCopy: Record<SeasonTier, { label: string; crowd: string; price: string }> = {
  peak: { label: "Wysoki sezon", crowd: "najwięcej turystów", price: "ceny w szczycie" },
  shoulder: { label: "Sezon przejściowy", crowd: "umiarkowany ruch", price: "ceny umiarkowane" },
  low: { label: "Poza sezonem", crowd: "najspokojniej", price: "ceny najniższe" },
};

function buildWeather(profile: DestinationProfile, facts: DestinationSeoFacts, monthIndex: number): MonthWeather | null {
  const tempC = monthTemperature(facts, monthIndex);
  const yearTemps = facts.temperature?.byMonth;
  if (tempC === null || !yearTemps) return null;

  const yearMin = Math.min(...yearTemps);
  const yearMax = Math.max(...yearTemps);
  const season = seasonCopy[classifySeason(tempC, monthIndex, profile.beachScore)];

  return {
    tempC,
    description: describeWeather(tempC),
    verdict: suitabilityVerdict(tempC, profile.beachScore),
    positionInYear: tempC >= yearMax - 2 ? "wysokie" : tempC <= yearMin + 2 ? "niskie" : "średnie",
    yearMin,
    yearMax,
    yearTemps,
    warmestMonth: polishMonthSlugs[yearTemps.indexOf(yearMax)],
    coldestMonth: polishMonthSlugs[yearTemps.indexOf(yearMin)],
    season,
    seaTempEstimate: profile.beachScore >= 0.6 ? estimateSeaTemperature(yearTemps, monthIndex) : null,
  };
}

export function buildMonthPageModel(input: MonthPageModelInput): MonthPageModel {
  const { profile, month, baseUrl, author } = input;
  const monthIndex = getMonthIndex(month);
  const facts = getDestinationSeoFacts(profile);
  const weather = buildWeather(profile, facts, monthIndex);
  const pageText = monthPageText({ name: facts.name, month, tempC: weather?.tempC ?? null });
  const budgetEstimate = canShowBudgetEstimate(facts) && facts.flight?.kind === "exact"
    ? estimateBudgetForMonth(profile.costIndex, facts.flight.hours, monthIndex)
    : null;
  const inMonth = inMonthPhrase(month);
  const h1 = weather
    ? `${facts.name} ${inMonth} — pogoda ${weather.tempC}°C, hotele i kiedy lecieć`
    : `${facts.name} ${inMonth} — hotele i kiedy lecieć`;
  const lead = weather
    ? `${facts.name} ${inMonth}: ${weather.description} (śr. ${weather.tempC}°C${weather.seaTempEstimate !== null ? `, morze szacunkowo ~${weather.seaTempEstimate}°C` : ""}). To ${weather.season.label.toLowerCase()} — ${weather.season.crowd}, ${weather.season.price}.${budgetEstimate ? " Poniżej orientacyjny budżet, najlepszy termin i przejście do hoteli z cenami w PLN." : " Poniżej najlepszy termin i przejście do hoteli z cenami w PLN."}`
    : `${facts.name} ${inMonth}: przejdź do hoteli z cenami w PLN na ten termin i sprawdź dostępność.`;
  const structuredData = buildMonthPageStructuredData({
    baseUrl,
    destinationSlug: facts.slug,
    month,
    name: facts.name,
    countryName: facts.countryName,
    weather: weather
      ? {
          tempC: weather.tempC,
          description: weather.description,
          verdict: weather.verdict,
          season: weather.season,
          warmestMonth: weather.warmestMonth,
          coldestMonth: weather.coldestMonth,
        }
      : null,
    exactFlightHours: exactFlightHours(facts),
    author,
  });

  return {
    slug: facts.slug,
    month,
    monthIndex,
    indexable: isMonthIndexable(profile, monthIndex),
    facts,
    text: {
      title: pageText.title,
      description: pageText.description,
      ogTitle: pageText.ogTitle,
      h1,
      lead,
    },
    weather,
    budgetEstimate,
    flightText: facts.flight ? formatFlightFact(facts.flight) : null,
    structuredData,
  };
}
