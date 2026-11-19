// Eksporty Google Search Console dostarczane przez właściciela (CSV z interfejsu GSC).
//
// Tryb pracy „SEO daily” (sesja Claude Code uruchamiana ręcznie) NIE wymaga API GSC:
// właściciel pobiera eksport z interfejsu (Skuteczność → Eksportuj → Pobierz CSV),
// a ten moduł znajduje najnowszy eksport, czyta go w pamięci i ocenia, jak stare są dane.
//
// Repozytorium jest PUBLICZNE: surowe dane (zapytania, liczby per adres) nigdy nie są
// zapisywane w repo ani w gałęzi stanu. Czytamy je wyłącznie w pamięci.
//
// Formaty, które spotykamy w praktyce (zmierzone na eksportach z 09.2026 i 11.2026):
//  • ZIP z interfejsu po polsku: Zapytania.csv, Strony.csv, Kraje.csv, Urządzenia.csv,
//    Wygląd w wyszukiwarce.csv, Filtry.csv, czasem Daty.csv; po angielsku Queries.csv,
//    Pages.csv, Dates.csv, Filters.csv…;
//  • tryb porównania okresów: 9 kolumn („Ostatnie 3 miesiące Kliknięcia”, „Poprzednie
//    3 miesiące Kliknięcia”…) — bierzemy okres bieżący, czyli pierwszą kolumnę z pary;
//  • folder z plikami *pages*.csv, *queries*.csv, *daily*.csv (format 5 kolumn).
//
// Data danych: jeśli jest Daty.csv/Dates.csv, koniec danych = najpóźniejsza data.
// W przeciwnym razie znamy tylko moment eksportu (znaczniki czasu w ZIP albo plików),
// a GSC pokazuje dane z opóźnieniem ok. 2 dni — koniec danych jest wtedy SZACUNKIEM
// i raport mówi to wprost.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { splitCsvLine, splitCsvRecords } from "@/lib/seo-ops/gsc/csv";

import type { GscCsvInputs } from "../pipeline";

/** Dane GSC są „świeże” do 10 dni od końca okresu, „starzejące się” do 35 dni. */
export const FRESH_MAX_AGE_DAYS = 10;
export const AGING_MAX_AGE_DAYS = 35;
/** Typowe opóźnienie danych w GSC względem chwili eksportu. */
export const GSC_DATA_LAG_DAYS = 2;
/**
 * Eksport GSC waży zwykle poniżej 1 MB. Szukamy go m.in. w folderze Pobrane, gdzie leżą
 * też duże archiwa — większych plików nie wczytujemy do pamięci w ogóle.
 */
export const MAX_EXPORT_ZIP_BYTES = 25 * 1024 * 1024;
/** Limit rozpakowanego pliku CSV (ochrona przed „bombą ZIP”). */
export const MAX_EXPORT_CSV_BYTES = 50 * 1024 * 1024;

export type FreshnessVerdict = "fresh" | "aging" | "stale";

export interface GscExportCandidate {
  /** Ścieżka do pliku ZIP albo folderu. */
  path: string;
  kind: "zip" | "folder";
  /** Moment eksportu (najpóźniejszy znacznik czasu pliku w eksporcie), ISO. */
  exportedAt: string;
  /** Opis zakresu z Filtry.csv/Filters.csv, np. „Ostatnie 3 miesiące”; null, gdy brak. */
  rangeLabel: string | null;
  /** Ostatni dzień danych (YYYY-MM-DD). */
  dataEnd: string;
  /** true, gdy dataEnd pochodzi z Daty.csv; false, gdy to szacunek z daty eksportu. */
  dataEndExact: boolean;
  /** Eksport w trybie porównania dwóch okresów. */
  comparison: boolean;
}

export interface GscFreshness {
  ageDays: number;
  verdict: FreshnessVerdict;
}

const PAGE_FILES = [/^strony\.csv$/i, /^pages\.csv$/i, /pages.*\.csv$/i];
const QUERY_FILES = [/^zapytania\.csv$/i, /^queries\.csv$/i, /queries.*\.csv$/i];
const DATE_FILES = [/^daty\.csv$/i, /^dates\.csv$/i, /daily.*\.csv$/i];
const FILTER_FILES = [/^filtry\.csv$/i, /^filters\.csv$/i];

// ── ZIP (bez zależności): katalog centralny + inflate ─────────────────────────

interface ZipEntry {
  name: string;
  modifiedAt: Date;
  data: () => Buffer;
}

function dosDate(date: number, time: number): Date {
  const year = ((date >> 9) & 0x7f) + 1980;
  const month = ((date >> 5) & 0x0f) - 1;
  const day = date & 0x1f;
  const hours = (time >> 11) & 0x1f;
  const minutes = (time >> 5) & 0x3f;
  const seconds = (time & 0x1f) * 2;
  // Znacznik w ZIP nie ma strefy czasowej; traktujemy go jak czas lokalny eksportującego.
  return new Date(year, month, day, hours, minutes, seconds);
}

export function readZipEntries(buffer: Buffer): ZipEntry[] {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("To nie jest poprawny plik ZIP (brak katalogu centralnego)");
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Uszkodzony katalog centralny ZIP");
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const time = buffer.readUInt16LE(cursor + 12);
    const date = buffer.readUInt16LE(cursor + 14);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    // Bit 11 = nazwa w UTF-8; GSC zapisuje polskie nazwy bez tej flagi, ale potrzebne
    // nam pliki (Strony, Zapytania, Daty, Filtry) mają nazwy w ASCII.
    const name = (flags & 0x0800) !== 0 ? rawName.toString("utf8") : rawName.toString("latin1");
    entries.push({
      name: path.posix.basename(name.replace(/\\/g, "/")),
      modifiedAt: dosDate(date, time),
      data: () => {
        if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Uszkodzony nagłówek pliku ${name}`);
        const localName = buffer.readUInt16LE(localOffset + 26);
        const localExtra = buffer.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localName + localExtra;
        const compressed = buffer.subarray(start, start + compressedSize);
        if (method === 0) {
          if (compressed.length > MAX_EXPORT_CSV_BYTES) throw new Error(`Plik ${name} przekracza limit rozmiaru`);
          return Buffer.from(compressed);
        }
        if (method === 8) return inflateRawSync(compressed, { maxOutputLength: MAX_EXPORT_CSV_BYTES });
        throw new Error(`Nieobsługiwana metoda kompresji ${method} w ${name}`);
      },
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// ── Odczyt plików eksportu ────────────────────────────────────────────────────

interface ExportFiles {
  pages: string | null;
  queries: string | null;
  dates: string | null;
  filters: string | null;
  modifiedAt: Date;
}

function pick(names: readonly string[], patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = names.find((name) => pattern.test(name));
    if (found) return found;
  }
  return null;
}

function decode(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/^﻿/, "");
}

/** Nagłówek eksportu GSC ma kolumnę kliknięć i kolumnę wyświetleń (także w trybie porównania). */
function looksLikeGscCsv(content: string | null): boolean {
  if (!content) return false;
  const metrics = splitCsvLine(splitCsvRecords(content.replace(/^﻿/, ""))[0] ?? "").map((header) => metricOf(header.trim()));
  const clicks = metrics.some((metric) => metric === "kliknięcia" || metric === "klikniecia" || metric === "clicks");
  const impressions = metrics.some((metric) => metric === "wyświetlenia" || metric === "wyswietlenia" || metric === "impressions");
  return clicks && impressions;
}

/** Pliki eksportu albo null, gdy to nie jest eksport GSC (np. przypadkowy pages.csv w Pobranych). */
function readExportFiles(candidatePath: string): ExportFiles | null {
  const files = readExportFilesRaw(candidatePath);
  if (!files || !looksLikeGscCsv(files.pages) || !looksLikeGscCsv(files.queries)) return null;
  return files;
}

function readExportFilesRaw(candidatePath: string): ExportFiles | null {
  const stat = statSync(candidatePath);
  if (stat.isDirectory()) {
    const names = readdirSync(candidatePath).filter((name) => name.toLowerCase().endsWith(".csv"));
    const pagesName = pick(names, PAGE_FILES);
    const queriesName = pick(names, QUERY_FILES);
    if (!pagesName || !queriesName) return null;
    const dateName = pick(names, DATE_FILES);
    const filterName = pick(names, FILTER_FILES);
    for (const name of [pagesName, queriesName, dateName, filterName]) {
      if (name && statSync(path.join(candidatePath, name)).size > MAX_EXPORT_CSV_BYTES) return null;
    }
    const read = (name: string | null) => (name ? decode(readFileSync(path.join(candidatePath, name))) : null);
    const newest = Math.max(
      ...[pagesName, queriesName, dateName, filterName]
        .filter((name): name is string => Boolean(name))
        .map((name) => statSync(path.join(candidatePath, name)).mtimeMs),
    );
    return { pages: read(pagesName), queries: read(queriesName), dates: read(dateName), filters: read(filterName), modifiedAt: new Date(newest) };
  }
  if (!candidatePath.toLowerCase().endsWith(".zip")) return null;
  if (stat.size > MAX_EXPORT_ZIP_BYTES) return null;
  let entries: ZipEntry[];
  try {
    entries = readZipEntries(readFileSync(candidatePath));
  } catch {
    return null;
  }
  const names = entries.map((entry) => entry.name);
  const pagesName = pick(names, PAGE_FILES);
  const queriesName = pick(names, QUERY_FILES);
  if (!pagesName || !queriesName) return null;
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const read = (name: string | null) => (name ? decode(byName.get(name)!.data()) : null);
  return {
    pages: read(pagesName),
    queries: read(queriesName),
    dates: read(pick(names, DATE_FILES)),
    filters: read(pick(names, FILTER_FILES)),
    modifiedAt: new Date(Math.max(...entries.map((entry) => entry.modifiedAt.getTime()))),
  };
}

const METRICS = ["kliknięcia", "klikniecia", "clicks", "wyświetlenia", "wyswietlenia", "impressions", "ctr", "pozycja", "position"];

function metricOf(header: string): string | null {
  const lower = header.toLowerCase();
  return METRICS.find((metric) => lower === metric || lower.endsWith(` ${metric}`)) ?? null;
}

/**
 * Sprowadza CSV z interfejsu GSC do formatu 5 kolumn (wymiar + 4 metryki).
 * W trybie porównania bierze PIERWSZĄ kolumnę każdej metryki (okres bieżący).
 */
export function toFiveColumnCsv(content: string): { csv: string; comparison: boolean } {
  const records = splitCsvRecords(content.replace(/^﻿/, ""));
  if (records.length === 0) throw new Error("Pusty plik CSV z GSC");
  const header = splitCsvLine(records[0]).map((cell) => cell.trim());
  if (header.length === 5) return { csv: records.join("\n"), comparison: false };
  const dimensionIndex = header.findIndex((cell) => metricOf(cell) === null);
  if (dimensionIndex < 0) throw new Error(`Nie rozpoznano kolumny wymiaru: ${header.join(" | ")}`);
  const chosen: number[] = [dimensionIndex];
  const seen = new Set<string>();
  header.forEach((cell, index) => {
    const metric = metricOf(cell);
    if (!metric) return;
    const canonical = metric.startsWith("klik") ? "clicks" : metric.startsWith("wy") ? "impressions" : metric === "pozycja" ? "position" : metric;
    if (seen.has(canonical)) return;
    seen.add(canonical);
    chosen.push(index);
  });
  if (chosen.length !== 5) throw new Error(`Eksport GSC bez kompletu metryk: ${header.join(" | ")}`);
  const quote = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const lines = records.map((record) => {
    const cells = splitCsvLine(record);
    return chosen.map((index, position) => {
      const value = (cells[index] ?? "").trim();
      // Nagłówek metryki bez prefiksu okresu („Ostatnie 3 miesiące Kliknięcia” → „Kliknięcia”).
      if (record === records[0] && position > 0) return quote(value.replace(/^.*\s(\S+)$/, "$1"));
      return quote(value);
    }).join(",");
  });
  return { csv: lines.join("\n"), comparison: true };
}

function rangeLabelOf(filters: string | null): string | null {
  if (!filters) return null;
  for (const record of splitCsvRecords(filters.replace(/^﻿/, "")).slice(1)) {
    const [key, value] = splitCsvLine(record).map((cell) => cell.trim());
    if (/^(data|date)$/i.test(key ?? "") && value) return value;
  }
  return null;
}

function isoDay(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function maxDateIn(dates: string | null): string | null {
  if (!dates) return null;
  let latest: string | null = null;
  for (const record of splitCsvRecords(dates.replace(/^﻿/, "")).slice(1)) {
    const first = splitCsvLine(record)[0]?.trim() ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(first) && (!latest || first > latest)) latest = first;
  }
  return latest;
}

function describe(candidatePath: string, files: ExportFiles): GscExportCandidate {
  const exactEnd = maxDateIn(files.dates);
  const exportedDay = isoDay(files.modifiedAt);
  const pagesHeader = splitCsvLine(splitCsvRecords(files.pages ?? "")[0] ?? "");
  return {
    path: candidatePath,
    kind: statSync(candidatePath).isDirectory() ? "folder" : "zip",
    exportedAt: files.modifiedAt.toISOString(),
    rangeLabel: rangeLabelOf(files.filters),
    dataEnd: exactEnd ?? shiftDays(exportedDay, -GSC_DATA_LAG_DAYS),
    dataEndExact: Boolean(exactEnd),
    comparison: pagesHeader.length > 5,
  };
}

/** Szuka eksportów GSC w podanych katalogach (pliki ZIP i foldery do dwóch poziomów). */
export function findGscExports(directories: readonly string[]): GscExportCandidate[] {
  const candidates: GscExportCandidate[] = [];
  const seen = new Set<string>();
  const visit = (directory: string, depth: number) => {
    let names: string[];
    try {
      names = readdirSync(directory);
    } catch {
      return;
    }
    // Także katalog wskazany wprost (`--gsc-dir` na folder z CSV) bywa samym eksportem.
    const self = safeRead(directory);
    if (self && !seen.has(directory)) {
      seen.add(directory);
      candidates.push(describe(directory, self));
    }
    for (const name of names) {
      const full = path.join(directory, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isFile() && name.toLowerCase().endsWith(".zip") && !seen.has(full)) {
        const files = safeRead(full);
        if (files) {
          seen.add(full);
          candidates.push(describe(full, files));
        }
      } else if (stat.isDirectory() && depth < 2 && !name.startsWith(".") && name !== "node_modules") {
        visit(full, depth + 1);
      }
    }
  };
  for (const directory of directories) {
    // Ścieżka wprost do pliku ZIP z eksportem.
    if (directory.toLowerCase().endsWith(".zip") && !seen.has(directory)) {
      const files = safeRead(directory);
      if (files) {
        seen.add(directory);
        candidates.push(describe(directory, files));
      }
      continue;
    }
    visit(directory, 0);
  }
  return candidates.sort((left, right) => right.dataEnd.localeCompare(left.dataEnd) || right.exportedAt.localeCompare(left.exportedAt));
}

function safeRead(candidatePath: string): ExportFiles | null {
  try {
    return readExportFiles(candidatePath);
  } catch {
    return null;
  }
}

export function gscFreshness(dataEnd: string, today: string): GscFreshness {
  const ageDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dataEnd}T00:00:00Z`)) / 86_400_000);
  const verdict: FreshnessVerdict = ageDays <= FRESH_MAX_AGE_DAYS ? "fresh" : ageDays <= AGING_MAX_AGE_DAYS ? "aging" : "stale";
  return { ageDays, verdict };
}

/** Wczytuje eksport do formatu wejścia silnika (wyłącznie w pamięci). */
export function loadGscExport(candidate: Pick<GscExportCandidate, "path">): GscCsvInputs {
  const files = readExportFiles(candidate.path);
  if (!files?.pages || !files.queries) throw new Error(`To nie jest eksport GSC: ${candidate.path}`);
  const pages = toFiveColumnCsv(files.pages).csv;
  const queries = toFiveColumnCsv(files.queries).csv;
  const daily = files.dates ? toFiveColumnCsv(files.dates).csv : "Data,Kliknięcia,Wyświetlenia,CTR,Pozycja";
  return { pages, queries, daily };
}
