import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { fixtureScenario, type FixtureScenarioName } from "../../src/lib/content-engine/fixtures/scenarios";
import { FixtureInventory, StoreBackedInventory } from "../../src/lib/content-engine/inventory";
import { AnthropicLlm } from "../../src/lib/content-engine/anthropic-llm";
import { Ledger } from "../../src/lib/content-engine/ledger";
import { FakeLlm, type LlmClient } from "../../src/lib/content-engine/llm";
import { buildSiteInventory } from "../../src/lib/content-engine/site-inventory";
import { redactRunReport, runDaily, type GscCsvInputs } from "../../src/lib/content-engine/pipeline";
import { FixtureSourceFetcher, HttpSourceFetcher, type SourceFetcher } from "../../src/lib/content-engine/sources";
import { ContentStore } from "../../src/lib/content-engine/store";
import type { ContentType } from "../../src/lib/content-engine/schema";
import type { PublishMode } from "../../src/lib/content-quality/gate";
import {
  SEO_GSC_SERVICE_ACCOUNT_JSON,
  SEO_GSC_SITE_URL,
  fetchGscExport,
  toGscCsvInputs,
} from "../../src/lib/seo-ops/gsc/api-client";

type GscSource = "csv" | "api";

interface CliOptions {
  mode: PublishMode;
  scenario?: FixtureScenarioName;
  scheduledAt: string;
  stateDir: string;
  storeDir: string;
  gscDir: string;
  gscSource: GscSource;
  /** Gdzie zapisać raport bez danych GSC (artefakt CI). */
  publicReport?: string;
  releasePending?: string;
}

const FIXTURE_RENDERABLE_TYPES: ReadonlySet<ContentType> = new Set([
  "comparison_enrichment",
  "month_enrichment",
  "hub_enrichment",
  "article",
]);

function valueAfter(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Opcja ${option} wymaga wartości`);
  return value;
}

function parseMode(value: string): PublishMode {
  const modes: Readonly<Record<string, PublishMode>> = {
    "dry-run": "DRY_RUN",
    "draft-and-pr": "DRAFT_AND_PR",
    "auto-evergreen": "AUTO_EVERGREEN",
  };
  const mode = modes[value];
  if (!mode) throw new Error(`Nieznany tryb: ${value}`);
  return mode;
}

function parseScenario(value: string): FixtureScenarioName {
  if (value === "refresh" || value === "new-evergreen" || value === "reject-unverified") return value;
  throw new Error(`Nieznany scenariusz: ${value}`);
}

function parseGscSource(value: string): GscSource {
  if (value === "csv" || value === "api") return value;
  throw new Error(`Nieznane źródło GSC: ${value}; użyj csv albo api`);
}

export function parseCliArgs(args: readonly string[], currentDate = new Date()): CliOptions {
  const result: CliOptions = {
    mode: "DRY_RUN",
    scheduledAt: currentDate.toISOString(),
    stateDir: ".seo-engine-state",
    storeDir: "content/seo",
    gscDir: "data/gsc",
    gscSource: "csv",
  };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    // `pnpm content:run -- --mode …` przekazuje separator `--` do skryptu; obie formy mają działać.
    if (option === "--") continue;
    if (option === "--mode") result.mode = parseMode(valueAfter(args, index++, option));
    else if (option === "--scenario") result.scenario = parseScenario(valueAfter(args, index++, option));
    else if (option === "--scheduled-at") result.scheduledAt = valueAfter(args, index++, option);
    else if (option === "--state-dir") result.stateDir = valueAfter(args, index++, option);
    else if (option === "--store-dir") result.storeDir = valueAfter(args, index++, option);
    else if (option === "--gsc-dir") result.gscDir = valueAfter(args, index++, option);
    else if (option === "--gsc-source") result.gscSource = parseGscSource(valueAfter(args, index++, option));
    else if (option === "--public-report") result.publicReport = valueAfter(args, index++, option);
    else if (option === "--release-pending") result.releasePending = valueAfter(args, index++, option);
    else throw new Error(`Nieznana opcja: ${option}`);
  }
  if (!Number.isFinite(new Date(result.scheduledAt).getTime())) throw new Error("--scheduled-at wymaga poprawnego czasu ISO");
  return result;
}

async function loadGsc(directory: string): Promise<GscCsvInputs> {
  const [pages, queries, daily] = await Promise.all(
    ["pages.csv", "queries.csv", "daily.csv"].map((name) => readFile(path.join(directory, name), "utf8")),
  );
  return { pages, queries, daily };
}

async function loadGscFromApi(now: Date): Promise<GscCsvInputs> {
  const serviceAccountJson = process.env[SEO_GSC_SERVICE_ACCOUNT_JSON];
  const siteUrl = process.env[SEO_GSC_SITE_URL];
  if (!serviceAccountJson || !siteUrl) {
    const missing = [
      ...(serviceAccountJson ? [] : [SEO_GSC_SERVICE_ACCOUNT_JSON]),
      ...(siteUrl ? [] : [SEO_GSC_SITE_URL]),
    ];
    throw new Error(`Dla --gsc-source api ustaw wymagane zmienne środowiskowe: ${missing.join(", ")}`);
  }
  // Zakres danych liczymy od dnia przebiegu, ale JWT musi nosić bieżący czas —
  // przy powtórce starego dnia Google odrzuciłby podpis z dawnym `iat`.
  const end = new Date(now.getTime());
  end.setUTCDate(end.getUTCDate() - 3);
  return toGscCsvInputs(await fetchGscExport({ siteUrl, serviceAccountJson, endDate: end.toISOString().slice(0, 10), includePageQuery: false }));
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.releasePending) {
    const removed = await new Ledger({ stateDir: options.stateDir }).releasePending(options.releasePending);
    console.log(`Zwolniono ${removed} wpisów pending przebiegu ${options.releasePending}.`);
    return;
  }
  const hasApiKey = Boolean(process.env.SEO_ENGINE_ANTHROPIC_API_KEY);
  if (!hasApiKey && !options.scenario) {
    throw new Error("Bez SEO_ENGINE_ANTHROPIC_API_KEY podaj --scenario refresh|new-evergreen|reject-unverified; scenariusz działa całkowicie offline.");
  }

  const store = new ContentStore(options.storeDir);
  let gsc: GscCsvInputs;
  let llm: LlmClient;
  let sourceFetcher: SourceFetcher;
  let baseInventory: FixtureInventory;
  const scheduled = new Date(options.scheduledAt);

  if (options.scenario) {
    const fixture = fixtureScenario(options.scenario);
    gsc = fixture.gsc;
    llm = new FakeLlm(fixture.scripts);
    sourceFetcher = new FixtureSourceFetcher(fixture.sources, () => new Date(scheduled));
    baseInventory = new FixtureInventory(fixture.inventory);
  } else {
    gsc = options.gscSource === "api" ? await loadGscFromApi(scheduled) : await loadGsc(options.gscDir);
    llm = new AnthropicLlm();
    sourceFetcher = new HttpSourceFetcher();
    // Realne trasy (z tej samej funkcji co sitemap) i tytuły istniejących treści —
    // z pustym inwentarzem każde CTA byłoby „nieznaną trasą", a kontrola duplikatów pusta.
    baseInventory = buildSiteInventory();
  }

  const inventory = await StoreBackedInventory.create(baseInventory, store);
  const report = await runDaily(
    { gsc, inventory, store, llm, sourceFetcher },
    {
      mode: options.mode,
      scheduledAt: options.scheduledAt,
      stateDir: options.stateDir,
      ...(options.scenario ? { renderableTypes: FIXTURE_RENDERABLE_TYPES } : {}),
    },
  );

  const reportPath = path.join(options.stateDir, "reports", `${report.runId}.json`);
  if (options.publicReport) {
    await writeFile(options.publicReport, `${JSON.stringify(redactRunReport(report), null, 2)}\n`, "utf8");
  }
  console.log(`HelpTravel content engine: ${report.outcome}`);
  console.log(`run: ${report.runId} | dzień UTC: ${report.scheduledAt.slice(0, 10)} | tryb: ${report.mode}`);
  console.log(`zadania: ${report.selectedTasks.length} | decyzja: ${report.decision ?? "brak"} | gate: ${report.gateReport?.verdict ?? "brak"}`);
  console.log(`LLM: ${report.usage.requests} żądań, ${report.usage.outputTokens} tokenów wyjściowych, koszt maks. wg tabeli: $${report.usage.costUsd.toFixed(4)}`);
  console.log(`pliki treści: ${report.filesWritten.length > 0 ? report.filesWritten.join(", ") : "brak"}`);
  console.log(`raport: ${reportPath}`);
  if (report.reason) console.log(`powód: ${report.reason}`);
  if (report.error) console.error(`błąd [${report.error.stage}]: ${report.error.message}`);
  if (report.outcome === "FAILED") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

