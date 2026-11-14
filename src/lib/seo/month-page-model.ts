import { isMonthIndexable } from "@/lib/mvp/month-index-policy";
import { getMonthIndex, inMonthPhrase, polishMonthSlugs, type PolishMonthSlug } from "@/lib/mvp/months";
import type { DestinationProfile } from "@/lib/mvp/types";

import {
  canClaimFromProfileScores,
  canShowBudgetEstimate,
  exactFlightHours,
  formatFlightFact,
  getDestinationSeoFacts,
  monthTemperature,
  type DestinationSeoFacts,
} from "./destination-facts";
import { buildMonthPageStructuredData, monthPageQuestions, type MonthQuestion } from "./month-page-schema";
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
  /** Widoczne FAQ — identyczne z węzłem FAQPage. */
  faq: MonthQuestion[];
  /** Na co ten termin się nadaje, a na co nie — wyłącznie ze średniej temperatury. */
  fit: MonthFit | null;
  structuredData: Record<string, unknown>;
}

export interface MonthFit {
  goodFor: string[];
  skipIf: string[];
  basis: string;
}

// Reguły z samej średniej temperatury miesiąca (dane kuratorowane). Nie mówią
// nic o tłumach, cenach ani opadach — do tego nie mamy źródła.
function buildFit(weather: MonthWeather, isBeachDestination: boolean): MonthFit {
  const goodFor: string[] = [];
  const skipIf: string[] = [];
  const t = weather.tempC;
  if (t >= 27) {
    // Upał to nie to samo co plaża: Marrakesz i Rzym latem mają 27°C+, ale nie są
    // kierunkami plażowymi (przegląd 2026-11-14).
    goodFor.push(...(isBeachDestination ? ["plażowanie i kąpiel", "wieczory na zewnątrz"] : ["wieczory na zewnątrz", "zwiedzanie wcześnie rano i późnym popołudniem"]));
    skipIf.push("planujesz długie zwiedzanie pieszo w środku dnia — bywa upalnie");
  } else if (t >= 22) {
    goodFor.push("zwiedzanie pieszo bez grubej kurtki", "posiłki i wieczory na zewnątrz");
    if (isBeachDestination) goodFor.push("plażowanie w cieplejsze dni");
  } else if (t >= 17) {
    goodFor.push("zwiedzanie pieszo — bez upału", "spacery i tarasy w ciągu dnia");
    if (isBeachDestination) skipIf.push("liczysz na pewną pogodę plażową i ciepłe morze");
  } else if (t >= 12) {
    goodFor.push("zwiedzanie miasta bez upału", "muzea, kuchnię i spokojniejsze tempo");
    skipIf.push("celem wyjazdu jest plaża i kąpiel");
  } else {
    goodFor.push("muzea, wnętrza i kuchnię", "krótki miejski wyjazd z ciepłą kurtką");
    skipIf.push("chcesz spędzać dni na zewnątrz albo na plaży");
  }
  return {
    goodFor,
    skipIf,
    basis: `Wskazania wynikają wyłącznie ze średniej temperatury miesiąca (${t}°C, średnia wieloletnia z danych redakcyjnych HelpTravel). To nie jest prognoza pogody; nie uwzględnia opadów, tłumów ani cen.`,
  };
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

// Werdykt mówi wyłącznie o pogodzie z danych kuratorowanych. Sama temperatura
// nie niesie informacji o sezonie turystycznym, tłumach ani cenach, więc nie ma
// tu „poza sezonem" ani „wysokiego sezonu".
function suitabilityVerdict(temp: number, beachScore: number) {
  if (temp >= 22 && beachScore >= 0.7) return "Tak — to jeden z cieplejszych terminów na tym kierunku.";
  if (temp >= 18) return "Tak — komfortowa temperatura na city break i sensowne zwiedzanie.";
  if (temp >= 12) return "Warto, jeśli akceptujesz chłodniejszą pogodę i nie liczysz na plażę.";
  return "Możliwe, ale trzeba liczyć się z chłodem — to termin raczej na miasto i wnętrza niż na plażę.";
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

// Bez „sezonu", tłumów i cen. Klasyfikacja sezonu z samej temperatury
// („Styczeń to poza sezonem — najspokojniej, ceny najniższe") nie ma źródła
// o ruchu ani cenach i myli się dla kierunków zimowego słońca: na Teneryfie
// styczeń to szczyt sezonu. Temperatura z danych kuratorowanych zostaje
// faktem; sezon i ceny wrócą dopiero z własnym źródłem.
function buildWeather(profile: DestinationProfile, facts: DestinationSeoFacts, monthIndex: number): MonthWeather | null {
  const tempC = monthTemperature(facts, monthIndex);
  const yearTemps = facts.temperature?.byMonth;
  if (tempC === null || !yearTemps) return null;

  const yearMin = Math.min(...yearTemps);
  const yearMax = Math.max(...yearTemps);

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
  // Nagłówek to fraza, której ludzie szukają („Barcelona w styczniu: pogoda");
  // liczby i odpowiedź stoją zaraz pod nim, nie w nagłówku.
  const h1 = weather ? `${facts.name} ${inMonth}: pogoda i temperatura` : `${facts.name} ${inMonth}: hotele i loty`;
  const lead = weather
    ? `${facts.name} ${inMonth}: ${weather.description} (śr. ${weather.tempC}°C${weather.seaTempEstimate !== null ? `, morze szacunkowo ~${weather.seaTempEstimate}°C` : ""}).${budgetEstimate ? " Poniżej orientacyjny budżet, temperatury w ciągu roku i przejście do hoteli z cenami w PLN." : " Poniżej temperatury w ciągu roku i przejście do hoteli z cenami w PLN."}`
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
    faq: monthPageQuestions({
      month,
      name: facts.name,
      weather: weather ? { tempC: weather.tempC, description: weather.description, verdict: weather.verdict } : null,
      exactFlightHours: exactFlightHours(facts),
    }),
    // Kierunek plażowy tylko według ocen kuratorowanych — w profilu z szablonu
    // beachScore to stała regionu (bramka faktów, PR #1.5).
    fit: weather ? buildFit(weather, canClaimFromProfileScores(facts) && profile.beachScore >= 0.6) : null,
    structuredData,
  };
}
