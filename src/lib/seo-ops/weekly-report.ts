// Raport tygodniowy SEO (okna 28 i 56 dni) z eksportów GSC + opcjonalnie GA4.
//
// Zasady interpretacji, które raport powtarza na górze, bo inaczej liczby
// zaczynają żyć własnym życiem:
//  • marka to DOLNE ograniczenie (zapytania anonimizowane nie trafiają do eksportu);
//  • CTR porównujemy w tych samych przedziałach pozycji, nie „ogólnie";
//  • suma po adresach ≠ suma usługi (kilka adresów w jednym wyniku);
//  • GSC to wyświetlenia i kliknięcia, GA4 to sesje — nie łączymy ich w jeden lejek;
//  • zmiana po wdrożeniu to korelacja: sezon, TikTok i SERP też się zmieniają.

import { brandSplit, comparePeriods, pageAnomalies, pagesBySegment, periodAnomalies, rankOpportunities } from "./gsc/analysis";
import { totals, type GscRow } from "./gsc/csv";
import { classifyUrl } from "./gsc/segments";

export interface Ga4LandingRow {
  landingPath: string;
  sessions: number;
  engagedSessions: number;
  /** Kliknięcia `seo_cta_click` z tej strony wejścia. */
  seoCtaClicks: number;
  /** Sesje z `hotel_results_loaded` po wejściu z tej strony. */
  searchResults: number;
}

/** Źródło danych GA4. Dziś brak podłączenia — patrz docs/seo/OWNER_ACTIONS.md. */
export interface Ga4Source {
  status: "CONNECTED" | "NOT_CONNECTED";
  organicLandingPages(fromIso: string, toIso: string): Promise<Ga4LandingRow[]>;
}

export class NotConnectedGa4 implements Ga4Source {
  readonly status = "NOT_CONNECTED" as const;
  async organicLandingPages(): Promise<Ga4LandingRow[]> {
    return [];
  }
}

export interface WeeklyReportInput {
  daily: readonly GscRow[];
  pages: readonly GscRow[];
  queries: readonly GscRow[];
  /** Ostatni dzień danych (YYYY-MM-DD) — GSC ma opóźnienie, więc nie „dziś". */
  endDate: string;
  ga4: { status: Ga4Source["status"]; rows: readonly Ga4LandingRow[] };
}

export const POSITION_BUCKETS: ReadonlyArray<readonly [string, number, number]> = [
  ["1–3", 0, 3],
  ["3–5", 3, 5],
  ["5–10", 5, 10],
  ["10–20", 10, 20],
  ["20+", 20, Number.POSITIVE_INFINITY],
];

export function positionBucket(position: number): string {
  for (const [label, from, to] of POSITION_BUCKETS) if (position > from && position <= to) return label;
  return "20+";
}

function shiftIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function pct(value: number | null, digits = 1): string {
  return value === null ? "n/d" : `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

function windowLine(daily: readonly GscRow[], endDate: string, days: number): string {
  const currentFrom = shiftIso(endDate, -(days - 1));
  const previousTo = shiftIso(currentFrom, -1);
  const previousFrom = shiftIso(previousTo, -(days - 1));
  const inRange = (from: string, to: string) => daily.filter((row) => row.key >= from && row.key <= to);
  const current = inRange(currentFrom, endDate);
  const previous = inRange(previousFrom, previousTo);
  // API pomija dni bez danych, więc kompletność oceniamy po zasięgu dat, nie po liczbie wierszy.
  const earliest = daily.reduce<string | null>((min, row) => (min === null || row.key < min ? row.key : min), null);
  if (current.length === 0 || earliest === null || earliest > previousFrom) {
    return `| ${days} dni | brak pełnych danych (${current.length}/${days} i ${previous.length}/${days} dni) | | | |`;
  }
  const comparison = comparePeriods(previous, current);
  return `| ${days} dni (${currentFrom}–${endDate} vs ${previousFrom}–${previousTo}) | ${comparison.previous.clicks} → ${comparison.current.clicks} (${pct(comparison.clicksChange)}) | ${comparison.previous.impressions} → ${comparison.current.impressions} (${pct(comparison.impressionsChange)}) | ${pct(comparison.previous.ctr, 2)} → ${pct(comparison.current.ctr, 2)} | ${comparison.previous.position.toFixed(1)} → ${comparison.current.position.toFixed(1)} |`;
}

export function buildWeeklyReport(input: WeeklyReportInput): string {
  const lines: string[] = [];
  const property = totals(input.daily);
  const split = brandSplit(input.queries, property.clicks);

  lines.push(`# Raport SEO — dane do ${input.endDate}`, "");
  lines.push(
    "> Marka to dolne ograniczenie (anonimizowane zapytania nie trafiają do eksportu). CTR porównuj w tych samych przedziałach pozycji. Suma po adresach ≠ suma usługi. GSC (kliknięcia) i GA4 (sesje) to różne jednostki. Zmiana po wdrożeniu to korelacja, nie dowód przyczyny.",
    "",
  );

  lines.push("## Okna czasowe (cała usługa)", "", "| Okno | Kliknięcia | Wyświetlenia | CTR | Pozycja (ważona) |", "|---|---|---|---|---|");
  lines.push(windowLine(input.daily, input.endDate, 28), windowLine(input.daily, input.endDate, 56), "");
  // Podział na połowy ma sens tylko chronologicznie; wiersze z API nie mają gwarantowanej kolejności.
  const chronological = [...input.daily].sort((a, b) => a.key.localeCompare(b.key));
  const half = Math.floor(chronological.length / 2);
  const anomalies = periodAnomalies(comparePeriods(chronological.slice(0, half), chronological.slice(half)));
  for (const anomaly of anomalies) lines.push(`- ⚠ ${anomaly.detail}`);
  if (anomalies.length > 0) lines.push("");

  lines.push("## Marka a reszta (eksport zapytań)", "");
  lines.push(
    `- Marka: ${split.brand.clicks} kliknięć w eksporcie zapytań — co najmniej ${pct(split.brandShareOfPropertyLowerBound)} kliknięć całej usługi.`,
    `- Poza marką (widoczne w eksporcie): ${split.nonBrand.clicks} kliknięć, ${split.nonBrand.impressions} wyświetleń.`,
    "",
  );

  lines.push("## Segmenty adresów", "", "| Segment | Adresy | Kliknięcia | Wyświetlenia | CTR | Pozycja |", "|---|---|---|---|---|---|");
  for (const segment of pagesBySegment(input.pages)) {
    lines.push(`| ${segment.group} | ${segment.rows} | ${segment.clicks} | ${segment.impressions} | ${pct(segment.ctr, 2)} | ${segment.position.toFixed(1)} |`);
  }
  lines.push("");

  lines.push("## CTR w przedziałach pozycji (segment × pozycja)", "", "| Segment | Pozycja | Adresy | Wyświetlenia | CTR |", "|---|---|---|---|---|");
  const buckets = new Map<string, GscRow[]>();
  for (const row of input.pages) {
    const key = `${classifyUrl(row.key).segment}|${positionBucket(row.position)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  for (const [key, rows] of [...buckets.entries()].sort()) {
    const t = totals(rows);
    if (t.impressions < 100) continue;
    const [segment, bucket] = key.split("|");
    lines.push(`| ${segment} | ${bucket} | ${t.rows} | ${t.impressions} | ${pct(t.ctr, 2)} |`);
  }
  lines.push("");

  lines.push("## Szanse (luka CTR × waga segmentu)", "", "| Adres | Segment | Wynik | Uzasadnienie |", "|---|---|---|---|");
  for (const item of rankOpportunities(input.pages, 15)) {
    lines.push(`| ${item.url.replace("https://helptravel.pl", "")} | ${item.segment} | ${item.score} | ${item.rationale} |`);
  }
  lines.push("");

  const anomaliesPages = pageAnomalies(input.pages);
  if (anomaliesPages.length > 0) {
    lines.push("## Anomalie adresów", "");
    for (const anomaly of anomaliesPages.slice(0, 20)) lines.push(`- ${anomaly.kind}: ${anomaly.subject.replace("https://helptravel.pl", "")} — ${anomaly.detail}`);
    lines.push("");
  }

  lines.push("## GA4 — strony wejścia z wyszukiwania organicznego", "");
  if (input.ga4.status === "NOT_CONNECTED") {
    lines.push(
      "Status: **NOT_CONNECTED**. Brak dostępu do GA4 w tej sesji — lejek (wejście → `seo_cta_click` → wyniki wyszukiwania → rezerwacja) nie jest liczony. Jak podłączyć: docs/seo/OWNER_ACTIONS.md.",
      "",
    );
  } else {
    lines.push("| Strona wejścia | Sesje | Zaangażowane | Kliknięcia CTA | Sesje z wynikami | CTA / sesja |", "|---|---|---|---|---|---|");
    for (const row of input.ga4.rows) {
      const rate = row.sessions > 0 ? row.seoCtaClicks / row.sessions : null;
      lines.push(`| ${row.landingPath} | ${row.sessions} | ${row.engagedSessions} | ${row.seoCtaClicks} | ${row.searchResults} | ${pct(rate)} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
