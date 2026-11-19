// Polecenia sesji „SEO daily” poza zadaniem treści: stan i synchronizacja PR, eksport GSC,
// plan według dowodów, kolejka tematów i dziennik. Każde polecenie zwraca wynik (status
// dla CLI) i raport tekstowy dla sesji.
//
// Pamięć (kolejka, dziennik) żyje w gałęzi stanu, folder `daily/`. Polecenia, które ją
// zmieniają, odtwarzają i utrwalają WYŁĄCZNIE ten folder — dzięki temu nie nadpisują
// niezapisanych jeszcze zmian rejestru zadań (oczekujące propozycje po `finalize`).
//
// Repozytorium jest publiczne: raporty z liczbami GSC trafiają tylko na konsolę sesji
// i do lokalnego katalogu `.seo-daily/` (poza gitem).

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Ledger } from "../ledger";
import { PENDING_PROPOSAL_DAYS, type GscCsvInputs } from "../pipeline";
import type { SiteInventory } from "../inventory";
import type { ContentStore } from "../store";
import {
  JournalEntrySchema,
  QueueItemSchema,
  QueueKindSchema,
  QueueStatusSchema,
  appendJournal,
  readJournal,
  readQueue,
  removeQueueItem,
  setQueueStatus,
  upsertQueueItem,
  type QueueItem,
} from "./daily-state";
import type { ProposalBranch, StateFolder } from "./git-state";
import { parseGitHubRemote, pullRequestNumberFromUrl, type GitHubRepository, type PullRequestState } from "./github";
import { findGscExports, gscFreshness, loadGscExport, type GscExportCandidate } from "./gsc-export";
import { proposalPendingTargets, type LoadedGscExport } from "./phases";
import { buildPlan, renderPlanMarkdown } from "./plan";
import { SessionResultSchema, sessionPaths, type SessionResult } from "./work-order";

const DAILY_ONLY: readonly StateFolder[] = ["daily"];

export interface DailyGit {
  restoreState(stateDir: string, folders?: readonly StateFolder[]): Promise<void>;
  persistState(stateDir: string, message: string, folders?: readonly StateFolder[]): Promise<void>;
  listProposalBranches(): Promise<ProposalBranch[]>;
  remoteUrl(): Promise<string>;
}

export interface DailyGitHub {
  getPullRequest(input: GitHubRepository & { number: number }): Promise<PullRequestState>;
}

export interface DailyContext {
  git: DailyGit;
  gh: DailyGitHub;
  now: () => Date;
  stateDir?: string;
  sessionDir?: string;
  outDir?: string;
}

export interface DailyOutput {
  result: SessionResult;
  report: string;
}

function dirs(ctx: DailyContext): { stateDir: string; sessionDir: string; outDir: string } {
  return { stateDir: ctx.stateDir ?? ".seo-engine-state", sessionDir: ctx.sessionDir ?? ".seo-session", outDir: ctx.outDir ?? ".seo-daily" };
}

function today(ctx: DailyContext): string {
  return ctx.now().toISOString().slice(0, 10);
}

function ok(reason: string, extra: Partial<SessionResult> = {}): SessionResult {
  return SessionResultSchema.parse({ status: "OK", reason, ...extra });
}

/**
 * Zadanie treści w toku (zlecenie przygotowane, nieopublikowane): wtedy odtwarzamy tylko
 * `daily/`, żeby nie skasować lokalnych zmian rejestru, które utrwali dopiero `publish`.
 */
async function contentTaskInProgress(sessionDir: string): Promise<boolean> {
  try {
    const result = SessionResultSchema.parse(JSON.parse(await fs.readFile(sessionPaths(sessionDir).result, "utf8")));
    return ["TASK_READY", "CLAIMS_VERIFIED", "DRAFT_READY"].includes(result.status) || (result.status === "REJECTED" && result.retryAllowed === true);
  } catch {
    return false;
  }
}

async function restoreForReading(ctx: DailyContext): Promise<void> {
  const { stateDir, sessionDir } = dirs(ctx);
  await ctx.git.restoreState(stateDir, (await contentTaskInProgress(sessionDir)) ? DAILY_ONLY : undefined);
}

function queueLine(item: QueueItem): string {
  return `- [${item.status}] ${item.priority} ${item.kind} \`${item.target}\` — ${item.title}${item.prUrl ? ` (${item.prUrl})` : ""} [id: ${item.id}]`;
}

// ── status --sync ─────────────────────────────────────────────────────────────

/** Stan pracy: propozycje, kolejka, dziennik; z `sync` — PR scalony → done, zamknięty → rejected. */
export async function dailyStatus(ctx: DailyContext, options: { sync?: boolean } = {}): Promise<DailyOutput> {
  const { stateDir } = dirs(ctx);
  await restoreForReading(ctx);
  const changes: string[] = [];
  const warnings: string[] = [];
  if (options.sync) {
    let repository: GitHubRepository | null = null;
    try {
      repository = parseGitHubRemote(await ctx.git.remoteUrl());
    } catch (error) {
      warnings.push(`Nie rozpoznano repozytorium GitHub: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const item of await readQueue(stateDir)) {
      if (!repository || item.status !== "pending_review" || !item.prUrl) continue;
      const number = pullRequestNumberFromUrl(item.prUrl);
      if (!number) continue;
      try {
        const pr = await ctx.gh.getPullRequest({ ...repository, number });
        if (pr.merged) {
          await setQueueStatus(stateDir, item.id, "done", ctx.now(), { note: `PR #${number} scalony przez właściciela.` });
          changes.push(`${item.id}: done (PR #${number} scalony)`);
        } else if (pr.state === "closed") {
          await setQueueStatus(stateDir, item.id, "rejected", ctx.now(), { note: `PR #${number} zamknięty bez scalenia — nie wracamy do tematu bez nowego dowodu.` });
          changes.push(`${item.id}: rejected (PR #${number} zamknięty)`);
        }
      } catch (error) {
        warnings.push(`PR #${number}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (changes.length > 0) await ctx.git.persistState(stateDir, `SEO daily: synchronizacja PR (${changes.length})`, DAILY_ONLY);
  }

  const queue = await readQueue(stateDir);
  const journal = await readJournal(stateDir);
  const proposals = await ctx.git.listProposalBranches();
  const count = (status: QueueItem["status"]) => queue.filter((item) => item.status === status).length;
  const active = queue.filter((item) => item.status === "in_progress" || item.status === "pending_review");
  const todo = queue.filter((item) => item.status === "todo").sort((left, right) => right.priority - left.priority).slice(0, 10);
  const recent = [...journal].sort((left, right) => right.date.localeCompare(left.date) || right.runId.localeCompare(left.runId)).slice(0, 3);
  const lines = [
    `# Stan pracy SEO (${today(ctx)})`,
    "",
    `Otwarte gałęzie propozycji: ${proposals.length}${proposals.length > 0 ? ` — ${proposals.map((branch) => branch.branch).join(", ")}` : ""}`,
    `Kolejka: w toku ${count("in_progress")}, w przeglądzie ${count("pending_review")}, do zrobienia ${count("todo")}, zamknięte ${count("done") + count("rejected") + count("do_not_redo")}`,
  ];
  if (options.sync) lines.push(`Synchronizacja PR: ${changes.length > 0 ? changes.join("; ") : "bez zmian"}`);
  for (const warning of warnings) lines.push(`Uwaga: ${warning}`);
  lines.push("", "## W toku i w przeglądzie", "", ...(active.length > 0 ? active.map(queueLine) : ["- brak"]));
  lines.push("", "## Do zrobienia (najwyższy priorytet)", "", ...(todo.length > 0 ? todo.map(queueLine) : ["- brak"]));
  lines.push("", "## Ostatnie sesje", "");
  if (recent.length === 0) lines.push("- brak wpisów w dzienniku (pierwsza sesja)");
  for (const entry of recent) {
    lines.push(`- ${entry.date} (${entry.gsc.freshness}): ${entry.summary}`);
    for (const task of entry.tasks) lines.push(`  - ${task.kind} \`${task.target}\`: ${task.outcome}${task.prUrl ? ` — ${task.prUrl}` : ""}`);
    for (const step of entry.nextSteps) lines.push(`  - dalej: ${step}`);
  }
  return {
    result: ok(`Stan: ${count("todo")} tematów do zrobienia, ${count("pending_review")} w przeglądzie.`, { proposalBranches: proposals.map((branch) => branch.branch) }),
    report: `${lines.join("\n")}\n`,
  };
}

// ── gsc ───────────────────────────────────────────────────────────────────────

export interface GscSearchOptions {
  explicitDir?: string;
  env?: Readonly<Record<string, string | undefined>>;
  cwd?: string;
  mainCheckout?: string | null;
  home?: string;
}

/** Katalogi z eksportami GSC w kolejności: wskazany, $SEO_GSC_INBOX, seo-private (główny katalog i bieżący), Pobrane. */
export function gscSearchDirs(options: GscSearchOptions = {}): string[] {
  if (options.explicitDir) return [path.resolve(options.explicitDir)];
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? os.homedir();
  const result: string[] = [];
  if (env.SEO_GSC_INBOX) result.push(env.SEO_GSC_INBOX);
  for (const root of [options.mainCheckout, cwd]) {
    if (!root) continue;
    result.push(path.join(root, "seo-private", "gsc-inbox"), path.join(root, "seo-private", "gsc"));
  }
  result.push(path.join(home, "Downloads"), path.join(home, "Pobrane"));
  return [...new Set(result.map((directory) => path.resolve(directory)))];
}

/** Najnowszy eksport z oceną świeżości względem dnia sesji (null, gdy brak). */
export function newestGscExport(directories: readonly string[], day: string): { candidate: GscExportCandidate; loaded: LoadedGscExport; ageDays: number } | null {
  for (const candidate of findGscExports(directories)) {
    try {
      const inputs = loadGscExport(candidate);
      const freshness = gscFreshness(candidate.dataEnd, day);
      return { candidate, loaded: { inputs, dataEnd: candidate.dataEnd, exact: candidate.dataEndExact, freshness: freshness.verdict }, ageDays: freshness.ageDays };
    } catch {
      // Uszkodzony albo niepełny eksport — próbujemy następnego.
    }
  }
  return null;
}

const FRESHNESS_ADVICE: Record<string, string> = {
  fresh: "Dane świeże — decyzje „pod popyt” są uzasadnione.",
  aging: "Dane starzejące się — traktuj je jako wskazówkę trendu i poproś właściciela o nowy eksport.",
  stale: "Dane przestarzałe — nie podejmuj decyzji „pod popyt”; pracuj nad świeżością faktów, kolejką i jakością, poproś o eksport.",
};

export async function dailyGsc(ctx: DailyContext, directories: readonly string[]): Promise<DailyOutput> {
  const { outDir } = dirs(ctx);
  const day = today(ctx);
  const newest = newestGscExport(directories, day);
  if (!newest) {
    return {
      result: ok("Nie znaleziono eksportu GSC."),
      report: [
        "# Eksport GSC",
        "",
        "Nie znaleziono eksportu GSC (ZIP albo folder z Zapytania.csv/Queries.csv i Strony.csv/Pages.csv).",
        `Szukano w: ${directories.join("; ")}`,
        "",
        "Poproś właściciela: Search Console → Skuteczność → Wyniki wyszukiwania → Eksportuj → Pobierz CSV (plik zostaje w Pobranych).",
        "Do tego czasu nie podejmuj decyzji „pod popyt”: pracuj nad świeżością faktów i kolejką.",
        "",
      ].join("\n"),
    };
  }
  const { candidate, loaded, ageDays } = newest;
  const meta = { source: "export" as const, dataEnd: loaded.dataEnd, exact: loaded.exact, freshness: loaded.freshness };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, "gsc.json"),
    `${JSON.stringify({ path: candidate.path, kind: candidate.kind, exportedAt: candidate.exportedAt, rangeLabel: candidate.rangeLabel, comparison: candidate.comparison, ageDays, ...meta }, null, 2)}\n`,
    "utf8",
  );
  const others = findGscExports(directories).filter((other) => other.path !== candidate.path).slice(0, 4);
  const pageRows = Math.max(0, loaded.inputs.pages.split(/\r?\n/).filter(Boolean).length - 1);
  const queryRows = Math.max(0, loaded.inputs.queries.split(/\r?\n/).filter(Boolean).length - 1);
  return {
    result: ok(`Eksport GSC do ${loaded.dataEnd} (${loaded.freshness}).`, { gsc: meta }),
    report: [
      "# Eksport GSC",
      "",
      `Plik: ${candidate.path} (${candidate.kind}${candidate.comparison ? ", tryb porównania okresów — biorę okres bieżący" : ""})`,
      `Zakres: ${candidate.rangeLabel ?? "nieznany (brak Filtry.csv)"}; wyeksportowano: ${candidate.exportedAt.slice(0, 16).replace("T", " ")} UTC`,
      `Koniec danych: ${loaded.dataEnd}${loaded.exact ? " (dokładnie — z pliku z datami)" : " (szacunek: data eksportu minus 2 dni)"}; wiek: ${ageDays} dni → ${loaded.freshness}`,
      `Wiersze: strony ${pageRows}, zapytania ${queryRows}`,
      FRESHNESS_ADVICE[loaded.freshness],
      ...(others.length > 0 ? ["", "Starsze eksporty (pominięte):", ...others.map((other) => `- ${other.path} — dane do ${other.dataEnd}`)] : []),
      "",
    ].join("\n"),
  };
}

// ── plan ──────────────────────────────────────────────────────────────────────

export interface PlanDependencies {
  inventory: SiteInventory;
  store: ContentStore;
  gsc: { loaded: LoadedGscExport; label: string } | null;
  loadBacklog: () => Promise<GscCsvInputs>;
  top?: number;
}

export async function dailyPlan(ctx: DailyContext, deps: PlanDependencies): Promise<DailyOutput> {
  const { stateDir, outDir } = dirs(ctx);
  await restoreForReading(ctx);
  const now = ctx.now();
  const queue = await readQueue(stateDir);
  const documents = await deps.store.listDocuments();
  const pending = await new Ledger({ stateDir, now: ctx.now }).pendingTargets(now, PENDING_PROPOSAL_DAYS);
  for (const target of proposalPendingTargets(await ctx.git.listProposalBranches(), deps.inventory)) pending.add(target);
  const gsc = deps.gsc
    ? { inputs: deps.gsc.loaded.inputs, freshness: deps.gsc.loaded.freshness }
    : { inputs: await deps.loadBacklog(), freshness: "backlog" as const };
  const plan = buildPlan({ today: now, inventory: deps.inventory, documents, gsc, queue, pending });
  const source = deps.gsc
    ? `eksport GSC ${deps.gsc.label}, dane do ${deps.gsc.loaded.dataEnd}${deps.gsc.loaded.exact ? "" : " (szacunek)"} — ${deps.gsc.loaded.freshness}`
    : "brak eksportu GSC — kolejka możliwości z repo (dane historyczne, waga obniżona)";
  const header = [`Dzień: ${today(ctx)}`, `Źródło popytu: ${source}`, `Kandydaci: ${plan.candidates.length}; pominięci: ${plan.excluded.length}`];
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "plan.md"), renderPlanMarkdown(plan, header), "utf8");
  await fs.writeFile(path.join(outDir, "plan.json"), `${JSON.stringify({ day: today(ctx), source, ...plan }, null, 2)}\n`, "utf8");
  const top = plan.candidates.slice(0, deps.top ?? 8);
  return {
    result: ok(`Plan: ${plan.candidates.length} kandydatów.`),
    report: [
      "# Plan sesji (według dowodów)",
      "",
      ...header,
      "",
      ...top.map((candidate, index) => `${index + 1}. [${candidate.priority}] ${candidate.kind} \`${candidate.target}\` — ${candidate.why} Dowody: ${candidate.evidence}${candidate.queueId ? ` [kolejka: ${candidate.queueId}]` : ""}`),
      ...(top.length === 0 ? ["Brak kandydatów z dowodem wartości — dzień bez zmian w treści jest poprawnym wynikiem."] : []),
      "",
      `Pełny plan: ${path.join(outDir, "plan.md")} (lokalnie, poza gitem).`,
      "",
    ].join("\n"),
  };
}

// ── kolejka ───────────────────────────────────────────────────────────────────

export interface QueueAddInput {
  id?: string;
  kind: string;
  target: string;
  title: string;
  why: string;
  source?: string;
  priority?: number;
  status?: string;
  note?: string;
}

export function queueIdFor(kind: string, target: string): string {
  const slug = `${kind}-${target}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 80).replace(/-+$/g, "");
}

export async function dailyQueueList(ctx: DailyContext, status?: string): Promise<DailyOutput> {
  const { stateDir } = dirs(ctx);
  await ctx.git.restoreState(stateDir, DAILY_ONLY);
  const filter = status ? QueueStatusSchema.parse(status) : null;
  const items = (await readQueue(stateDir)).filter((item) => !filter || item.status === filter).sort((left, right) => right.priority - left.priority);
  return {
    result: ok(`Kolejka: ${items.length} pozycji${filter ? ` o statusie ${filter}` : ""}.`),
    report: `# Kolejka tematów\n\n${items.length > 0 ? items.map(queueLine).join("\n") : "- pusta"}\n`,
  };
}

export async function dailyQueueAdd(ctx: DailyContext, input: QueueAddInput): Promise<DailyOutput> {
  const { stateDir } = dirs(ctx);
  await ctx.git.restoreState(stateDir, DAILY_ONLY);
  const kind = QueueKindSchema.parse(input.kind);
  const candidate = QueueItemSchema.pick({ id: true, kind: true, target: true, title: true, why: true, source: true, priority: true }).parse({
    id: input.id ?? queueIdFor(kind, input.target),
    kind,
    target: input.target,
    title: input.title,
    why: input.why,
    source: input.source ?? "session",
    priority: input.priority ?? 50,
  });
  const status = input.status ? QueueStatusSchema.parse(input.status) : undefined;
  const outcome = await upsertQueueItem(stateDir, { ...candidate, ...(status ? { status } : {}), ...(input.note ? { notes: [input.note] } : {}) }, ctx.now());
  if (outcome.blockedByClosed) {
    return {
      result: ok(`Temat ${outcome.item.id} jest zamknięty (${outcome.item.status}) — nie otwieram go ponownie.`),
      report: `Temat zamknięty, bez zmian:\n${queueLine(outcome.item)}\n`,
    };
  }
  await ctx.git.persistState(stateDir, `SEO daily: kolejka ${outcome.created ? "+" : "~"} ${outcome.item.id}`, DAILY_ONLY);
  return {
    result: ok(`${outcome.created ? "Dodano" : "Zaktualizowano"} ${outcome.item.id}.`),
    report: `${queueLine(outcome.item)}\n`,
  };
}

export async function dailyQueueSet(ctx: DailyContext, id: string, input: { status: string; prUrl?: string; note?: string }): Promise<DailyOutput> {
  const { stateDir } = dirs(ctx);
  await ctx.git.restoreState(stateDir, DAILY_ONLY);
  const item = await setQueueStatus(stateDir, id, QueueStatusSchema.parse(input.status), ctx.now(), { prUrl: input.prUrl, note: input.note });
  await ctx.git.persistState(stateDir, `SEO daily: kolejka ${id} → ${item.status}`, DAILY_ONLY);
  return { result: ok(`${id} → ${item.status}.`), report: `${queueLine(item)}\n` };
}

export async function dailyQueueRemove(ctx: DailyContext, id: string): Promise<DailyOutput> {
  const { stateDir } = dirs(ctx);
  await ctx.git.restoreState(stateDir, DAILY_ONLY);
  const removed = await removeQueueItem(stateDir, id);
  await ctx.git.persistState(stateDir, `SEO daily: kolejka − ${id}`, DAILY_ONLY);
  return { result: ok(`Usunięto ${id} z kolejki.`), report: `Usunięto: ${queueLine(removed)}\n` };
}

// ── dziennik ──────────────────────────────────────────────────────────────────

/** Dopisuje wpis dziennika z pliku JSON (data i runId uzupełniane, gdy ich brak). */
export async function dailyJournal(ctx: DailyContext, file: string): Promise<DailyOutput> {
  const { stateDir } = dirs(ctx);
  const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
  const day = typeof raw.date === "string" ? raw.date : today(ctx);
  const entry = JournalEntrySchema.parse({ ...raw, date: day, runId: typeof raw.runId === "string" ? raw.runId : `daily-${day}-${randomUUID().slice(0, 8)}` });
  await ctx.git.restoreState(stateDir, DAILY_ONLY);
  await appendJournal(stateDir, entry);
  await ctx.git.persistState(stateDir, `SEO daily: dziennik ${entry.date}`, DAILY_ONLY);
  return {
    result: ok(`Zapisano wpis dziennika ${entry.date} (${entry.runId}).`),
    report: `Dziennik: ${entry.date} — ${entry.summary}\n`,
  };
}
