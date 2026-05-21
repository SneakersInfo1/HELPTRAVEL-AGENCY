import { promises as fs } from "node:fs";
import path from "node:path";

import * as chromeLauncher from "chrome-launcher";
import type { Flags } from "lighthouse";

const DEFAULT_BASE_URL = "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), "tmp", "lighthouse");

const ROUTES = [
  "/",
  "/hotele/szukaj?destination=Madrid&country=Spain",
  "/hotele/szukaj?destination=Lisbon&country=Portugal",
  "/hotele/szukaj?destination=Bilbao&country=Spain",
] as const;

interface Row {
  route: string;
  url: string;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function score(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100);
}

function metricMs(audits: Record<string, { numericValue?: number }>, key: string): number | null {
  const value = audits[key]?.numericValue;
  return typeof value === "number" ? Math.round(value) : null;
}

function metricNumber(audits: Record<string, { numericValue?: number }>, key: string): number | null {
  const value = audits[key]?.numericValue;
  return typeof value === "number" ? Number(value.toFixed(3)) : null;
}

function safeName(route: string): string {
  return route
    .replace(/^\//, "home")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();
}

function formatNullable(value: number | null, suffix = ""): string {
  return value === null ? "n/a" : `${value}${suffix}`;
}

async function main() {
  const baseUrl = (parseArg("base") ?? process.env.LIGHTHOUSE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const outputLabel = parseArg("label") ?? new Date().toISOString().replace(/[:.]/g, "-");
  const { default: lighthouse } = await import("lighthouse");

  await fs.mkdir(OUT_DIR, { recursive: true });

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });

  const rows: Row[] = [];
  try {
    for (const route of ROUTES) {
      const url = `${baseUrl}${route}`;
      const flags: Flags = {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        throttlingMethod: "simulate",
        formFactor: "mobile",
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          disabled: false,
        },
      };
      const result = await lighthouse(url, flags);

      if (!result?.lhr) {
        throw new Error(`Lighthouse did not return an LHR for ${url}`);
      }

      const { lhr } = result;
      const jsonPath = path.join(OUT_DIR, `${outputLabel}-${safeName(route)}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(lhr, null, 2));

      rows.push({
        route,
        url,
        fcpMs: metricMs(lhr.audits, "first-contentful-paint"),
        lcpMs: metricMs(lhr.audits, "largest-contentful-paint"),
        cls: metricNumber(lhr.audits, "cumulative-layout-shift"),
        tbtMs: metricMs(lhr.audits, "total-blocking-time"),
        performance: score(lhr.categories.performance?.score),
        accessibility: score(lhr.categories.accessibility?.score),
        bestPractices: score(lhr.categories["best-practices"]?.score),
        seo: score(lhr.categories.seo?.score),
      });
    }
  } finally {
    try {
      await chrome.kill();
    } catch (error) {
      console.warn(
        `Warning: Chrome cleanup failed (${error instanceof Error ? error.message : String(error)}). Reports were still generated.`,
      );
    }
  }

  const tsv = [
    "route\tperf\ta11y\tbp\tseo\tfcp_ms\tlcp_ms\tcls\ttbt_ms",
    ...rows.map((row) =>
      [
        row.route,
        row.performance,
        row.accessibility,
        row.bestPractices,
        row.seo,
        row.fcpMs ?? "",
        row.lcpMs ?? "",
        row.cls ?? "",
        row.tbtMs ?? "",
      ].join("\t"),
    ),
  ].join("\n");
  await fs.writeFile(path.join(OUT_DIR, `${outputLabel}-summary.tsv`), `${tsv}\n`);

  console.log(tsv);
  console.log("");
  console.log(`JSON reports written to ${OUT_DIR}`);

  const failing = rows.filter(
    (row) => row.performance < 90 || row.accessibility < 95 || row.bestPractices < 95 || row.seo < 95,
  );
  if (failing.length > 0) {
    console.error("");
    console.error("Lighthouse threshold failures:");
    for (const row of failing) {
      console.error(
        `- ${row.route}: perf=${row.performance}, a11y=${row.accessibility}, bp=${row.bestPractices}, seo=${row.seo}, LCP=${formatNullable(row.lcpMs, "ms")}`,
      );
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
