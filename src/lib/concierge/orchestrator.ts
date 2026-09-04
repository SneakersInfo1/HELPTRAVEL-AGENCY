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
    timeoutMs?: number;
  }) => Promise<unknown>;
  executors: {
    executeSearchTrips: (args: unknown) => Promise<unknown>;
    executeGetTripOffer: (args: unknown) => Promise<TripOffer>;
    executeListThemes: () => unknown;
  };
  /** Zegar (testy) — domyślnie Date.now. */
  now?: () => number;
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

/**
 * Czat renderuje CZYSTY tekst — markdown pokazuje się użytkownikowi dosłownie
 * jako gwiazdki/kratki. Zakaz jest w prompcie, ale modele (zwł. Haiku) i tak
 * wstawiają pogrubienia w dłuższych odpowiedziach, więc zdejmujemy je
 * mechanicznie: ** __ pogrubienia, nagłówki #, punktory "* " → "- ".
 */
function stripMarkdownArtifacts(text: string): string {
  return text
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/__([^_]*)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ");
}

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

/**
 * Licznik tokenów tury (koszt!) — sumuje pole `usage` z każdej odpowiedzi
 * OpenRouter. Logowany raz na turę (widoczny w logach runtime Vercela), co
 * daje obserwowalność kosztu od pierwszego dnia; próg alertu dostroimy po
 * realnym ruchu (Faza 6).
 */
interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  /** Tokeny wejścia odczytane z cache (10% ceny u Anthropic) — weryfikacja, że caching realnie działa. */
  cachedTokens: number;
  chatCalls: number;
  /**
   * Model i dostawca, które NAPRAWDĘ policzyły odpowiedź (echo z OpenRoutera).
   * Bez tego logi nie mówią, co jedzie na produkcji: slug siedzi w zmiennej
   * środowiskowej Vercela, a kod ma własny DEFAULT_MODEL — przy audycie
   * 2026-09-04 nie dało się z logów rozstrzygnąć, który z nich odpowiadał.
   */
  model: string | null;
  provider: string | null;
  /** Ile razy odpowiedź modelu była zdeformowana i wymagała ponowienia. */
  retries: number;
  /** Ile wywołań narzędzi wykonano w tej turze (koszt i czas ogona). */
  toolCalls: number;
}

function addUsage(totals: UsageTotals, payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const usage = (
    payload as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    }
  ).usage;
  if (!usage) return;
  // uwaga: chatCalls liczone jest w chatWithRetry, nie tutaj — odpowiedz
  // bledna nie ma pola `usage`, a wywolanie i tak sie odbylo i kosztowalo.
  totals.promptTokens += typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  totals.completionTokens +=
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  totals.cachedTokens +=
    typeof usage.prompt_tokens_details?.cached_tokens === "number"
      ? usage.prompt_tokens_details.cached_tokens
      : 0;
}

/** Echo modelu/dostawcy z odpowiedzi OpenRoutera (pola `model` i `provider`). */
function noteModel(totals: UsageTotals, payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const p = payload as { model?: unknown; provider?: unknown };
  if (typeof p.model === "string" && p.model) totals.model = p.model;
  if (typeof p.provider === "string" && p.provider) totals.provider = p.provider;
}

/**
 * JEDNA linia na turę w logach runtime Vercela (§34 audytu): model i dostawca,
 * które realnie odpowiedziały, czas tury, tokeny z podziałem na cache, liczba
 * rund modelu, ponowień i wywołań narzędzi. Bez PII — logujemy liczby i slugi,
 * nigdy treści rozmowy.
 */
function logTurn(usage: UsageTotals, elapsedMs: number, outcome: string): void {
  const cachePct =
    usage.promptTokens > 0 ? Math.round((usage.cachedTokens / usage.promptTokens) * 100) : 0;
  console.log("[concierge] turn", {
    model: usage.model,
    provider: usage.provider,
    outcome,
    elapsedMs,
    chatCalls: usage.chatCalls,
    toolCalls: usage.toolCalls,
    retries: usage.retries,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cachedTokens: usage.cachedTokens,
    cachePct,
  });
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

/** Twardy błąd API (np. zły klucz, brak środków) — ponawianie nic nie da. */
function isHardApiError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  return "error" in payload && Boolean((payload as ChatCompletionResponse).error);
}

/**
 * Jedno wywołanie modelu z JEDNĄ ponowną próbą na „miękko" zdeformowaną
 * odpowiedź (np. Gemini `MALFORMED_FUNCTION_CALL` — stochastyczny zwrot z
 * pustą wiadomością). Twardych błędów API nie ponawiamy (deterministyczne).
 */
async function chatWithRetry(
  deps: OrchestratorDeps,
  args: { messages: Record<string, unknown>[]; tools: Record<string, unknown>[]; timeoutMs?: number },
  usage: UsageTotals,
): Promise<unknown> {
  let response = await deps.chat(args);
  usage.chatCalls += 1;
  addUsage(usage, response);
  noteModel(usage, response);
  if (isMalformedResponse(response) && !isHardApiError(response)) {
    console.warn("[concierge] zdeformowana odpowiedź modelu — jedna ponowna próba");
    usage.retries += 1;
    response = await deps.chat(args);
    usage.chatCalls += 1;
    addUsage(usage, response);
    noteModel(usage, response);
  }
  return response;
}

// ── Budżet czasowy tury (incydent: 7×504 w 7 dni na prodzie) ────────────────
// Tura = do 4 rund LLM (każda ≤30 s) + narzędzia (loty potrafią 10–16 s) —
// ogon przekraczał maxDuration=60 route'a i user dostawał gołe 504 zamiast
// odpowiedzi. Mechanicznie: cała tura ma 50 s; gdy budżet topnieje, model
// dostaje krótszy timeout, a poniżej minimum NIE wołamy go wcale — jeśli
// karta oferty JUŻ jest, domykamy deterministycznym tekstem (bez LLM),
// w przeciwnym razie uczciwy błąd z przyciskiem „Spróbuj ponownie" w UI.
const TURN_BUDGET_MS = 50_000;
const MIN_CHAT_BUDGET_MS = 6_000;
const CHAT_TIMEOUT_CAP_MS = 30_000;

const OFFER_FALLBACK_TEXT =
  "Mam dla Ciebie ofertę — kartę z cenami i linkami widzisz poniżej. " +
  "Wyszukiwanie trwało dziś dłużej niż zwykle, więc na tym się zatrzymałem. " +
  "Chcesz zmienić termin, kierunek albo budżet? Napisz śmiało.";

/**
 * Zapas/przekroczenie budżetu liczy SYSTEM, nie model. Realny incydent
 * (Majorka, preview): oferta 5474 zł łącznie przy budżecie 5000 zł → Haiku
 * ogłosił „masz 474 zł zapasu" zamiast przekroczenia — zły ZNAK odejmowania.
 * budgetFit dokleja się do wyniku narzędzia (get_trip_offer z budgetPln od
 * modelu; auto-oferta z budżetu z argumentów search_trips) — model ma tę
 * liczbę cytować, nigdy liczyć.
 */
function computeBudgetFit(
  args: unknown,
  totalPerPersonPln: number | null,
): { budgetPerPersonPln: number; gapPln: number; note: string } | null {
  if (totalPerPersonPln === null || !args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  const budgetPln =
    typeof a.budgetPln === "number" && Number.isFinite(a.budgetPln) && a.budgetPln > 0
      ? a.budgetPln
      : null;
  if (budgetPln === null) return null;
  // „Łącznie" dzielimy przez REALNĄ liczbę podróżnych z argumentów — nie
  // sztywno przez 2 (realny incydent: rodzina 2+1 z 6000 zł łącznie dostała
  // „zapas 758 zł/os." przy ofercie 6726 zł > 6000 zł).
  const adults = typeof a.adults === "number" && a.adults >= 1 ? a.adults : 2;
  const children = typeof a.children === "number" && a.children >= 0 ? a.children : 0;
  const pax = Math.max(1, adults + children);
  const perPerson = a.budgetKind === "total_two" ? budgetPln / pax : budgetPln;
  const gapPln = Math.round(perPerson - totalPerPersonPln);
  const note =
    gapPln >= 0
      ? `Oferta MIEŚCI SIĘ w budżecie: zapas ${gapPln} zł/os. Cytuj dokładnie tę kwotę zapasu.`
      : `Oferta PRZEKRACZA budżet użytkownika o ${-gapPln} zł/os. — to NIE jest zapas. Powiedz o przekroczeniu wprost i zaproponuj alternatywę (inny kierunek lub termin).`;
  return { budgetPerPersonPln: Math.round(perPerson), gapPln, note };
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
        // AUTO-OFERTA: tani model NIE łańcuchuje niezawodnie get_trip_offer po
        // search_trips (zweryfikowane na preview — user utknął bez karty mimo
        // instrukcji w prompcie). Dlatego kartę najlepszego kandydata pobiera
        // SYSTEM, nie model: krótszy lejek (karta w tej samej turze) i zero
        // zależności od dyscypliny LLM. month/nights użytkownika przechodzą
        // z argumentów wyszukiwania → live ceny na JEGO termin. Porażka
        // auto-oferty nie psuje wyniku wyszukiwania (spadamy do samej listy).
        const candidates = (result as { candidates?: Array<Record<string, unknown>> } | null)
          ?.candidates;
        const top = Array.isArray(candidates) ? candidates[0] : undefined;
        if (top && typeof top.cityEn === "string" && typeof top.countryEn === "string") {
          const searchArgs = (args && typeof args === "object" ? args : {}) as Record<
            string,
            unknown
          >;
          try {
            const offer = await executors.executeGetTripOffer({
              cityEn: top.cityEn,
              countryEn: top.countryEn,
              origin: searchArgs.origin ?? "WAW",
              adults: searchArgs.adults ?? 2,
              children: searchArgs.children ?? 0,
              month: searchArgs.month,
              nights: searchArgs.nights,
              // Sam hotel / sam lot — auto-oferta respektuje życzenie z search
              // (inaczej klient „bez lotu" dostawał kartę z lotem i ceną pakietu).
              wantsFlight: searchArgs.wantsFlight,
              wantsHotel: searchArgs.wantsHotel,
            });
            const budgetFit = computeBudgetFit(searchArgs, offer.totalPerPersonPln);
            return {
              result: {
                ...(result as Record<string, unknown>),
                // Top kandydat JEST auto-ofertą — wycinamy go z listy, żeby
                // model nie cytował tego samego miasta drugi raz z INNĄ
                // (snapshotową) ceną jako „alternatywy" (realny incydent:
                // karta Larnaka 1833 zł/os. + „alternatywa Larnaka od 1081").
                candidates: candidates!.slice(1),
                autoOffer: budgetFit ? { ...offer, budgetFit } : offer,
                autoOfferNote:
                  "Karta tej oferty (najlepszy kandydat) została JUŻ pokazana użytkownikowi, z linkami „Zobacz hotel” i „Zobacz lot”. Omów jej wartość (cena, daty z karty, zapas do budżetu wg budgetFit) i wymień 1–2 alternatywy z candidates (to już TYLKO inne kierunki).",
              },
              offer,
            };
          } catch (err) {
            console.warn(
              "concierge: auto-oferta po search_trips nieudana",
              err instanceof Error ? err.message : err,
            );
          }
        }
        return { result, offer: null };
      }
      case "get_trip_offer": {
        const offer = await executors.executeGetTripOffer(args);
        // budgetFit tylko w treści DLA MODELU — karta (offer) zostaje czysta.
        const budgetFit = computeBudgetFit(args, offer.totalPerPersonPln);
        return { result: budgetFit ? { ...offer, budgetFit } : offer, offer };
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
  // PROMPT CACHING (Anthropic przez OpenRouter): schematy narzędzi + system
  // prompt to STATYCZNY prefiks ~3,5k tokenów wysyłany z każdym wywołaniem —
  // breakpoint cache_control na system message każe Anthropic cache'ować cały
  // prefiks (tools+system), odczyt kosztuje 10% ceny wejścia. Drugi breakpoint
  // na ostatniej wiadomości historii: kolejne rundy narzędzi w TEJ turze i
  // następna tura rozmowy czytają dotychczasową historię z cache (Anthropic
  // sam znajduje najdłuższy wcześniej zapisany prefiks). Dostawcy bez cache
  // (fallback gemini-flash-lite) ignorują adnotację — OpenRouter ją wycina.
  const trimmed = trimHistory(history);
  const lastIdx = trimmed.length - 1;
  if (lastIdx >= 0 && typeof trimmed[lastIdx].content === "string") {
    trimmed[lastIdx] = {
      role: trimmed[lastIdx].role,
      content: [
        {
          type: "text",
          text: trimmed[lastIdx].content,
          cache_control: { type: "ephemeral" },
        },
      ],
    };
  }
  const messages: Record<string, unknown>[] = [
    {
      role: "system",
      content: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    },
    ...trimmed,
  ];

  let offer: TripOffer | null = null;
  const usage: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    chatCalls: 0,
    model: null,
    provider: null,
    retries: 0,
    toolCalls: 0,
  };

  const nowFn = deps.now ?? Date.now;
  const startedAt = nowFn();
  const timeLeft = () => TURN_BUDGET_MS - (nowFn() - startedAt);
  const chatTimeout = () => Math.min(CHAT_TIMEOUT_CAP_MS, Math.max(MIN_CHAT_BUDGET_MS, timeLeft() - 2_000));
  const outOfBudget = (): ConciergeResult => {
    logTurn(usage, nowFn() - startedAt, offer ? "budget-exhausted+offer" : "budget-exhausted");
    return offer
      ? { text: OFFER_FALLBACK_TEXT, offer, error: false }
      : { text: FALLBACK_ERROR_TEXT, offer: null, error: true };
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (timeLeft() < MIN_CHAT_BUDGET_MS) return outOfBudget();
    const response = await chatWithRetry(deps, { messages, tools: TOOL_DEFS, timeoutMs: chatTimeout() }, usage);

    if (isMalformedResponse(response)) {
      console.error("concierge: OpenRouter error", response);
      logTurn(usage, nowFn() - startedAt, "model-error");
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
        // Budżet krytycznie niski → NIE wykonujemy narzędzia (loty potrafią
        // 10–16 s), ale KAŻDY tool_call musi dostać odpowiedź role:"tool"
        // (wiszący id = 400 od providera i martwa rozmowa).
        if (timeLeft() < MIN_CHAT_BUDGET_MS + 4_000) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: "Przekroczono budżet czasu — odpowiedz na podstawie dotychczasowych danych." }),
          });
          continue;
        }
        usage.toolCalls += 1;
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
      logTurn(usage, nowFn() - startedAt, offer ? "ok+offer" : "ok");
      return { text: stripMarkdownArtifacts(message.content), offer, error: false };
    }

    // Ani content, ani tool_calls — traktujemy jak zdeformowaną odpowiedź.
    console.error("concierge: OpenRouter error", response);
    logTurn(usage, nowFn() - startedAt, "empty-response");
    return { text: FALLBACK_ERROR_TEXT, offer: null, error: true };
  }

  // Limit rund osiągnięty — finalne wywołanie BEZ narzędzi, wymusza tekst.
  if (timeLeft() < MIN_CHAT_BUDGET_MS) return outOfBudget();
  const finalResponse = await chatWithRetry(deps, { messages, tools: [], timeoutMs: chatTimeout() }, usage);
  if (isMalformedResponse(finalResponse)) {
    console.error("concierge: OpenRouter error", finalResponse);
    return { text: FALLBACK_ERROR_TEXT, offer: null, error: true };
  }
  const finalMessage = (finalResponse as ChatCompletionResponse).choices![0]!.message!;
  if (typeof finalMessage.content === "string") {
    logTurn(usage, nowFn() - startedAt, offer ? "ok+offer(max-rounds)" : "ok(max-rounds)");
    return { text: stripMarkdownArtifacts(finalMessage.content), offer, error: false };
  }
  console.error("concierge: OpenRouter error", finalResponse);
  return { text: FALLBACK_ERROR_TEXT, offer: null, error: true };
}
