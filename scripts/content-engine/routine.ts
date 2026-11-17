import { buildSiteInventory } from "../../src/lib/content-engine/site-inventory";
import { StoreBackedInventory } from "../../src/lib/content-engine/inventory";
import { HttpSourceFetcher } from "../../src/lib/content-engine/sources";
import { ContentStore } from "../../src/lib/content-engine/store";
import { GitHubClient } from "../../src/lib/content-engine/routine/github";
import { GitState, DEFAULT_STATE_BRANCH } from "../../src/lib/content-engine/routine/git-state";
import { assertNoPaidLlmCredentials, installNoPaidLlmGuard, type NoPaidLlmGuard } from "../../src/lib/content-engine/routine/guard";
import { RoutinePhases, type RoutineGscSource } from "../../src/lib/content-engine/routine/phases";
import type { RoutineResult, RoutineStatus } from "../../src/lib/content-engine/routine/work-order";

type RoutineCommand = "prepare" | "verify-claims" | "finalize" | "publish" | "status" | "release";

export interface RoutineCliOptions {
  command: RoutineCommand;
  date?: string;
  base?: string;
  stateBranch: string;
  gscSource: RoutineGscSource;
  maxOpen: number;
  runId?: string;
}

function valueAfter(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Opcja ${option} wymaga wartości.`);
  return value;
}

export function parseRoutineCliArgs(rawArgs: readonly string[]): RoutineCliOptions {
  const args = rawArgs.filter((value) => value !== "--");
  const command = args[0] as RoutineCommand | undefined;
  if (!command || !["prepare", "verify-claims", "finalize", "publish", "status", "release"].includes(command)) {
    throw new Error("Użycie: content:routine prepare|verify-claims|finalize|publish|status|release");
  }
  const result: RoutineCliOptions = {
    command,
    stateBranch: DEFAULT_STATE_BRANCH,
    gscSource: "auto",
    maxOpen: 3,
  };
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--date" && command === "prepare") result.date = valueAfter(args, index++, option);
    else if (option === "--base" && (command === "prepare" || command === "publish")) result.base = valueAfter(args, index++, option);
    else if (option === "--state-branch" && command === "prepare") result.stateBranch = valueAfter(args, index++, option);
    else if (option === "--gsc-source" && command === "prepare") {
      const value = valueAfter(args, index++, option);
      if (value !== "auto" && value !== "api" && value !== "backlog") throw new Error(`Nieznane źródło GSC: ${value}.`);
      result.gscSource = value;
    } else if (option === "--max-open" && command === "prepare") {
      result.maxOpen = Number(valueAfter(args, index++, option));
      if (!Number.isInteger(result.maxOpen) || result.maxOpen < 1) throw new Error("--max-open wymaga dodatniej liczby całkowitej.");
    } else if (option === "--run" && command === "release") result.runId = valueAfter(args, index++, option);
    else throw new Error(`Nieznana opcja ${option} dla podkomendy ${command}.`);
  }
  if (command === "release" && !result.runId) throw new Error("release wymaga --run <id>.");
  return result;
}

function exitCode(status: RoutineStatus): number {
  if (status === "FAILED" || status === "PR_FAILED") return 1;
  if (status === "REJECTED" || status === "BLOCKED_FACTS") return 2;
  return 0;
}

function polishSummary(result: RoutineResult): string {
  const detail = result.reason ? ` ${result.reason}` : "";
  return `Routine zakończone statusem ${result.status}.${detail}`;
}

async function execute(options: RoutineCliOptions): Promise<RoutineResult> {
  const store = new ContentStore("content/seo");
  const inventory = await StoreBackedInventory.create(buildSiteInventory(), store);
  const git = new GitState({ cwd: process.cwd(), stateBranch: options.stateBranch });
  const phases = new RoutinePhases({
    sourceFetcher: new HttpSourceFetcher(),
    inventory,
    store,
    git,
    gh: new GitHubClient(undefined, process.cwd()),
    env: process.env,
  });
  switch (options.command) {
    case "prepare":
      return phases.prepare({
        date: options.date,
        base: options.base,
        stateBranch: options.stateBranch,
        gscSource: options.gscSource,
        maxOpen: options.maxOpen,
      });
    case "verify-claims":
      return phases.verifyClaims();
    case "finalize":
      return phases.finalize();
    case "publish":
      return phases.publish({ base: options.base });
    case "status":
      return phases.status();
    case "release":
      return phases.release(options.runId!);
  }
}

async function main(): Promise<void> {
  let guard: NoPaidLlmGuard | null = null;
  let result: RoutineResult = { status: "FAILED", reason: "Nie uruchomiono fazy." };
  try {
    guard = installNoPaidLlmGuard(process.env);
    assertNoPaidLlmCredentials(process.env);
    result = await execute(parseRoutineCliArgs(process.argv.slice(2)));
  } catch (error) {
    result = { status: "FAILED", reason: error instanceof Error ? error.message : String(error) };
  } finally {
    console.log(`ROUTINE_STATUS=${result.status}`);
    console.log(`ROUTINE_PAID_LLM_CALLS_BLOCKED=${guard?.blockedCount() ?? 0}`);
    console.log(polishSummary(result));
    process.exitCode = exitCode(result.status);
    guard?.uninstall();
  }
}

void main();
