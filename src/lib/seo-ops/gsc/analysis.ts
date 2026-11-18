// Analizy na tabelach GSC: agregacja po segmentach, porównanie okresów,
// oczekiwany CTR dla pozycji i wykrywanie anomalii.
//
// OGRANICZENIA, które każdy raport z tych funkcji musi powtórzyć:
//  • tabele `pages` i `queries` są niezależne — nie da się z nich ustalić,
//    który adres wyświetla się na które zapytanie (potrzebny wymiar page+query);
//  • suma po adresach przewyższa sumę usługi (kilka adresów w jednym wyniku);
//  • eksport zapytań gubi zapytania anonimizowane (długi ogon).

import { totals, type GscRow, type GscTotals } from "./csv";
import { classifyQuery, classifyUrl, isBrandQuery, type QueryIntent, type UrlSegment } from "./segments";

export interface SegmentTotals extends GscTotals {
  segment: string;
}

function groupTotals<T extends string>(rows: readonly GscRow[], keyOf: (row: GscRow) => T): Array<GscTotals & { group: T }> {
  const groups = new Map<T, GscRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .map(([group, list]) => ({ group, ...totals(list) }))
    .sort((a, b) => b.impressions - a.impressions);
}

export function pagesBySegment(rows: readonly GscRow[]): Array<GscTotals & { group: UrlSegment }> {
  return groupTotals(rows, (row) => classifyUrl(row.key).segment);
}

export function queriesByIntent(rows: readonly GscRow[]): Array<GscTotals & { group: QueryIntent }> {
  return groupTotals(rows, (row) => classifyQuery(row.key));
}

export interface BrandSplit {
  brand: GscTotals;
  nonBrand: GscTotals;
  /** Udział marki w kliknięciach eksportu zapytań (nie całej usługi). */
  brandShareOfExport: number;
  /** Dolne ograniczenie udziału marki w kliknięciach usługi; null bez sumy usługi. */
  brandShareOfPropertyLowerBound: number | null;
}

export function brandSplit(queryRows: readonly GscRow[], propertyClicks?: number): BrandSplit {
  const brand = totals(queryRows.filter((row) => isBrandQuery(row.key)));
  const nonBrand = totals(queryRows.filter((row) => !isBrandQuery(row.key)));
  const exportClicks = brand.clicks + nonBrand.clicks;
  return {
    brand,
    nonBrand,
    brandShareOfExport: exportClicks > 0 ? brand.clicks / exportClicks : 0,
    brandShareOfPropertyLowerBound: propertyClicks && propertyClicks > 0 ? brand.clicks / propertyClicks : null,
  };
}

export interface PeriodComparison {
  previous: GscTotals;
  current: GscTotals;
  clicksChange: number | null;
  impressionsChange: number | null;
  ctrChangePoints: number;
  positionChange: number;
}

function relativeChange(before: number, after: number): number | null {
  return before > 0 ? (after - before) / before : null;
}

export function comparePeriods(previous: readonly GscRow[], current: readonly GscRow[]): PeriodComparison {
  const prev = totals(previous);
  const cur = totals(current);
  return {
    previous: prev,
    current: cur,
    clicksChange: relativeChange(prev.clicks, cur.clicks),
    impressionsChange: relativeChange(prev.impressions, cur.impressions),
    ctrChangePoints: cur.ctr - prev.ctr,
    positionChange: cur.position - prev.position,
  };
}

// ── Oczekiwany CTR ───────────────────────────────────────────────────────
//
// Krzywa orientacyjna dla wyników organicznych bez funkcji SERP. NIE jest to
// pomiar dla tej witryny — służy wyłącznie do rankingu „gdzie CTR odstaje
// najmocniej przy tej pozycji", nigdy do prognozy kliknięć w raporcie.
const CTR_CURVE: ReadonlyArray<readonly [number, number]> = [
  [1, 0.28], [2, 0.15], [3, 0.1], [4, 0.07], [5, 0.05], [6, 0.04], [7, 0.03], [8, 0.025], [9, 0.02], [10, 0.018],
  [15, 0.008], [20, 0.004], [30, 0.002], [50, 0.001],
];

export function referenceCtrForPosition(position: number): number {
  if (!(position > 0)) return 0;
  if (position <= CTR_CURVE[0][0]) return CTR_CURVE[0][1];
  for (let i = 1; i < CTR_CURVE.length; i += 1) {
    const [p1, c1] = CTR_CURVE[i - 1];
    const [p2, c2] = CTR_CURVE[i];
    if (position <= p2) return c1 + ((c2 - c1) * (position - p1)) / (p2 - p1);
  }
  return CTR_CURVE[CTR_CURVE.length - 1][1];
}

// ── Anomalie ─────────────────────────────────────────────────────────────

export type AnomalyKind =
  | "legacy_url_with_impressions"
  | "param_url_with_impressions"
  | "ctr_far_below_reference"
  | "impressions_up_clicks_down"
  | "sum_of_pages_exceeds_property";

export interface Anomaly {
  kind: AnomalyKind;
  subject: string;
  detail: string;
}

export function pageAnomalies(pageRows: readonly GscRow[], minImpressions = 100): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const row of pageRows) {
    const info = classifyUrl(row.key);
    if (info.segment === "legacy" && row.impressions > 0) {
      anomalies.push({
        kind: "legacy_url_with_impressions",
        subject: row.key,
        detail: `${info.anomaly}: ${row.impressions} wyśw., ${row.clicks} klik.`,
      });
    } else if ((info.anomaly === "lang_param" || info.anomaly === "query_string") && row.impressions > 0) {
      anomalies.push({
        kind: "param_url_with_impressions",
        subject: row.key,
        detail: `${info.anomaly}: ${row.impressions} wyśw., ${row.clicks} klik.`,
      });
    }
    if (row.impressions >= minImpressions && row.position <= 10) {
      const reference = referenceCtrForPosition(row.position);
      const actual = row.clicks / row.impressions;
      if (actual < reference * 0.33) {
        anomalies.push({
          kind: "ctr_far_below_reference",
          subject: row.key,
          detail: `poz. ${row.position.toFixed(1)}, CTR ${(actual * 100).toFixed(2)}% wobec odniesienia ${(reference * 100).toFixed(1)}% (${row.impressions} wyśw.)`,
        });
      }
    }
  }
  return anomalies;
}

export function periodAnomalies(comparison: PeriodComparison): Anomaly[] {
  const { clicksChange, impressionsChange } = comparison;
  if (clicksChange !== null && impressionsChange !== null && impressionsChange > 0.25 && clicksChange < -0.1) {
    return [
      {
        kind: "impressions_up_clicks_down",
        subject: "property",
        detail: `wyświetlenia ${(impressionsChange * 100).toFixed(0)}%, kliknięcia ${(clicksChange * 100).toFixed(1)}% — zmiana miksu zapytań albo utrata kliknięć markowych; sam CTR nie wskazuje przyczyny`,
      },
    ];
  }
  return [];
}

export function consistencyAnomalies(pageRows: readonly GscRow[], propertyImpressions: number): Anomaly[] {
  const sum = totals(pageRows).impressions;
  if (propertyImpressions > 0 && sum > propertyImpressions * 1.05) {
    return [
      {
        kind: "sum_of_pages_exceeds_property",
        subject: "pages",
        detail: `suma po adresach ${sum} vs usługa ${propertyImpressions} (${((sum / propertyImpressions) * 100).toFixed(0)}%) — agregacja GSC, nie błąd; nie liczyć „udziału strony w ruchu"`,
      },
    ];
  }
  return [];
}

// ── Scoring szans ────────────────────────────────────────────────────────

export interface OpportunityInput {
  url: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface OpportunityScore {
  url: string;
  segment: UrlSegment;
  score: number;
  /** Wyświetlenia × (CTR odniesienia − CTR faktyczny), przycięte do zera. */
  ctrGapClicks: number;
  rationale: string;
}

/** Waga biznesowa segmentu: gdzie kliknięcie ma realną szansę wejść w lejek. */
const SEGMENT_WEIGHT: Record<UrlSegment, number> = {
  comparison: 1.0,
  mood_hub: 0.9,
  city_hotels: 0.9,
  guide: 0.7,
  article: 0.6,
  season: 0.6,
  comparison_hub: 0.5,
  guide_hub: 0.5,
  article_hub: 0.4,
  // SERP pogodowy zabiera kliknięcia stronom miesięcy (Faza 2.1: dane
  // kuratorowane nie poprawiły CTR), więc ten sam odstęp CTR waży mniej.
  month: 0.35,
  // Strony informacyjne i główna żyją z linków dodatkowych przy marce
  // (Faza 2.1: kliknięcia /cennik pochodziły wyłącznie z zapytań markowych) — to nie są szanse treści.
  home: 0,
  info: 0,
  hotel_detail: 0,
  legacy: 0,
  other: 0.2,
};

export function scoreOpportunity(input: OpportunityInput): OpportunityScore {
  const info = classifyUrl(input.url);
  const actual = input.impressions > 0 ? input.clicks / input.impressions : 0;
  const reference = referenceCtrForPosition(input.position);
  const ctrGapClicks = Math.max(0, input.impressions * (reference - actual));
  // Strony z pozycji 11–20 dostają osobny składnik: potencjał wejścia do top 10.
  const strikingDistance = input.position > 10 && input.position <= 20 ? input.impressions * 0.01 : 0;
  const weight = SEGMENT_WEIGHT[info.segment];
  const score = Math.round((ctrGapClicks + strikingDistance) * weight * 10) / 10;
  const rationale =
    weight === 0
      ? "segment poza zakresem treści"
      : `${input.impressions} wyśw. na poz. ${input.position.toFixed(1)}; CTR ${(actual * 100).toFixed(2)}% wobec odniesienia ${(reference * 100).toFixed(1)}%; waga segmentu ${weight}`;
  return { url: input.url, segment: info.segment, score, ctrGapClicks: Math.round(ctrGapClicks * 10) / 10, rationale };
}

export function rankOpportunities(rows: readonly GscRow[], limit = 20): OpportunityScore[] {
  return rows
    .map((row) => scoreOpportunity({ url: row.key, clicks: row.clicks, impressions: row.impressions, position: row.position }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, limit);
}
