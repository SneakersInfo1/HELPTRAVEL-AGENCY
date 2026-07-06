import type { ConciergeIntent, MissingField } from "./types";

/**
 * Czego jeszcze brakuje, by odpalić trip-search (do dopytania przez bota).
 * Reguły:
 * - theme: wymagany
 * - budgetPln: wymagany
 * - budgetKind: wymagany GDY budgetPln jest obecny
 * - month: wymagany
 * - adults: wymagany
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

  if (intent.month === undefined || intent.month === null) {
    missing.push("month");
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
 * NIE mutuje wejścia.
 */
export function normalizeIntent(intent: ConciergeIntent): ConciergeIntent {
  return {
    ...intent,
    origin: intent.origin ?? "WAW",
    adults: intent.adults ?? 2,
    children: intent.children ?? 0,
  };
}
