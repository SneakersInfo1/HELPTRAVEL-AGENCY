// Pętla orkiestracji AI Concierge (Task 3.2): mediuje między modelem
// (OpenRouter, non-stream) a egzekutorami narzędzi (Task 2.2). Zero I/O
// bezpośredniego — wszystko przez wstrzyknięte OrchestratorDeps, więc test
// jednostkowy działa bez sieci (route z Task 3.3 wiąże produkcyjne zależności).
//
// TWARDA ZASADA UCZCIWOŚCI: `chatCompletion` NIE sprawdza response.ok — błąd
// OpenRouter (zły klucz, rate limit) parsuje się jako JSON i wygląda jak
// sukces na poziomie transportu. Dlatego KAŻDA odpowiedź modelu jest tu
// walidowana (brak choices[0].message albo pole error) i zamieniana na
// łagodny komunikat PL — nigdy crash, nigdy udawany sukces.

import { MAX_HISTORY_MESSAGES, MAX_INPUT_CHARS, MAX_TOOL_ROUNDS } from "./openrouter";
import { SYSTEM_PROMPT } from "./system-prompt";
import { TOOL_DEFS } from "./tools";
import type { TripOffer } from "./types";

/** Zależności wstrzykiwane do testów — route (Task 3.3) wiąże produkcyjne. */
export interface OrchestratorDeps {
  /** Prod: chatCompletion (non-stream) z ./openrouter. */
  chat: (args: {
    messages: Record<string, unknown>[];
    tools: Record<string, unknown>[];
  }) => Promise<unknown>;
  executors: {
    executeSearchTrips: (args: unknown) => Promise<unknown>;
    executeGetTripOffer: (args: unknown) => Promise<TripOffer>;
    executeListThemes: () => unknown;
  };
}

export interface ConciergeResult {
  /** Finalny tekst asystenta (PL). Zawsze obecny — także przy błędzie (łagodny komunikat). */
  text: string;
  /** TripOffer z OSTATNIEGO udanego get_trip_offer w tej turze (do karty), else null. */
  offer: TripOffer | null;
  /** true gdy wystąpił błąd transportu/modelu (UI może pokazać stan błędu). */
  error: boolean;
}

const FALLBACK_ERROR_TEXT = "Chwilowo nie mogę odpowiedzieć — spróbuj za moment.";

/** Maks. liczba tool_calls obsłużonych w jednej rundzie — reszta ignorowana. */
const MAX_TOOL_CALLS_PER_ROUND = 3;

type HistoryMessage = { role: "user" | "assistant"; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Wąska, defensywna odpowiedź OpenRouter/OpenAI chat completions. */
interface ChatCompletionMessage {
  role?: string;
  content?: string | null;
  tool_calls?: ToolCall[];
}
interface ChatCompletionResponse {
  choices?: { message?: ChatCompletionMessage }[];
  error?: unknown;
}

/** Przycina historię: ostatnie MAX_HISTORY_MESSAGES wiadomości, treść ≤ MAX_INPUT_CHARS. */
function trimHistory(history: HistoryMessage[]): Record<string, unknown>[] {
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  return trimmed.map((m) => ({
    role: m.role,
    content: m.content.length > MAX_INPUT_CHARS ? m.content.slice(0, MAX_INPUT_CHARS) : m.content,
  }));
}

/** Wąska walidacja kształtu odpowiedzi modelu — patrz nagłówek pliku. */
function isMalformedResponse(payload: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object") return true;
  const p = payload as ChatCompletionResponse;
  if ("error" in p && p.error) return true;
  const message = p.choices?.[0]?.message;
  if (!message) return true;
  const hasContent = typeof message.content === "string";
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  return !hasContent && !hasToolCalls;
}

/** Dispatch bezpieczny: nigdy nie rzuca — błąd egzekutora/parsowania staje się wynikiem narzędzia. */
async function dispatchToolCall(
  call: ToolCall,
  executors: OrchestratorDeps["executors"],
): Promise<{ result: unknown; offer: TripOffer | null }> {
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return { result: { error: "Nieprawidłowe argumenty narzędzia" }, offer: null };
  }

  try {
    switch (call.function.name) {
      case "search_trips": {
        const result = await executors.executeSearchTrips(args);
        return { result, offer: null };
      }
      case "get_trip_offer": {
        const offer = await executors.executeGetTripOffer(args);
        return { result: offer, offer };
      }
      case "list_themes": {
        const result = executors.executeListThemes();
        return { result, offer: null };
      }
      default:
        return { result: { error: "Nieznane narzędzie" }, offer: null };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("concierge: egzekutor narzędzia rzucił błąd", call.function.name, message);
    return { result: { error: message }, offer: null };
  }
}

/**
 * Uruchamia turę konwersacji: wysyła historię do modelu, wykonuje żądane
 * narzędzia (do MAX_TOOL_ROUNDS rund), i zwraca finalny tekst + ewentualną
 * ofertę. Nigdy nie rzuca — każda ścieżka błędu kończy się łagodnym tekstem PL.
 */
export async function runConcierge(
  history: HistoryMessage[],
  deps: OrchestratorDeps,
): Promise<ConciergeResult> {
  const messages: Record<string, unknown>[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history),
  ];

  let offer: TripOffer | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await deps.chat({ messages, tools: TOOL_DEFS });

    if (isMalformedResponse(response)) {
      console.error("concierge: OpenRouter error", response);
      return { text: FALLBACK_ERROR_TEXT, offer: null, error: true };
    }

    const message = (response as ChatCompletionResponse).choices![0]!.message!;

    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      // Ucięte tool_calls muszą odpowiadać 1:1 wiadomościom role:"tool" —
      // wiszący tool_call_id bez odpowiedzi = provider w formacie OpenAI
      // odrzuca kolejny request (400) i zabija rozmowę. Dlatego do historii
      // trafia TYLKO wykonywany podzbiór, nigdy pełna lista z modelu.
      const callsToRun = message.tool_calls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: callsToRun,
      });
      for (const call of callsToRun) {
        const { result, offer: callOffer } = await dispatchToolCall(call, deps.executors);
        if (callOffer) offer = callOffer;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    if (typeof message.content === "string") {
      return { text: message.content, offer, error: false };
    }

    // Ani content, ani tool_calls — traktujemy jak zdeformowaną odpowiedź.
    console.error("concierge: OpenRouter error", response);
    return { text: FALLBACK_ERROR_TEXT, offer: null, error: true };
  }

  // Limit rund osiągnięty — finalne wywołanie BEZ narzędzi, wymusza tekst.
  const finalResponse = await deps.chat({ messages, tools: [] });
  if (isMalformedResponse(finalResponse)) {
    console.error("concierge: OpenRouter error", finalResponse);
    return { text: FALLBACK_ERROR_TEXT, offer: null, error: true };
  }
  const finalMessage = (finalResponse as ChatCompletionResponse).choices![0]!.message!;
  if (typeof finalMessage.content === "string") {
    return { text: finalMessage.content, offer, error: false };
  }
  console.error("concierge: OpenRouter error", finalResponse);
  return { text: FALLBACK_ERROR_TEXT, offer: null, error: true };
}
