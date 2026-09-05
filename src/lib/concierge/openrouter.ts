// Server-only HTTP client for OpenRouter Chat Completions API. Do not import from client components.
//
// KONFIGURACJA MODELU (§41 audytu — model zmienia się zmienną, nie refaktorem):
//   OPENROUTER_MODEL           model podstawowy (brak → DEFAULT_MODEL z tego pliku)
//   OPENROUTER_FALLBACK_MODEL  model zapasowy; pusty = brak zapasu
// Zapas uruchamia się WYŁĄCZNIE na awarię (brak treści i brak tool_calls albo
// błąd API) — nigdy dlatego, że odpowiedź się nie podoba.

// Hard cost/abuse safeguards
export const MAX_TOOL_ROUNDS = 4;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_INPUT_CHARS = 1500;
export const MAX_TOKENS = 700;

/**
 * Model podstawowy. Env OPENROUTER_MODEL go nadpisuje, ALE: nieaktualny slug
 * w env dwukrotnie polozyl czat (`gemma-3-27b-it:free` przestala istniec).
 * Dlatego na blad „model niedostepny" robimy JEDNA ponowna probe na modelu
 * domyslnym i glosno logujemy — zla konfiguracja degraduje sie do dzialania.
 *
 * DLACZEGO haiku-4.5 (zmiana 2026-09-05, pomiar w docs/concierge-v2):
 * Ta stala mowila wczesniej `google/gemini-2.5-flash-lite`, ale PRODUKCJA i
 * tak jedzie na haiku-4.5 z OPENROUTER_MODEL — wykazal to dopiero nowy log
 * `[concierge] turn`, ktory podaje model i dostawce z ODPOWIEDZI. Rozjazd byl
 * grozny: gdyby ktos kiedykolwiek usunal zmienna ze srodowiska, czat po cichu
 * zszedlby na model, ktory w slepym sedziowaniu parami przegrywa z haiku 4:32
 * i wygrywa tylko 13% wszystkich starc. Domyslna wartosc = to, co realnie
 * jedzie, wiec brak zmiennej niczego juz nie psuje.
 *
 * Haiku obronilo sie tez merytorycznie: 69% wygranych i NAJLEPSZA polszczyzna
 * (75%) w slepym sedziowaniu — wiecej niz gemini-3.1-flash-lite (62%/64%)
 * i luna (56%/46%). Jest za to najdrozsze (21,61 USD/1k rozmow bez cache) i
 * slabsze w sprawdzeniach deterministycznych (57% vs 68%). Przy naszym ruchu
 * (~240 rozmow/mies.) cala roznica to ~14 zl/mies., wiec jakosc wygrywa.
 */
export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

/**
 * Model ZAPASOWY (tylko na awarie — patrz chatCompletion).
 * `gemini-3.1-flash-lite` celowo od INNEGO dostawcy niz podstawowy: awaria
 * Anthropica/Bedrocka nie moze zabrac obu naraz. To drugi wynik u sedziego
 * (62% wygranych), najlepsza dyscyplina narzedzi w calej stawce (ZERO
 * przypadkow bez siegniecia po dane), najnizszy odsetek zmyslonych kwot
 * i 3,3x nizszy koszt — czyli zejscie na zapas nie jest degradacja.
 * Env OPENROUTER_FALLBACK_MODEL nadpisuje.
 */
export const DEFAULT_FALLBACK_MODEL = "google/gemini-3.1-flash-lite";

// Kontrakt czatu to POJEDYNCZY JSON (route → orkiestrator) — martwa obsługa
// stream/ReadableStream usunięta w audycie czystości 2026-07-11 (nikt jej nie
// wołał, a zaciemniała typ zwrotny fallbacku modelu).
interface ChatCompletionArgs {
  messages: Record<string, unknown>[];
  tools: Record<string, unknown>[];
  /** Twardy limit czasu wywołania (ms). Domyślnie 30 s; orkiestrator skraca
   *  go pod koniec budżetu tury (incydent: 7×504 — tura > maxDuration 60 s). */
  timeoutMs?: number;
}

/** Błąd OpenRoutera wskazujący na zły/nieistniejący slug modelu (404 + tekst o modelu). */
function isInvalidModelError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const err = (payload as { error?: { code?: unknown; message?: unknown } }).error;
  if (!err || typeof err !== "object") return false;
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  return err.code === 404 && (message.includes("model") || message.includes("slug"));
}

/**
 * Awaria, po ktorej warto sprobowac INNEGO modelu (§15 audytu): brak
 * uzytecznej odpowiedzi mimo poprawnego transportu.
 *
 * Zaobserwowane na zywo na dev-serverze: gemini-2.5-flash-lite zwrocil
 * `native_finish_reason: MALFORMED_FUNCTION_CALL` dwa razy z rzedu, wiec
 * uzytkownik dostal „Chwilowo nie moge odpowiedziec". Ponawianie na TYM SAMYM
 * modelu nie pomaga, bo defekt jest systematyczny dla modelu, nie losowy.
 *
 * NIE jest awaria: odpowiedz, ktora sie uzytkownikowi nie podoba. Zapas
 * wlacza sie wylacznie na brak tresci i brak tool_calls.
 */
function isTransientModelFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return true;
  const p = payload as {
    error?: unknown;
    choices?: Array<{ finish_reason?: string; message?: { content?: unknown; tool_calls?: unknown } }>;
  };
  if (p.error) return true;
  const choice = p.choices?.[0];
  if (!choice?.message) return true;
  const hasContent = typeof choice.message.content === "string" && choice.message.content.length > 0;
  const hasToolCalls = Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0;
  return !hasContent && !hasToolCalls;
}

async function requestChatCompletion(
  apiKey: string,
  model: string,
  { messages, tools, timeoutMs }: ChatCompletionArgs,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? 30000);

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: MAX_TOKENS,
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

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function chatCompletion(args: ChatCompletionArgs): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const result = await requestChatCompletion(apiKey, model, args);

  // Fallback 1: env wskazuje slug, którego OpenRouter nie zna → ponów raz na
  // modelu wbudowanym (chyba że to on właśnie zawiódł).
  if (model !== DEFAULT_MODEL && isInvalidModelError(result)) {
    console.error(
      `[concierge] OPENROUTER_MODEL="${model}" odrzucony przez OpenRouter (zły/nieistniejący slug) — fallback na ${DEFAULT_MODEL}. Popraw albo usuń zmienną środowiskową.`,
    );
    return requestChatCompletion(apiKey, DEFAULT_MODEL, args);
  }

  // Fallback 2: model odpowiedział, ale bezużytecznie (brak treści i brak
  // tool_calls) → JEDNA próba na modelu zapasowym z env. Świadomie WEWNĄTRZ
  // chatCompletion: narzędzia wykonuje orkiestrator dopiero po powrocie, więc
  // zmiana modelu nie może wykonać żadnego tool-calla drugi raz.
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  if (fallback && fallback !== model && isTransientModelFailure(result)) {
    console.warn(
      `[concierge] model ${model} nie zwrócił użytecznej odpowiedzi — jedna próba na zapasowym ${fallback}`,
    );
    return requestChatCompletion(apiKey, fallback, args);
  }

  return result;
}
