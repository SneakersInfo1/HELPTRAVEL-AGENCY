// `pnpm seo:daily <polecenie>` — narzędzia dziennej sesji SEO uruchamianej ręcznie w Claude Code
// (procedura: docs/seo/daily/PROCEDURE.md). Analizę, research, redakcję i kod wykonuje Claude
// w sesji, w ramach abonamentu. To CLI NIE wywołuje żadnego modelu AI: każde polecenie ma
// blokadę żądań do API modeli i kończy się błędem, gdy w środowisku jest klucz silnika.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildSiteInventory } from "../../src/lib/content-engine/site-inventory";
import { StoreBackedInventory } from "../../src/lib/content-engine/inventory";
import { HttpSourceFetcher } from "../../src/lib/content-engine/sources";
import { ContentStore } from "../../src/lib/content-engine/store";
import { backlogCsvToGscInputs } from "../../src/lib/content-engine/session/backlog";
import {
  dailyGsc,
  dailyJournal,
  dailyPlan,
  dailyQueueAdd,
  dailyQueueList,
  dailyQueueRemove,
  dailyQueueSet,
  dailyStatus,
  gscSearchDirs,
  newestGscExport,
  type DailyContext,
  type DailyOutput,
} from "../../src/lib/content-engine/session/daily-commands";
import { GitHubClient } from "../../src/lib/content-engine/session/github";
import { GitState, DEFAULT_STATE_BRANCH } from "../../src/lib/content-engine/session/git-state";
import { assertNoPaidLlmCredentials, installNoPaidLlmGuard, type NoPaidLlmGuard } from "../../src/lib/content-engine/session/guard";
import { SessionPhases, type SessionGscSource } from "../../src/lib/content-engine/session/phases";
import type { SessionResult, SessionStatus } from "../../src/lib/content-engine/session/work-order";

const COMMANDS = ["status", "gsc", "plan", "queue", "journal", "prepare", "verify-claims", "finalize", "publish", "release"] as const;
type DailyCommand = (typeof COMMANDS)[number];

const FLAGS = new Set(["--sync", "--again", "--with-code", "--code-only"]);

/** Dozwolone opcje dla każdego polecenia (reszta to błąd — literówka nie może przejść po cichu). */
const ALLOWED: Record<DailyCommand, readonly string[]> = {
  status: ["--sync"],
  gsc: ["--gsc-dir"],
  plan: ["--gsc-dir", "--top"],
  queue: ["--status", "--kind", "--target", "--title", "--why", "--source", "--priority", "--id", "--note", "--pr"],
  journal: ["--file"],
  prepare: ["--date", "--base", "--state-branch", "--gsc-source", "--gsc-dir", "--max-open", "--target", "--again"],
  "verify-claims": [],
  finalize: [],
  publish: ["--base", "--with-code", "--body-file", "--code-only", "--title"],
  release: ["--run"],
};

export interface DailyCliOptions {
  command: DailyCommand;
  positional: string[];
  options: Map<string, string | true>;
}

const USAGE = [
  "Użycie: pnpm seo:daily <polecenie>",
  "  status [--sync]                      stan kolejki, dziennika i PR-ów (z --sync: scalony → done, zamknięty → rejected)",
  "  gsc [--gsc-dir DIR]                  najnowszy eksport GSC i ocena świeżości danych",
  "  plan [--gsc-dir DIR] [--top N]       zadania według dowodów (pełny plan: .seo-daily/plan.md)",
  "  queue list [--status S]",
  "  queue add --kind K --target T --title TXT --why TXT [--priority N] [--status S] [--source S] [--id ID] [--note TXT]",
  "  queue set <id> --status S [--pr URL] [--note TXT]",
  "  queue remove <id>                    usuwa błędny wpis (zamknięcie tematu: queue set --status rejected)",
  "  journal --file PLIK.json             wpis dziennika sesji",
  "  prepare [--target URL] [--again] [--base B] [--gsc-source auto|export|api|backlog] [--gsc-dir DIR]",
  "  verify-claims | finalize",
  "  publish [--base B] [--with-code] [--body-file PLIK]",
  "  publish --code-only --title TXT --body-file PLIK [--base B]",
  "  release --run ID",
].join("\n");

export function parseDailyCliArgs(rawArgs: readonly string[]): DailyCliOptions {
  const args = rawArgs.filter((value) => value !== "--");
  const command = args[0] as DailyCommand | undefined;
  if (!command || !COMMANDS.includes(command)) throw new Error(USAGE);
  const positional: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    if (!ALLOWED[command].includes(arg)) throw new Error(`Nieznana opcja ${arg} dla polecenia ${command}.\n${USAGE}`);
    if (FLAGS.has(arg)) {
      options.set(arg, true);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Opcja ${arg} wymaga wartości.`);
    options.set(arg, value);
    index += 1;
  }
  const maxPositional = command === "queue" ? 2 : 0;
  if (positional.length > maxPositional) throw new Error(`Nieoczekiwany argument: ${positional.slice(maxPositional).join(" ")}.\n${USAGE}`);
  if (command === "queue" && !["list", "add", "set", "remove"].includes(positional[0] ?? "")) throw new Error(`queue wymaga: list | add | set | remove.\n${USAGE}`);
  if (command === "release" && !options.has("--run")) throw new Error("release wymaga --run <id>.");
  const gscSource = options.get("--gsc-source");
  if (gscSource !== undefined && !["auto", "export", "api", "backlog"].includes(String(gscSource))) throw new Error(`Nieznane źródło GSC: ${String(gscSource)}.`);
  return { command, positional, options };
}

/**
 * Cel zadania jako ścieżka strony. Przyjmuje pełny adres (`https://helptravel.pl/porownanie/x`),
 * ścieżkę (`/porownanie/x`) albo obszar kodu (`src/...`). Git Bash na Windows (MSYS) zamienia
 * argument zaczynający się od „/” na ścieżkę Windows (`C:/Program Files/Git/porownanie/x`) —
 * taką zamianę cofamy, a gdy się nie da, kończymy błędem zamiast zapisać zły cel.
 */
export function normalizeTargetArg(raw: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return new URL(value).pathname.replace(/\/+$/, "") || "/";
  const slashed = value.replace(/\\/g, "/");
  if (!/^[A-Za-z]:\//.test(slashed)) return value;
  // EXEPATH to katalog Gita albo jego `bin`; korzeń musi mieć co najmniej jeden katalog (nie sam dysk).
  const roots = (env.EXEPATH ? [env.EXEPATH, path.win32.dirname(env.EXEPATH)] : [])
    .map((root) => root.replace(/\\/g, "/").replace(/\/+$/, ""))
    .filter((root) => /^[A-Za-z]:\/[^/]+/.test(root));
  for (const root of roots.sort((left, right) => right.length - left.length)) {
    if (slashed.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return slashed.slice(root.length);
  }
  const marker = `/${slashed}`.toLowerCase().lastIndexOf("/git/");
  if (marker >= 0) return `/${slashed}`.slice(marker + "/git".length);
  throw new Error(`Cel „${raw}” wygląda na ścieżkę Windows (Git Bash zamienia argumenty zaczynające się od „/”). Podaj pełny adres https://helptravel.pl/… albo poprzedź polecenie MSYS_NO_PATHCONV=1.`);
}

function text(options: Map<string, string | true>, name: string): string | undefined {
  const value = options.get(name);
  return typeof value === "string" ? value : undefined;
}

function required(options: Map<string, string | true>, name: string, context: string): string {
  const value = text(options, name);
  if (!value) throw new Error(`${context} wymaga ${name}.`);
  return value;
}

function positiveInteger(options: Map<string, string | true>, name: string, fallback: number): number {
  const raw = text(options, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} wymaga dodatniej liczby całkowitej.`);
  return value;
}

function exitCode(status: SessionStatus): number {
  if (status === "FAILED" || status === "PR_FAILED") return 1;
  if (status === "REJECTED" || status === "BLOCKED_FACTS") return 2;
  return 0;
}

function runGit(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { encoding: "utf8", windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

/** Główny katalog repozytorium (pierwszy worktree) — tam właściciel trzyma `seo-private/`. */
async function mainCheckout(): Promise<string | null> {
  try {
    const first = (await runGit(["worktree", "list", "--porcelain"])).split(/\r?\n/).find((line) => line.startsWith("worktree "));
    return first ? first.slice("worktree ".length).trim() : null;
  } catch {
    return null;
  }
}

/**
 * Domyślna baza: gałąź, od której utworzono gałąź sesji (`git switch -c … origin/<baza>`
 * ustawia ją jako upstream). Gałąź sesji jako baza nie ma sensu — wtedy `main`.
 */
async function defaultBase(): Promise<string> {
  try {
    const upstream = (await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim();
    const branch = upstream.replace(/^origin\//, "");
    if (upstream.startsWith("origin/") && !branch.startsWith("claude/seo-daily/")) return branch;
  } catch {
    // Brak upstreamu — baza domyślna.
  }
  return "main";
}

async function execute(cli: DailyCliOptions): Promise<DailyOutput> {
  const { command, positional, options } = cli;
  const now = () => new Date();
  const day = now().toISOString().slice(0, 10);
  const git = new GitState({ cwd: process.cwd(), stateBranch: text(options, "--state-branch") ?? DEFAULT_STATE_BRANCH });
  const gh = new GitHubClient(undefined, process.cwd());
  const ctx: DailyContext = { git, gh, now };
  const searchDirs = async () => gscSearchDirs({ explicitDir: text(options, "--gsc-dir"), env: process.env, cwd: process.cwd(), mainCheckout: await mainCheckout() });
  const loadBacklog = async () => backlogCsvToGscInputs(await readFile("docs/seo/OPPORTUNITY_BACKLOG.csv", "utf8"));

  switch (command) {
    case "status":
      return dailyStatus(ctx, { sync: options.has("--sync") });
    case "gsc":
      return dailyGsc(ctx, await searchDirs());
    case "plan": {
      const store = new ContentStore("content/seo");
      const inventory = await StoreBackedInventory.create(buildSiteInventory(), store);
      const newest = newestGscExport(await searchDirs(), day);
      const label = newest ? newest.candidate.path.split(/[\\/]/).pop() ?? newest.candidate.path : "";
      return dailyPlan(ctx, { inventory, store, gsc: newest ? { loaded: newest.loaded, label } : null, loadBacklog, top: positiveInteger(options, "--top", 8) });
    }
    case "queue": {
      const sub = positional[0];
      if (sub === "list") return dailyQueueList(ctx, text(options, "--status"));
      if (sub === "add") {
        return dailyQueueAdd(ctx, {
          id: text(options, "--id"),
          kind: required(options, "--kind", "queue add"),
          target: normalizeTargetArg(required(options, "--target", "queue add")),
          title: required(options, "--title", "queue add"),
          why: required(options, "--why", "queue add"),
          source: text(options, "--source"),
          priority: text(options, "--priority") === undefined ? undefined : Number(text(options, "--priority")),
          status: text(options, "--status"),
          note: text(options, "--note"),
        });
      }
      const id = positional[1];
      if (!id) throw new Error(`queue ${sub} wymaga identyfikatora tematu.`);
      if (sub === "remove") return dailyQueueRemove(ctx, id);
      return dailyQueueSet(ctx, id, { status: required(options, "--status", "queue set"), prUrl: text(options, "--pr"), note: text(options, "--note") });
    }
    case "journal":
      return dailyJournal(ctx, required(options, "--file", "journal"));
    default:
      break;
  }

  const store = new ContentStore("content/seo");
  const inventory = await StoreBackedInventory.create(buildSiteInventory(), store);
  const dirs = command === "prepare" ? await searchDirs() : [];
  const phases = new SessionPhases({
    sourceFetcher: new HttpSourceFetcher(),
    inventory,
    store,
    git,
    gh,
    env: process.env,
    loadGscExport: () => newestGscExport(dirs, day)?.loaded ?? null,
  });
  const wrap = (result: SessionResult): DailyOutput => ({ result, report: "" });
  switch (command) {
    case "prepare":
      return wrap(
        await phases.prepare({
          date: text(options, "--date"),
          base: text(options, "--base") ?? (await defaultBase()),
          stateBranch: text(options, "--state-branch") ?? DEFAULT_STATE_BRANCH,
          gscSource: (text(options, "--gsc-source") as SessionGscSource | undefined) ?? "auto",
          maxOpen: positiveInteger(options, "--max-open", 3),
          target: text(options, "--target") === undefined ? undefined : normalizeTargetArg(text(options, "--target")!),
          again: options.has("--again"),
        }),
      );
    case "verify-claims":
      return wrap(await phases.verifyClaims());
    case "finalize":
      return wrap(await phases.finalize());
    case "publish": {
      const bodyFile = text(options, "--body-file");
      const body = bodyFile ? await readFile(bodyFile, "utf8") : undefined;
      if (options.has("--code-only")) {
        return wrap(
          await phases.publishCode({
            base: text(options, "--base") ?? (await defaultBase()),
            title: required(options, "--title", "publish --code-only"),
            body: body ?? "",
          }),
        );
      }
      return wrap(await phases.publish({ base: text(options, "--base"), withCode: options.has("--with-code"), extraBody: body }));
    }
    case "release":
      return wrap(await phases.release(required(options, "--run", "release")));
    default:
      throw new Error(USAGE);
  }
}

async function main(): Promise<void> {
  let guard: NoPaidLlmGuard | null = null;
  let output: DailyOutput = { result: { status: "FAILED", reason: "Nie uruchomiono polecenia." }, report: "" };
  try {
    guard = installNoPaidLlmGuard(process.env);
    assertNoPaidLlmCredentials(process.env);
    output = await execute(parseDailyCliArgs(process.argv.slice(2)));
  } catch (error) {
    output = { result: { status: "FAILED", reason: error instanceof Error ? error.message : String(error) }, report: "" };
  } finally {
    if (output.report) console.log(output.report.trimEnd());
    const { result } = output;
    console.log(`SEO_DAILY_STATUS=${result.status}`);
    console.log(`SEO_DAILY_PAID_LLM_CALLS_BLOCKED=${guard?.blockedCount() ?? 0}`);
    console.log(`SEO daily: ${result.status}.${result.reason ? ` ${result.reason}` : ""}`);
    for (const error of result.errors ?? []) console.log(`- ${error}`);
    if (result.prUrl) console.log(`PR: ${result.prUrl}`);
    process.exitCode = exitCode(result.status);
    guard?.uninstall();
  }
}

if (process.argv[1] && /daily\.ts$/.test(process.argv[1])) void main();
