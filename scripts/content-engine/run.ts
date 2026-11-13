import { readFile } from "node:fs/promises";
import path from "node:path";

import { fixtureScenario, type FixtureScenarioName } from "../../src/lib/content-engine/fixtures/scenarios";
import { FixtureInventory, StoreBackedInventory } from "../../src/lib/content-engine/inventory";
import { AnthropicLlm } from "../../src/lib/content-engine/anthropic-llm";
import { FakeLlm, type LlmClient } from "../../src/lib/content-engine/llm";
import { runDaily, type GscCsvInputs } from "../../src/lib/content-engine/pipeline";
import { FixtureSourceFetcher, HttpSourceFetcher, type SourceFetcher } from "../../src/lib/content-engine/sources";
import { ContentStore } from "../../src/lib/content-engine/store";
import type { PublishMode } from "../../src/lib/content-quality/gate";

interface CliOptions {
  mode: PublishMode;
  scenario?: FixtureScenarioName;
  scheduledAt: string;
  stateDir: string;
  storeDir: string;
  gscDir: string;
}

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

export function parseCliArgs(args: readonly string[], currentDate = new Date()): CliOptions {
  const result: CliOptions = {
    mode: "DRY_RUN",
    scheduledAt: currentDate.toISOString(),
    stateDir: ".seo-engine-state",
    storeDir: "content/seo",
    gscDir: "data/gsc",
  };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--mode") result.mode = parseMode(valueAfter(args, index++, option));
    else if (option === "--scenario") result.scenario = parseScenario(valueAfter(args, index++, option));
    else if (option === "--scheduled-at") result.scheduledAt = valueAfter(args, index++, option);
    else if (option === "--state-dir") result.stateDir = valueAfter(args, index++, option);
    else if (option === "--store-dir") result.storeDir = valueAfter(args, index++, option);
    else if (option === "--gsc-dir") result.gscDir = valueAfter(args, index++, option);
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

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
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
    gsc = await loadGsc(options.gscDir);
    llm = new AnthropicLlm();
    sourceFetcher = new HttpSourceFetcher();
    // Produkcyjny adapter tras zostanie dostarczony przez właściciela przez SiteInventory.
    baseInventory = new FixtureInventory();
  }

  const inventory = await StoreBackedInventory.create(baseInventory, store);
  const report = await runDaily(
    { gsc, inventory, store, llm, sourceFetcher },
    { mode: options.mode, scheduledAt: options.scheduledAt, stateDir: options.stateDir },
  );

  const reportPath = path.join(options.stateDir, "reports", `${report.runId}.json`);
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

