// Klient OpenRoutera DLA BENCHMARKU — świadomie NIE reużywamy
// src/lib/concierge/openrouter.ts, bo tamten czyta model z env i milczy o
// tym, co realnie odpowiedziało. Tutaj model jest PRZYPIĘTY per wywołanie,
// a z odpowiedzi zbieramy wszystko, czego wymaga §34: model zwrotny (OpenRouter
// echo — mówi, co NAPRAWDĘ policzyło), tokeny, cache, opóźnienie.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface OrPricing {
  prompt: number;
  completion: number;
  cacheRead: number | null;
}

let priceCache: Record<string, OrPricing> | null = null;

/** Cennik z ZAMROŻONEGO katalogu (fixtures/or-models.json) — ten sam dla każdego modelu i przebiegu. */
export function loadPricing(): Record<string, OrPricing> {
  if (priceCache) return priceCache;
  const path = join(process.cwd(), "bench/concierge/fixtures/or-models.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    data: Array<{
      id: string;
      pricing?: { prompt?: string; completion?: string; input_cache_read?: string };
    }>;
  };
  const out: Record<string, OrPricing> = {};
  for (const m of raw.data) {
    out[m.id] = {
      prompt: Number(m.pricing?.prompt ?? 0),
      completion: Number(m.pricing?.completion ?? 0),
      cacheRead:
        m.pricing?.input_cache_read === undefined ? null : Number(m.pricing.input_cache_read),
    };
  }
  priceCache = out;
  return out;
}

export interface ChatCallRecord {
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  /** Model, który OpenRouter faktycznie policzył (echo z odpowiedzi). */
  modelEcho: string | null;
  /** Dostawca, jeśli OpenRouter go poda. */
  providerEcho: string | null;
  httpStatus: number;
  /** Ustawiane, gdy transport/API zwróciły błąd. */
  errorText: string | null;
}

export interface BenchChatArgs {
  messages: Record<string, unknown>[];
  tools: Record<string, unknown>[];
  timeoutMs?: number;
}

/**
 * Fabryka `chat` do wstrzyknięcia w OrchestratorDeps. Każde wywołanie
 * dopisuje rekord do `sink`, więc runner widzi koszt i czas KAŻDEJ rundy,
 * nie tylko sumy tury.
 */
/**
 * Modele ROZUMUJĄCE zjadają `max_tokens` na tokeny rozumowania, zanim
 * napiszą choć słowo odpowiedzi. Zmierzone: qwen3.7-flash 689/700 tokenów
 * na rozumowanie → finish_reason:"length" i content:null; gpt-5-mini 448/576.
 * Orkiestrator widzi wtedy „brak treści" i zwraca łagodny błąd — czyli
 * produkcyjny limit MAX_TOKENS=700 po cichu WYKLUCZA całą klasę modeli.
 *
 * Porównanie ma być uczciwe (§10: ten sam prompt/kontekst/narzędzia), więc
 * model rozumujący testujemy w konfiguracji, w jakiej realnie by pojechał —
 * z rozumowaniem ściętym do minimum — a nie w cudzej domyślnej.
 */
export const REASONING_MINIMAL: Record<string, Record<string, unknown>> = {
  "openai/gpt-5-mini": { effort: "minimal" },
  "openai/gpt-5-nano": { effort: "minimal" },
  "openai/gpt-5.6-luna": { effort: "minimal" },
  "qwen/qwen3.7-flash": { exclude: true },
  "openai/gpt-5.4-mini": { effort: "minimal" },
};

export function makeBenchChat(
  model: string,
  sink: ChatCallRecord[],
  opts: { apiKey: string; temperature?: number; maxTokens?: number },
) {
  return async function benchChat(args: BenchChatArgs): Promise<unknown> {
    const started = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 30000);

    const body: Record<string, unknown> = {
      model,
      messages: args.messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 700,
      usage: { include: true },
    };
    if (args.tools.length > 0) {
      body.tools = args.tools;
      body.tool_choice = "auto";
    }
    const reasoning = REASONING_MINIMAL[model];
    if (reasoning) body.reasoning = reasoning;

    let httpStatus = 0;
    try {
      // PONOWIENIA na błędy PRZEJŚCIOWE (429 / 5xx). Bez tego jeden skok
      // limitu u dostawcy wywracał CAŁY przebieg modelu: w pierwszym pełnym
      // uruchomieniu trzy modele wyszły ze 113/113 błędów, kosztem $0,00 i
      // czasem ~300 ms — czyli żądania nigdy nie doszły do modelu, a wynik
      // wyglądał jak katastrofalna jakość. To był błąd POMIARU, nie modeli.
      let res: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + opts.apiKey,
            "HTTP-Referer": "https://helptravel.pl",
            "X-Title": "HelpTravel bench",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.status !== 429 && res.status < 500) break;
        const waitMs = 1500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
      }
      httpStatus = res!.status;
      const json = (await res!.json()) as Record<string, unknown>;
      const usage = (json.usage ?? {}) as {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
      sink.push({
        latencyMs: Date.now() - started,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        modelEcho: typeof json.model === "string" ? json.model : null,
        providerEcho: typeof json.provider === "string" ? json.provider : null,
        httpStatus,
        errorText: json.error ? JSON.stringify(json.error).slice(0, 300) : null,
      });
      return json;
    } catch (err) {
      sink.push({
        latencyMs: Date.now() - started,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        modelEcho: null,
        providerEcho: null,
        httpStatus,
        errorText: err instanceof Error ? err.message : String(err),
      });
      // Orkiestrator sam obsłuży „zdeformowaną odpowiedź" — nie rzucamy.
      return { error: { message: err instanceof Error ? err.message : String(err) } };
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Koszt USD z REALNYCH tokenow — w DWOCH wariantach, bo to nie jest ta sama
 * liczba i mylenie ich zaklamuje prognoze:
 *
 *  • `measured` — ile ten przebieg NAPRAWDE kosztowal, z uwzglednieniem
 *    trafien w cache (w baterii 60–86% wejscia szlo z cache, bo 113 rozmow
 *    leci pod rzad na tym samym prefiksie).
 *  • `noCache`  — ten sam ruch wyceniony tak, jakby cache NIE trafil ani razu.
 *
 * Do PROGNOZ PRODUKCYJNYCH uzywa sie `noCache`. Na produkcji rozmowy sa
 * rozrzucone w czasie, pierwsza tura kazdej sesji zawsze placi pelna stawke,
 * a cache Anthropic/Google wygasa — zakladanie 80% trafien to myslenie
 * zyczeniowe, ktore zaniza rachunek kilkukrotnie.
 */
export interface CostBreakdown {
  measured: number;
  noCache: number;
}

export function costUsd(model: string, calls: ChatCallRecord[]): CostBreakdown {
  const p = loadPricing()[model];
  if (!p) return { measured: 0, noCache: 0 };
  let measured = 0;
  let noCache = 0;
  for (const c of calls) {
    const cached = p.cacheRead === null ? 0 : Math.min(c.cachedTokens, c.promptTokens);
    const fresh = c.promptTokens - cached;
    const out = c.completionTokens * p.completion;
    measured += fresh * p.prompt + cached * (p.cacheRead ?? p.prompt) + out;
    noCache += c.promptTokens * p.prompt + out;
  }
  return { measured, noCache };
}
