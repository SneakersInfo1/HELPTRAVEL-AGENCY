import { readFile } from "node:fs/promises";

import { parseGscCsv, splitCsvLine, splitCsvRecords } from "@/lib/seo-ops/gsc/csv";

import type { GscCsvInputs } from "../pipeline";

const PAGE_HEADER = "Page,Clicks,Impressions,CTR,Position";
const QUERY_HEADER = "Query,Clicks,Impressions,CTR,Position\n";
const DAILY_HEADER = "Date,Clicks,Impressions,CTR,Position\n";

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function metric(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", ".").replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function backlogCsvToGscInputs(content: string): GscCsvInputs {
  const records = splitCsvRecords(content.replace(/^\uFEFF/, ""));
  if (records.length === 0) throw new Error("Backlog szans SEO jest pusty.");
  const header = splitCsvLine(records[0]).map((cell) => cell.trim().toLowerCase());
  const index = (name: string) => header.indexOf(name);
  const columns = {
    url: index("url"),
    clicks: index("gsc_clicks_92d"),
    impressions: index("gsc_impressions_92d"),
    ctr: index("gsc_ctr_92d"),
    position: index("gsc_position_92d"),
  };
  if (Object.values(columns).some((value) => value < 0)) {
    throw new Error("Backlog nie zawiera wymaganych kolumn GSC: url, kliknięcia, wyświetlenia, CTR i pozycja.");
  }

  const pages: string[] = [PAGE_HEADER];
  for (const record of records.slice(1)) {
    const cells = splitCsvLine(record);
    const url = cells[columns.url]?.trim() ?? "";
    const clicks = metric(cells[columns.clicks]);
    const impressions = metric(cells[columns.impressions]);
    const ctr = metric(cells[columns.ctr]);
    const position = metric(cells[columns.position]);
    if (url === "" || clicks === null || impressions === null || ctr === null || position === null) continue;
    if (clicks < 0 || impressions < 0 || clicks > impressions || position < 0) continue;
    pages.push([csvCell(url), clicks, impressions, `${ctr}%`, position].join(","));
  }

  const result = { pages: `${pages.join("\n")}\n`, queries: QUERY_HEADER, daily: DAILY_HEADER };
  parseGscCsv(result.pages);
  parseGscCsv(result.queries);
  parseGscCsv(result.daily);
  return result;
}

export const backlogToGscCsvInputs = backlogCsvToGscInputs;

export async function loadBacklogGscInputs(file = "docs/seo/OPPORTUNITY_BACKLOG.csv"): Promise<GscCsvInputs> {
  return backlogCsvToGscInputs(await readFile(file, "utf8"));
}
