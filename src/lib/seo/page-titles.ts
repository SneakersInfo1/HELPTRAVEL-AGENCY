import { formatPricePln } from "@/lib/home/deal-card";
import { formatClimateNumber } from "@/lib/mvp/climate-normals";
import type { CommercialCity } from "@/lib/mvp/commercial-cities";
import type { ComparisonPair } from "@/lib/mvp/comparisons";
import { inMonthPhrase, type PolishMonthSlug, type Season } from "@/lib/mvp/months";

import type { VerifiedTitlePrice } from "./price-claim";

// Tytuły, opisy i nagłówki stron szablonowych.
//
// ZASADY (audyt SEO Growth V1, P0):
//  • Bez roku. Rok liczony z zegara builda starzał się razem z cache: we
//    wrześniu 2026 Google pokazywał „Malaga w styczniu 2026". Tytuły są
//    bezterminowe.
//  • Bez ceny modelowanej. Kwota pojawia się wyłącznie z `VerifiedTitlePrice`,
//    którą wydaje tylko verifyTitlePrice() (świeży, realny rekord na przyszły
//    termin). Żaden z tych szablonów nie ma dziś takiego źródła, więc nie
//    pokazuje kwot — ani „od X zł", ani „orientacyjnie".

function hotelsFromPhrase(price: VerifiedTitlePrice): string {
  return `hotele od ${formatPricePln(price.amountPln)}/noc`;
}

function flightHoursLabel(hours: number): string {
  return `${hours.toFixed(1)} h`;
}

export interface GuidePageTextInput {
  cityPl: string;
  /** Tylko dokładny czas lotu z bramki faktów SEO. */
  flightHours: number | null;
  /** Np. „4-5 dni" z tripLengthLabel(); null przy braku danych o locie. */
  tripLength: string | null;
  price?: VerifiedTitlePrice | null;
}

export function guidePageText({ cityPl, flightHours, tripLength, price }: GuidePageTextInput) {
  if (flightHours === null) {
    return {
      title: price
        ? `${cityPl}: ${hotelsFromPhrase(price)}, przewodnik`
        : `${cityPl}: przewodnik po kierunku, hotele i loty`,
      description: `${cityPl}: praktyczny przewodnik po kierunku z przejściem do hoteli i lotów z cenami w PLN.`,
      ogTitle: `${cityPl} — przewodnik`,
      ogDescription: `${cityPl}: przewodnik, hotele i loty z cenami w PLN.`,
      twitterTitle: `${cityPl}: przewodnik po kierunku`,
      twitterDescription: "Sprawdź hotele i loty z cenami w PLN.",
    };
  }

  const hours = flightHoursLabel(flightHours);
  return {
    title: price
      ? `${cityPl}: ${hotelsFromPhrase(price)}, lot ${hours}, przewodnik`
      : `${cityPl}: przewodnik, kiedy lecieć i gdzie spać, lot ${hours}`,
    description: `${cityPl}: najlepsze terminy, lot z Polski ${hours}${tripLength !== null ? ` i sensowna długość wyjazdu (${tripLength})` : ""}. Praktyczny przewodnik z przejściem do hoteli i lotów z cenami w PLN.`,
    ogTitle: price ? `${cityPl} — ${hotelsFromPhrase(price)}, lot ${hours}` : `${cityPl} — przewodnik, lot ${hours} z Polski`,
    ogDescription: `${cityPl}: najlepsze terminy, ceny w PLN, lot ${hours} z Polski. Hotele, loty, przewodnik.`,
    twitterTitle: price ? `${cityPl}: ${hotelsFromPhrase(price)}` : `${cityPl}: przewodnik po kierunku`,
    twitterDescription: `Lot ${hours} z Polski. Sprawdź konkretne oferty w PLN.`,
  };
}

export interface MonthPageTextInput {
  /** Polska nazwa kierunku z bramki faktów SEO. */
  name: string;
  month: PolishMonthSlug;
  /** Średnia maksymalna temperatura w dzień z normy WMO. */
  maxTempC: number | null;
  /** Średnia minimalna temperatura w nocy z normy WMO. */
  minTempC: number | null;
  price?: VerifiedTitlePrice | null;
}

/**
 * Tytuł strony miesiąca z pogodą. Jest ustawiany jako tytuł absolutny, bez
 * sufiksu marki, i zawsze mieści się w 60 znakach.
 */
export function monthWeatherTitle(name: string, inMonth: string, maxTempC: number): string {
  const value = formatClimateNumber(maxTempC);
  const candidates = [
    `${name} ${inMonth}: pogoda, w dzień ${value}°C`,
    `${name} ${inMonth}: w dzień ${value}°C`,
    // Miesiąc zostaje zawsze: bez niego 12 stron kierunku miałoby ten sam tytuł.
    `${name} ${inMonth}: ${value}°C`,
  ];
  return candidates.find((candidate) => candidate.length <= 60) ?? candidates[candidates.length - 1];
}

export function monthPageText({ name, month, maxTempC, minTempC, price }: MonthPageTextInput) {
  const inMonth = inMonthPhrase(month);
  if (maxTempC === null) {
    return {
      title: price ? `${name} ${inMonth}: ${hotelsFromPhrase(price)}` : `${name} ${inMonth}: hotele i kiedy lecieć`,
      description: `${name} ${inMonth}: hotele z cenami w PLN i loty na ten termin. Sprawdź dostępność w wyszukiwarce.`,
      ogTitle: `${name} ${inMonth} — hotele i loty`,
      headline: `${name} ${inMonth} — hotele i kiedy lecieć`,
    };
  }

  const max = formatClimateNumber(maxTempC);
  const min = minTempC === null ? null : formatClimateNumber(minTempC);
  return {
    title: price
      ? `${name} ${inMonth}: ${max}°C w dzień, ${hotelsFromPhrase(price)}`
      : monthWeatherTitle(name, inMonth, maxTempC),
    description: `${name} ${inMonth}: średnia maksymalna w dzień ${max}°C${min ? `, minimalna w nocy ${min}°C` : ""}. Aktualne ceny hoteli na wybrany termin pokazuje wyszukiwarka.`,
    ogTitle: price
      ? `${name} ${inMonth} — ${max}°C w dzień i ${hotelsFromPhrase(price)}`
      : `${name} ${inMonth} — pogoda, w dzień ${max}°C`,
    headline: `${name} ${inMonth} — pogoda i temperatura`,
  };
}

/** „w Barcelonie" / „na Teneryfie" — przyimek mieszka w rekordzie miasta. */
export function cityLocationPhrase(city: CommercialCity): string {
  return `${city.preposition} ${city.cityLocative}`;
}

export interface CityHotelsPageTextInput {
  city: CommercialCity;
  price?: VerifiedTitlePrice | null;
}

export function cityHotelsPageText({ city, price }: CityHotelsPageTextInput) {
  const inLoc = cityLocationPhrase(city);
  // Bez nawiasu z krajem dla wysp-państw (Malta, Cypr), gdzie miasto = kraj.
  const countrySuffix = city.cityNominative === city.countryNominative ? "" : ` (${city.countryLocative})`;
  return {
    title: price
      ? `Hotele ${inLoc}: od ${formatPricePln(price.amountPln)}/noc, ceny w PLN`
      : `Hotele ${inLoc} — sprawdź ceny w PLN i dostępność`,
    description: `Hotele ${inLoc}${countrySuffix}: ceny w PLN, bezpłatna anulacja w wybranych ofertach i polskie wsparcie. Sprawdź dostępność w swoim terminie.`,
    ogTitle: `Hotele ${inLoc} — ceny w PLN`,
    twitterTitle: `Hotele ${inLoc} — ceny w PLN`,
    twitterDescription: `Hotele ${inLoc}: ceny w PLN, bezpłatna anulacja w wybranych ofertach, polskie wsparcie.`,
    heading: `Hotele ${inLoc}`,
    articleHeadline: `Hotele ${inLoc} — sprawdź ceny w PLN`,
    articleDescription: `Hotele ${inLoc}${countrySuffix}. Bezpłatna anulacja w wybranych ofertach, polskie wsparcie.`,
  };
}

const SEASON_HEADINGS: Record<Season, string> = {
  wiosna: "Kierunki na wiosnę: w dzień średnio 22–28°C",
  lato: "Kierunki na lato: w dzień średnio 22–28°C",
  jesien: "Kierunki na jesień: w dzień średnio 22–28°C",
  zima: "Kierunki na zimę: w dzień średnio 22–28°C",
};

export function seasonPageHeading(season: Season): string {
  return SEASON_HEADINGS[season];
}

export interface ComparisonPageTextInput {
  pair: ComparisonPair;
  nameA: string;
  nameB: string;
  /** Obie strony mają normę WMO — tylko wtedy strona pokazuje pogodę. */
  hasClimate?: boolean;
}

// Tytuł i opis obiecują tylko to, co strona pokazuje. Bez kwot budżetu ze wzoru.
export function comparisonPageText({ pair, nameA, nameB, hasClimate = false }: ComparisonPageTextInput) {
  const titleTopics = hasClimate ? "pogoda, plaże i dolot" : "plaże, zwiedzanie i dolot";
  const descriptionTopics = [
    hasClimate ? "pogoda w sezonie" : null,
    "plaże i dolot z Polski",
  ]
    .filter((topic): topic is string => topic !== null)
    .join(", ");
  return {
    // Top strony mają ręcznie dopracowany `metaTitle` (wariant do zmierzenia w GSC).
    title: pair.metaTitle ?? `${nameA} czy ${nameB}? Porównanie: ${titleTopics}`,
    description: `${nameA} czy ${nameB}: ${descriptionTopics}. Sprawdź, który kierunek wybrać. ${pair.intent}.`,
  };
}
