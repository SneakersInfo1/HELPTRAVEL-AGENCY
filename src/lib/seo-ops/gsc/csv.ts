// Import eksportów Google Search Console (CSV z interfejsu albo z API).
//
// Eksport z polskiego interfejsu ma BOM, polskie nagłówki („Kliknięcia",
// „Wyświetlenia", „CTR", „Pozycja"), a CTR bywa ułamkiem (0.0343) albo
// procentem („3,43%"). Parser normalizuje wszystkie te warianty do jednego
// kształtu i ODRZUCA plik, którego nie rozumie — cicha zamiana nieznanej
// kolumny na zera byłaby gorsza niż błąd.

export interface GscRow {
  /** Wartość wymiaru: adres, zapytanie, data (YYYY-MM-DD), kraj albo urządzenie. */
  key: string;
  clicks: number;
  impressions: number;
  /** Ułamek 0–1 z pliku (nie przeliczany — patrz ctrOf). */
  ctr: number;
  position: number;
}

export interface GscTable {
  dimension: string;
  rows: GscRow[];
}

export class GscCsvError extends Error {}

const HEADER_ALIASES: Record<string, keyof Omit<GscRow, "key">> = {
  kliknięcia: "clicks",
  klikniecia: "clicks",
  clicks: "clicks",
  wyświetlenia: "impressions",
  wyswietlenia: "impressions",
  impressions: "impressions",
  ctr: "ctr",
  pozycja: "position",
  position: "position",
};

/** Dzieli wiersz CSV z obsługą pól w cudzysłowie i podwojonych cudzysłowów. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Dzieli plik na rekordy. Pole w cudzysłowie może zawierać znak nowej linii
 * (w eksporcie zapytań trafia się wklejone wielowierszowe zapytanie z operatorami
 * `-site:`), więc dzielenie po `\n` rozcinałoby jeden rekord na kilka.
 */
export function splitCsvRecords(content: string): string[] {
  const records: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char === '"') quoted = !quoted;
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && content[i + 1] === "\n") i += 1;
      if (current.trim() !== "") records.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim() !== "") records.push(current);
  return records;
}

function parseNumber(raw: string, column: string, lineNo: number): number {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  const isPercent = cleaned.endsWith("%");
  const value = Number(isPercent ? cleaned.slice(0, -1) : cleaned);
  if (!Number.isFinite(value)) throw new GscCsvError(`Wiersz ${lineNo}: „${raw}" w kolumnie ${column} nie jest liczbą`);
  return isPercent ? value / 100 : value;
}

export function parseGscCsv(content: string): GscTable {
  const lines = splitCsvRecords(content.replace(/^﻿/, ""));
  if (lines.length === 0) throw new GscCsvError("Pusty plik");
  const header = splitCsvLine(lines[0]).map((cell) => cell.trim());
  if (header.length !== 5) throw new GscCsvError(`Oczekiwano 5 kolumn, jest ${header.length}: ${header.join(" | ")}`);

  const metricIndex: Partial<Record<keyof Omit<GscRow, "key">, number>> = {};
  header.forEach((name, index) => {
    const metric = HEADER_ALIASES[name.toLowerCase()];
    if (metric) metricIndex[metric] = index;
  });
  for (const metric of ["clicks", "impressions", "ctr", "position"] as const) {
    if (metricIndex[metric] === undefined) throw new GscCsvError(`Brak kolumny ${metric} w nagłówku: ${header.join(" | ")}`);
  }
  const dimensionIndex = header.findIndex((name) => HEADER_ALIASES[name.toLowerCase()] === undefined);
  if (dimensionIndex < 0) throw new GscCsvError("Brak kolumny wymiaru");

  const rows: GscRow[] = lines.slice(1).map((line, offset) => {
    const lineNo = offset + 2;
    const cells = splitCsvLine(line);
    if (cells.length !== 5) throw new GscCsvError(`Wiersz ${lineNo}: ${cells.length} pól zamiast 5`);
    const row: GscRow = {
      key: cells[dimensionIndex].replace(/\s+/g, " ").trim(),
      clicks: parseNumber(cells[metricIndex.clicks!], "clicks", lineNo),
      impressions: parseNumber(cells[metricIndex.impressions!], "impressions", lineNo),
      ctr: parseNumber(cells[metricIndex.ctr!], "ctr", lineNo),
      position: parseNumber(cells[metricIndex.position!], "position", lineNo),
    };
    if (row.clicks < 0 || row.impressions < 0) throw new GscCsvError(`Wiersz ${lineNo}: ujemna wartość`);
    if (row.clicks > row.impressions) throw new GscCsvError(`Wiersz ${lineNo}: kliknięć więcej niż wyświetleń`);
    return row;
  });

  return { dimension: header[dimensionIndex], rows };
}

export interface GscTotals {
  rows: number;
  clicks: number;
  impressions: number;
  /** Kliknięcia / wyświetlenia — liczone z sum, nigdy średnia z wierszy. */
  ctr: number;
  /** Pozycja ważona wyświetleniami. */
  position: number;
}

export function totals(rows: readonly GscRow[]): GscTotals {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weighted += row.position * row.impressions;
  }
  return {
    rows: rows.length,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weighted / impressions : 0,
  };
}

/** Wiersze dzienne z zakresu [from, to] włącznie (daty ISO). */
export function inDateRange(rows: readonly GscRow[], from: string, to: string): GscRow[] {
  return rows.filter((row) => row.key >= from && row.key <= to);
}
