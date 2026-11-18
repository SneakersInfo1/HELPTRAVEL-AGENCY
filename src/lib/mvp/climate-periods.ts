import type { ClimateMonthlyValues } from "./climate-normals";

export type PeriodRelation = "same" | "adjacent" | "different" | "unknown";

interface ClimatePeriod {
  periodFrom: number | null;
  periodTo: number | null;
}

interface DaytimeMaxClimatePeriod extends ClimatePeriod {
  maxTempC: ClimateMonthlyValues<number> | readonly number[];
}

export const APPROXIMATE_MIN_DIFF_C = 1.5;

/**
 * Standardowe normy WMO obejmują 30 lat i są aktualizowane co 10 lat.
 * Różnice między okresami mogą wynikać zarówno z ocieplenia klimatu, jak i ze
 * zmian stacji pomiarowej, dlatego tylko identyczne okresy porównujemy dokładnie.
 */
export function periodRelation(a: ClimatePeriod, b: ClimatePeriod): PeriodRelation {
  if (a.periodFrom === null || a.periodTo === null || b.periodFrom === null || b.periodTo === null) {
    return "unknown";
  }

  if (a.periodFrom === b.periodFrom && a.periodTo === b.periodTo) return "same";

  const aLength = a.periodTo - a.periodFrom + 1;
  const bLength = b.periodTo - b.periodFrom + 1;
  const aMidpoint = (a.periodFrom + a.periodTo) / 2;
  const bMidpoint = (b.periodFrom + b.periodTo) / 2;

  return aLength >= 20 && bLength >= 20 && Math.abs(aMidpoint - bMidpoint) <= 10
    ? "adjacent"
    : "different";
}

function roundSymmetrically(value: number, precision: number): number {
  const factor = 10 ** precision;
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export type DaytimeMaxComparison =
  | { kind: "exact"; diffC: number }
  | { kind: "approximate"; diffC: number }
  | { kind: "incomparable"; reason: "different" | "unknown" };

/** Różnica `a − b`; pełna precyzja tylko dla identycznego okresu normy. */
export function compareDaytimeMax(
  a: DaytimeMaxClimatePeriod,
  b: DaytimeMaxClimatePeriod,
  monthIndex: number,
): DaytimeMaxComparison {
  const relation = periodRelation(a, b);
  if (relation === "different" || relation === "unknown") {
    return { kind: "incomparable", reason: relation };
  }

  const difference = a.maxTempC[monthIndex] - b.maxTempC[monthIndex];
  return relation === "same"
    ? { kind: "exact", diffC: roundSymmetrically(difference, 1) }
    : { kind: "approximate", diffC: roundSymmetrically(difference, 0) };
}

export function climatePeriodYears(period: ClimatePeriod): string | null {
  return period.periodFrom !== null && period.periodTo !== null
    ? `${period.periodFrom}–${period.periodTo}`
    : null;
}
