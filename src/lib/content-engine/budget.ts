import { priceForModel, type EngineEnv } from "./models";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface BudgetCaps {
  maxUsd: number;
  maxRequests: number;
  maxOutputTokens: number;
  maxRuntimeSeconds: number;
}

export interface BudgetSummary extends TokenUsage {
  requests: number;
  costUsd: number;
  runtimeSeconds: number;
  caps: BudgetCaps;
}

export type BudgetDimension = "usd" | "requests" | "output_tokens" | "runtime";

export class BudgetExceededError extends Error {
  readonly name = "BudgetExceededError";

  constructor(
    readonly dimension: BudgetDimension,
    readonly limit: number,
    readonly actual: number,
  ) {
    super(`Przekroczono limit ${dimension}: ${actual} / ${limit}`);
  }
}

function positiveNumber(env: EngineEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface RunBudgetOptions {
  env?: EngineEnv;
  now?: () => number;
  startedAtMs?: number;
}

export class RunBudget {
  readonly caps: BudgetCaps;
  private readonly now: () => number;
  private readonly startedAtMs: number;
  private requests = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private costUsd = 0;

  constructor(options: RunBudgetOptions = {}) {
    const env = options.env ?? process.env;
    this.now = options.now ?? Date.now;
    this.startedAtMs = options.startedAtMs ?? this.now();
    this.caps = {
      maxUsd: positiveNumber(env, "SEO_ENGINE_MAX_USD_PER_RUN", 1.5),
      maxRequests: positiveNumber(env, "SEO_ENGINE_MAX_REQUESTS_PER_RUN", 24),
      maxOutputTokens: positiveNumber(env, "SEO_ENGINE_MAX_OUTPUT_TOKENS_PER_RUN", 60_000),
      maxRuntimeSeconds: positiveNumber(env, "SEO_ENGINE_MAX_RUNTIME_SECONDS", 900),
    };
  }

  /** Rezerwacja żądania jest atomowa z kontrolą limitów, więc retry też zużywa limit. */
  assertCanSpend(): void {
    this.assertRuntime();
    if (this.requests >= this.caps.maxRequests) {
      throw new BudgetExceededError("requests", this.caps.maxRequests, this.requests);
    }
    if (this.outputTokens >= this.caps.maxOutputTokens) {
      throw new BudgetExceededError("output_tokens", this.caps.maxOutputTokens, this.outputTokens);
    }
    if (this.costUsd >= this.caps.maxUsd) {
      throw new BudgetExceededError("usd", this.caps.maxUsd, this.costUsd);
    }
    this.requests += 1;
  }

  charge(usage: TokenUsage, model: string): void {
    if (!Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens) || usage.inputTokens < 0 || usage.outputTokens < 0) {
      throw new TypeError("Zużycie tokenów musi zawierać nieujemne, skończone liczby");
    }
    const price = priceForModel(model);
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.costUsd += (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
    this.assertRuntime();
  }

  summary(): BudgetSummary {
    return {
      requests: this.requests,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      costUsd: Math.round(this.costUsd * 1_000_000) / 1_000_000,
      runtimeSeconds: Math.max(0, this.now() - this.startedAtMs) / 1000,
      caps: this.caps,
    };
  }

  private assertRuntime(): void {
    const seconds = Math.max(0, this.now() - this.startedAtMs) / 1000;
    if (seconds >= this.caps.maxRuntimeSeconds) {
      throw new BudgetExceededError("runtime", this.caps.maxRuntimeSeconds, seconds);
    }
  }
}

