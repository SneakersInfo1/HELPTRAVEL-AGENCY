import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";

import type { GateReport, PublishMode } from "@/lib/content-quality/gate";
import {
  SEO_GSC_SERVICE_ACCOUNT_JSON,
  SEO_GSC_SITE_URL,
  fetchGscExport,
  toGscCsvInputs,
} from "@/lib/seo-ops/gsc/api-client";

import { Ledger, idempotencyKey } from "../ledger";
import {
  MAX_REGISTERED_SOURCES,
  PENDING_PROPOSAL_DAYS,
  SOURCE_EXCERPT_CHARS,
  buildDocument,
  collect,
  contentTypeFor,
  idForTask,
  noMaterialGate,
  parseCandidateClaims,
  prefetchRegisteredSources,
  researcherInstructions,
  select,
  verify,
  verifyCandidateClaims,
  writerInstructions,
  type CollectedInput,
  type GscCsvInputs,
  type PrefetchedSources,
  type ResearchResult,
  type Task,
} from "../pipeline";
import { ContentDocumentSchema, POLICY_VERSION, isClaimFresh } from "../schema";
import { RENDERED_CONTENT_TYPES } from "../site-content";
import { SOURCE_ALLOWLIST, type SourceFetchResult, type SourceFetcher } from "../sources";
import { NODE_FS, type ContentStore, type FsLike } from "../store";
import type { SiteInventory } from "../inventory";
import { backlogCsvToGscInputs, DEFAULT_BACKLOG_FILE, missingBacklogMessage } from "./backlog";
import type { CreatedPullRequest, CreatePullRequestInput, GitHubRepository } from "./github";
import { parseGitHubRemote } from "./github";
import { isProtectedPath, parsePorcelainZ, type ClaimDayResult, type ProposalBranch, type SessionChanges, type StateClaim, type StateFolder } from "./git-state";
import type { FreshnessVerdict } from "./gsc-export";
import { indexPolicyHits } from "./index-guard";
import { assertPublicPrText, gscDataHits } from "./public-text";
import {
  DraftBodySchema,
  ResearchFileSchema,
  SessionResultSchema,
  WorkOrderSchema,
  sessionPaths,
  type SessionPaths,
  type SessionResult,
  type WorkOrder,
} from "./work-order";

export type SessionGscSource = "auto" | "export" | "api" | "backlog";

/** Eksport GSC wczytany w pamięci (session/gsc-export.ts) z opisem wieku danych. */
export interface LoadedGscExport {
  inputs: GscCsvInputs;
  dataEnd: string;
  exact: boolean;
  freshness: FreshnessVerdict;
}

export interface SessionGit {
  readonly stateBranch: string;
  useStateBranch(branch: string): void;
  restoreState(stateDir: string, folders?: readonly StateFolder[]): Promise<void>;
  claimDay(day: string, runId: string): Promise<ClaimDayResult>;
  persistState(stateDir: string, message: string, folders?: readonly StateFolder[]): Promise<void>;
  listProposalBranches(): Promise<ProposalBranch[]>;
  listClaims(limit?: number): Promise<StateClaim[]>;
  statusPorcelain(): Promise<string>;
  remoteUrl(): Promise<string>;
  createAndPushProposalBranch(branch: string, message: string, paths?: readonly string[]): Promise<void>;
  currentBranch(): Promise<string>;
  changesSinceBase(base: string): Promise<SessionChanges>;
}

export interface SessionGitHub {
  createPullRequest(input: CreatePullRequestInput): Promise<CreatedPullRequest>;
  addLabels(input: GitHubRepository & { issueNumber: number; labels: readonly string[] }): Promise<boolean>;
}

export interface SessionDependencies {
  fs?: FsLike;
  sourceFetcher: SourceFetcher;
  inventory: SiteInventory;
  store: ContentStore;
  git: SessionGit;
  gh: SessionGitHub;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  randomUUID?: () => string;
  sessionDir?: string;
  stateDir?: string;
  backlogFile?: string;
  loadBacklog?: () => Promise<GscCsvInputs>;
  loadGscApi?: (scheduledAt: Date) => Promise<GscCsvInputs>;
  /** Najnowszy lokalny eksport GSC (CSV z interfejsu) albo null, gdy go nie ma. */
  loadGscExport?: () => LoadedGscExport | null;
}

export interface PrepareOptions {
  date?: string;
  base?: string;
  stateBranch?: string;
  gscSource?: SessionGscSource;
  maxOpen?: number;
  /** Cel wybrany przez sesję z planu (`pnpm seo:daily plan`). */
  target?: string;
  /** Druga sesja tego samego dnia: bez rezerwacji dnia (rejestr zadań nadal chroni przed duplikatem). */
  again?: boolean;
}

export interface FinalizeOptions {
  mode?: PublishMode;
}

export interface PublishOptions {
  base?: string;
  /** Dołącz zmiany w kodzie (poza `content/seo/`), z wyjątkiem plików chronionych. */
  withCode?: boolean;
  /** Opis pracy sesji dopisywany do opisu PR (zadania, dowody bez liczb GSC, testy). */
  extraBody?: string;
}

/** PR z samymi zmianami kodu (bez dokumentu treści), np. linkowanie wewnętrzne. */
export interface CodePublishOptions {
  base: string;
  title: string;
  body: string;
}

const SESSION_BRANCH = /^claude\/seo-daily\/\d{4}-\d{2}-\d{2}(?:-\d+)?$/;

/**
 * Foldery rejestru zadań. `daily/` (kolejka, dziennik) utrwalają wyłącznie polecenia daily,
 * każde zaraz po zmianie — publikacja nie może nadpisać ich starszą kopią z `prepare`.
 */
const LEDGER_FOLDERS: readonly StateFolder[] = ["idempotency", "pending", "dead-letter"];

/** Zadanie treści, którego dokument czeka na publikację — nowe `prepare` by go nadpisało. */
const CONTENT_AWAITING_PUBLISH = "DRAFT_READY";

function isWorkDir(file: string): boolean {
  return file.startsWith(".seo-session/") || file.startsWith(".seo-engine-state/") || file.startsWith(".seo-daily/");
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function zodErrors(error: unknown): string[] {
  if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
  return [safeMessage(error)];
}

function asDay(date: string | undefined, now: Date): { day: string; scheduledAt: Date } {
  const day = date ?? now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("--date wymaga formatu YYYY-MM-DD.");
  const scheduledAt = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.toISOString().slice(0, 10) !== day) throw new Error(`Nieprawidłowy dzień: ${day}`);
  return { day, scheduledAt };
}

function killSwitch(env: Readonly<Record<string, string | undefined>>): boolean {
  return ["1", "true"].includes((env.SEO_ENGINE_KILL_SWITCH ?? "").trim().toLowerCase());
}

function taskKey(task: Task, day: string): string {
  return idempotencyKey({ day, target: task.target, operation: task.operation, policyVersion: POLICY_VERSION, modeClass: "publishing" });
}

function branchWithinDays(branch: ProposalBranch, day: string, days: number): boolean {
  const current = new Date(`${day}T00:00:00.000Z`).getTime();
  const candidate = new Date(`${branch.day}T00:00:00.000Z`).getTime();
  const age = current - candidate;
  return age >= 0 && age < days * 86_400_000;
}

export function proposalPendingTargets(branches: readonly ProposalBranch[], inventory: SiteInventory): Set<string> {
  const result = new Set<string>();
  for (const branch of branches) {
    result.add(`/inspiracje/${branch.slug}`);
    for (const existing of inventory.existing()) {
      const pseudoTask: Task = {
        operation: "refresh",
        target: existing.canonicalUrl,
        primaryQuery: existing.title,
        evidence: { source: "page", key: existing.canonicalUrl, clicks: 0, impressions: 0, ctr: 0, position: 0 },
        rationale: "dopasowanie otwartej propozycji",
      };
      if (idForTask(pseudoTask) === branch.slug) result.add(existing.canonicalUrl);
    }
  }
  return result;
}

function routeOfKey(raw: string): string {
  try {
    return new URL(raw, "https://helptravel.pl").pathname.replace(/\/$/, "") || "/";
  } catch {
    return raw;
  }
}

/**
 * Zadanie dla adresu wybranego przez sesję z planu. Reguły jak w `select`: adres istnieje,
 * jego typ dokumentu jest renderowany, nie czeka w przeglądzie i nie ma aktualnego dokumentu.
 * Dowody GSC są opcjonalne (np. odświeżenie faktów albo temat z kolejki).
 */
export function taskForTarget(
  target: string,
  collected: CollectedInput,
  inventory: SiteInventory,
  pending: ReadonlySet<string>,
): { task: Task } | { reason: string } {
  const route = routeOfKey(target);
  const existing = inventory.existing().find((item) => item.canonicalUrl === route);
  if (!existing) return { reason: `Adres ${route} nie istnieje w serwisie.` };
  if (pending.has(route)) return { reason: `Propozycja dla ${route} czeka na przegląd.` };
  const task: Task = {
    operation: "refresh",
    target: route,
    primaryQuery: existing.title,
    evidence: { source: "page", key: route, clicks: 0, impressions: 0, ctr: 0, position: 0 },
    rationale: "Cel wybrany przez sesję z planu (dowody w planie sesji).",
  };
  if (!RENDERED_CONTENT_TYPES.has(contentTypeFor(task))) return { reason: `Typ dokumentu dla ${route} nie jest renderowany w serwisie.` };
  const enrichmentClaims = inventory.enrichmentClaims?.(route) ?? [];
  const enrichmentFresh = inventory.hasEnrichment(route) && (enrichmentClaims.length === 0 || enrichmentClaims.every((claim) => isClaimFresh(claim, new Date())));
  if (enrichmentFresh) return { reason: `Adres ${route} ma już aktualny dokument ze źródłami.` };
  const row = collected.pages.rows.find((candidate) => routeOfKey(candidate.key) === route);
  if (row) task.evidence = { source: "page", key: route, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
  return { task };
}

function gateSummary(gate: GateReport): NonNullable<SessionResult["gate"]> {
  return {
    verdict: gate.verdict,
    metrics: {
      words: gate.metrics.words,
      claims: gate.metrics.claims,
      verifiedClaims: gate.metrics.verifiedClaims,
      sources: gate.metrics.sources,
      fillerHits: gate.metrics.fillerHits,
      repeatedShingleRatio: gate.metrics.repeatedShingleRatio,
    },
  };
}

export class SessionPhases {
  private readonly fs: FsLike;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly paths: SessionPaths;
  private readonly stateDir: string;
  private readonly backlogFile: string;

  constructor(private readonly deps: SessionDependencies) {
    this.fs = deps.fs ?? NODE_FS;
    this.env = deps.env ?? process.env;
    this.now = deps.now ?? (() => new Date());
    this.uuid = deps.randomUUID ?? randomUUID;
    this.paths = sessionPaths(deps.sessionDir);
    this.stateDir = deps.stateDir ?? ".seo-engine-state";
    this.backlogFile = deps.backlogFile ?? DEFAULT_BACKLOG_FILE;
  }

  private async writeJson(target: string, value: unknown): Promise<void> {
    await this.fs.mkdir(path.dirname(target), { recursive: true });
    await this.fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { flag: "w" });
  }

  private async readJson(target: string): Promise<unknown> {
    return JSON.parse(await this.fs.readFile(target, "utf8")) as unknown;
  }

  private async writeResult(value: SessionResult): Promise<SessionResult> {
    const result = SessionResultSchema.parse(value);
    await this.writeJson(this.paths.result, result);
    return result;
  }

  private async failed(error: unknown, context?: Pick<SessionResult, "runId" | "day">): Promise<SessionResult> {
    return this.writeResult({ status: "FAILED", ...context, errors: [safeMessage(error)], reason: "Faza sesji zakończyła się błędem." });
  }

  private async readBacklog(): Promise<string> {
    try {
      return await this.fs.readFile(this.backlogFile, "utf8");
    } catch (error) {
      if (isMissing(error)) throw new Error(missingBacklogMessage(this.backlogFile));
      throw error;
    }
  }

  private async workOrder(): Promise<WorkOrder> {
    return WorkOrderSchema.parse(await this.readJson(this.paths.workOrder));
  }

  private ledger(workOrder: Pick<WorkOrder, "runId">): Ledger {
    return new Ledger({ stateDir: this.stateDir, runId: workOrder.runId, fs: this.fs, now: this.now });
  }

  private async gsc(source: SessionGscSource, scheduledAt: Date): Promise<{ inputs: GscCsvInputs; meta: NonNullable<SessionResult["gsc"]> }> {
    const hasApi = Boolean(this.env[SEO_GSC_SERVICE_ACCOUNT_JSON] && this.env[SEO_GSC_SITE_URL]);
    const exported = source === "auto" || source === "export" ? (this.deps.loadGscExport?.() ?? null) : null;
    if (source === "export" && !exported) throw new Error("Nie znaleziono eksportu GSC (CSV z interfejsu). Zobacz `pnpm seo:daily gsc`.");
    if (exported) {
      return { inputs: exported.inputs, meta: { source: "export", dataEnd: exported.dataEnd, exact: exported.exact, freshness: exported.freshness } };
    }
    const selected = source === "auto" ? (hasApi ? "api" : "backlog") : source;
    if (selected === "backlog") {
      const inputs = this.deps.loadBacklog ? await this.deps.loadBacklog() : backlogCsvToGscInputs(await this.readBacklog());
      return { inputs, meta: { source: "backlog", dataEnd: null, exact: false, freshness: "backlog" } };
    }
    if (!hasApi) throw new Error(`Dla źródła GSC api ustaw ${SEO_GSC_SERVICE_ACCOUNT_JSON} i ${SEO_GSC_SITE_URL}.`);
    const end = new Date(scheduledAt);
    end.setUTCDate(end.getUTCDate() - 3);
    const meta = { source: "api" as const, dataEnd: end.toISOString().slice(0, 10), exact: true, freshness: "fresh" as const };
    if (this.deps.loadGscApi) return { inputs: await this.deps.loadGscApi(scheduledAt), meta };
    const inputs = toGscCsvInputs(
      await fetchGscExport({
        siteUrl: this.env[SEO_GSC_SITE_URL]!,
        serviceAccountJson: this.env[SEO_GSC_SERVICE_ACCOUNT_JSON]!,
        endDate: meta.dataEnd,
        includePageQuery: false,
      }),
    );
    return { inputs, meta };
  }

  async prepare(options: PrepareOptions = {}): Promise<SessionResult> {
    const runId = this.uuid();
    let day: string | undefined;
    try {
      const scheduled = asDay(options.date, this.now());
      day = scheduled.day;
      if (killSwitch(this.env) || (await this.deps.store.killSwitchExists())) {
        return this.writeResult({ status: "KILLED", runId, day, reason: "Kill switch zatrzymał przebieg przed odtworzeniem stanu i claimem dnia." });
      }

      const awaiting = await this.awaitingPublish();
      if (awaiting) {
        // Bez zapisu result.json: stan DRAFT_READY musi zostać, żeby dało się opublikować.
        return SessionResultSchema.parse({
          status: "FAILED",
          runId: awaiting.runId,
          day: awaiting.day,
          reason:
            "Dokument poprzedniego zadania czeka na publikację (DRAFT_READY). Najpierw `pnpm seo:daily publish`, " +
            "albo porzuć go: przywróć `content/seo/` (`git restore content/seo && git clean -fd content/seo`) i `pnpm seo:daily release --run " +
            `${awaiting.runId ?? "<runId>"}\`.`,
        });
      }
      if (options.stateBranch) this.deps.git.useStateBranch(options.stateBranch);
      await this.deps.git.restoreState(this.stateDir);
      const proposalBranches = await this.deps.git.listProposalBranches();
      const maxOpen = options.maxOpen ?? 3;
      if (!Number.isInteger(maxOpen) || maxOpen < 1) throw new Error("maxOpen musi być dodatnią liczbą całkowitą.");
      const recent = proposalBranches.filter((branch) => branchWithinDays(branch, day!, 14));
      if (recent.length >= maxOpen) {
        return this.writeResult({
          status: "NO_TASK",
          runId,
          day,
          reason: `Propozycje czekają na przegląd (${recent.length}/${maxOpen}).`,
          proposalBranches: recent.map((branch) => branch.branch),
        });
      }

      const gsc = await this.gsc(options.gscSource ?? "auto", scheduled.scheduledAt);
      const collected = collect(gsc.inputs, this.deps.inventory);
      const ledger = new Ledger({ stateDir: this.stateDir, runId, fs: this.fs, now: this.now });
      const pending = await ledger.pendingTargets(scheduled.scheduledAt, PENDING_PROPOSAL_DAYS);
      for (const target of proposalPendingTargets(proposalBranches, this.deps.inventory)) pending.add(target);
      let task: Task | undefined;
      if (options.target) {
        const chosen = taskForTarget(options.target, collected, this.deps.inventory, pending);
        if ("reason" in chosen) return this.writeResult({ status: "NO_TASK", runId, day, reason: chosen.reason, gsc: gsc.meta });
        task = chosen.task;
      } else {
        const selection = select(collected, this.deps.inventory, scheduled.scheduledAt, pending, RENDERED_CONTENT_TYPES);
        task = selection.tasks.find((candidate) => candidate.decision !== "REVIEW_REQUIRED");
        if (!task) {
          if (selection.tasks.some((candidate) => candidate.decision === "REVIEW_REQUIRED")) {
            return this.writeResult({ status: "REVIEW_REQUIRED", runId, day, reason: selection.reason, gsc: gsc.meta });
          }
          return this.writeResult({ status: "NO_TASK", runId, day, reason: selection.reason, gsc: gsc.meta });
        }
      }

      // Dzień rezerwujemy dopiero dla wybranego zadania: odrzucony cel albo brak zadania
      // nie zużywają dnia, a sesja może od razu spróbować innego celu z planu.
      if (!options.again) {
        const claimed = await this.deps.git.claimDay(day, runId);
        if (claimed.status === "duplicate") {
          return this.writeResult({
            status: "DUPLICATE_SKIPPED",
            runId,
            day,
            reason: `Dzień przejął już przebieg ${claimed.previous.runId}. Drugie zadanie treści tego dnia: --again.`,
          });
        }
      }

      const begin = await ledger.begin(taskKey(task, day), runId);
      if (begin.status === "duplicate") {
        return this.writeResult({ status: "DUPLICATE_SKIPPED", runId, day, reason: `Zadanie rozpoczął już przebieg ${begin.previous.runId}.` });
      }

      const documents = await this.deps.store.listDocuments();
      const previousDocument = documents.find((document) => document.canonicalUrl === task.target) ?? null;
      const prefetched = await prefetchRegisteredSources(task, this.deps.sourceFetcher);
      await this.fs.mkdir(this.paths.sources, { recursive: true });
      try {
        for (const name of await this.fs.readdir(this.paths.sources)) {
          if (name.endsWith(".txt")) await this.fs.rm(path.join(this.paths.sources, name), { force: true });
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
      }

      const registeredSources: WorkOrder["registeredSources"] = [];
      for (let index = 0; index < prefetched.registeredSources.length; index += 1) {
        const source = prefetched.registeredSources[index];
        let textFile: string | null = null;
        if (source.aiInput && source.status !== null && source.status >= 200 && source.status < 300 && source.text) {
          const name = `${String(index + 1).padStart(2, "0")}.txt`;
          textFile = path.join("sources", name).replace(/\\/g, "/");
          await this.fs.writeFile(path.join(this.paths.root, textFile), source.text, { flag: "w" });
        }
        registeredSources.push({
          url: source.url,
          publisher: source.publisher,
          covers: source.covers,
          aiInput: source.aiInput,
          status: source.status,
          textFile,
        });
      }

      const workOrder = WorkOrderSchema.parse({
        runId,
        day,
        scheduledAt: scheduled.scheduledAt.toISOString(),
        baseBranch: options.base ?? "main",
        stateBranch: this.deps.git.stateBranch,
        task,
        contentType: contentTypeFor(task),
        docId: idForTask(task),
        internalLinkTargets: task.evidence.internalLinkTargets ?? [],
        previousDocument,
        registeredSources,
        curatedClaims: prefetched.curatedClaims,
        allowedSourceDomains: [...SOURCE_ALLOWLIST],
        instructions: { researcher: researcherInstructions(task), writer: writerInstructions(task) },
        limits: { maxRegisteredSources: MAX_REGISTERED_SOURCES, sourceExcerptChars: SOURCE_EXCERPT_CHARS, maxDraftRepairs: 1 },
      });
      await this.writeJson(this.paths.workOrder, workOrder);
      return this.writeResult({ status: "TASK_READY", runId, day, reason: `Przygotowano zlecenie dla ${task.target}.`, gsc: gsc.meta });
    } catch (error) {
      return this.failed(error, { runId, ...(day ? { day } : {}) });
    }
  }

  private async awaitingPublish(): Promise<SessionResult | null> {
    try {
      const current = SessionResultSchema.parse(await this.readJson(this.paths.result));
      return current.status === CONTENT_AWAITING_PUBLISH ? current : null;
    } catch {
      return null;
    }
  }

  private async prefetchedFromWorkOrder(workOrder: WorkOrder): Promise<PrefetchedSources> {
    const fetchedByUrl = new Map<string, SourceFetchResult | null>();
    for (const source of workOrder.registeredSources) {
      if (source.textFile) {
        const text = await this.fs.readFile(path.join(this.paths.root, source.textFile), "utf8");
        fetchedByUrl.set(source.url, {
          url: source.url,
          status: source.status ?? 200,
          text,
          retrievedAt: workOrder.scheduledAt,
        });
      } else if (source.status === null || source.status < 200 || source.status >= 300) {
        fetchedByUrl.set(source.url, null);
      }
    }
    return {
      registeredSources: workOrder.registeredSources.map((source) => ({
        ...source,
        text: null,
        retrievedAt: source.status === null ? null : workOrder.scheduledAt,
      })),
      curatedClaims: workOrder.curatedClaims,
      fetchedByUrl,
    };
  }

  async verifyClaims(): Promise<SessionResult> {
    let workOrder: WorkOrder | undefined;
    try {
      workOrder = await this.workOrder();
      this.deps.git.useStateBranch(workOrder.stateBranch);
      const submitted = parseCandidateClaims(await this.readJson(this.paths.candidates));
      const prefetched = await this.prefetchedFromWorkOrder(workOrder);
      const research = await verifyCandidateClaims([...workOrder.curatedClaims, ...submitted], prefetched, this.deps.sourceFetcher);
      const file = ResearchFileSchema.parse({
        claims: research.claims,
        sources: research.sources,
        candidateCount: research.candidateCount,
        droppedCount: research.droppedCount,
        unreachableCount: research.unreachableCount,
        rejected: research.rejected,
      });
      await this.writeJson(this.paths.research, file);
      if (research.claims.length === 0) {
        const blocked = research.candidateCount > 0 && research.droppedCount > 0;
        const gate = noMaterialGate(new Date(workOrder.scheduledAt), blocked, research);
        return this.writeResult({
          status: blocked ? "BLOCKED_FACTS" : "NO_VERIFIED_MATERIAL",
          runId: workOrder.runId,
          day: workOrder.day,
          reason: gate.findings[0]?.message,
          errors: research.rejected.map((item) => `${item.reason}: ${item.detail}`),
          verifiedClaims: 0,
          sources: 0,
          gate: gateSummary(gate),
        });
      }
      return this.writeResult({
        status: "CLAIMS_VERIFIED",
        runId: workOrder.runId,
        day: workOrder.day,
        verifiedClaims: research.claims.length,
        sources: research.sources.length,
        reason: `Zweryfikowano ${research.claims.length} twierdzeń z ${research.sources.length} źródeł.`,
      });
    } catch (error) {
      return this.failed(error, workOrder ? { runId: workOrder.runId, day: workOrder.day } : undefined);
    }
  }

  private async researchForFinalize(): Promise<ResearchResult> {
    const file = ResearchFileSchema.parse(await this.readJson(this.paths.research));
    const sourceTextById = new Map<string, string>();
    for (const source of file.sources) {
      try {
        const fetched = await this.deps.sourceFetcher.fetchText(source.url);
        if (fetched.status >= 200 && fetched.status < 300) sourceTextById.set(source.id, fetched.text);
      } catch {
        // Brak ponownego pobrania oznacza unverified w deterministycznym verify.
      }
    }
    return { ...file, sourceTextById };
  }

  private async finalizeAttempt(): Promise<number> {
    try {
      const previous = SessionResultSchema.parse(await this.readJson(this.paths.result));
      return (previous.finalizeAttempts ?? 0) + 1;
    } catch {
      return 1;
    }
  }

  private prBody(workOrder: WorkOrder, gate: GateReport, research: ResearchResult): string {
    const sources = research.sources.map((source) => `- ${source.url}`).join("\n");
    const metrics = gate.metrics;
    return [
      "## Cel",
      "",
      `Propozycja treści dla \`${workOrder.task.target}\` (${workOrder.contentType}), intencja: ${workOrder.task.primaryQuery}.`,
      "",
      "## Materiał źródłowy",
      "",
      `Zweryfikowane twierdzenia: ${research.claims.length}; źródła: ${research.sources.length}.`,
      sources || "- brak",
      "",
      "## Bramka jakości",
      "",
      `Werdykt: **${gate.verdict}**. Słowa: ${metrics.words}; twierdzenia: ${metrics.claims}; zweryfikowane: ${metrics.verifiedClaims}; źródła: ${metrics.sources}; wypełniacze: ${metrics.fillerHits}; powtórzenia: ${metrics.repeatedShingleRatio}.`,
      "",
      "## Zatwierdzenie",
      "",
      `Po przeglądzie uruchom: \`pnpm content:verify -- --approve ${workOrder.docId} --by "Imię Nazwisko" --write\``,
      "",
    ].join("\n");
  }

  async finalize(options: FinalizeOptions = {}): Promise<SessionResult> {
    if (options.mode === "AUTO_EVERGREEN") throw new Error("Tryb AUTO_EVERGREEN jest zabroniony w trybie sesji.");
    let workOrder: WorkOrder | undefined;
    let attempts = 1;
    try {
      workOrder = await this.workOrder();
      this.deps.git.useStateBranch(workOrder.stateBranch);
      attempts = await this.finalizeAttempt();
      const current = SessionResultSchema.parse(await this.readJson(this.paths.result));
      if (current.status === "DRAFT_READY") return current;
      if (current.status === "REJECTED" && current.retryAllowed === false) return current;

      const research = await this.researchForFinalize();
      const body = DraftBodySchema.parse(await this.readJson(this.paths.draftBody));
      const document = buildDocument(body, workOrder.task, research, workOrder.previousDocument, new Date(workOrder.scheduledAt), workOrder.runId);
      const checked = verify(document, research, this.deps.inventory, new Date(workOrder.scheduledAt), "DRAFT_AND_PR", workOrder.previousDocument);
      if (checked.decision === "REJECTED" || checked.decision === "SKIPPED_QUALITY_GATE") {
        return this.writeResult({
          status: "REJECTED",
          runId: workOrder.runId,
          day: workOrder.day,
          reason: `Bramka jakości: ${checked.gateReport.verdict}.`,
          errors: checked.gateReport.findings.map((finding) => `${finding.rule}: ${finding.message}`),
          retryAllowed: attempts < 2,
          finalizeAttempts: attempts,
          gate: gateSummary(checked.gateReport),
        });
      }

      const finalDocument = ContentDocumentSchema.parse({ ...checked.document, reviewStatus: "in_review" });
      try {
        await this.deps.store.writeDocumentsAtomically([finalDocument]);
        await this.deps.store.regenerateIndex();
        await this.ledger(workOrder).markPending(workOrder.task.target, workOrder.runId, new Date(workOrder.scheduledAt));
        await this.fs.writeFile(this.paths.prBody, this.prBody(workOrder, checked.gateReport, research), { flag: "w" });
        this.deps.store.commitLastWrite();
      } catch (error) {
        await this.deps.store.rollbackLastWrite();
        throw error;
      }
      return this.writeResult({
        status: "DRAFT_READY",
        runId: workOrder.runId,
        day: workOrder.day,
        reason: "Dokument in_review i opis PR są gotowe.",
        finalizeAttempts: attempts,
        verifiedClaims: research.claims.length,
        sources: research.sources.length,
        gate: gateSummary(checked.gateReport),
      });
    } catch (error) {
      if (!workOrder) return this.failed(error);
      const retryAllowed = attempts < 2;
      return this.writeResult({
        status: "REJECTED",
        runId: workOrder.runId,
        day: workOrder.day,
        reason: "Draft nie przeszedł walidacji.",
        errors: zodErrors(error),
        retryAllowed,
        finalizeAttempts: attempts,
      });
    }
  }

  private async persistAfterPublish(workOrder: WorkOrder, message: string): Promise<void> {
    this.deps.git.useStateBranch(workOrder.stateBranch);
    await this.deps.git.persistState(this.stateDir, message, LEDGER_FOLDERS);
  }

  /**
   * Kontrola zmian przed publikacją — wspólna dla PR z treścią i PR z kodem. Obejmuje CAŁĄ
   * gałąź sesji względem bazy (także commity zrobione w sesji): bez plików chronionych,
   * bez zmian polityki indeksowania, kod tylko na wyraźne żądanie.
   */
  private async reviewedChanges(base: string, withCode: boolean): Promise<{ changed: string[]; uncommitted: string[] }> {
    const changes = await this.deps.git.changesSinceBase(base);
    // Katalogi robocze (zlecenie, stan, plan z liczbami GSC) mogą istnieć lokalnie, ale nigdy
    // w gicie: zaindeksowane, zatwierdzone ani zmienione w historii gałęzi.
    const untracked = new Set(changes.untracked);
    const workDirInGit = changes.files.filter((file) => isWorkDir(file) && !untracked.has(file));
    if (workDirInGit.length > 0) {
      throw new Error(`Katalogi robocze sesji nie mogą trafić do gita (dane lokalne, m.in. liczby GSC): ${workDirInGit.join(", ")}`);
    }
    if (changes.tooLarge.length > 0) {
      throw new Error(`Pliki zbyt duże, żeby je sprawdzić przed publikacją: ${changes.tooLarge.join(", ")}`);
    }
    const changed = changes.files.filter((file) => !isWorkDir(file));
    const outsideContent = changed.filter((file) => !file.startsWith("content/seo/"));
    if (!withCode && outsideContent.length > 0) {
      throw new Error(`Publish odmawia zmian spoza content/seo/ (dla kodu: --with-code): ${outsideContent.join(", ")}`);
    }
    const protectedChanges = changed.filter((file) => isProtectedPath(file));
    if (protectedChanges.length > 0) throw new Error(`Publish odmawia plików chronionych (wymagają właściciela): ${protectedChanges.join(", ")}`);
    const indexHits = indexPolicyHits(changes.added.filter((line) => !isWorkDir(line.file)));
    if (indexHits.length > 0) {
      throw new Error(`Publish odmawia zmian polityki indeksowania (decyzja właściciela — zapisz w kolejce): ${indexHits.join("; ")}`);
    }
    const rawGsc = changes.added
      .filter((line) => !isWorkDir(line.file))
      .flatMap((line) => gscDataHits(line.line).map((hit) => `${line.file}: ${hit}`))
      .filter((hit) => /nagłówek eksportu|kolumny eksportu/.test(hit));
    if (rawGsc.length > 0) throw new Error(`Publish odmawia surowych eksportów GSC (repozytorium jest publiczne): ${rawGsc.slice(0, 5).join("; ")}`);
    if (changed.length === 0) throw new Error("Brak zmian do publikacji.");
    const uncommitted = parsePorcelainZ(await this.deps.git.statusPorcelain()).filter((file) => !isWorkDir(file));
    return { changed, uncommitted };
  }

  /** Odmowa PRZED wysłaniem gałęzi: bez nadpisania `result.json`, więc po poprawce można ponowić publish. */
  private refused(error: unknown, context?: Pick<SessionResult, "runId" | "day">): SessionResult {
    return SessionResultSchema.parse({
      status: "FAILED",
      ...context,
      errors: [safeMessage(error)],
      reason: "Publikacja odrzucona przed wysłaniem gałęzi — stan sesji bez zmian; popraw i uruchom ponownie.",
    });
  }

  async publish(options: PublishOptions = {}): Promise<SessionResult> {
    let workOrder: WorkOrder | undefined;
    let pushed = false;
    try {
      workOrder = await this.workOrder();
      this.deps.git.useStateBranch(workOrder.stateBranch);
      const current = SessionResultSchema.parse(await this.readJson(this.paths.result));
      if (current.status !== "DRAFT_READY") throw new Error(`Publikacja wymaga statusu DRAFT_READY, jest ${current.status}.`);

      const base = options.base ?? workOrder.baseBranch;
      const generated = await this.fs.readFile(this.paths.prBody, "utf8");
      const extra = options.extraBody?.trim();
      const body = extra ? `${generated.trimEnd()}\n\n## Praca sesji\n\n${extra}\n` : generated;
      assertPublicPrText(body, "Opis PR (--body-file)");
      const { uncommitted } = await this.reviewedChanges(base, options.withCode ?? false);
      // Sesja pracuje na gałęzi `claude/seo-daily/<dzień>…` — propozycja zostaje na niej.
      const sessionBranch = await this.deps.git.currentBranch();
      const branch = SESSION_BRANCH.test(sessionBranch) ? sessionBranch : `claude/seo-daily/${workOrder.day}-${workOrder.docId}`;
      await this.deps.git.createAndPushProposalBranch(branch, `SEO daily: propozycja ${workOrder.docId}`, uncommitted);
      pushed = true;
      const repository = parseGitHubRemote(await this.deps.git.remoteUrl());
      let pullRequest: CreatedPullRequest;
      try {
        pullRequest = await this.deps.gh.createPullRequest({
          ...repository,
          head: branch,
          base,
          title: `SEO: ${workOrder.task.primaryQuery}`,
          body,
          draft: false,
        });
      } catch (error) {
        const ledger = this.ledger(workOrder);
        const cleanupErrors: string[] = [];
        try {
          await ledger.releasePending(workOrder.runId);
        } catch (cleanupError) {
          cleanupErrors.push(`releasePending: ${safeMessage(cleanupError)}`);
        }
        try {
          await this.persistAfterPublish(workOrder, `SEO daily: PR failed ${workOrder.runId}`);
        } catch (cleanupError) {
          cleanupErrors.push(`persistState: ${safeMessage(cleanupError)}`);
        }
        return this.writeResult({
          status: "PR_FAILED",
          runId: workOrder.runId,
          day: workOrder.day,
          branch,
          reason: "Gałąź wysłano, ale utworzenie PR przez REST nie powiodło się.",
          errors: [safeMessage(error), ...cleanupErrors],
        });
      }

      try {
        await this.deps.gh.addLabels({ ...repository, issueNumber: pullRequest.number, labels: ["seo-daily"] });
      } catch {
        // Etykieta jest pomocnicza; istniejącego PR nie wolno przez nią uznać za nieudany.
      }
      await this.ledger(workOrder).complete(taskKey(workOrder.task, workOrder.day), "PR_CREATED");
      await this.persistAfterPublish(workOrder, `SEO daily: PR #${pullRequest.number}`);
      return this.writeResult({
        status: "PR_CREATED",
        runId: workOrder.runId,
        day: workOrder.day,
        branch,
        prNumber: pullRequest.number,
        prUrl: pullRequest.url,
        reason: `Utworzono PR #${pullRequest.number}.`,
      });
    } catch (error) {
      const context = workOrder ? { runId: workOrder.runId, day: workOrder.day } : undefined;
      if (!pushed) return this.refused(error, context);
      return this.failed(error, context);
    }
  }

  /**
   * PR z samymi zmianami kodu (linkowanie, deduplikacja, konwersja, technika), gdy sesja
   * nie przygotowała dokumentu treści. Te same kontrole co `publish`; gałąź musi być
   * gałęzią sesji. Nie zmienia `result.json` zadania treści.
   */
  async publishCode(options: CodePublishOptions): Promise<SessionResult> {
    let pushed = false;
    try {
      if (options.title.trim().length < 5) throw new Error("PR z kodem wymaga tytułu (--title).");
      if (options.body.trim().length < 40) throw new Error("PR z kodem wymaga opisu pracy (--body-file).");
      assertPublicPrText(options.title, "Tytuł PR (--title)", 120);
      assertPublicPrText(options.body, "Opis PR (--body-file)");
      try {
        const current = SessionResultSchema.parse(await this.readJson(this.paths.result));
        if (current.status === "DRAFT_READY") {
          throw new Error("Dokument treści czeka na publikację — użyj `publish --with-code`, żeby dołączyć kod do tego samego PR.");
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Dokument treści czeka")) throw error;
      }
      const branch = await this.deps.git.currentBranch();
      if (!SESSION_BRANCH.test(branch)) throw new Error(`Zmiany kodu publikujemy tylko z gałęzi sesji claude/seo-daily/<dzień>, jest ${branch}.`);
      const { uncommitted } = await this.reviewedChanges(options.base, true);
      await this.deps.git.createAndPushProposalBranch(branch, `SEO daily: ${options.title.trim()}`, uncommitted);
      pushed = true;
      const repository = parseGitHubRemote(await this.deps.git.remoteUrl());
      let pullRequest: CreatedPullRequest;
      try {
        pullRequest = await this.deps.gh.createPullRequest({
          ...repository,
          head: branch,
          base: options.base,
          title: `SEO: ${options.title.trim()}`,
          body: options.body,
          draft: false,
        });
      } catch (error) {
        return SessionResultSchema.parse({
          status: "PR_FAILED",
          branch,
          reason: "Gałąź wysłano, ale utworzenie PR przez REST nie powiodło się.",
          errors: [safeMessage(error)],
        });
      }
      try {
        await this.deps.gh.addLabels({ ...repository, issueNumber: pullRequest.number, labels: ["seo-daily"] });
      } catch {
        // Etykieta jest pomocnicza.
      }
      return SessionResultSchema.parse({
        status: "PR_CREATED",
        branch,
        prNumber: pullRequest.number,
        prUrl: pullRequest.url,
        reason: `Utworzono PR #${pullRequest.number}.`,
      });
    } catch (error) {
      if (!pushed) return this.refused(error);
      return SessionResultSchema.parse({ status: "FAILED", errors: [safeMessage(error)], reason: "Publikacja kodu zakończyła się błędem." });
    }
  }

  async release(runId: string): Promise<SessionResult> {
    try {
      await this.deps.git.restoreState(this.stateDir, LEDGER_FOLDERS);
      const removed = await new Ledger({ stateDir: this.stateDir, runId, fs: this.fs, now: this.now }).releasePending(runId);
      await this.deps.git.persistState(this.stateDir, `SEO daily: release ${runId}`, LEDGER_FOLDERS);
      return this.writeResult({ status: "NO_TASK", runId, reason: `Zwolniono ${removed} wpisów pending.` });
    } catch (error) {
      return this.failed(error, { runId });
    }
  }
}

export function createSessionPhases(dependencies: SessionDependencies): SessionPhases {
  return new SessionPhases(dependencies);
}
