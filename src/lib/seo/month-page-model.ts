import { formatClimateNumber } from "@/lib/mvp/climate-normals";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { isMonthIndexable } from "@/lib/mvp/month-index-policy";
import { getMonthIndex, inMonthPhrase, polishMonthSlugs, type PolishMonthSlug } from "@/lib/mvp/months";
import type { DestinationProfile } from "@/lib/mvp/types";

import {
  destinationDisplayName,
  exactFlightHours,
  formatFlightFact,
  getDestinationSeoFacts,
  type ClimateFactSource,
  type DestinationSeoFacts,
} from "./destination-facts";
import { formatDayLength, midMonthDayLength } from "./daylight";
import { homeComparison, monthStanding, stationLatitude, warmerAlternatives } from "./month-context";
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
  /** Średnia maksymalna temperatura w dzień z normy WMO. */
  maxTempC: number;
  /** Średnia minimalna temperatura w nocy z normy WMO. */
  minTempC: number;
  rainDays: number | null;
  rainfallMm: number;
  rankInYear: number;
  rankShared: boolean;
  yearMinMaxTempC: number;
  yearMaxMaxTempC: number;
  yearMaxTemps: readonly number[];
  warmestMonths: PolishMonthSlug[];
  coldestMonths: PolishMonthSlug[];
  source: ClimateFactSource;
}

/**
 * Miesiąc na tle Polski i innych kierunków. Każda wartość to różnica albo pozycja
 * policzona z tych samych norm WMO; długość dnia wynika z szerokości geograficznej stacji.
 */
export interface MonthContext {
  /** Długość dnia 15. dnia miesiąca, np. „9 h 35 min”. */
  dayLength: string | null;
  /** Porównanie z Warszawą w tym samym miesiącu; null dla samej Warszawy. */
  home: { maxDiffC: number; homeMaxC: number; rainDaysDiff: number | null } | null;
  /** Ile kierunków z normą ma w tym miesiącu wyższe średnie maksimum. */
  standing: { warmerCount: number; total: number };
  /** Najbliższe cieplejsze kierunki z indeksowalną stroną tego samego miesiąca. */
  warmer: Array<{ slug: string; name: string; maxTempC: number; diffC: number }>;
}

export interface MonthPageModel {
  slug: string;
  month: PolishMonthSlug;
  monthIndex: number;
  indexable: boolean;
  facts: DestinationSeoFacts;
  text: { title: string; description: string; ogTitle: string; h1: string; lead: string };
  weather: MonthWeather | null;
  /** Tylko dla stron z normą WMO. */
  context: MonthContext | null;
  flightText: string | null;
  /** Widoczne FAQ — identyczne z węzłem FAQPage. */
  faq: MonthQuestion[];
  /** Wskazania wyłącznie z maksymalnej temperatury w dzień i dni z opadem. */
  fit: MonthFit | null;
  structuredData: Record<string, unknown>;
}

export interface MonthFit {
  goodFor: string[];
  skipIf: string[];
  basis: string;
}

function buildFit(weather: MonthWeather): MonthFit {
  const goodFor: string[] = [];
  const skipIf: string[] = [];
  const maxTemp = weather.maxTempC;

  if (maxTemp >= 30) {
    goodFor.push("aktywności na zewnątrz rano i późnym popołudniem");
    skipIf.push("chcesz zwiedzać pieszo przez cały dzień bez przerw od wysokiej temperatury");
  } else if (maxTemp >= 24) {
    goodFor.push("spacery, zwiedzanie i posiłki na zewnątrz w ciągu dnia");
  } else if (maxTemp >= 18) {
    goodFor.push("zwiedzanie pieszo bez wysokich temperatur w środku dnia");
  } else if (maxTemp >= 12) {
    goodFor.push("zwiedzanie miasta z cieplejszą warstwą pod ręką");
    skipIf.push("zależy Ci na ciepłych dniach przez większość wyjazdu");
  } else {
    goodFor.push("muzea, wnętrza i krótki miejski plan");
    skipIf.push("chcesz spędzać większość dnia na zewnątrz w łagodnej temperaturze");
  }

  if (weather.rainDays !== null && weather.rainDays >= 12) {
    skipIf.push(`chcesz ograniczyć liczbę dni z opadem — norma wskazuje ${formatClimateNumber(weather.rainDays)} dnia w miesiącu`);
  } else if (weather.rainDays !== null && weather.rainDays <= 3) {
    goodFor.push(`plan z dużą ilością czasu na zewnątrz — norma wskazuje ${formatClimateNumber(weather.rainDays)} dnia z opadem`);
  }

  const rainBasis =
    weather.rainDays === null ? "" : ` oraz średniej liczbie dni z opadem (${formatClimateNumber(weather.rainDays)})`;
  return {
    goodFor,
    skipIf,
    basis: `Wskazania oparto na średniej maksymalnej temperaturze w dzień (${formatClimateNumber(weather.maxTempC)}°C)${rainBasis} z ${weather.source.name}, ${weather.source.periodLabel}. To norma wieloletnia, nie prognoza; wskazania nie uwzględniają tłumów ani cen.`,
  };
}

function monthsAtValue(values: readonly number[], expected: number): PolishMonthSlug[] {
  return polishMonthSlugs.filter((_, index) => values[index] === expected);
}

function buildWeather(facts: DestinationSeoFacts, monthIndex: number): MonthWeather | null {
  const temperature = facts.temperature;
  if (!temperature) return null;

  const maxTempC = temperature.byMonth[monthIndex];
  const minTempC = temperature.minByMonth[monthIndex];
  const yearMinMaxTempC = Math.min(...temperature.byMonth);
  const yearMaxMaxTempC = Math.max(...temperature.byMonth);
  const equalMonths = temperature.byMonth.filter((value) => value === maxTempC).length;

  return {
    maxTempC,
    minTempC,
    rainDays: temperature.rainDays[monthIndex],
    rainfallMm: temperature.rainfallMm[monthIndex],
    rankInYear: temperature.byMonth.filter((value) => value > maxTempC).length + 1,
    rankShared: equalMonths > 1,
    yearMinMaxTempC,
    yearMaxMaxTempC,
    yearMaxTemps: temperature.byMonth,
    warmestMonths: monthsAtValue(temperature.byMonth, yearMaxMaxTempC),
    coldestMonths: monthsAtValue(temperature.byMonth, yearMinMaxTempC),
    source: temperature.source,
  };
}

let profilesBySlug: Map<string, DestinationProfile> | null = null;

function profileBySlug(slug: string): DestinationProfile | undefined {
  profilesBySlug ??= new Map(getAllDestinationProfiles().map((profile) => [profile.slug, profile]));
  return profilesBySlug.get(slug);
}

function buildContext(slug: string, monthIndex: number): MonthContext | null {
  const standing = monthStanding(slug, monthIndex);
  if (!standing) return null;
  const latitude = stationLatitude(slug);
  const warmer = warmerAlternatives(slug, monthIndex, {
    // Linkujemy tylko do stron, które istnieją i są w indeksie — nie do noindex.
    isEligible: (other) => {
      const profile = profileBySlug(other);
      return profile !== undefined && isMonthIndexable(profile, monthIndex);
    },
  }).map((item) => ({ ...item, name: destinationDisplayName(profileBySlug(item.slug)!) }));
  return {
    dayLength: latitude === null ? null : formatDayLength(midMonthDayLength(latitude, monthIndex)),
    home: homeComparison(slug, monthIndex),
    standing,
    warmer,
  };
}

/** Jedno zdanie do odpowiedzi: jak to wypada wobec tego, co czytelnik ma w tym czasie w Polsce. */
function homeLead(context: MonthContext | null, inMonth: string): string {
  const home = context?.home;
  if (!home) return "";
  const difference = formatClimateNumber(Math.abs(home.maxDiffC));
  const warsaw = `${formatClimateNumber(home.homeMaxC)}°C`;
  if (home.maxDiffC >= 1) return ` W dzień to o ${difference}°C więcej niż w Warszawie ${inMonth} (${warsaw}).`;
  if (home.maxDiffC <= -1) return ` W dzień to o ${difference}°C mniej niż w Warszawie ${inMonth} (${warsaw}).`;
  return ` W dzień to niemal tyle samo co w Warszawie ${inMonth} (${warsaw}).`;
}

function precipitationLead(weather: MonthWeather): string {
  if (weather.rainDays !== null) {
    return ` Opad notuje się średnio w ${formatClimateNumber(weather.rainDays)} dnia miesiąca, łącznie ${formatClimateNumber(weather.rainfallMm)} mm.`;
  }
  return ` Średnia suma opadu to ${formatClimateNumber(weather.rainfallMm)} mm; źródło nie podaje liczby dni z opadem.`;
}

export function buildMonthPageModel(input: MonthPageModelInput): MonthPageModel {
  const { profile, month, baseUrl, author } = input;
  const monthIndex = getMonthIndex(month);
  const facts = getDestinationSeoFacts(profile);
  const weather = buildWeather(facts, monthIndex);
  const pageText = monthPageText({
    name: facts.name,
    month,
    maxTempC: weather?.maxTempC ?? null,
    minTempC: weather?.minTempC ?? null,
  });
  const inMonth = inMonthPhrase(month);
  const context = weather ? buildContext(profile.slug, monthIndex) : null;
  // Nagłówek to fraza, której ludzie szukają; o tym, że liczby są normą, mówi treść pod nim.
  const h1 = weather ? `${facts.name} ${inMonth}: pogoda i temperatura` : `${facts.name} ${inMonth}: hotele i loty`;
  const lead = weather
    ? `${facts.name} ${inMonth}: w dzień średnio ${formatClimateNumber(weather.maxTempC)}°C (średnia temperatura maksymalna), w nocy ${formatClimateNumber(weather.minTempC)}°C (średnia minimalna).${homeLead(context, inMonth)}${precipitationLead(weather)}`
    : `${facts.name} ${inMonth}: przejdź do hoteli z cenami w PLN na ten termin i sprawdź dostępność.`;
  const schemaWeather = weather
    ? {
        maxTempC: weather.maxTempC,
        minTempC: weather.minTempC,
        rainDays: weather.rainDays,
        rainfallMm: weather.rainfallMm,
        source: weather.source,
      }
    : null;
  const structuredData = buildMonthPageStructuredData({
    baseUrl,
    destinationSlug: facts.slug,
    month,
    name: facts.name,
    countryName: facts.countryName,
    weather: schemaWeather,
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
    context,
    flightText: facts.flight ? formatFlightFact(facts.flight) : null,
    faq: monthPageQuestions({
      month,
      name: facts.name,
      weather: schemaWeather,
      exactFlightHours: exactFlightHours(facts),
    }),
    fit: weather ? buildFit(weather) : null,
    structuredData,
  };
}
