import type { ConciergeIntent, MissingField } from "./types";

/**
 * Czego jeszcze brakuje, by odpalić trip-search (do dopytania przez bota).
 * Reguły:
 * - theme: wymagany
 * - budgetPln: wymagany
 * - budgetKind: wymagany GDY budgetPln jest obecny
 * - adults: wymagany
 *
 * month CELOWO NIE jest wymagany. Bateria ewaluacyjna (2026-09-04) pokazala,
 * ze wymuszanie go bylo przymusem STRUKTURALNYM: „Lecimy z dwojka dzieci w
 * wakacje, budzet 8000 zl lacznie" oblalo 8 z 9 modeli, bo kazdy musial
 * zapytac „ktory miesiac?" — „wakacje" nie jest liczba. To stalo w
 * sprzecznosci z system promptem, ktory przy niekonkretnym kliencie kaze
 * PRZYJAC zalozenie i szukac. Brak miesiaca wypelnia defaultMonth, a
 * egzekutor mowi modelowi, jaki miesiac zalozyl, zeby ten nazwal zalozenie.
 */
export function missingFields(intent: ConciergeIntent): MissingField[] {
  const missing: MissingField[] = [];

  if (!intent.theme) {
    missing.push("theme");
  }

  if (intent.budgetPln === undefined || intent.budgetPln === null) {
    missing.push("budgetPln");
  }

  if (intent.budgetPln !== undefined && intent.budgetPln !== null && !intent.budgetKind) {
    missing.push("budgetKind");
  }

  if (intent.adults === undefined || intent.adults === null) {
    missing.push("adults");
  }

  return missing;
}

/**
 * Uzupełnia sensowne domyślne wartości na KOPII obiektu.
 * - origin ??= "WAW"
 * - adults ??= 2
 * - children ??= 0
 * - wantsFlight ??= true
 * - wantsHotel ??= true
 * NIE mutuje wejścia.
 */
export function normalizeIntent(intent: ConciergeIntent): ConciergeIntent {
  return {
    ...intent,
    origin: intent.origin ?? "WAW",
    adults: intent.adults ?? 2,
    children: intent.children ?? 0,
    wantsFlight: intent.wantsFlight ?? true,
    wantsHotel: intent.wantsHotel ?? true,
  };
}

/**
 * Miesiac zakladany, gdy klient go nie poda: NASTEPNY pelny miesiac. Nigdy
 * biezacy — w polowie miesiaca zostalo za malo terminow, a snapshot i tak
 * wygrzewa okna z wyprzedzeniem.
 */
export function defaultMonth(now: number = Date.now()): number {
  const d = new Date(now);
  return (d.getUTCMonth() + 1) % 12 + 1;
}
