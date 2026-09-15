import { formatPricePln } from "@/lib/home/deal-card";
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
  tempC: number | null;
  price?: VerifiedTitlePrice | null;
}

export function monthPageText({ name, month, tempC, price }: MonthPageTextInput) {
  const inMonth = inMonthPhrase(month);
  if (tempC === null) {
    return {
      title: price ? `${name} ${inMonth}: ${hotelsFromPhrase(price)}` : `${name} ${inMonth}: hotele i kiedy lecieć`,
      description: `${name} ${inMonth}: hotele z cenami w PLN i loty na ten termin. Sprawdź dostępność w wyszukiwarce.`,
      ogTitle: `${name} ${inMonth} — hotele i loty`,
      headline: `${name} ${inMonth} — hotele i kiedy lecieć`,
    };
  }

  return {
    title: price
      ? `${name} ${inMonth}: pogoda ${tempC}°C, ${hotelsFromPhrase(price)}`
      : `${name} ${inMonth}: pogoda ${tempC}°C, hotele i kiedy lecieć`,
    description: `${name} ${inMonth}: średnia temperatura ${tempC}°C. Sprawdź, czy to dobry termin, i przejdź do hoteli i lotów z cenami w PLN.`,
    ogTitle: price
      ? `${name} ${inMonth} — pogoda ${tempC}°C i ${hotelsFromPhrase(price)}`
      : `${name} ${inMonth} — pogoda ${tempC}°C i hotele`,
    headline: `${name} ${inMonth} — pogoda, hotele i kiedy lecieć`,
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
  wiosna: "Najlepsze kierunki na wiosnę — ranking pod krótki wyjazd",
  lato: "Najlepsze kierunki na lato — gdzie ciepło i sensownie",
  jesien: "Najlepsze kierunki na jesień — ciepła pogoda, mniej tłumów",
  zima: "Najlepsze kierunki na zimę — ciepłe ucieczki i city break",
};

export function seasonPageHeading(season: Season): string {
  return SEASON_HEADINGS[season];
}

export interface ComparisonPageTextInput {
  pair: ComparisonPair;
  nameA: string;
  nameB: string;
  /** Obie strony mają temperaturę kuratorowaną — tylko wtedy strona pokazuje pogodę. */
  hasClimate?: boolean;
  /** Obie strony mają szacunek budżetu z danych kuratorowanych. */
  hasBudget?: boolean;
}

// Tytuł i opis obiecują tylko to, co strona pokazuje. Po PR #1.5 porównanie bez
// danych kuratorowanych (np. Kreta–Rodos) nie ma sekcji pogody ani budżetu.
export function comparisonPageText({ pair, nameA, nameB, hasClimate = false, hasBudget = false }: ComparisonPageTextInput) {
  const titleTopics =
    hasClimate && hasBudget
      ? "pogoda, budżet i dolot"
      : hasClimate
        ? "pogoda, plaże i dolot"
        : hasBudget
          ? "budżet, plaże i dolot"
          : "plaże, zwiedzanie i dolot";
  const descriptionTopics = [
    hasClimate ? "pogoda w sezonie" : null,
    hasBudget ? "orientacyjny budżet na 4 dni" : null,
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
