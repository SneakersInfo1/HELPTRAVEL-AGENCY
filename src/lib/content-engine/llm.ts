import type { ModelRole } from "./models";
import type { Sleep } from "./retry";

export type LlmRole = ModelRole;

export interface LlmRequest {
  role: LlmRole;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  model: string;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  readonly name = "LlmError";

  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly code?: "timeout" | "http" | "configuration" | "invalid_response" | "refusal",
    /** Zużycie żądania, które skończyło się błędem po stronie treści (ucięcie, odmowa) — też jest płatne. */
    readonly usage?: { inputTokens: number; outputTokens: number; model: string },
  ) {
    super(message);
  }
}

export interface FakeLlmFailure {
  status?: number;
  message?: string;
  timeout?: boolean;
}

export type FakeLlmStep = string | LlmResponse | Error | FakeLlmFailure;

export interface FakeLlmOptions {
  failures?: Partial<Record<LlmRole, readonly FakeLlmFailure[]>>;
  latencyMs?: number | Partial<Record<LlmRole, number>>;
  sleep?: Sleep;
  defaultUsage?: { inputTokens: number; outputTokens: number };
}

function isLlmResponse(value: FakeLlmStep): value is LlmResponse {
  return typeof value === "object" && value !== null && "text" in value && "usage" in value && "model" in value;
}

function isFailure(value: FakeLlmStep): value is FakeLlmFailure {
  return typeof value === "object" && value !== null && !(value instanceof Error) && !isLlmResponse(value);
}

function failureToError(failure: FakeLlmFailure): LlmError {
  if (failure.timeout) return new LlmError(failure.message ?? "Przekroczono czas odpowiedzi modelu", null, true, "timeout");
  const status = failure.status ?? 500;
  return new LlmError(failure.message ?? `Model zwrócił HTTP ${status}`, status, status === 429 || status >= 500, "http");
}

/** Klient testowy nie szacuje tokenów z tekstu — zużycie zawsze pochodzi ze skryptu albo jawnej stałej testowej. */
export class FakeLlm implements LlmClient {
  readonly calls: LlmRequest[] = [];
  private readonly positions: Record<LlmRole, number> = { selector: 0, researcher: 0, writer: 0, verifier_assist: 0 };
  private readonly failurePositions: Record<LlmRole, number> = { selector: 0, researcher: 0, writer: 0, verifier_assist: 0 };

  constructor(
    private readonly scripts: Partial<Record<LlmRole, readonly FakeLlmStep[]>>,
    private readonly options: FakeLlmOptions = {},
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push({ ...request });
    const latency = typeof this.options.latencyMs === "number" ? this.options.latencyMs : (this.options.latencyMs?.[request.role] ?? 0);
    if (latency > 0) await (this.options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(latency);

    const failures = this.options.failures?.[request.role] ?? [];
    const failureIndex = this.failurePositions[request.role];
    if (failureIndex < failures.length) {
      this.failurePositions[request.role] += 1;
      throw failureToError(failures[failureIndex]);
    }

    const steps = this.scripts[request.role] ?? [];
    const index = this.positions[request.role];
    if (index >= steps.length) {
      throw new LlmError(`Brak odpowiedzi FakeLlm dla roli ${request.role}, wywołanie ${index + 1}`, null, false, "configuration");
    }
    this.positions[request.role] += 1;
    const step = steps[index];
    if (step instanceof Error) throw step;
    if (isFailure(step)) throw failureToError(step);
    if (isLlmResponse(step)) return step;
    return {
      text: step,
      model: request.model,
      usage: this.options.defaultUsage ?? { inputTokens: 100, outputTokens: 200 },
    };
  }
}
