// Klient Claude dla silnika treści — oficjalny SDK, osobny klucz i osobne rozliczenie.
//
// Klucz czytany WYŁĄCZNIE z `SEO_ENGINE_ANTHROPIC_API_KEY` (nie z
// `ANTHROPIC_API_KEY` aplikacji): zadanie wsadowe ma własny limit i własne
// zużycie, a subskrypcja Claude Code nie jest dostępem do API.
//
// Ponowienia robi `withRetry` w pipeline'ie, nie SDK (`maxRetries: 0`) —
// inaczej ponowione żądanie ominęłoby kontrolę budżetu przed wysłaniem.

import Anthropic from "@anthropic-ai/sdk";

import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from "./llm";
import { modelForRole, supportsServerSideFallback, type EngineEnv } from "./models";

export interface AnthropicLlmOptions {
  env?: EngineEnv;
  timeoutMs?: number;
  /** Wstrzykiwany klient — do testów bez sieci. */
  client?: Pick<Anthropic, "beta">;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AnthropicLlm implements LlmClient {
  private readonly env: EngineEnv;
  private readonly timeoutMs: number;
  private client: Pick<Anthropic, "beta"> | null;

  constructor(options: AnthropicLlmOptions = {}) {
    this.env = options.env ?? process.env;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.client = options.client ?? null;
  }

  private resolveClient(): Pick<Anthropic, "beta"> {
    if (this.client) return this.client;
    const apiKey = this.env.SEO_ENGINE_ANTHROPIC_API_KEY;
    if (!apiKey) throw new LlmError("Brak SEO_ENGINE_ANTHROPIC_API_KEY", null, false, "configuration");
    this.client = new Anthropic({ apiKey, maxRetries: 0, timeout: this.timeoutMs });
    return this.client;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const client = this.resolveClient();
    const model = request.model || modelForRole(request.role, this.env);
    const withFallback = supportsServerSideFallback(model);
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        // Myślenie adaptacyjne jest w tych modelach włączone domyślnie; głębokość
        // ustawia effort. „medium" wystarcza do ekstrakcji cytatów i redakcji JSON.
        output_config: { effort: "medium" },
        // Odmowa klasyfikatora nie może po cichu zakończyć przebiegu pustym tekstem:
        // tam, gdzie API to wspiera, żądanie przechodzi na model zapasowy.
        ...(withFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      });

      if (response.stop_reason === "refusal") {
        throw new LlmError(`Model odmówił odpowiedzi (${response.stop_details?.category ?? "bez kategorii"})`, null, false, "refusal");
      }
      if (response.stop_reason === "max_tokens") {
        throw new LlmError("Odpowiedź ucięta limitem max_tokens — JSON byłby niekompletny", null, false, "invalid_response");
      }
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n");
      if (text === "") throw new LlmError("Odpowiedź modelu nie zawiera tekstu", null, false, "invalid_response");

      const usage = response.usage;
      return {
        text,
        model: response.model,
        usage: {
          // Zapis i odczyt cache też są wejściem — do limitu liczymy je po pełnej cenie.
          inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
          outputTokens: usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new LlmError("Przekroczono czas odpowiedzi Anthropic", null, true, "timeout");
      }
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new LlmError(`Anthropic odrzucił poświadczenia (HTTP ${error.status})`, error.status ?? 401, false, "http");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new LlmError("Anthropic: limit żądań (HTTP 429)", 429, true, "http");
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new LlmError("Błąd połączenia z Anthropic", null, true, "http");
      }
      if (error instanceof Anthropic.APIError) {
        const status = typeof error.status === "number" ? error.status : null;
        throw new LlmError(`Anthropic zwrócił HTTP ${status ?? "?"}`, status, status !== null && status >= 500, "http");
      }
      throw new LlmError("Nieznany błąd klienta Anthropic", null, false, "http");
    }
  }
}
