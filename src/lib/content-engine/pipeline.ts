import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";
import { z } from "zod";

import { publishDecision, runQualityGate, type GateReport, type PublishMode } from "@/lib/content-quality/gate";
import { rankOpportunities } from "@/lib/seo-ops/gsc/analysis";
import { parseGscCsv, type GscRow, type GscTable } from "@/lib/seo-ops/gsc/csv";
import { classifyQuery, classifyUrl, isBrandQuery, isHighRiskIntent } from "@/lib/seo-ops/gsc/segments";

import { RunBudget, type BudgetSummary } from "./budget";
import { numbersCoveredBy } from "./numbers";
import { computeContentHash } from "./hash";
import type { SiteInventory } from "./inventory";
import { Ledger, type LedgerLock, idempotencyKey } from "./ledger";
import { LlmError, type LlmClient, type LlmResponse, type LlmRole } from "./llm";
import { modelForRole, type EngineEnv } from "./models";
import { withRetry, type RetryOptions, type Sleep } from "./retry";
import {
  ContentDocumentSchema,
  DATA_CLASS_RISK,
  DataClassSchema,
  ImageAssetSchema,
  POLICY_VERSION,
  SectionSchema,
  isClaimFresh,
  maxRisk,
  type ContentDocument,
  type ContentType,
  type FactClaim,
  type PublishDecision,
  type RiskClass,
  type Source,
} from "./schema";
import { registeredSourcesForTarget } from "./source-registry";
import { RENDERED_CONTENT_TYPES } from "./site-content";
import { assertAllowedSource, evidenceFoundIn, type SourceFetchResult, type SourceFetcher } from "./sources";
import { NODE_FS, type ContentStore, type FsLike } from "./store";

export interface GscCsvInputs {
  pages: string;
  queries: string;
  daily: string;
}

export interface CollectedInput {
  pages: GscTable;
  queries: GscTable;
  daily: GscTable;
  existing: ReturnType<SiteInventory["existing"]>;
}

export interface TaskEvidence {
  source: "page" | "query";
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  opportunityScore?: number;
  internalLinkTargets?: string[];
}

export interface Task {
  operation: "refresh" | "new_article";
  target: string;
  primaryQuery: string;
  evidence: TaskEvidence;
  rationale: string;
  decision?: "REVIEW_REQUIRED";
}

export interface SelectionResult {
  tasks: Task[];
  reason: string;
  skipped: SelectionSkip[];
}

export interface SelectionSkip {
  operation: Task["operation"];
  target: string;
  contentType: ContentType;
  reason: "content_type_not_rendered";
}

export type RunOutcome =
  | "PUBLISHED_AUTOMATION"
  | "DRAFT_CREATED"
  | "REVIEW_REQUIRED"
  | "REJECTED"
  | "SKIPPED_QUALITY_GATE"
  | "DUPLICATE_SKIPPED"
  | "KILLED"
  | "FAILED";

export interface StageResults {
  collect?: Record<string, unknown>;
  select?: Record<string, unknown>;
  research?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  verify?: Record<string, unknown>;
  publish?: Record<string, unknown>;
}

export interface RunReport {
  runId: string;
  scheduledAt: string;
  startedAt: string;
  finishedAt: string;
  mode: PublishMode;
  policyVersion: string;
  selectedTasks: Task[];
  stages: StageResults;
  gateReport: GateReport | null;
  decision: PublishDecision | null;
  filesWritten: string[];
  usage: BudgetSummary;
  outcome: RunOutcome;
  reason?: string;
  error?: { class: string; message: string; stage: string; code: string };
}

export interface PublicRunReport {
  runId: string;
  scheduledAt: string;
  startedAt: string;
  finishedAt: string;
  mode: PublishMode;
  policyVersion: string;
  outcome: RunOutcome;
  decision: PublishDecision | null;
  usage: BudgetSummary;
  filesWritten: string[];
  selectedTasks: Array<{ operation: Task["operation"]; decision: PublishDecision | "REVIEW_REQUIRED" | null; target: string }>;
  gateReport: { verdict: GateReport["verdict"]; metrics: GateReport["metrics"]; findings: Array<Pick<GateReport["findings"][number], "rule" | "severity">> } | null;
  error: { stage: string; code: string } | null;
}

function publicTaskTarget(task: Task): string {
  if (task.operation === "refresh") return task.target;
  const digest = createHash("sha256").update(task.target.normalize("NFKC"), "utf8").digest("hex").slice(0, 8);
  return `nowy-temat-${digest}`;
}

/** Raport publiczny powstaje wyłącznie z jawnie wymienionych, bezpiecznych pól. */
export function redactRunReport(report: RunReport): PublicRunReport {
  const gateReport = report.gateReport
    ? {
        verdict: report.gateReport.verdict,
        metrics: {
          words: report.gateReport.metrics.words,
          claims: report.gateReport.metrics.claims,
          verifiedClaims: report.gateReport.metrics.verifiedClaims,
          sources: report.gateReport.metrics.sources,
          fillerHits: report.gateReport.metrics.fillerHits,
          repeatedShingleRatio: report.gateReport.metrics.repeatedShingleRatio,
        },
        findings: report.gateReport.findings.map((finding) => ({ rule: finding.rule, severity: finding.severity })),
      }
    : null;
  const hasExistingTarget = report.selectedTasks.some((task) => task.operation === "refresh" && task.decision !== "REVIEW_REQUIRED");
  return {
    runId: report.runId,
    scheduledAt: report.scheduledAt,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    mode: report.mode,
    policyVersion: report.policyVersion,
    outcome: report.outcome,
    decision: report.decision,
    usage: {
      requests: report.usage.requests,
      inputTokens: report.usage.inputTokens,
      outputTokens: report.usage.outputTokens,
      costUsd: report.usage.costUsd,
      runtimeSeconds: report.usage.runtimeSeconds,
      caps: {
        maxUsd: report.usage.caps.maxUsd,
        maxRequests: report.usage.caps.maxRequests,
        maxOutputTokens: report.usage.caps.maxOutputTokens,
        maxRuntimeSeconds: report.usage.caps.maxRuntimeSeconds,
      },
    },
    filesWritten: hasExistingTarget ? [...report.filesWritten] : [],
    selectedTasks: report.selectedTasks.map((task) => ({
      operation: task.operation,
      decision: task.decision ?? report.decision,
      target: publicTaskTarget(task),
    })),
    gateReport,
    error: report.error ? { stage: report.error.stage, code: report.error.code } : null,
  };
}

export class PipelineStageError extends Error {
  readonly name = "PipelineStageError";

  constructor(
    readonly stage: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function collect(gsc: GscCsvInputs, inventory: SiteInventory): CollectedInput {
  return {
    pages: parseGscCsv(gsc.pages),
    queries: parseGscCsv(gsc.queries),
    daily: parseGscCsv(gsc.daily),
    existing: inventory.existing(),
  };
}

function routeOf(raw: string): string {
  return classifyUrl(raw).path;
}

function asciiSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "temat-podrozniczy";
}

function intentTokens(value: string): string[] {
  const stop = new Set(["czy", "jak", "gdzie", "kiedy", "oraz", "dla", "co", "na", "do", "we", "w", "z", "i"]);
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stop.has(token))
    .map((token) => (token.length > 6 ? token.slice(0, token.length - 3) : token));
}

function overlapRatio(query: string, candidate: string): number {
  const queryTokens = [...new Set(intentTokens(query))];
  if (queryTokens.length === 0) return 0;
  const candidateTokens = new Set(intentTokens(candidate));
  return queryTokens.filter((token) => candidateTokens.has(token)).length / queryTokens.length;
}

function relevantInternalTargets(query: string, existing: CollectedInput["existing"]): string[] {
  return existing
    .filter((item) => overlapRatio(query, `${item.canonicalUrl} ${item.title} ${item.h1 ?? ""}`) > 0)
    .map((item) => item.canonicalUrl)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
}

function intentCovered(query: string, target: string, existing: CollectedInput["existing"]): boolean {
  const plannedSlug = asciiSlug(query);
  return existing.some((item) => {
    const currentSlug = item.canonicalUrl.split("/").filter(Boolean).at(-1) ?? "";
    return currentSlug === plannedSlug || item.canonicalUrl === target || overlapRatio(query, `${item.canonicalUrl} ${item.title} ${item.h1 ?? ""} ${item.lead ?? ""}`) >= 0.75;
  });
}

function enrichmentExpired(inventory: SiteInventory, canonicalUrl: string, now: Date): boolean {
  const claims = inventory.enrichmentClaims?.(canonicalUrl) ?? [];
  if (claims.length > 0) return claims.some((claim) => !isClaimFresh(claim, now));
  const verifiedAt = inventory.enrichmentVerifiedAt(canonicalUrl);
  if (!verifiedAt) return true;
  // Bez klas twierdzeń stosujemy bezpieczny termin roczny; StoreBackedInventory udostępnia dokładne TTL.
  return new Date(verifiedAt).getTime() + 365 * 86_400_000 <= now.getTime();
}

function taskEvidence(row: GscRow, source: TaskEvidence["source"], opportunityScore?: number, internalLinkTargets?: string[]): TaskEvidence {
  return {
    source,
    key: row.key,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    ...(opportunityScore === undefined ? {} : { opportunityScore }),
    ...(internalLinkTargets === undefined ? {} : { internalLinkTargets }),
  };
}

/** Ile dni propozycja dla tej samej strony blokuje kolejne (czas na przegląd PR-a). */
export const PENDING_PROPOSAL_DAYS = 14;

function selectionReason(reason: string, skipped: readonly SelectionSkip[]): string {
  if (skipped.length === 0) return reason;
  const types = [...new Set(skipped.map((item) => item.contentType))].sort().join(", ");
  return `${reason} Pominięto ${skipped.length} zadań, ponieważ typy treści nie mają renderera: ${types}.`;
}

export function select(
  input: CollectedInput,
  inventory: SiteInventory,
  now: Date,
  pending: ReadonlySet<string> = new Set(),
  renderableTypes: ReadonlySet<ContentType> = RENDERED_CONTENT_TYPES,
): SelectionResult {
  const skipped: SelectionSkip[] = [];
  const skippedKeys = new Set<string>();
  const canRender = (task: Task): boolean => {
    const contentType = contentTypeFor(task);
    if (renderableTypes.has(contentType)) return true;
    const key = `${task.operation}|${task.target}|${contentType}`;
    if (!skippedKeys.has(key)) {
      skippedKeys.add(key);
      skipped.push({ operation: task.operation, target: task.target, contentType, reason: "content_type_not_rendered" });
    }
    return false;
  };
  const reviewTasks = highRiskReviewTasks(input.queries.rows).filter(canRender);
  const opportunities = rankOpportunities(input.pages.rows);
  for (const opportunity of opportunities) {
    const target = routeOf(opportunity.url);
    if (pending.has(target)) continue;
    const existing = input.existing.find((item) => item.canonicalUrl === target);
    if (!existing) continue;
    if (inventory.hasEnrichment(target) && !enrichmentExpired(inventory, target, now)) continue;
    const row = input.pages.rows.find((candidate) => routeOf(candidate.key) === target);
    if (!row) continue;
    const reason = inventory.hasEnrichment(target) ? "zweryfikowane twierdzenia rozszerzenia utraciły świeżość" : "adres ma potencjał GSC i nie ma rozszerzenia";
    const refresh: Task = {
      operation: "refresh",
      target,
      primaryQuery: existing.title,
      evidence: taskEvidence(row, "page", opportunity.score),
      rationale: `${reason}; ${opportunity.rationale}`,
    };
    if (!canRender(refresh)) continue;
    return {
      tasks: [refresh, ...reviewTasks],
      reason: selectionReason("Odświeżenie istniejącego adresu ma pierwszeństwo przed nowym artykułem.", skipped),
      skipped,
    };
  }

  const rankedQueries = new Map(rankOpportunities(input.queries.rows).map((opportunity, index) => [opportunity.url, { index, score: opportunity.score }]));
  const candidates = input.queries.rows
    .filter((row) => !isBrandQuery(row.key) && !isHighRiskIntent(classifyQuery(row.key)) && row.impressions > 0)
    .sort((left, right) => {
      const leftRank = rankedQueries.get(left.key)?.index ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rankedQueries.get(right.key)?.index ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || right.impressions - left.impressions || left.key.localeCompare(right.key);
    });
  for (const row of candidates) {
    const target = `/inspiracje/${asciiSlug(row.key)}`;
    if (pending.has(target)) continue;
    if (intentCovered(row.key, target, input.existing)) continue;
    const links = relevantInternalTargets(row.key, input.existing);
    if (links.length < 3) continue;
    const task: Task = {
      operation: "new_article",
      target,
      primaryQuery: row.key,
      evidence: taskEvidence(row, "query", rankedQueries.get(row.key)?.score, links.slice(0, 8)),
      rationale: `${row.impressions} wyświetleń potwierdza popyt; brak adresu pokrywającego intencję; ${links.length} trafnych celów linkowania wewnętrznego.`,
    };
    if (!canRender(task)) continue;
    return {
      tasks: [...reviewTasks, task],
      reason: selectionReason("Wybrano najwyżej popytowy, niepokryty klaster zapytań; limit nowego artykułu wynosi jeden.", skipped),
      skipped,
    };
  }

  if (reviewTasks.length > 0) {
    return {
      tasks: reviewTasks,
      reason: selectionReason("Zapytania wysokiego ryzyka przekazano wyłącznie do ręcznego przeglądu.", skipped),
      skipped,
    };
  }
  return {
    tasks: [],
    reason: selectionReason(
      "Brak kwalifikującego się odświeżenia ani klastra z popytem, luką intencji i co najmniej trzema trafnymi linkami wewnętrznymi.",
      skipped,
    ),
    skipped,
  };
}

function highRiskReviewTasks(rows: readonly GscRow[]): Task[] {
  return rows
    .filter((row) => !isBrandQuery(row.key) && isHighRiskIntent(classifyQuery(row.key)) && row.impressions > 0)
    .sort((left, right) => right.impressions - left.impressions || left.key.localeCompare(right.key))
    .slice(0, 1)
    .map((row) => ({
      operation: "new_article" as const,
      target: `/inspiracje/${asciiSlug(row.key)}`,
      primaryQuery: row.key,
      evidence: taskEvidence(row, "query"),
      rationale: "Intencja dotyczy dokumentów, zdrowia lub bezpieczeństwa i nie może być generowana automatycznie.",
      decision: "REVIEW_REQUIRED" as const,
    }));
}

const CandidateClaimSchema = z.object({
  claim: z.string().min(8),
  value: z.string().default(""),
  dataClass: DataClassSchema,
  sourceUrl: z.string().url(),
  observedEvidence: z.string().min(8).max(400),
});

type CandidateClaim = z.infer<typeof CandidateClaimSchema>;

export interface ResearchResult {
  claims: FactClaim[];
  sources: Source[];
  candidateCount: number;
  droppedCount: number;
  unreachableCount: number;
  sourceTextById: ReadonlyMap<string, string>;
}

type StageComplete = (request: { role: LlmRole; system: string; prompt: string; maxOutputTokens: number }) => Promise<LlmResponse>;

function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (start < 0) throw new SyntaxError("Odpowiedź nie zawiera JSON");
  return JSON.parse(trimmed.slice(start)) as unknown;
}

function candidateArray(value: unknown): CandidateClaim[] {
  const raw = Array.isArray(value) ? value : typeof value === "object" && value !== null && "claims" in value ? (value as { claims: unknown }).claims : value;
  return z.array(CandidateClaimSchema).parse(raw);
}

function sourceKind(candidate: CandidateClaim): Source["kind"] {
  if (candidate.dataClass === "entry_requirements") return "government";
  if (candidate.dataClass === "climate_normal") return "climate_dataset";
  if (candidate.dataClass === "transport") return "public_transport_operator";
  if (new URL(candidate.sourceUrl).hostname.endsWith("unesco.org")) return "heritage_or_museum";
  return "official_tourism";
}

/** Ile znaków tekstu jednego źródła trafia do promptu researchera. */
const SOURCE_EXCERPT_CHARS = 9_000;
const MAX_REGISTERED_SOURCES = 4;

/** Fragment z największym zagęszczeniem treści: nawigacja stron jest na początku i końcu. */
function sourceExcerpt(text: string): string {
  if (text.length <= SOURCE_EXCERPT_CHARS) return text;
  const start = Math.max(0, Math.floor(text.length * 0.12));
  return text.slice(start, start + SOURCE_EXCERPT_CHARS);
}

export async function research(task: Task, complete: StageComplete, sourceFetcher: SourceFetcher): Promise<ResearchResult> {
  const fetchedByUrl = new Map<string, SourceFetchResult | null>();

  // Model nie zna dosłownej treści stron. Dla kierunków z rejestru pobieramy
  // źródła PRZED pytaniem i podajemy ich tekst, żeby cytat dało się przepisać;
  // o tym, czy cytat jest prawdziwy, i tak decyduje kontrola mechaniczna niżej.
  const excerpts: string[] = [];
  const curatedCandidates: CandidateClaim[] = [];
  for (const registered of registeredSourcesForTarget(task.target).slice(0, MAX_REGISTERED_SOURCES)) {
    try {
      const url = assertAllowedSource(registered.url).href;
      const fetched = await sourceFetcher.fetchText(url);
      fetchedByUrl.set(url, fetched);
      for (const curated of registered.curated ?? []) {
        curatedCandidates.push({ ...curated, sourceUrl: url });
      }
      // Źródło z zakazem `aiInput` służy tylko do mechanicznej kontroli cytatów.
      if (registered.aiInput === false) continue;
      if (fetched.status >= 200 && fetched.status < 300 && fetched.text.length > 0) {
        excerpts.push(`ŹRÓDŁO ${url} (${registered.publisher}; ${registered.covers}):\n${sourceExcerpt(fetched.text)}`);
      }
    } catch {
      // Niedostępne źródło z rejestru nie przerywa researchu — po prostu nie ma go w prompcie.
    }
  }
  const sourceBlock =
    excerpts.length > 0
      ? `\nKorzystaj WYŁĄCZNIE z tekstów poniżej. Pole observedEvidence musi być przepisane znak w znak z tekstu źródła (bez tłumaczenia i skracania).\n\n${excerpts.join("\n\n")}`
      : "";

  const response = await complete({
    role: "researcher",
    system: "Zwracaj wyłącznie JSON. Proponuj tylko krótkie, dosłowne fragmenty źródeł urzędowych lub oficjalnych.",
    prompt: `Zbierz kandydackie twierdzenia dla zadania ${task.operation} pod adresem ${task.target} i intencji „${task.primaryQuery}”. Format: {"claims":[{"claim":"...","value":"","dataClass":"geography","sourceUrl":"https://...","observedEvidence":"..."}]}.${sourceBlock}`,
    maxOutputTokens: 8_000,
  });
  const candidates = [...curatedCandidates, ...candidateArray(parseJsonText(response.text))];
  const sources: Source[] = [];
  const claims: FactClaim[] = [];
  const sourceByUrl = new Map<string, Source>();
  const sourceTextById = new Map<string, string>();
  let droppedCount = 0;
  let unreachableCount = 0;

  for (const candidate of candidates) {
    let normalizedUrl: string;
    let fetched: SourceFetchResult | null | undefined;
    try {
      normalizedUrl = assertAllowedSource(candidate.sourceUrl).href;
      fetched = fetchedByUrl.get(normalizedUrl);
      if (fetched === undefined) {
        fetched = await sourceFetcher.fetchText(normalizedUrl);
        fetchedByUrl.set(normalizedUrl, fetched);
      }
    } catch {
      try {
        fetchedByUrl.set(new URL(candidate.sourceUrl).href, null);
      } catch {
        // Zod odrzuca niepoprawne URL-e wcześniej; blok chroni tylko granicę typu.
      }
      droppedCount += 1;
      unreachableCount += 1;
      continue;
    }
    if (fetched === null) {
      droppedCount += 1;
      unreachableCount += 1;
      continue;
    }
    if (fetched.status < 200 || fetched.status >= 300) {
      droppedCount += 1;
      unreachableCount += 1;
      continue;
    }
    if (!evidenceFoundIn(fetched.text, candidate.observedEvidence)) {
      droppedCount += 1;
      continue;
    }
    // Cytat musi zawierać liczby twierdzenia — inaczej prawdziwy, ale niezwiązany
    // fragment („Tenerife South Airport") „potwierdzałby" dowolną liczbę („60 km").
    if (!numbersCoveredBy(`${candidate.claim} ${candidate.value}`, candidate.observedEvidence).ok) {
      droppedCount += 1;
      continue;
    }
    let source = sourceByUrl.get(normalizedUrl);
    if (!source) {
      const host = new URL(normalizedUrl).hostname;
      source = {
        id: `source-${sources.length + 1}`,
        url: normalizedUrl,
        title: `Oficjalne źródło: ${host}`,
        publisher: host,
        kind: sourceKind(candidate),
        licence: "Fakt i krótki cytat w granicach prawa cytatu",
        retrievedAt: fetched.retrievedAt,
      };
      sources.push(source);
      sourceByUrl.set(normalizedUrl, source);
      sourceTextById.set(source.id, fetched.text);
    }
    const riskClass = DATA_CLASS_RISK[candidate.dataClass];
    claims.push({
      id: `claim-${claims.length + 1}`,
      claim: candidate.claim,
      value: candidate.value,
      dataClass: candidate.dataClass,
      riskClass,
      sourceId: source.id,
      observedEvidence: candidate.observedEvidence,
      retrievedAt: fetched.retrievedAt,
      verification: "source_verified",
    });
  }
  const usedSourceIds = new Set(claims.map((claim) => claim.sourceId));
  return {
    claims,
    sources: sources.filter((source) => usedSourceIds.has(source.id)),
    candidateCount: candidates.length,
    droppedCount,
    unreachableCount,
    sourceTextById,
  };
}

const DraftBodySchema = z.object({
  topicCluster: z.string().min(2),
  title: z.string().min(10).max(70),
  description: z.string().min(50).max(170),
  lead: z.string().min(60).max(600),
  sections: z.array(SectionSchema).min(1),
  imageAsset: ImageAssetSchema,
  relatedContent: z.array(z.string().regex(/^\//)).default([]),
  ctaTarget: z.string().regex(/^\//),
});

function contentTypeFor(task: Task): ContentType {
  if (task.operation === "new_article") return "article";
  const segment = classifyUrl(task.target).segment;
  if (segment === "comparison") return "comparison_enrichment";
  if (segment === "month") return "month_enrichment";
  return "hub_enrichment";
}

function idForTask(task: Task): string {
  const parts = task.target.split("/").filter(Boolean);
  const classified = classifyUrl(task.target);
  if (classified.segment === "month" && parts.length >= 3) return asciiSlug(`${parts[1]}-${parts[2]}`);
  return asciiSlug(parts.at(-1) ?? task.primaryQuery);
}

function zodMessages(error: unknown): string[] {
  if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
  return [error instanceof Error ? error.message : String(error)];
}

function buildDocument(
  bodyValue: unknown,
  task: Task,
  result: ResearchResult,
  previous: ContentDocument | null,
  now: Date,
  runId: string,
): ContentDocument {
  const body = DraftBodySchema.parse(bodyValue);
  const riskClass: RiskClass = maxRisk(...result.claims.map((claim) => claim.riskClass));
  const timestamp = now.toISOString();
  const base: ContentDocument = {
    id: idForTask(task),
    canonicalUrl: task.target,
    primaryQueryIntent: task.primaryQuery,
    contentType: contentTypeFor(task),
    topicCluster: body.topicCluster,
    locale: "pl-PL",
    title: body.title,
    description: body.description,
    lead: body.lead,
    sections: body.sections,
    factClaims: result.claims,
    sources: result.sources,
    imageAsset: body.imageAsset,
    relatedContent: body.relatedContent,
    ctaTarget: body.ctaTarget,
    riskClass,
    contentHash: "0".repeat(64),
    createdAt: previous?.createdAt ?? timestamp,
    publishedAt: previous?.publishedAt ?? null,
    materiallyModifiedAt: timestamp,
    verifiedAt: timestamp,
    owner: "HelpTravel SEO",
    reviewStatus: "draft",
    generationRunId: runId,
    aiDisclosure: "Treść przygotowano z pomocą AI i zweryfikowano mechanicznie względem podanych źródeł.",
    policyVersion: POLICY_VERSION,
  };
  const contentHash = computeContentHash(base);
  const document = {
    ...base,
    contentHash,
    materiallyModifiedAt: previous && previous.contentHash === contentHash ? previous.materiallyModifiedAt : timestamp,
  };
  return ContentDocumentSchema.parse(document);
}

export async function draft(
  task: Task,
  result: ResearchResult,
  previous: ContentDocument | null,
  complete: StageComplete,
  now: Date,
  runId: string,
): Promise<{ document: ContentDocument; repaired: boolean }> {
  const verifiedFacts = {
    claims: result.claims.map(({ id, claim, value, dataClass, riskClass, sourceId, observedEvidence, retrievedAt }) => ({
      id,
      claim,
      value,
      dataClass,
      riskClass,
      sourceId,
      observedEvidence,
      retrievedAt,
    })),
    sources: result.sources.map(({ id, url, title, publisher, kind, licence, retrievedAt }) => ({ id, url, title, publisher, kind, licence, retrievedAt })),
  };
  const basePrompt = [
    `Napisz polski korpus JSON dla ${task.target}, intencja: „${task.primaryQuery}”.`,
    "Nie dodawaj pól stanu, identyfikatora dokumentu, dat, statusu, klasy ryzyka ani twierdzeń. Używaj wyłącznie poniższych zweryfikowanych twierdzeń i ich identyfikatorów w section.claimIds.",
    "Sekcja prose lub list bez faktów musi mieć opinion:true, puste claimIds i nie może zawierać liczb z jednostką.",
    `Dla nowego artykułu użyj linków wewnętrznych: ${JSON.stringify(task.evidence.internalLinkTargets ?? [])}.`,
    "Zwróć: topicCluster, title, description, lead, sections, imageAsset, relatedContent, ctaTarget.",
    JSON.stringify(verifiedFacts),
  ].join("\n");
  const system = "Jesteś redaktorem HelpTravel. Zwracasz wyłącznie poprawny JSON, bez markdownu i bez faktów spoza dostarczonego zestawu.";

  let firstError: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = attempt === 0 ? basePrompt : `${basePrompt}\nPopraw dokładnie te błędy walidacji: ${JSON.stringify(firstError)}`;
    const response = await complete({ role: "writer", system, prompt, maxOutputTokens: 16_000 });
    try {
      return { document: buildDocument(parseJsonText(response.text), task, result, previous, now, runId), repaired: attempt === 1 };
    } catch (error) {
      if (attempt === 1) throw new PipelineStageError("draft", `Druga odpowiedź writera nie przeszła walidacji: ${zodMessages(error).join("; ")}`, error);
      firstError = zodMessages(error);
    }
  }
  throw new PipelineStageError("draft", "Writer nie zwrócił dokumentu");
}

export interface VerifyResult {
  document: ContentDocument;
  gateReport: GateReport;
  decision: PublishDecision;
}

export function verify(
  document: ContentDocument,
  researchResult: ResearchResult,
  inventory: SiteInventory,
  now: Date,
  mode: PublishMode,
  previous: ContentDocument | null,
): VerifyResult {
  const factClaims = document.factClaims.map((claim) => {
    const text = researchResult.sourceTextById.get(claim.sourceId);
    const verified = text !== undefined && evidenceFoundIn(text, claim.observedEvidence) && isClaimFresh(claim, now);
    return { ...claim, verification: verified ? ("source_verified" as const) : ("unverified" as const) };
  });
  const checked = ContentDocumentSchema.parse({ ...document, factClaims });
  const gateReport = runQualityGate(checked, {
    now,
    existing: inventory.existing(),
    isKnownRoute: (route) => route === checked.canonicalUrl || inventory.isKnownRoute(route),
    previous,
  });
  return { document: checked, gateReport, decision: publishDecision(gateReport, checked, mode) };
}

function noMaterialGate(now: Date, blocked: boolean, result: ResearchResult): GateReport {
  return {
    verdict: blocked ? "BLOCKED_FACTS" : "SKIPPED_QUALITY_GATE",
    findings: [
      {
        rule: blocked ? "candidate_evidence_not_found" : "no_verified_material",
        severity: blocked ? "block_facts" : "skip",
        message: blocked
          ? `${result.droppedCount} kandydackich twierdzeń odrzucono, ponieważ dowodu nie znaleziono w dozwolonym źródle.`
          : "Żadne dozwolone źródło nie dostarczyło zweryfikowanego materiału.",
      },
    ],
    metrics: { words: 0, claims: 0, verifiedClaims: 0, sources: 0, fillerHits: 0, repeatedShingleRatio: 0 },
    checkedAt: now.toISOString(),
    policyVersion: POLICY_VERSION,
  };
}

export interface DailyDependencies {
  gsc: GscCsvInputs | (() => Promise<GscCsvInputs>);
  inventory: SiteInventory;
  store: ContentStore;
  llm: LlmClient;
  sourceFetcher: SourceFetcher;
  fs?: FsLike;
  env?: EngineEnv;
  now?: () => Date;
  sleep?: Sleep;
  random?: () => number;
  randomUUID?: () => string;
  retry?: Omit<RetryOptions, "sleep" | "random">;
  budget?: RunBudget;
}

export interface DailyOptions {
  mode?: PublishMode;
  scheduledAt: string | Date;
  stateDir?: string;
  runId?: string;
  /** Scenariusze offline mogą jawnie testować typy, których produkcja jeszcze nie renderuje. */
  renderableTypes?: ReadonlySet<ContentType>;
}

function asScheduledDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("scheduledAt musi być poprawnym czasem ISO");
  return date;
}

function killSwitchEnabled(env: EngineEnv): boolean {
  return ["1", "true"].includes((env.SEO_ENGINE_KILL_SWITCH ?? "").toLowerCase());
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function safeErrorCode(error: unknown): string {
  if (error instanceof PipelineStageError && error.cause) return safeErrorCode(error.cause);
  if (error instanceof LlmError && error.code) return error.code;
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code.toLowerCase();
  }
  return error instanceof Error ? error.name.toLowerCase() : "unknown_error";
}

function outcomeFor(decision: PublishDecision, mode: PublishMode, wrote: boolean): RunOutcome {
  if (decision === "REJECTED") return "REJECTED";
  if (decision === "SKIPPED_QUALITY_GATE") return "SKIPPED_QUALITY_GATE";
  if (decision === "APPROVED_AUTOMATION") return wrote ? "PUBLISHED_AUTOMATION" : "REVIEW_REQUIRED";
  if (wrote && mode !== "DRY_RUN") return "DRAFT_CREATED";
  return "REVIEW_REQUIRED";
}

function reportBase(
  runId: string,
  scheduledAt: string,
  startedAt: string,
  mode: PublishMode,
  usage: BudgetSummary,
): RunReport {
  return {
    runId,
    scheduledAt,
    startedAt,
    finishedAt: startedAt,
    mode,
    policyVersion: POLICY_VERSION,
    selectedTasks: [],
    stages: {},
    gateReport: null,
    decision: null,
    filesWritten: [],
    usage,
    outcome: "FAILED",
  };
}

export async function runDaily(deps: DailyDependencies, options: DailyOptions): Promise<RunReport> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const runId = options.runId ?? deps.randomUUID?.() ?? nodeRandomUUID();
  const mode = options.mode ?? "DRY_RUN";
  const scheduled = asScheduledDate(options.scheduledAt);
  const scheduledAt = scheduled.toISOString();
  const day = scheduledAt.slice(0, 10);
  const startedAt = now().toISOString();
  const fs = deps.fs ?? NODE_FS;
  const ledger = new Ledger({ stateDir: options.stateDir, runId, fs, now });
  const budget = deps.budget ?? new RunBudget({ env, now: () => now().getTime(), startedAtMs: new Date(startedAt).getTime() });
  const report = reportBase(runId, scheduledAt, startedAt, mode, budget.summary());
  let stage = "initialization";
  let lock: LedgerLock | null = null;
  let ledgerKey = `run-${runId}`;
  let storeChanged = false;

  const finish = async (outcome: RunOutcome, reason?: string): Promise<RunReport> => {
    report.outcome = outcome;
    report.finishedAt = now().toISOString();
    report.usage = budget.summary();
    if (reason) report.reason = reason;
    await ledger.writeReport(report as RunReport & Record<string, unknown>);
    return report;
  };

  const complete: StageComplete = async (request) => {
    const model = modelForRole(request.role, env);
    // Znaki/2 celowo zawyża typowy odczyt tokenów; rezerwacja ma być bezpieczna.
    const reservation = {
      inputTokens: Math.ceil((request.system.length + request.prompt.length) / 2),
      maxOutputTokens: request.maxOutputTokens,
      model,
    };
    return withRetry(
      async () => {
        budget.assertCanSpend(reservation);
        try {
          const response = await deps.llm.complete({ ...request, model });
          budget.charge(response.usage, response.model);
          return response;
        } catch (error) {
          // Brak usage nie oznacza braku kosztu: timeout i 5xx mogły zużyć całą rezerwę.
          if (error instanceof LlmError && error.usage) budget.charge(error.usage, error.usage.model);
          else budget.chargeReservation(reservation);
          throw error;
        }
      },
      {
        retries: deps.retry?.retries ?? 3,
        baseMs: deps.retry?.baseMs ?? 250,
        maxMs: deps.retry?.maxMs ?? 10_000,
        isRetryable: deps.retry?.isRetryable,
        sleep: deps.sleep,
        random: deps.random,
      },
    );
  };

  try {
    stage = "kill_switch";
    if (killSwitchEnabled(env) || (await deps.store.killSwitchExists())) {
      report.stages.select = { skipped: true, reason: "kill_switch" };
      return await finish("KILLED", "Kill switch zatrzymał przebieg przed pierwszym wywołaniem LLM.");
    }

    stage = "lock";
    lock = await ledger.acquireLock(`daily-${day}`, { ttlMs: budget.caps.maxRuntimeSeconds * 1000 + 60_000, now: now() });

    stage = "collect";
    const gsc = typeof deps.gsc === "function" ? await deps.gsc() : deps.gsc;
    const collected = collect(gsc, deps.inventory);
    report.stages.collect = {
      pages: collected.pages.rows.length,
      queries: collected.queries.rows.length,
      daily: collected.daily.rows.length,
      existing: collected.existing.length,
    };

    stage = "select";
    // Strona, dla której propozycja czeka już w PR-ze, nie dostaje kolejnej
    // codziennie — inaczej do czasu merge'a każdy dzień kosztowałby nowy przebieg i nowy PR.
    const pending = await ledger.pendingTargets(scheduled, PENDING_PROPOSAL_DAYS);
    const selection = select(collected, deps.inventory, scheduled, pending, options.renderableTypes ?? RENDERED_CONTENT_TYPES);
    report.selectedTasks = selection.tasks;
    report.stages.select = { tasks: selection.tasks.length, reason: selection.reason, skipped: selection.skipped };
    const task = selection.tasks.find((candidate) => candidate.decision !== "REVIEW_REQUIRED");
    if (!task) {
      if (selection.tasks.some((candidate) => candidate.decision === "REVIEW_REQUIRED")) {
        report.decision = "REVIEW_REQUIRED";
        return await finish("REVIEW_REQUIRED", selection.reason);
      }
      report.decision = "SKIPPED_QUALITY_GATE";
      return await finish("SKIPPED_QUALITY_GATE", selection.reason);
    }

    ledgerKey = idempotencyKey({
      day,
      target: task.target,
      operation: task.operation,
      policyVersion: POLICY_VERSION,
      modeClass: mode === "DRY_RUN" ? "trial" : "publishing",
    });
    stage = "idempotency";
    const begin = await ledger.begin(ledgerKey, runId);
    if (begin.status === "duplicate") {
      report.stages.select = { ...report.stages.select, duplicateOf: begin.previous.runId };
      return await finish("DUPLICATE_SKIPPED", `Zadanie wykonano już tego samego dnia w przebiegu ${begin.previous.runId}.`);
    }

    stage = "research";
    const researchResult = await research(task, complete, deps.sourceFetcher);
    report.stages.research = {
      candidates: researchResult.candidateCount,
      verifiedClaims: researchResult.claims.length,
      sources: researchResult.sources.length,
      dropped: researchResult.droppedCount,
      unreachable: researchResult.unreachableCount,
    };
    if (researchResult.claims.length === 0) {
      const blocked = researchResult.candidateCount > 0 && researchResult.droppedCount > 0;
      const gate = noMaterialGate(scheduled, blocked, researchResult);
      const decision = publishDecision(gate, { riskClass: "EVERGREEN" }, mode);
      report.gateReport = gate;
      report.decision = decision;
      report.stages.verify = { verdict: gate.verdict, reason: gate.findings[0]?.message };
      const outcome = outcomeFor(decision, mode, false);
      await ledger.complete(ledgerKey, outcome);
      return await finish(outcome);
    }

    const existingDocuments = await deps.store.listDocuments();
    const previous = existingDocuments.find((document) => document.canonicalUrl === task.target) ?? null;
    stage = "draft";
    const draftResult = await draft(task, researchResult, previous, complete, scheduled, runId);
    report.stages.draft = { id: draftResult.document.id, repaired: draftResult.repaired, contentHash: draftResult.document.contentHash };

    stage = "verify";
    const verified = verify(draftResult.document, researchResult, deps.inventory, scheduled, mode, previous);
    report.gateReport = verified.gateReport;
    report.decision = verified.decision;
    report.stages.verify = { verdict: verified.gateReport.verdict, decision: verified.decision };

    stage = "publish";
    const publishable = verified.decision === "REVIEW_REQUIRED" || verified.decision === "APPROVED_AUTOMATION";
    if (mode !== "DRY_RUN" && publishable) {
      const approved = mode === "AUTO_EVERGREEN" && verified.decision === "APPROVED_AUTOMATION";
      const finalDocument = ContentDocumentSchema.parse({
        ...verified.document,
        reviewStatus: approved ? "approved" : "in_review",
        ...(approved ? { reviewedBy: `automation-policy-${POLICY_VERSION}` } : {}),
      });
      const write = await deps.store.writeDocumentsAtomically([finalDocument]);
      storeChanged = true;
      const index = await deps.store.regenerateIndex();
      report.filesWritten = [...write.files, index];
      await ledger.markPending(task.target, runId, scheduled);
      report.stages.publish = { written: true, reviewStatus: finalDocument.reviewStatus };
    } else {
      report.stages.publish = { written: false, mode, decision: verified.decision };
    }

    const outcome = outcomeFor(verified.decision, mode, storeChanged);
    await ledger.complete(ledgerKey, outcome);
    const finished = await finish(outcome);
    deps.store.commitLastWrite();
    return finished;
  } catch (error) {
    if (storeChanged) {
      try {
        await deps.store.rollbackLastWrite();
        report.filesWritten = [];
      } catch {
        // Raport zachowuje pierwotny błąd; rollback ma własne testy integralności.
      }
      try {
        // Sprzątamy także zapis, po którym implementacja FS zgłosiła błąd.
        await ledger.releasePending(runId);
      } catch {
        // TTL propozycji i opcja CLI pozwalają posprzątać wpis po awarii systemu plików.
      }
    }
    const wrapped = error instanceof PipelineStageError ? error : new PipelineStageError(stage, safeErrorMessage(error), error);
    report.outcome = "FAILED";
    report.error = {
      class: error instanceof Error ? error.name : "UnknownError",
      message: safeErrorMessage(error),
      stage: wrapped.stage,
      code: safeErrorCode(error),
    };
    report.finishedAt = now().toISOString();
    report.usage = budget.summary();
    try {
      await ledger.fail(ledgerKey, wrapped);
    } catch {
      // Próba zapisu raportu nadal ma szansę się udać, nawet gdy ledger jest uszkodzony.
    }
    try {
      await ledger.writeReport(report as RunReport & Record<string, unknown>);
    } catch {
      // Gdy sam katalog stanu jest niedostępny, nie ma bezpiecznego miejsca zapisu zastępczego.
    }
    return report;
  } finally {
    if (lock) {
      try {
        await lock.release();
      } catch {
        // TTL zapewnia odzyskanie blokady po awarii zwalniania.
      }
    }
  }
}

