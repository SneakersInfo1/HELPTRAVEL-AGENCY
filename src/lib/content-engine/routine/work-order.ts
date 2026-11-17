import path from "node:path";
import { z } from "zod";

import {
  CandidateClaimSchema,
  DraftBodySchema,
  type CandidateClaimRejection,
} from "../pipeline";
import { ContentDocumentSchema, ContentTypeSchema, FactClaimSchema, SourceSchema } from "../schema";

const IsoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TaskEvidenceSchema = z.object({
  source: z.enum(["page", "query"]),
  key: z.string(),
  clicks: z.number().nonnegative(),
  impressions: z.number().nonnegative(),
  ctr: z.number().nonnegative(),
  position: z.number().nonnegative(),
  opportunityScore: z.number().optional(),
  internalLinkTargets: z.array(z.string().regex(/^\//)).optional(),
});

export const RoutineTaskSchema = z.object({
  operation: z.enum(["refresh", "new_article"]),
  target: z.string().regex(/^\//),
  primaryQuery: z.string().min(1),
  evidence: TaskEvidenceSchema,
  rationale: z.string().min(1),
  decision: z.literal("REVIEW_REQUIRED").optional(),
});

export const RegisteredSourceWorkOrderSchema = z.object({
  url: z.string().url(),
  publisher: z.string().min(1),
  covers: z.string().min(1),
  aiInput: z.boolean(),
  status: z.number().int().nullable(),
  textFile: z.string().nullable(),
});

export const WorkOrderSchema = z.object({
  runId: z.string().min(3),
  day: IsoDaySchema,
  scheduledAt: z.string().datetime(),
  baseBranch: z.string().min(1),
  stateBranch: z.string().startsWith("claude/"),
  task: RoutineTaskSchema,
  contentType: ContentTypeSchema,
  docId: z.string().min(1),
  internalLinkTargets: z.array(z.string().regex(/^\//)),
  previousDocument: ContentDocumentSchema.nullable(),
  registeredSources: z.array(RegisteredSourceWorkOrderSchema),
  curatedClaims: z.array(CandidateClaimSchema),
  allowedSourceDomains: z.array(z.string().min(1)),
  instructions: z.object({ researcher: z.string().min(1), writer: z.string().min(1) }),
  limits: z.object({
    maxRegisteredSources: z.number().int().positive(),
    sourceExcerptChars: z.number().int().positive(),
    maxDraftRepairs: z.literal(1),
  }),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const CandidatesFileSchema = z.union([
  z.array(CandidateClaimSchema),
  z.object({ claims: z.array(CandidateClaimSchema) }),
]);

export const CandidateRejectionSchema = z.object({
  candidate: CandidateClaimSchema,
  reason: z.enum(["source_not_allowed", "source_unreachable", "source_http_error", "evidence_not_found", "numbers_not_covered"]),
  detail: z.string(),
}) satisfies z.ZodType<CandidateClaimRejection>;

export const ResearchFileSchema = z.object({
  claims: z.array(FactClaimSchema),
  sources: z.array(SourceSchema),
  candidateCount: z.number().int().nonnegative(),
  droppedCount: z.number().int().nonnegative(),
  unreachableCount: z.number().int().nonnegative(),
  rejected: z.array(CandidateRejectionSchema),
});
export type ResearchFile = z.infer<typeof ResearchFileSchema>;

export { DraftBodySchema };

export const RoutineStatusSchema = z.enum([
  "KILLED",
  "NO_TASK",
  "REVIEW_REQUIRED",
  "DUPLICATE_SKIPPED",
  "TASK_READY",
  "CLAIMS_VERIFIED",
  "BLOCKED_FACTS",
  "NO_VERIFIED_MATERIAL",
  "DRAFT_READY",
  "REJECTED",
  "PR_CREATED",
  "PR_FAILED",
  "FAILED",
]);
export type RoutineStatus = z.infer<typeof RoutineStatusSchema>;

export const RoutineResultSchema = z.object({
  status: RoutineStatusSchema,
  runId: z.string().optional(),
  day: IsoDaySchema.optional(),
  reason: z.string().optional(),
  errors: z.array(z.string()).optional(),
  retryAllowed: z.boolean().optional(),
  finalizeAttempts: z.number().int().nonnegative().optional(),
  verifiedClaims: z.number().int().nonnegative().optional(),
  sources: z.number().int().nonnegative().optional(),
  gate: z.object({ verdict: z.string(), metrics: z.record(z.string(), z.number()) }).optional(),
  prNumber: z.number().int().positive().optional(),
  prUrl: z.string().url().optional(),
  branch: z.string().optional(),
  pending: z.number().int().nonnegative().optional(),
  proposalBranches: z.array(z.string()).optional(),
  claims: z.array(z.object({ day: IsoDaySchema, runId: z.string() })).optional(),
});
export type RoutineResult = z.infer<typeof RoutineResultSchema>;

export interface RoutinePaths {
  root: string;
  sources: string;
  workOrder: string;
  candidates: string;
  research: string;
  draftBody: string;
  prBody: string;
  result: string;
}

export function routinePaths(root = ".seo-routine"): RoutinePaths {
  return {
    root,
    sources: path.join(root, "sources"),
    workOrder: path.join(root, "work-order.json"),
    candidates: path.join(root, "candidates.json"),
    research: path.join(root, "research.json"),
    draftBody: path.join(root, "draft-body.json"),
    prBody: path.join(root, "pr-body.md"),
    result: path.join(root, "result.json"),
  };
}
