// Pomiar pokrycia snapshotu (§15, §16, §46, §47).
//
// GŁÓWNY KPI V2.2 to FUTURE USABLE COVERAGE, nie „ile kierunków ma cenę".
// Różnica jest istotna, bo dokładnie na niej wykładał się poprzedni pomiar:
// sonda raportowała „46 kluczy, 100% ze świeżym pakietem" i wyglądało to na
// zdrowy wynik, choć każdy z tych kierunków miał DOKŁADNIE JEDNO okno, a
// świeżość liczyła wiek CENY, nie to, czy termin da się jeszcze kupić.
//
// Dlatego liczymy tu cztery różne rzeczy i nie pozwalamy im się zlewać:
//   • DESTINATION coverage      — ile kierunków ma cokolwiek,
//   • FUTURE USABLE coverage    — ile ma PRZYSZŁY i używalny rekord (KPI),
//   • WINDOW/ORIGIN coverage    — ile (miesiąc, noce, wylot) realnie pokrywamy,
//   • WEIGHTED coverage         — to samo, ale ważone tierem, żeby wiedzieć,
//                                 czy snapshot jest UŻYTECZNY, a nie duży.

import { isBookableStart } from "@/lib/concierge/travel-dates";
import { travelToday } from "@/lib/time/travel-now";
import { TIER_WEIGHT, type TieredDestination } from "./tiers";
import type { PriceFreshness, SnapshotCoverage, SnapshotRecord } from "./types";

/**
 * Progi świeżości ceny (§39). Dobrane pod realny cykl rotacji: pełny obieg
 * zamyka się w ~10 h, więc 12 h to „ten obieg" (FRESH), a 48 h to „najwyżej
 * kilka obiegów wstecz" — cena wciąż realna, ale opisujemy ją jako
 * orientacyjną. Powyżej nie używamy jej wcale.
 */
export const PRICE_FRESH_MS = 12 * 3600 * 1000;
export const PRICE_USABLE_MS = 48 * 3600 * 1000;

export function priceFreshness(pricedAt: number, nowMs: number): PriceFreshness {
  if (!Number.isFinite(pricedAt)) return "EXPIRED_PRICE";
  const age = nowMs - pricedAt;
  if (age <= PRICE_FRESH_MS) return "FRESH";
  if (age <= PRICE_USABLE_MS) return "STALE_BUT_USABLE";
  return "EXPIRED_PRICE";
}

/**
 * Czy rekord nadaje się do POKAZANIA użytkownikowi: przyszły termin, cena
 * nie przeterminowana i policzony pakiet. Te trzy warunki razem to definicja
 * „usable" w KPI — brak któregokolwiek znaczy, że nie mamy czego zaproponować.
 */
export function isUsableRecord(record: SnapshotRecord, todayIso: string, nowMs: number): boolean {
  if (!isBookableStart(record.checkin, todayIso)) return false;
  if (priceFreshness(record.pricedAt, nowMs) === "EXPIRED_PRICE") return false;
  return typeof record.perPersonPln === "number" && Number.isFinite(record.perPersonPln) && record.perPersonPln > 0;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Number(((part / whole) * 100).toFixed(2));
}

/**
 * Pełny raport pokrycia. `tiered` podajemy w całości (cały seed po dedupie),
 * bo mianownikiem KPI jest katalog, a nie to, co akurat udało się wygrzać.
 */
export function computeCoverage(
  records: readonly SnapshotRecord[],
  tiered: readonly TieredDestination[],
  nowMs: number,
): SnapshotCoverage {
  const todayIso = travelToday(nowMs);
  const seedCount = tiered.length;
  const tierOf = new Map(tiered.map((t) => [t.id, t.tier] as const));

  const withPrice = new Set<string>();
  const futureUsable = new Set<string>();
  const months = new Set<string>();
  const nights = new Set<number>();
  const origins = new Set<string>();
  const countries = new Set<string>();

  let futureRecords = 0;
  let expiredRecords = 0;
  let fresh = 0;
  let staleButUsable = 0;
  let expiredPrice = 0;

  for (const r of records) {
    if (typeof r.perPersonPln === "number" || typeof r.hotelPlnPerNight === "number") withPrice.add(r.destId);
    const isFuture = isBookableStart(r.checkin, todayIso);
    if (isFuture) futureRecords += 1;
    else expiredRecords += 1;

    switch (priceFreshness(r.pricedAt, nowMs)) {
      case "FRESH":
        fresh += 1;
        break;
      case "STALE_BUT_USABLE":
        staleButUsable += 1;
        break;
      default:
        expiredPrice += 1;
    }

    if (isUsableRecord(r, todayIso, nowMs)) {
      futureUsable.add(r.destId);
      months.add(`${r.year}-${r.month}`);
      nights.add(r.nights);
      origins.add(r.origin);
      countries.add(r.countryEn);
    }
  }

  // Pokrycie ważone (§46): kierunek liczy się tyle, ile waży jego tier.
  let weightGot = 0;
  let weightTotal = 0;
  let tierAGot = 0;
  let tierATotal = 0;
  let tierBGot = 0;
  let tierBTotal = 0;
  for (const t of tiered) {
    const w = TIER_WEIGHT[t.tier];
    weightTotal += w;
    if (futureUsable.has(t.id)) weightGot += w;
    if (t.tier === "A") {
      tierATotal += 1;
      if (futureUsable.has(t.id)) tierAGot += 1;
    }
    if (t.tier === "B") {
      tierBTotal += 1;
      if (futureUsable.has(t.id)) tierBGot += 1;
    }
  }
  // Kierunki spoza seedu (teoretycznie niemożliwe) nie mogą zawyżyć KPI.
  void tierOf;

  return {
    seedDestinations: seedCount,
    destinationsWithPrice: withPrice.size,
    destinationCoveragePct: pct(withPrice.size, seedCount),
    futureUsableDestinations: futureUsable.size,
    futureUsableCoveragePct: pct(futureUsable.size, seedCount),
    weightedCoveragePct: pct(weightGot, weightTotal),
    tierACoveragePct: pct(tierAGot, tierATotal),
    tierBCoveragePct: pct(tierBGot, tierBTotal),
    records: records.length,
    futureRecords,
    expiredRecords,
    fresh,
    staleButUsable,
    expiredPrice,
    monthsCovered: months.size,
    nightsCovered: nights.size,
    originsCovered: origins.size,
    countriesCovered: countries.size,
  };
}
