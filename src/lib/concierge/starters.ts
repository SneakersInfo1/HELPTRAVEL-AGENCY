// Startery czatu — generowane z KALENDARZA, nigdy wpisane na sztywno.
//
// Poprzednia wersja trzymała je jako stałą tablicę w komponencie, z „w
// sierpniu” w pierwszym prompcie. Taki tekst nie ma jak się zestarzeć głośno:
// nic go nie waliduje, nikt go nie odświeża, a użytkownik dostaje zaproszenie
// na termin, którego nie da się kupić. Tutaj miesiąc jest FUNKCJĄ dnia, więc
// starzenie się jest architektonicznie niemożliwe (i przybite testem na
// wszystkie dwanaście miesięcy).
//
// Dobór intencji (§7) — trzy różne potrzeby, nie trzy warianty tej samej:
//   beach       — wakacje przy wodzie, główny wolumen leisure,
//   city-break   — krótki wypad, inny budżet i inna długość pobytu,
//   winter-sun   — ciepło poza sezonem; „zimą” to pora roku, więc nie starzeje
//                  się nigdy i celowo NIE dostaje numeru miesiąca.

import { addDaysIso, monthOfIso } from "@/lib/time/travel-now";
import { resolveMonthWithoutYear } from "./travel-dates";

/** Miesiące w miejscowniku, z polskimi znakami — to jest COPY, nie slug. */
export const MONTH_LOCATIVE_PL: Record<number, string> = {
  1: "styczniu",
  2: "lutym",
  3: "marcu",
  4: "kwietniu",
  5: "maju",
  6: "czerwcu",
  7: "lipcu",
  8: "sierpniu",
  9: "wrześniu",
  10: "październiku",
  11: "listopadzie",
  12: "grudniu",
};

/**
 * Miesiące, w których „plaża” w europejskim zasięgu lotu jest uczciwą
 * obietnicą. Poza nimi starter plażowy NIE nazywa terminu — zamiast obiecywać
 * grudniową plażę zostaje bezterminowy, a ciepło zimą sprzedaje osobny
 * starter, który ma po temu realne kierunki (Wyspy Kanaryjskie, Egipt).
 */
const BEACH_SEASON_MONTHS = new Set([4, 5, 6, 7, 8, 9, 10]);

export type StarterIntent = "beach" | "city-break" | "winter-sun";

export interface ConciergeStarter {
  intent: StarterIntent;
  /** Klucz ikony — komponent mapuje go na komponent Lucide (dane bez JSX). */
  iconKey: "umbrella" | "building" | "sun";
  label: string;
  prompt: string;
  /** Miesiąc (1–12) nazwany w tekście albo null, gdy starter jest bezterminowy. */
  namedMonth: number | null;
  /** Pierwszy dzień nazwanego miesiąca — do testów i telemetrii. */
  namedMonthFirstDayIso: string | null;
}

/**
 * Miesiąc proponowany domyślnie: NASTĘPNY pełny. Ta sama reguła co
 * `defaultMonth` w budget.ts (założenie, gdy klient nie poda terminu), więc
 * starter zaprasza dokładnie tam, gdzie i tak trafi wyszukiwanie — i gdzie
 * cron ma wygrzane okna.
 */
function nextFullMonth(todayIso: string): { month: number; firstDayIso: string } {
  // Pierwszy dzień kolejnego miesiąca — liczony przez przejście na 1. dzień
  // bieżącego i dodanie 32 dni, żeby nie bawić się w długości miesięcy.
  const firstOfThis = `${todayIso.slice(0, 8)}01`;
  const inNextMonth = addDaysIso(firstOfThis, 32);
  const month = monthOfIso(inNextMonth) as number;
  const resolved = resolveMonthWithoutYear(month, todayIso);
  return { month, firstDayIso: resolved?.firstDayIso ?? `${inNextMonth.slice(0, 8)}01` };
}

/**
 * Trzy startery na dany dzień. Czysta funkcja od `todayIso` — komponent
 * dostaje gotowe dane, a test może przejść cały rok bez zegara systemowego.
 */
export function buildConciergeStarters(todayIso: string): ConciergeStarter[] {
  const next = nextFullMonth(todayIso);
  const beachNamesMonth = BEACH_SEASON_MONTHS.has(next.month);
  const beachText = beachNamesMonth
    ? `Plaża do 3000 zł w ${MONTH_LOCATIVE_PL[next.month]}`
    : "Plaża do 3000 zł";

  return [
    {
      intent: "beach",
      iconKey: "umbrella",
      label: beachText,
      prompt: beachText,
      namedMonth: beachNamesMonth ? next.month : null,
      namedMonthFirstDayIso: beachNamesMonth ? next.firstDayIso : null,
    },
    {
      intent: "city-break",
      iconKey: "building",
      // Bezterminowy z wyboru: city break robi się „kiedyś w najbliższym
      // czasie”, a konkretny miesiąc niczego tu nie dodaje.
      label: "City break do 1500 zł",
      prompt: "City break do 1500 zł",
      namedMonth: null,
      namedMonthFirstDayIso: null,
    },
    {
      intent: "winter-sun",
      iconKey: "sun",
      // „Zimą” to pora roku — wraca co rok, więc nie ma jak się zestarzeć.
      label: "Słońce zimą do 4000 zł",
      prompt: "Słońce zimą do 4000 zł",
      namedMonth: null,
      namedMonthFirstDayIso: null,
    },
  ];
}
