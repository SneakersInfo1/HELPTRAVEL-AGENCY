// Server-only HTTP client for OpenRouter Chat Completions API. Do not import from client components.

// Hard cost/abuse safeguards
export const MAX_TOOL_ROUNDS = 4;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_INPUT_CHARS = 1500;
export const MAX_TOKENS = 700;

/**
 * Model wbudowany (zatwierdzony w planie). Env OPENROUTER_MODEL może go
 * nadpisać, ALE: nieaktualny slug w env dwukrotnie położył czat (lokalnie
 * i na Vercelu — `gemma-3-27b-it:free` z maja przestał istnieć). Dlatego na
 * błąd „model niedostępny" robimy JEDNĄ ponowną próbę na modelu domyślnym
 * i głośno logujemy — zła konfiguracja degraduje się do działania, nie do
 * martwego czatu.
 */
export const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

interface ChatCompletionArgs {
  messages: Record<string, unknown>[];
  tools: Record<string, unknown>[];
  stream?: boolean;
}

/** Błąd OpenRoutera wskazujący na zły/nieistniejący slug modelu (404 + tekst o modelu). */
function isInvalidModelError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const err = (payload as { error?: { code?: unknown; message?: unknown } }).error;
  if (!err || typeof err !== "object") return false;
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  return err.code === 404 && (message.includes("model") || message.includes("slug"));
}

async function requestChatCompletion(
  apiKey: string,
  model: string,
  { messages, tools, stream = false }: ChatCompletionArgs,
): Promise<unknown | ReadableStream<unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: MAX_TOKENS,
      stream,
    };

    // Include tools only if the array is not empty
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://helptravel.pl",
        "X-Title": "HelpTravel",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (stream && response.body) {
      return response.body;
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function chatCompletion(args: ChatCompletionArgs): Promise<unknown | ReadableStream<unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const result = await requestChatCompletion(apiKey, model, args);

  // Fallback: env wskazuje slug, którego OpenRouter nie zna → ponów raz na
  // modelu wbudowanym (chyba że to on właśnie zawiódł). Strumienia nie da się
  // zbadać bez konsumpcji, więc fallback dotyczy tylko odpowiedzi JSON.
  if (model !== DEFAULT_MODEL && !(result instanceof ReadableStream) && isInvalidModelError(result)) {
    console.error(
      `[concierge] OPENROUTER_MODEL="${model}" odrzucony przez OpenRouter (zły/nieistniejący slug) — fallback na ${DEFAULT_MODEL}. Popraw albo usuń zmienną środowiskową.`,
    );
    return requestChatCompletion(apiKey, DEFAULT_MODEL, args);
  }

  return result;
}
