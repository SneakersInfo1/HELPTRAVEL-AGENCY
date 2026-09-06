// Macierz okien dat snapshotu konsjerża — PRZESUWA SIĘ Z KALENDARZEM (§20, §21).
//
// CO BYŁO NIE TAK. Poprzedni generator (`computeSnapshotDateWindows`) dawał dwa
// okna: sobota ≥60 dni / 7 nocy oraz poniedziałek ≥40 dni / 4 noce. Oba były
// liczone od „dziś", więc przesuwały się poprawnie — problem był gdzie indziej:
// cron zapisywał na kierunek TYLKO JEDEN pakiet (ten tańszy z dwóch okien),
// więc snapshot niósł dokładnie jedną parę (miesiąc, liczba nocy) na kierunek.
// Pomiar produkcyjny 2026-09-06: 32 kierunki wycenione na 19–23 października
// (4 noce) i 14 na 7–14 listopada (7 nocy). Pytanie „Grecja, październik,
// 7 nocy" nie miało jak trafić — nie dlatego, że danych brakowało, tylko
// dlatego, że kształt snapshotu nie umiał ich pomieścić.
//
// TERAZ generujemy PEŁNĄ macierz: kolejne miesiące × kolejne długości pobytu,
// każdy miesiąc z każdą długością. Snapshot trzyma rekord per (kierunek ×
// wylot × okno), więc konsjerż może odpowiedzieć na pytanie o konkretny
// miesiąc I konkretną długość — albo uczciwie powiedzieć, że to NEAREST.
//
// KOTWICE DNI TYGODNIA są celowe, nie kosmetyczne:
//   • 7 nocy startuje w SOBOTĘ — klasyczny turnus, najgęstsza dostępność
//     lotów czarterowych i rozkładowych.
//   • 4 noce startują w PONIEDZIAŁEK — stawki weekdayowe są wyraźnie niższe
//     niż weekendowe (to była obserwacja stojąca za oknem „srodtydzien").

import { addDaysIso, isIsoDate } from "@/lib/time/travel-now";
import { MIN_LEAD_DAYS, SALE_HORIZON_DAYS } from "@/lib/concierge/travel-dates";

/** Ile kolejnych miesięcy obejmuje macierz. */
export const WINDOW_MONTHS_AHEAD = 4;

/**
 * Długości pobytu. Dwie, nie pięć — każda dodatkowa mnoży liczbę zapytań do
 * dostawcy przez liczbę kierunków i miesięcy. 4 noce pokrywają city break
 * i „długi weekend", 7 nocy pokrywa tydzień wakacji; razem to zdecydowana
 * większość realnych zapytań w tym produkcie.
 */
export const WINDOW_NIGHTS = [4, 7] as const;

/**
 * Minimalne wyprzedzenie pierwszego okna. 14 dni: bliżej ceny są last-minute'owo
 * wysokie i psułyby „od X zł", a dostępność w GDS bywa dziurawa.
 */
const MIN_WINDOW_LEAD_DAYS = 14;

export interface SnapshotWindow {
  checkin: string;
  checkout: string;
  nights: number;
  /** Miesiąc wyjazdu (1–12) — klucz wyszukiwania po stronie konsjerża. */
  month: number;
  /** Rok wyjazdu — bez niego „sierpień" jest dwuznaczny. */
  year: number;
  /** Stabilna etykieta do kluczy Redisa i logów, np. `2026-10|7n`. */
  label: string;
}

/** Najbliższy dzień tygodnia `dow` (0=niedz … 6=sob) nie wcześniej niż `from`. */
function nextDow(fromIso: string, dow: number): string {
  let d = fromIso;
  for (let i = 0; i < 7; i += 1) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === dow) return d;
    d = addDaysIso(d, 1);
  }
  return d;
}

/** Pierwszy dzień miesiąca oddalonego o `offset` miesięcy od miesiąca `todayIso`. */
function monthStart(todayIso: string, offset: number): { iso: string; year: number; month: number } {
  const year = Number(todayIso.slice(0, 4));
  const month0 = Number(todayIso.slice(5, 7)) - 1 + offset;
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return { iso: `${y}-${String(m + 1).padStart(2, "0")}-01`, year: y, month: m + 1 };
}

/** Ostatni dzień miesiąca zawierającego `iso`. */
function monthEnd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * Macierz okien na dziś. Czysta funkcja od `todayIso` — cała testowalność
 * kalendarzowa (rollover roku, koniec miesiąca) stoi na tym, że nie ma tu
 * zegara.
 *
 * Okno wchodzi do macierzy tylko, gdy jego WYJAZD wypada w danym miesiącu,
 * jest sprzedawalny i mieści się w horyzoncie dostawcy. Dzięki temu cron nigdy
 * nie wydaje budżetu na miesiąc, który już się kończy — a to była jedna z
 * rzeczy, o które prosił §21.
 */
export function buildWindowMatrix(todayIso: string): SnapshotWindow[] {
  if (!isIsoDate(todayIso)) return [];
  const earliest = addDaysIso(todayIso, Math.max(MIN_WINDOW_LEAD_DAYS, MIN_LEAD_DAYS));
  const horizonEnd = addDaysIso(todayIso, SALE_HORIZON_DAYS);
  const out: SnapshotWindow[] = [];

  // Iterujemy po offsetach, dopóki nie uzbieramy WINDOW_MONTHS_AHEAD RÓŻNYCH
  // miesięcy. Bieżący miesiąc bywa już za krótki (28 grudnia nie zmieści
  // nic z wyprzedzeniem 14 dni) — wtedy po prostu sięgamy o miesiąc dalej,
  // zamiast oddawać o jeden miesiąc pokrycia mniej.
  const monthsSeen = new Set<string>();
  for (let offset = 0; offset < WINDOW_MONTHS_AHEAD + 2; offset += 1) {
    if (monthsSeen.size >= WINDOW_MONTHS_AHEAD) break;
    const { iso: firstDay, year, month } = monthStart(todayIso, offset);
    const lastDay = monthEnd(year, month);
    for (const nights of WINDOW_NIGHTS) {
      // Start szukamy od późniejszej z dwóch dat: początku miesiąca albo
      // najwcześniejszego dopuszczalnego terminu. Dla bieżącego miesiąca
      // oznacza to, że bierzemy jego RESZTĘ, a nie cały.
      const from = firstDay > earliest ? firstDay : earliest;
      const checkin = nextDow(from, nights === 7 ? 6 : 1);
      // Okno NALEŻY do miesiąca swojego WYJAZDU — dokładnie tak, jak konsjerż
      // dopasowuje miesiąc (`monthOfIso(checkin)`). Wyjazd 26 września na
      // tydzień jest wyjazdem wrześniowym, choć wraca w październiku; wymóg
      // zmieszczenia CAŁEGO pobytu w miesiącu kosztowałby pokrycie i nie
      // odpowiadałby temu, jak ludzie mówią o terminach.
      if (checkin > lastDay) continue;
      if (checkin > horizonEnd) continue;
      monthsSeen.add(`${year}-${month}`);
      out.push({
        checkin,
        checkout: addDaysIso(checkin, nights),
        nights,
        month,
        year,
        label: `${year}-${String(month).padStart(2, "0")}|${nights}n`,
      });
    }
  }
  return out;
}
