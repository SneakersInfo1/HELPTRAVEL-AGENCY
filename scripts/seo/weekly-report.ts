// Raport tygodniowy SEO z eksportów GSC (CSV z interfejsu).
//
//   pnpm seo:weekly -- --gsc-dir seo-private/gsc/2026-11-10 --out seo-private/reports/weekly-2026-11-10.md
//
// Raport zawiera dane GSC, więc trafia do seo-private/ (poza repozytorium).
// GA4: dziś NOT_CONNECTED — patrz docs/seo/OWNER_ACTIONS.md.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parseGscCsv } from "../../src/lib/seo-ops/gsc/csv";
import { buildWeeklyReport, NotConnectedGa4 } from "../../src/lib/seo-ops/weekly-report";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function find(dir: string, pattern: RegExp): string {
  const name = readdirSync(dir).find((file) => pattern.test(file));
  if (!name) throw new Error(`Brak pliku ${pattern} w ${dir}`);
  return join(dir, name);
}

async function main() {
  const dir = arg("gsc-dir");
  if (!dir) throw new Error("Podaj --gsc-dir z eksportami GSC (daily, pages, queries)");
  const daily = parseGscCsv(readFileSync(find(dir, /daily.*\.csv$/), "utf8")).rows;
  const pages = parseGscCsv(readFileSync(find(dir, /pages.*\.csv$/), "utf8")).rows;
  const queries = parseGscCsv(readFileSync(find(dir, /queries.*\.csv$/), "utf8")).rows;
  const endDate = [...daily].map((row) => row.key).sort().at(-1)!;
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
