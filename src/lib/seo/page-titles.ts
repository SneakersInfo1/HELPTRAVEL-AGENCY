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
  flightHours: number;
  /** Np. „4-5 dni" z idealTripLength(). */
  tripLength: string;
  price?: VerifiedTitlePrice | null;
}

export function guidePageText({ cityPl, flightHours, tripLength, price }: GuidePageTextInput) {
  const hours = flightHoursLabel(flightHours);
  return {
    title: price
      ? `${cityPl}: ${hotelsFromPhrase(price)}, lot ${hours}, przewodnik`
      : `${cityPl}: przewodnik, kiedy lecieć i gdzie spać, lot ${hours}`,
    description: `${cityPl}: najlepsze terminy, lot z Polski ${hours} i sensowna długość wyjazdu (${tripLength}). Praktyczny przewodnik z przejściem do hoteli i lotów z cenami w PLN.`,
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
}

export function comparisonPageText({ pair, nameA, nameB }: ComparisonPageTextInput) {
  return {
    // Top strony mają ręcznie dopracowany `metaTitle` (wariant do zmierzenia w GSC).
    title: pair.metaTitle ?? `${nameA} czy ${nameB}? Porównanie: pogoda, budżet i dolot`,
    description: `${nameA} czy ${nameB}: pogoda w sezonie, orientacyjny budżet na 4 dni, plaże i dolot z Polski. Sprawdź, który kierunek wybrać. ${pair.intent}.`,
  };
}
