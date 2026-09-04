// Harness benchmarkowy AI Concierge (master prompt §45).
//
//   npx tsx --env-file=.env.local bench/concierge/run.ts --models=a,b --sample=20
//   npx tsx --env-file=.env.local bench/concierge/run.ts --dry-run
//
// Co mierzy: JAKOŚĆ (sprawdzenia deterministyczne + opcjonalny sędzia),
// OPÓŹNIENIE (p50/p95 na turę), KOSZT (z REALNYCH tokenów i zamrożonego
// cennika), DYSCYPLINĘ NARZĘDZI (co model wywołał SAM, bez auto-oferty).
//
// Dwie rzeczy są identyczne dla każdego modelu, żeby porównanie było uczciwe:
// ten sam dataset i te same deterministyczne dane narzędzi (fixture-deps).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runConcierge, type OrchestratorDeps } from "../../src/lib/concierge/orchestrator";
import { createToolExecutors } from "../../src/lib/concierge/tools";
import { SEED_CASES } from "./cases-seed";
import { extractAmounts, runChecks, type CheckFailure } from "./checks";
import { buildFixtureToolDeps, fixtureStats, resetFixtureStats } from "./fixture-deps";
import {
  costUsd,
  loadPricing,
  makeBenchChat,
  type ChatCallRecord,
} from "./openrouter-bench";
import type { EvalCase, ToolName } from "./types";

// ── CLI ─────────────────────────────────────────────────────────────────────
interface Cli {
  models: string[];
  sample: number | null;
  concurrency: number;
  dryRun: boolean;
  out: string;
  categories: string[] | null;
  /** Probka WARSTWOWA: N przypadkow z zachowaniem proporcji kategorii. */
  stratified: number | null;
  /** Twardy sufit kosztu etapu (USD). Przekroczenie szacunku = STOP. */
  maxUsd: number | null;
}

function parseCli(argv: string[]): Cli {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith("--" + name + "="));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  return {
    models: (get("models") ?? "google/gemini-2.5-flash-lite").split(",").map((s) => s.trim()).filter(Boolean),
    sample: get("sample") ? Number(get("sample")) : null,
    concurrency: get("concurrency") ? Number(get("concurrency")) : 4,
    dryRun: argv.includes("--dry-run"),
    out: get("out") ?? "bench/concierge/results",
    categories: get("categories") ? get("categories")!.split(",").map((s) => s.trim()) : null,
    stratified: get("stratified") ? Number(get("stratified")) : null,
    maxUsd: get("max-usd") ? Number(get("max-usd")) : null,
  };
}

// ── Wynik pojedynczego przypadku ────────────────────────────────────────────
export interface CaseResult {
  id: string;
  category: string;
  model: string;
  modelEcho: string | null;
  providerEcho: string | null;
  /** Tekst odpowiedzi z KAŻDEJ tury (do sędziego i do ręcznego czytania). */
  replies: string[];
  finalText: string;
  /** Narzędzia wywołane PRZEZ MODEL (bez systemowej auto-oferty). */
  toolsCalledByModel: ToolName[];
  /** Wszystkie wywołania egzekutorów, w tym auto-oferta. */
  executorCalls: ToolName[];
  offerShown: boolean;
  hadError: boolean;
  failures: CheckFailure[];
  turnLatenciesMs: number[];
  totalLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  chatCalls: number;
  costUsdMeasured: number;
  costUsdNoCache: number;
  /** Statusy HTTP i tresci bledow — bez nich nie da sie odroznic slabego
   *  modelu od zerwanego polaczenia (pierwszy pelny przebieg: 3 modele po
   *  113/113 „bledow", w rzeczywistosci 429/5xx). */
  httpStatuses: number[];
  transportErrors: string[];
  /** Wszystko, co model DOSTAL z narzedzi w tej rozmowie. Trzymane, zeby dalo
   *  sie przeliczyc sprawdzenia po poprawce w checks.ts BEZ ponownego
   *  (platnego) odpytywania modeli. */
  toolResults: unknown[];
}

const TOOL_NAMES: ToolName[] = ["search_trips", "get_trip_offer", "list_themes"];

/** Wyciąga nazwy tool_calls z SUROWEJ odpowiedzi modelu — to jedyny sposób,
 *  by odróżnić wywołanie MODELU od systemowej auto-oferty w orkiestratorze. */
function sniffToolCalls(payload: unknown, sink: ToolName[]): void {
  const calls = (
    payload as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string } }> } }> }
  )?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls)) return;
  for (const c of calls) {
    const n = c.function?.name;
    if (n && (TOOL_NAMES as string[]).includes(n)) sink.push(n as ToolName);
  }
}

async function runCase(
  testCase: EvalCase,
  model: string,
  apiKey: string,
): Promise<CaseResult> {
  const chatRecords: ChatCallRecord[] = [];
  const toolsCalledByModel: ToolName[] = [];
  const executorCalls: ToolName[] = [];
  const toolResults: unknown[] = [];

  const rawChat = makeBenchChat(model, chatRecords, { apiKey });
  const seenToolMsgs = new Set<string>();
  const chat: OrchestratorDeps["chat"] = async (args) => {
    // GROUND TRUTH tego, co model DOSTAŁ: wiadomości role:"tool" tak, jak
    // składa je orkiestrator. Podglądanie wyniku egzekutora NIE wystarcza —
    // orkiestrator dokłada do niego budgetFit (zapas/przekroczenie budżetu),
    // więc uczciwie zacytowany „1787 zł zapasu" wyglądał jak zmyślona kwota.
    for (const m of args.messages) {
      if ((m as { role?: string }).role !== "tool") continue;
      const content = (m as { content?: unknown }).content;
      if (typeof content !== "string" || seenToolMsgs.has(content)) continue;
      seenToolMsgs.add(content);
      try {
        toolResults.push(JSON.parse(content));
      } catch {
        toolResults.push(content);
      }
    }
    const res = await rawChat(args);
    sniffToolCalls(res, toolsCalledByModel);
    return res;
  };

  const base = createToolExecutors(buildFixtureToolDeps());
  const executors: OrchestratorDeps["executors"] = {
    executeSearchTrips: async (a) => {
      executorCalls.push("search_trips");
      const r = await base.executeSearchTrips(a);
      toolResults.push(r);
      return r;
    },
    executeGetTripOffer: async (a) => {
      executorCalls.push("get_trip_offer");
      const r = await base.executeGetTripOffer(a);
      toolResults.push(r);
      return r;
    },
    executeListThemes: () => {
      executorCalls.push("list_themes");
      const r = base.executeListThemes();
      toolResults.push(r);
      return r;
    },
  };

  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  const replies: string[] = [];
  const turnLatenciesMs: number[] = [];
  let offerShown = false;
  let hadError = false;

  for (const userMsg of testCase.turns) {
    history.push({ role: "user", content: userMsg });
    const t0 = Date.now();
    const result = await runConcierge(history, { chat, executors });
    turnLatenciesMs.push(Date.now() - t0);
    replies.push(result.text);
    if (result.offer) offerShown = true;
    if (result.error) hadError = true;
    history.push({ role: "assistant", content: result.text });
  }

  const finalText = replies[replies.length - 1] ?? "";
  // Kwoty, które PODAŁ UŻYTKOWNIK, są legalne do zacytowania („masz 3500 zł")
  // i do użycia w przykładzie („np. 3000 zł na osobę") — bez tego sprawdzenie
  // karało bota za powtórzenie budżetu klienta.
  const userStated = extractAmounts(testCase.turns.join(" "));
  const failures = runChecks(testCase.expect, {
    finalText,
    toolsCalled: executorCalls,
    toolResults: [...toolResults, { __userStated: userStated }],
    offerShown,
    hadError,
  });

  const last = chatRecords[chatRecords.length - 1];
  return {
    id: testCase.id,
    category: testCase.category,
    model,
    modelEcho: last?.modelEcho ?? null,
    providerEcho: last?.providerEcho ?? null,
    replies,
    finalText,
    toolsCalledByModel,
    executorCalls,
    offerShown,
    hadError,
    failures,
    turnLatenciesMs,
    totalLatencyMs: turnLatenciesMs.reduce((a, b) => a + b, 0),
    promptTokens: chatRecords.reduce((a, c) => a + c.promptTokens, 0),
    completionTokens: chatRecords.reduce((a, c) => a + c.completionTokens, 0),
    cachedTokens: chatRecords.reduce((a, c) => a + c.cachedTokens, 0),
    chatCalls: chatRecords.length,
    costUsdMeasured: costUsd(model, chatRecords).measured,
    costUsdNoCache: costUsd(model, chatRecords).noCache,
    toolResults,
    httpStatuses: [...new Set(chatRecords.map((c) => c.httpStatus))],
    transportErrors: [
      ...new Set(chatRecords.map((c) => c.errorText).filter((e): e is string => !!e)),
    ].slice(0, 3),
  };
}

/** Prosta pula — OpenRouter nie lubi kilkudziesięciu równoległych żądań. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

/** Pełny dataset (cases.ts) dokładany dynamicznie — zalążek działa i bez niego. */
function allCases(): EvalCase[] {
  try {

    const mod = require("./cases") as { EVAL_CASES?: EvalCase[] };
    if (Array.isArray(mod.EVAL_CASES) && mod.EVAL_CASES.length > 0) {
      return [...mod.EVAL_CASES, ...SEED_CASES];
    }
  } catch {
    // brak cases.ts → lecimy na zalążku
  }
  return SEED_CASES;
}

/**
 * Probka WARSTWOWA — bierze z kazdej kategorii udzial proporcjonalny do jej
 * wielkosci, ale NIGDY mniej niz 1. Zwykle `slice(0, N)` wzieloby same
 * pierwsze litery alfabetu kategorii (A=discovery, B=budget...) i caly
 * screening przeszedlby obok halucynacji, wsparcia i rozmow wielaturowych.
 * Wybor jest deterministyczny (co k-ty przypadek), wiec kazdy model i kazdy
 * przebieg widzi DOKLADNIE ten sam zestaw.
 */
function stratify(cases: EvalCase[], target: number): EvalCase[] {
  const byCat = new Map<string, EvalCase[]>();
  for (const c of cases) {
    const arr = byCat.get(c.category) ?? [];
    arr.push(c);
    byCat.set(c.category, arr);
  }
  const cats = [...byCat.keys()].sort();
  const out: EvalCase[] = [];
  for (const cat of cats) {
    const arr = byCat.get(cat)!;
    const want = Math.max(1, Math.round((arr.length / cases.length) * target));
    const step = Math.max(1, Math.floor(arr.length / want));
    for (let i = 0, taken = 0; i < arr.length && taken < want; i += step, taken++) {
      out.push(arr[i]);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function selectCases(cli: Cli): EvalCase[] {
  let cases = allCases();
  if (cli.categories) cases = cases.filter((c) => cli.categories!.includes(c.category));
  if (cli.stratified) return stratify(cases, cli.stratified);
  if (cli.sample) cases = cases.slice(0, cli.sample);
  return cases;
}

// ── Dry run: koszt PRZED wydaniem pieniędzy (§47) ─────────────────────────
//
// Liczby wzięte z REALNYCH przebiegów, nie z sufitu: 113 przypadków (197 tur)
// na gemini-2.5-flash-lite dało 1,29 mln tokenów wejścia i 47 tys. wyjścia,
// czyli ~6 550 wejścia i ~240 wyjścia na turę BEZ zakładania cache.
//
// Świadomie NIE zakładamy tu wysokiego odsetka trafień w cache. W baterii
// wychodziło 60–86%, bo rozmowy lecą jedna po drugiej na tym samym prefiksie
// — i właśnie dlatego poprzedni szacunek był zbyt optymistyczny. Sufit ma być
// sufitem.
const IN_PER_TURN_NO_CACHE = 6550;
const OUT_PER_TURN = 240;

function estimateUsd(model: string, turns: number): number | null {
  const p = loadPricing()[model];
  if (!p) return null;
  return turns * (IN_PER_TURN_NO_CACHE * p.prompt + OUT_PER_TURN * p.completion);
}

function dryRun(cli: Cli, cases: EvalCase[]): number {
  const turns = cases.reduce((a, c) => a + c.turns.length, 0);
  const cats = [...new Set(cases.map((c) => c.category))].sort();

  console.log("DRY RUN — nic nie zostało wywołane, zero kosztu.\n");
  console.log("przypadków: " + cases.length + ", tur łącznie: " + turns);
  console.log("kategorii: " + cats.length + " (" + cats.join(", ") + ")");
  console.log(
    "\nzałożenia/turę (BEZ cache, z realnych pomiarów): " +
      IN_PER_TURN_NO_CACHE +
      " tok. wejścia, " +
      OUT_PER_TURN +
      " tok. wyjścia\n",
  );

  let total = 0;
  for (const m of cli.models) {
    const usd = estimateUsd(m, turns);
    if (usd === null) {
      console.log(m.padEnd(36) + "BRAK W CENNIKU");
      continue;
    }
    total += usd;
    console.log(m.padEnd(36) + "$" + usd.toFixed(3));
  }
  console.log("\nSZACOWANY MAKSYMALNY KOSZT ETAPU: $" + total.toFixed(2));

  if (cli.maxUsd !== null) {
    if (total > cli.maxUsd) {
      console.log(
        "\nSTOP — szacunek $" +
          total.toFixed(2) +
          " PRZEKRACZA zadany sufit $" +
          cli.maxUsd.toFixed(2) +
          ". Zmniejsz próbkę albo listę modeli.",
      );
      return 2;
    }
    console.log("mieści się w suficie $" + cli.maxUsd.toFixed(2) + " — można ruszać.");
  }
  return 0;
}

async function main(): Promise<number> {
  const cli = parseCli(process.argv.slice(2));
  const cases = selectCases(cli);

  if (cli.dryRun) return dryRun(cli, cases);

  // Sufit kosztu obowiazuje takze przy realnym przebiegu — bez tego flaga
  // --max-usd bylaby ozdobnikiem dzialajacym tylko w dry-runie.
  if (cli.maxUsd !== null) {
    const turns = cases.reduce((a, c) => a + c.turns.length, 0);
    const est = cli.models.reduce((a, m) => a + (estimateUsd(m, turns) ?? 0), 0);
    if (est > cli.maxUsd) {
      console.error(
        "STOP — szacunek $" + est.toFixed(2) + " przekracza sufit $" + cli.maxUsd.toFixed(2),
      );
      return 2;
    }
    console.log("szacunek $" + est.toFixed(2) + " / sufit $" + cli.maxUsd.toFixed(2));
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Brak OPENROUTER_API_KEY — uruchom z --env-file=.env.local");
    return 1;
  }

  mkdirSync(join(process.cwd(), cli.out), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const model of cli.models) {
    resetFixtureStats();
    console.log("\n=== " + model + " (" + cases.length + " przypadków) ===");
    const started = Date.now();
    let done = 0;
    const results = await pool(cases, cli.concurrency, async (c) => {
      const r = await runCase(c, model, apiKey);
      done++;
      const mark = r.failures.length === 0 ? "ok" : "FAIL(" + r.failures.map((f) => f.code).join(",") + ")";
      console.log("  [" + done + "/" + cases.length + "] " + r.id + " " + mark + " " + r.totalLatencyMs + "ms");
      return r;
    });

    const turnLat = results.flatMap((r) => r.turnLatenciesMs);
    const passed = results.filter((r) => r.failures.length === 0).length;
    const summary = {
      model,
      modelEcho: results.find((r) => r.modelEcho)?.modelEcho ?? null,
      providerEcho: results.find((r) => r.providerEcho)?.providerEcho ?? null,
      cases: results.length,
      turns: turnLat.length,
      deterministicPassRate: passed / results.length,
      failuresByCode: results
        .flatMap((r) => r.failures.map((f) => f.code))
        .reduce<Record<string, number>>((acc, c) => ((acc[c] = (acc[c] ?? 0) + 1), acc), {}),
      p50TurnMs: percentile(turnLat, 50),
      p95TurnMs: percentile(turnLat, 95),
      totalCostUsd: results.reduce((a, r) => a + r.costUsdMeasured, 0),
      totalCostUsdNoCache: results.reduce((a, r) => a + r.costUsdNoCache, 0),
      promptTokens: results.reduce((a, r) => a + r.promptTokens, 0),
      completionTokens: results.reduce((a, r) => a + r.completionTokens, 0),
      cachedTokens: results.reduce((a, r) => a + r.cachedTokens, 0),
      httpStatusCounts: results
        .flatMap((r) => r.httpStatuses)
        .reduce<Record<string, number>>((a, c) => ((a[c] = (a[c] ?? 0) + 1), a), {}),
      sampleTransportErrors: [...new Set(results.flatMap((r) => r.transportErrors))].slice(0, 3),
      wallClockMs: Date.now() - started,
      fixtureStats: { ...fixtureStats },
    };

    const file = join(cli.out, model.replace(/[/:]/g, "_") + "__" + stamp + ".json");
    writeFileSync(file, JSON.stringify({ summary, results }, null, 1), "utf8");
    console.log("\n" + JSON.stringify(summary, null, 1));
    console.log("zapisano: " + file);
  }
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
