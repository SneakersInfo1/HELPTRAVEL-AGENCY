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
  type GscCsvInputs,
  type PrefetchedSources,
  type ResearchResult,
  type Task,
} from "../pipeline";
import { ContentDocumentSchema, POLICY_VERSION } from "../schema";
import { RENDERED_CONTENT_TYPES } from "../site-content";
import { SOURCE_ALLOWLIST, type SourceFetchResult, type SourceFetcher } from "../sources";
import { NODE_FS, type ContentStore, type FsLike } from "../store";
import type { SiteInventory } from "../inventory";
import { backlogCsvToGscInputs } from "./backlog";
import type { CreatedPullRequest, CreatePullRequestInput, GitHubRepository } from "./github";
import { parseGitHubRemote } from "./github";
import type { ClaimDayResult, ProposalBranch, StateClaim } from "./git-state";
import {
  DraftBodySchema,
  ResearchFileSchema,
  RoutineResultSchema,
  WorkOrderSchema,
  routinePaths,
  type RoutinePaths,
  type RoutineResult,
  type WorkOrder,
} from "./work-order";

export type RoutineGscSource = "auto" | "api" | "backlog";

export interface RoutineGit {
  readonly stateBranch: string;
  useStateBranch(branch: string): void;
  restoreState(stateDir: string): Promise<void>;
  claimDay(day: string, runId: string): Promise<ClaimDayResult>;
  persistState(stateDir: string, message: string): Promise<void>;
  listProposalBranches(): Promise<ProposalBranch[]>;
  listClaims(limit?: number): Promise<StateClaim[]>;
  statusPorcelain(): Promise<string>;
  remoteUrl(): Promise<string>;
  createAndPushProposalBranch(branch: string, message: string): Promise<void>;
}

export interface RoutineGitHub {
  createPullRequest(input: CreatePullRequestInput): Promise<CreatedPullRequest>;
  addLabels(input: GitHubRepository & { issueNumber: number; labels: readonly string[] }): Promise<boolean>;
}

export interface RoutineDependencies {
  fs?: FsLike;
  sourceFetcher: SourceFetcher;
  inventory: SiteInventory;
  store: ContentStore;
  git: RoutineGit;
  gh: RoutineGitHub;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  randomUUID?: () => string;
  routineDir?: string;
  stateDir?: string;
  backlogFile?: string;
  loadBacklog?: () => Promise<GscCsvInputs>;
  loadGscApi?: (scheduledAt: Date) => Promise<GscCsvInputs>;
}

export interface PrepareOptions {
  date?: string;
  base?: string;
  stateBranch?: string;
  gscSource?: RoutineGscSource;
  maxOpen?: number;
}

export interface FinalizeOptions {
  mode?: PublishMode;
}

export interface PublishOptions {
  base?: string;
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

function proposalPendingTargets(branches: readonly ProposalBranch[], inventory: SiteInventory): Set<string> {
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

function gateSummary(gate: GateReport): NonNullable<RoutineResult["gate"]> {
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

function statusPaths(porcelain: string): string[] {
  const paths: string[] = [];
  for (const line of porcelain.split(/\r?\n/).filter(Boolean)) {
    const raw = line.slice(3).trim().replace(/^"|"$/g, "");
    for (const item of raw.split(" -> ")) paths.push(item.replace(/\\/g, "/"));
  }
  return paths;
}

export class RoutinePhases {
  private readonly fs: FsLike;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly paths: RoutinePaths;
  private readonly stateDir: string;
  private readonly backlogFile: string;

  constructor(private readonly deps: RoutineDependencies) {
    this.fs = deps.fs ?? NODE_FS;
    this.env = deps.env ?? process.env;
    this.now = deps.now ?? (() => new Date());
    this.uuid = deps.randomUUID ?? randomUUID;
    this.paths = routinePaths(deps.routineDir);
    this.stateDir = deps.stateDir ?? ".seo-engine-state";
    this.backlogFile = deps.backlogFile ?? "docs/seo/OPPORTUNITY_BACKLOG.csv";
  }

  private async writeJson(target: string, value: unknown): Promise<void> {
    await this.fs.mkdir(path.dirname(target), { recursive: true });
    await this.fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { flag: "w" });
  }

  private async readJson(target: string): Promise<unknown> {
    return JSON.parse(await this.fs.readFile(target, "utf8")) as unknown;
  }

  private async writeResult(value: RoutineResult): Promise<RoutineResult> {
    const result = RoutineResultSchema.parse(value);
    await this.writeJson(this.paths.result, result);
    return result;
  }

  private async failed(error: unknown, context?: Pick<RoutineResult, "runId" | "day">): Promise<RoutineResult> {
    return this.writeResult({ status: "FAILED", ...context, errors: [safeMessage(error)], reason: "Faza Routine zakończyła się błędem." });
  }

  private async workOrder(): Promise<WorkOrder> {
    return WorkOrderSchema.parse(await this.readJson(this.paths.workOrder));
  }

  private ledger(workOrder: Pick<WorkOrder, "runId">): Ledger {
    return new Ledger({ stateDir: this.stateDir, runId: workOrder.runId, fs: this.fs, now: this.now });
  }

  private async gsc(source: RoutineGscSource, scheduledAt: Date): Promise<GscCsvInputs> {
    const hasApi = Boolean(this.env[SEO_GSC_SERVICE_ACCOUNT_JSON] && this.env[SEO_GSC_SITE_URL]);
    const selected = source === "auto" ? (hasApi ? "api" : "backlog") : source;
    if (selected === "backlog") {
      if (this.deps.loadBacklog) return this.deps.loadBacklog();
      return backlogCsvToGscInputs(await this.fs.readFile(this.backlogFile, "utf8"));
    }
    if (!hasApi) throw new Error(`Dla źródła GSC api ustaw ${SEO_GSC_SERVICE_ACCOUNT_JSON} i ${SEO_GSC_SITE_URL}.`);
    if (this.deps.loadGscApi) return this.deps.loadGscApi(scheduledAt);
    const end = new Date(scheduledAt);
    end.setUTCDate(end.getUTCDate() - 3);
    return toGscCsvInputs(
      await fetchGscExport({
        siteUrl: this.env[SEO_GSC_SITE_URL]!,
        serviceAccountJson: this.env[SEO_GSC_SERVICE_ACCOUNT_JSON]!,
        endDate: end.toISOString().slice(0, 10),
        includePageQuery: false,
      }),
    );
  }

  async prepare(options: PrepareOptions = {}): Promise<RoutineResult> {
    const runId = this.uuid();
    let day: string | undefined;
    try {
      const scheduled = asDay(options.date, this.now());
      day = scheduled.day;
      if (killSwitch(this.env) || (await this.deps.store.killSwitchExists())) {
        return this.writeResult({ status: "KILLED", runId, day, reason: "Kill switch zatrzymał przebieg przed odtworzeniem stanu i claimem dnia." });
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

      const claimed = await this.deps.git.claimDay(day, runId);
      if (claimed.status === "duplicate") {
        return this.writeResult({ status: "DUPLICATE_SKIPPED", runId, day, reason: `Dzień przejął już przebieg ${claimed.previous.runId}.` });
      }

      const collected = collect(await this.gsc(options.gscSource ?? "auto", scheduled.scheduledAt), this.deps.inventory);
      const ledger = new Ledger({ stateDir: this.stateDir, runId, fs: this.fs, now: this.now });
      const pending = await ledger.pendingTargets(scheduled.scheduledAt, PENDING_PROPOSAL_DAYS);
      for (const target of proposalPendingTargets(proposalBranches, this.deps.inventory)) pending.add(target);
      const selection = select(collected, this.deps.inventory, scheduled.scheduledAt, pending, RENDERED_CONTENT_TYPES);
      const task = selection.tasks.find((candidate) => candidate.decision !== "REVIEW_REQUIRED");
      if (!task) {
        if (selection.tasks.some((candidate) => candidate.decision === "REVIEW_REQUIRED")) {
          return this.writeResult({ status: "REVIEW_REQUIRED", runId, day, reason: selection.reason });
        }
        return this.writeResult({ status: "NO_TASK", runId, day, reason: selection.reason });
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
      return this.writeResult({ status: "TASK_READY", runId, day, reason: `Przygotowano zlecenie dla ${task.target}.` });
    } catch (error) {
      return this.failed(error, { runId, ...(day ? { day } : {}) });
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

  async verifyClaims(): Promise<RoutineResult> {
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
      const previous = RoutineResultSchema.parse(await this.readJson(this.paths.result));
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

  async finalize(options: FinalizeOptions = {}): Promise<RoutineResult> {
    if (options.mode === "AUTO_EVERGREEN") throw new Error("Tryb AUTO_EVERGREEN jest zabroniony w Routine.");
    let workOrder: WorkOrder | undefined;
    let attempts = 1;
    try {
      workOrder = await this.workOrder();
      this.deps.git.useStateBranch(workOrder.stateBranch);
      attempts = await this.finalizeAttempt();
      const current = RoutineResultSchema.parse(await this.readJson(this.paths.result));
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
    await this.deps.git.persistState(this.stateDir, message);
  }

  async publish(options: PublishOptions = {}): Promise<RoutineResult> {
    let workOrder: WorkOrder | undefined;
    try {
      workOrder = await this.workOrder();
      this.deps.git.useStateBranch(workOrder.stateBranch);
      const current = RoutineResultSchema.parse(await this.readJson(this.paths.result));
      if (current.status !== "DRAFT_READY") throw new Error(`Publikacja wymaga statusu DRAFT_READY, jest ${current.status}.`);

      const changed = statusPaths(await this.deps.git.statusPorcelain()).filter(
        (file) => !file.startsWith(".seo-routine/") && !file.startsWith(".seo-engine-state/"),
      );
      const forbidden = changed.filter((file) => !file.startsWith("content/seo/"));
      if (forbidden.length > 0) throw new Error(`Publish odmawia zmian spoza content/seo/: ${forbidden.join(", ")}`);
      if (changed.length === 0) throw new Error("Brak zmian content/seo do publikacji.");

      const branch = `claude/seo-content/${workOrder.day}-${workOrder.docId}`;
      await this.deps.git.createAndPushProposalBranch(branch, `SEO: propozycja ${workOrder.docId}`);
      const repository = parseGitHubRemote(await this.deps.git.remoteUrl());
      const base = options.base ?? workOrder.baseBranch;
      const body = await this.fs.readFile(this.paths.prBody, "utf8");
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
          await this.persistAfterPublish(workOrder, `SEO routine: PR failed ${workOrder.runId}`);
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
        await this.deps.gh.addLabels({ ...repository, issueNumber: pullRequest.number, labels: ["seo-automat"] });
      } catch {
        // Etykieta jest pomocnicza; istniejącego PR nie wolno przez nią uznać za nieudany.
      }
      await this.ledger(workOrder).complete(taskKey(workOrder.task, workOrder.day), "PR_CREATED");
      await this.persistAfterPublish(workOrder, `SEO routine: PR #${pullRequest.number}`);
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
      return this.failed(error, workOrder ? { runId: workOrder.runId, day: workOrder.day } : undefined);
    }
  }

  async status(): Promise<RoutineResult> {
    try {
      await this.deps.git.restoreState(this.stateDir);
      const proposals = await this.deps.git.listProposalBranches();
      const claims = await this.deps.git.listClaims(10);
      const pending = await new Ledger({ stateDir: this.stateDir, fs: this.fs, now: this.now }).pendingTargets(this.now(), PENDING_PROPOSAL_DAYS);
      return this.writeResult({
        status: "NO_TASK",
        reason: "Podsumowanie stanu Routine.",
        pending: pending.size,
        proposalBranches: proposals.map((branch) => branch.branch),
        claims: claims.map(({ day, runId }) => ({ day, runId })),
      });
    } catch (error) {
      return this.failed(error);
    }
  }

  async release(runId: string): Promise<RoutineResult> {
    try {
      await this.deps.git.restoreState(this.stateDir);
      const removed = await new Ledger({ stateDir: this.stateDir, runId, fs: this.fs, now: this.now }).releasePending(runId);
      await this.deps.git.persistState(this.stateDir, `SEO routine: release ${runId}`);
      return this.writeResult({ status: "NO_TASK", runId, reason: `Zwolniono ${removed} wpisów pending.` });
    } catch (error) {
      return this.failed(error, { runId });
    }
  }
}

export function createRoutinePhases(dependencies: RoutineDependencies): RoutinePhases {
  return new RoutinePhases(dependencies);
}
