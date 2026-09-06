// Semantyka terminów podróży — jedyne miejsce, w którym zapada decyzja
// „czy ten termin da się jeszcze sprzedać".
//
// KONTRAKT V2.2 (§4, §8, §12). Rozdzielamy trzy rzeczy, które wcześniej
// zlewały się w jedną i dlatego produkowały ofertę z przeszłości:
//
//   1. STAN TERMINU  — czy data wyjazdu jest przed/po dzisiaj (PAST/TODAY/FUTURE).
//   2. SPRZEDAWALNOŚĆ — czy da się na ten termin zrobić rezerwację (≥ jutro
//      i w horyzoncie sprzedaży dostawcy).
//   3. ŚWIEŻOŚĆ CENY — czy kwota nie jest za stara. To OSOBNY wymiar, mieszkający
//      w warstwie snapshotu; oferta może być FUTURE i mieć nieświeżą cenę.
//
// Świeżość ceny NIE jest tu obsługiwana świadomie — patrz `src/lib/snapshot`.

import { addDaysIso, daysBetweenIso, isIsoDate, monthOfIso } from "@/lib/time/travel-now";

/** Stan czasowy daty wyjazdu względem „dziś". */
export type TravelDateState = "PAST" | "TODAY" | "FUTURE";

/**
 * Horyzont sprzedaży lotów. GDS (LiteAPI Flights) publikuje rozkłady zwykle
 * na ~11 miesięcy w przód. Termin dalej niż to jest formalnie „przyszłością",
 * ale nie da się na niego kupić biletu — a właśnie tam lądował użytkownik,
 * któremu „sierpień" po sierpniu przeskakiwał na sierpień NASTĘPNEGO roku
 * (karta bez lotu, wynik wyglądający na zepsuty).
 */
export const SALE_HORIZON_DAYS = 330;

/**
 * Minimalne wyprzedzenie oferty, którą sami GENERUJEMY. Rezerwacja na dziś
 * jest u dostawcy zawodna (hotel po godzinie zameldowania, lot już odleciał),
 * więc nic, co proponujemy z własnej inicjatywy, nie startuje wcześniej niż
 * jutro. Do ODRZUCANIA cudzych dat służy `classifyTravelDate` — tam „dziś"
 * nie jest przeszłością i nie udajemy, że jest.
 */
export const MIN_LEAD_DAYS = 1;

/** Stan czasowy daty. Wejście nie-będące datą traktujemy jak PAST (fail-closed). */
export function classifyTravelDate(startIso: unknown, todayIso: string): TravelDateState {
  if (!isIsoDate(startIso)) return "PAST";
  if (startIso < todayIso) return "PAST";
  if (startIso === todayIso) return "TODAY";
  return "FUTURE";
}

/** Czy na ten termin wolno pokazać ofertę do kupienia (≥ jutro). */
export function isBookableStart(startIso: unknown, todayIso: string): boolean {
  if (!isIsoDate(startIso)) return false;
  return startIso >= addDaysIso(todayIso, MIN_LEAD_DAYS);
}

/** Czy termin mieści się w horyzoncie, na który dostawca w ogóle sprzedaje. */
export function isWithinSaleHorizon(startIso: unknown, todayIso: string): boolean {
  if (!isIsoDate(startIso)) return false;
  const delta = daysBetweenIso(todayIso, startIso);
  return delta >= 0 && delta <= SALE_HORIZON_DAYS;
}

export interface MonthResolution {
  year: number;
  /** 1–12. */
  month: number;
  /** Pierwszy dzień rozwiązanego miesiąca — do porównań i do generowania okna. */
  firstDayIso: string;
  /** Ostatni dzień rozwiązanego miesiąca. */
  lastDayIso: string;
  /** Czy trzeba było przeskoczyć na kolejny rok (miesiąc w tym roku już minął). */
  rolledOver: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function firstDay(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

function lastDay(year: number, month: number): string {
  // Dzień 0 kolejnego miesiąca = ostatni dzień tego. Liczone w UTC.
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * Miesiąc PODANY BEZ ROKU → najbliższe PRZYSZŁE wystąpienie (§8).
 *
 * Reguła: zostajemy w bieżącym roku, dopóki w tym miesiącu mieści się jeszcze
 * termin z wymaganym wyprzedzeniem (`minLeadDays`). W przeciwnym razie kolejny
 * rok. Dlatego „lipiec" poproszony 10 lipca zostaje lipcem TEGO roku (realny
 * incydent — skok o rok wypychał ofertę poza horyzont sprzedaży lotów),
 * a „sierpień" poproszony 6 września jest już sierpniem NASTĘPNEGO roku.
 *
 * Zwraca null dla miesiąca spoza 1–12.
 */
export function resolveMonthWithoutYear(
  month: number,
  todayIso: string,
  minLeadDays: number = MIN_LEAD_DAYS,
): MonthResolution | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const year = Number(todayIso.slice(0, 4));
  const earliestStart = addDaysIso(todayIso, minLeadDays);
  // Miesiąc w tym roku jest do wzięcia, jeśli jego OSTATNI dzień jest nie
  // wcześniejszy niż najwcześniejszy dopuszczalny start.
  const thisYearLast = lastDay(year, month);
  const rolledOver = thisYearLast < earliestStart;
  const resolvedYear = rolledOver ? year + 1 : year;
  return {
    year: resolvedYear,
    month,
    firstDayIso: firstDay(resolvedYear, month),
    lastDayIso: lastDay(resolvedYear, month),
    rolledOver,
  };
}

export interface ExplicitMonthResolution {
  year: number;
  month: number;
  firstDayIso: string;
  lastDayIso: string;
  state: TravelDateState;
  /** Czy da się na ten miesiąc cokolwiek sprzedać (nie minął i jest w horyzoncie). */
  bookable: boolean;
  withinSaleHorizon: boolean;
}

/**
 * Miesiąc PODANY Z ROKIEM („sierpień 2026"). Nie przesuwamy go nigdzie —
 * użytkownik był konkretny. Gdy taki termin już minął, wynik mówi to wprost
 * (`state: "PAST"`, `bookable: false`), a rozmowa ma poprosić o inny termin
 * zamiast po cichu podstawiać kolejny rok (§8).
 */
export function resolveExplicitMonthYear(
  month: number,
  year: number,
  todayIso: string,
): ExplicitMonthResolution | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  const first = firstDay(year, month);
  const last = lastDay(year, month);
  // Miesiąc jest przeszłością dopiero, gdy minął CAŁY — 6 września „wrzesień
  // 2026" wciąż da się sprzedać na koniec miesiąca.
  const state: TravelDateState = last < todayIso ? "PAST" : first <= todayIso ? "TODAY" : "FUTURE";
  // Do sprzedaży bierzemy najwcześniejszy dopuszczalny dzień W TYM miesiącu.
  const earliestStart = addDaysIso(todayIso, MIN_LEAD_DAYS);
  const candidateStart = first > earliestStart ? first : earliestStart;
  const withinSaleHorizon = state !== "PAST" && isWithinSaleHorizon(candidateStart, todayIso);
  return {
    year,
    month,
    firstDayIso: first,
    lastDayIso: last,
    state,
    bookable: state !== "PAST" && candidateStart <= last,
    withinSaleHorizon,
  };
}

export interface DateWindowLike {
  checkin: string;
  checkout: string;
  nights?: number;
}

export type WindowMatchType = "EXACT" | "NEAREST";

export interface WindowMatch<W extends DateWindowLike> {
  window: W;
  matchType: WindowMatchType;
}

/**
 * Wybór okna z puli — WYŁĄCZNIE spośród przyszłych (§12).
 *
 * EXACT = zgadza się i miesiąc (jeśli podany), i liczba nocy (jeśli podana).
 * NEAREST = najwcześniejsze przyszłe okno po odrzuceniu przeszłości; wołający
 * MUSI wtedy powiedzieć, że cena jest orientacyjna dla innego terminu.
 *
 * Okno sierpniowe przy prośbie o sierpień nie może wygrać tylko dlatego, że
 * „miesiąc się zgadza" — jeżeli minęło, wypada z puli razem z całą resztą
 * przeszłości. To jest ta reguła, której brak dawał kartę „10–17 sierpnia".
 */
export function pickNearestFutureWindow<W extends DateWindowLike>(
  windows: readonly W[],
  want: { month?: number; nights?: number },
  todayIso: string,
): WindowMatch<W> | null {
  const future = windows
    .filter((w) => isBookableStart(w.checkin, todayIso))
    .sort((a, b) => (a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : 0));
  if (future.length === 0) return null;

  const nightsOf = (w: W): number =>
    typeof w.nights === "number" ? w.nights : daysBetweenIso(w.checkin, w.checkout);

  const monthOk = (w: W) => want.month === undefined || monthOfIso(w.checkin) === want.month;
  const nightsOk = (w: W) => want.nights === undefined || nightsOf(w) === want.nights;

  const exact = future.find((w) => monthOk(w) && nightsOk(w));
  if (exact) return { window: exact, matchType: "EXACT" };

  // Bez trafienia wprost preferujemy zgodną długość pobytu przed zgodnym
  // miesiącem: użytkownik, który prosił o „7 nocy", dostanie 7 nocy w innym
  // terminie, a nie 4 noce w swoim.
  const byNights = future.find((w) => nightsOk(w));
  return { window: byNights ?? future[0], matchType: "NEAREST" };
}
