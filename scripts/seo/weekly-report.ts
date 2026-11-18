// Raport tygodniowy SEO z eksportów GSC (CSV z interfejsu albo API tylko do odczytu).
//
//   pnpm seo:weekly -- --gsc-dir seo-private/gsc/2026-11-10 --out seo-private/reports/weekly-2026-11-10.md
//   pnpm seo:weekly -- --source api --days 92
//
// Raport zawiera dane GSC, więc trafia do seo-private/ (poza repozytorium).
// GA4: dziś NOT_CONNECTED — patrz docs/seo/OWNER_ACTIONS.md.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  SEO_GSC_SERVICE_ACCOUNT_JSON,
  SEO_GSC_SITE_URL,
  fetchGscExport,
} from "../../src/lib/seo-ops/gsc/api-client";
import { parseGscCsv } from "../../src/lib/seo-ops/gsc/csv";
import { buildWeeklyReport, NotConnectedGa4 } from "../../src/lib/seo-ops/weekly-report";

type ReportSource = "csv" | "api";

interface ReportGscData {
  daily: ReturnType<typeof parseGscCsv>["rows"];
  pages: ReturnType<typeof parseGscCsv>["rows"];
  queries: ReturnType<typeof parseGscCsv>["rows"];
  endDate: string;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function find(dir: string, pattern: RegExp): string {
  const name = readdirSync(dir).find((file) => pattern.test(file));
  if (!name) throw new Error(`Brak pliku ${pattern} w ${dir}`);
  return join(dir, name);
}

function reportSource(): ReportSource {
  const source = arg("source") ?? "csv";
  if (source === "csv" || source === "api") return source;
  throw new Error("Opcja --source przyjmuje csv albo api");
}

function requestedDays(): number | undefined {
  const value = arg("days");
  if (value === undefined) return undefined;
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) throw new Error("Opcja --days wymaga dodatniej liczby całkowitej");
  return days;
}

function loadCsv(): ReportGscData {
  const dir = arg("gsc-dir");
  if (!dir) throw new Error("Podaj --gsc-dir z eksportami GSC (daily, pages, queries)");
  const daily = parseGscCsv(readFileSync(find(dir, /daily.*\.csv$/), "utf8")).rows;
  const pages = parseGscCsv(readFileSync(find(dir, /pages.*\.csv$/), "utf8")).rows;
  const queries = parseGscCsv(readFileSync(find(dir, /queries.*\.csv$/), "utf8")).rows;
  const endDate = [...daily].map((row) => row.key).sort().at(-1);
  if (!endDate) throw new Error("Eksport dzienny GSC jest pusty");
  return { daily, pages, queries, endDate };
}

async function loadApi(): Promise<ReportGscData> {
  const serviceAccountJson = process.env[SEO_GSC_SERVICE_ACCOUNT_JSON];
  const siteUrl = process.env[SEO_GSC_SITE_URL];
  if (!serviceAccountJson || !siteUrl) {
    const missing = [
      ...(serviceAccountJson ? [] : [SEO_GSC_SERVICE_ACCOUNT_JSON]),
      ...(siteUrl ? [] : [SEO_GSC_SITE_URL]),
    ];
    throw new Error(`Dla --source api ustaw wymagane zmienne środowiskowe: ${missing.join(", ")}`);
  }
  const gsc = await fetchGscExport({ siteUrl, serviceAccountJson, days: requestedDays(), includePageQuery: false });
  return { daily: gsc.daily, pages: gsc.pages, queries: gsc.queries, endDate: gsc.range.endDate };
}

async function main() {
  const { daily, pages, queries, endDate } = reportSource() === "api" ? await loadApi() : loadCsv();
  const ga4 = new NotConnectedGa4();
  const markdown = buildWeeklyReport({ daily, pages, queries, endDate, ga4: { status: ga4.status, rows: await ga4.organicLandingPages() } });
  const out = arg("out") ?? join("seo-private", "reports", `weekly-${endDate}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${markdown}\n`, "utf8");
  console.log(`raport: ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
