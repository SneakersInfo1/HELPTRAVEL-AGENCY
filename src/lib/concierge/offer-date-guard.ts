// Bezpieczeństwo dat NA POZIOMIE KARTY — ostatnia linia obrony (§13).
//
// Warstwy wyżej (snapshot, ranking, egzekutor narzędzia) mają już twarde
// filtry czasowe. Ten moduł istnieje mimo to, bo karta jest jedyną rzeczą,
// którą użytkownik naprawdę widzi i klika: jeśli cokolwiek przepuści termin
// z przeszłości, to właśnie tutaj musi się zatrzymać, zanim zamieni się
// w widoczną cenę i klikalne CTA.
//
// Drugi problem, który ten moduł zamyka, to CZYTELNOŚĆ ROKU. Poprzedni
// formatter nigdy nie drukował roku, więc oferta na 2027-08-10 wyświetlała się
// jako „10–17 sierpnia” — 6 września 2026 nie do odróżnienia od terminu, który
// właśnie minął. To był realny zrzut ekranu od właściciela. Rok pojawia się
// więc zawsze, gdy termin wychodzi poza bieżący rok kalendarzowy.

import { isIsoDate, yearOfIso } from "@/lib/time/travel-now";
import { isBookableStart } from "./travel-dates";

/** Parametry URL niosące datę wyjazdu/zameldowania w tym produkcie. */
const START_DATE_PARAMS = ["checkin", "depart", "departure", "date", "from_date"] as const;
/** Parametry URL niosące datę powrotu/wymeldowania. */
const END_DATE_PARAMS = ["checkout", "return", "to_date"] as const;

export interface OfferDates {
  checkin: unknown;
  checkout: unknown;
}

/**
 * Czy kartę z tym terminem wolno w ogóle wyrenderować jako ofertę do kupienia.
 * Wymagamy startu co najmniej jutro (patrz MIN_LEAD_DAYS) i poprawnej kolejności.
 */
export function isOfferDateRenderable(offer: OfferDates, todayIso: string): boolean {
  const { checkin, checkout } = offer;
  if (!isIsoDate(checkin) || !isIsoDate(checkout)) return false;
  if (checkout <= checkin) return false;
  return isBookableStart(checkin, todayIso);
}

/**
 * Zakres dat po polsku. Rok drukujemy, gdy KTÓRAKOLWIEK ze stron wychodzi poza
 * bieżący rok — inaczej tekst jest dwuznaczny (i właśnie na tej dwuznaczności
 * oparł się incydent „10–17 sierpnia” we wrześniu).
 */
export function formatTravelDateRangePl(checkin: string, checkout: string, todayIso: string): string {
  if (!isIsoDate(checkin) || !isIsoDate(checkout)) return `${checkin} – ${checkout}`;
  const inDate = new Date(`${checkin}T00:00:00Z`);
  const outDate = new Date(`${checkout}T00:00:00Z`);
  const currentYear = yearOfIso(todayIso);
  const needYear = yearOfIso(checkin) !== currentYear || yearOfIso(checkout) !== currentYear;

  const base = { timeZone: "UTC" } as const;
  const sameMonth =
    inDate.getUTCMonth() === outDate.getUTCMonth() && inDate.getUTCFullYear() === outDate.getUTCFullYear();

  const dayFmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", ...base });
  const dayMonthFmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", ...base });
  const dayMonthYearFmt = new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...base,
  });
  const tail = needYear ? dayMonthYearFmt : dayMonthFmt;

  if (sameMonth) {
    // „10–17 sierpnia 2027” — rok raz, na końcu, bo miesiąc jest wspólny.
    return `${dayFmt.format(inDate)}–${tail.format(outDate)}`;
  }
  return `${tail.format(inDate)} – ${tail.format(outDate)}`;
}

/**
 * Walidacja dat W LINKU. Zwraca URL bez zmian, gdy wszystkie daty są w
 * porządku, albo `null`, gdy link prowadziłby do wyszukiwania na termin
 * z przeszłości — wołający ma wtedy NIE renderować CTA.
 *
 * Fail-closed z rozmysłem: data w nieznanym formacie też odrzuca link. Lepiej
 * nie pokazać przycisku, niż wysłać użytkownika na stronę, która i tak nie
 * zwróci wyników.
 */
export function withSafeDateParams(url: string, todayIso: string): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return url;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(url.slice(queryStart + 1));
  } catch {
    return null;
  }

  for (const name of START_DATE_PARAMS) {
    const value = params.get(name);
    if (value === null) continue;
    if (!isIsoDate(value) || !isBookableStart(value, todayIso)) return null;
  }
  for (const name of END_DATE_PARAMS) {
    const value = params.get(name);
    if (value === null) continue;
    // Data powrotu nie musi być „sprzedawalna" sama z siebie, ale nie może
    // leżeć w przeszłości.
    if (!isIsoDate(value) || value < todayIso) return null;
  }
  return url;
}
