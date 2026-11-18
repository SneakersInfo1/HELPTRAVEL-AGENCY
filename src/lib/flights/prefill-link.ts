// Przejście ze stron treści (miesiąc, porównanie, przewodnik) do wyszukiwarki
// lotów na stronie głównej z wpisanym celem i — gdy strona go zna — terminem.
//
// DO 17.11.2026 przycisk „Szukaj lotów” prowadził na gołe `/?tab=loty`:
// czytelnik strony „Barcelona w styczniu” trafiał do pustego formularza
// i musiał drugi raz wpisać kierunek i daty.
//
// DANE W FRAGMENCIE (#…), NIE W ZAPYTANIU (?…):
// - fragment nie trafia do serwera ani do indeksu wyszukiwarek, więc dla
//   Google adres celu zostaje jeden: `/?tab=loty`. Parametry w zapytaniu
//   zrobiłyby z 2820 stron miesięcy tysiące wariantów strony głównej do
//   crawlowania;
// - GA4 składa `page_location` ze ścieżki i zapytania (bez fragmentu);
// - formularz i tak czyta stan po zamontowaniu (zakładkę z `?tab=` też).
//
// LINK NIE URUCHAMIA WYSZUKIWANIA. Lotnisko wylotu wybiera człowiek (pole
// wymagane), a każde zapytanie do dostawcy lotów musi wyjść od użytkownika:
// dostawca ma twardy limit tempa (bramka provider-slot), a stron treści nie
// mogą „klikać” roboty.
//
// Wejście z adresu jest niezaufane: kod IATA musi mieć 3 litery, tekst ma limit
// długości i nie może zawierać znaków sterujących, a daty z przeszłości, zbyt
// odległe albo w złej kolejności są pomijane (wtedy termin wybiera użytkownik).

import { daysBetweenIso, isIsoDate } from "@/lib/time/travel-now";

/** Adres wyszukiwarki lotów bez wypełnionych pól (stan sprzed zmiany). */
export const FLIGHT_SEARCH_HREF = "/?tab=loty";

const IATA_RE = /^[A-Z]{3}$/;
const MAX_TEXT_LENGTH = 80;
// Znaki sterujące i nawiasy kątowe — tekst trafia do pola formularza i do adresu wyników.
const UNSAFE_TEXT_RE = /[\u0000-\u001f\u007f<>]/;
/** Najdalszy wylot, jaki przenosimy z linku (strony miesięcy linkują do 12 miesięcy w przód). */
const MAX_DAYS_AHEAD = 366;
/** Najdłuższy pobyt, jaki przenosimy z linku. */
const MAX_TRIP_DAYS = 30;

export interface FlightSearchPrefillInput {
  /** Kod celu z profilu kierunku: lotnisko albo metropolia (np. „BCN”, „ROM”). */
  destIata: string | undefined;
  /** Nazwa miasta z profilu (klucz wyszukiwarki, po angielsku, np. „Barcelona”). */
  city: string;
  /** Kraj z profilu — gdyby użytkownik przełączył formularz na hotele. */
  country?: string;
  /** Wylot (YYYY-MM-DD). */
  depart?: string;
  /** Powrót (YYYY-MM-DD), tylko razem z wylotem. */
  return?: string;
}

export interface FlightSearchPrefill {
  destIata: string;
  /** Nazwa miasta — w formularzu `destination` (klucz wyszukiwarki). */
  destination: string;
  destinationCountry: string | null;
  startDate: string | null;
  endDate: string | null;
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text || text.length > MAX_TEXT_LENGTH || UNSAFE_TEXT_RE.test(text)) return null;
  return text;
}

/**
 * Link do zakładki lotów z wypełnionym celem (i terminem, jeśli podany).
 * Bez poprawnego kodu IATA albo nazwy miasta zwraca zwykłe `/?tab=loty`.
 */
export function flightSearchPrefillHref(input: FlightSearchPrefillInput): string {
  const destIata = input.destIata?.trim().toUpperCase() ?? "";
  const city = cleanText(input.city);
  if (!IATA_RE.test(destIata) || !city) return FLIGHT_SEARCH_HREF;

  const params = new URLSearchParams({ destination: destIata, destLabel: city });
  const country = cleanText(input.country);
  if (country) params.set("country", country);
  if (isIsoDate(input.depart)) {
    params.set("depart", input.depart);
    if (isIsoDate(input.return) && daysBetweenIso(input.depart, input.return) >= 0) {
      params.set("return", input.return);
    }
  }
  return `${FLIGHT_SEARCH_HREF}#${params.toString()}`;
}

function parseDates(
  depart: string | null,
  ret: string | null,
  today: string,
): Pick<FlightSearchPrefill, "startDate" | "endDate"> {
  const none = { startDate: null, endDate: null };
  if (!isIsoDate(depart) || !isIsoDate(today)) return none;
  const ahead = daysBetweenIso(today, depart);
  if (ahead < 0 || ahead > MAX_DAYS_AHEAD) return none;
  if (!isIsoDate(ret)) return { startDate: depart, endDate: null };
  const trip = daysBetweenIso(depart, ret);
  if (trip < 0 || trip > MAX_TRIP_DAYS) return { startDate: depart, endDate: null };
  return { startDate: depart, endDate: ret };
}

/**
 * Odczyt fragmentu adresu (`window.location.hash`) zbudowanego przez
 * `flightSearchPrefillHref`. `today` = dzień w Europe/Warsaw (`travelToday()`).
 * Zwraca null, gdy fragment nie niesie poprawnego celu.
 */
export function parseFlightSearchPrefill(hash: string, today: string): FlightSearchPrefill | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const destIata = params.get("destination")?.trim().toUpperCase() ?? "";
  const destination = cleanText(params.get("destLabel"));
  if (!IATA_RE.test(destIata) || !destination) return null;
  return {
    destIata,
    destination,
    destinationCountry: cleanText(params.get("country")),
    ...parseDates(params.get("depart"), params.get("return"), today),
  };
}
