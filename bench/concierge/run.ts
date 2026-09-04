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
  costUsd: number;
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
    costUsd: costUsd(model, chatRecords),
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

function selectCases(cli: Cli): EvalCase[] {
  let cases = allCases();
  if (cli.categories) cases = cases.filter((c) => cli.categories!.includes(c.category));
  if (cli.sample) cases = cases.slice(0, cli.sample);
  return cases;
}

// ── Dry run: koszt PRZED wydaniem pieniędzy (§47) ──────────────────────────
function dryRun(cli: Cli, cases: EvalCase[]): void {
  const pricing = loadPricing();
  // Zmierzone na produkcji (logi runtime 2026-09-04): tura bez narzędzi
  // ~6,9k tokenów wejścia, tura z narzędziami ~16,9k przy 2 wywołaniach.
  const IN_PER_TURN = 12000;
  const OUT_PER_TURN = 420;
  const turns = cases.reduce((a, c) => a + c.turns.length, 0);

  console.log("DRY RUN — nic nie zostało wywołane, zero kosztu.\n");
  console.log("przypadków: " + cases.length + ", tur łącznie: " + turns);
  console.log("założenia/turę: " + IN_PER_TURN + " tok. wejścia, " + OUT_PER_TURN + " tok. wyjścia\n");
  let total = 0;
  const rows: string[] = [];
  for (const m of cli.models) {
    const p = pricing[m];
    if (!p) {
      rows.push(m.padEnd(34) + "BRAK W CENNIKU");
      continue;
    }
    const usd = turns * (IN_PER_TURN * p.prompt + OUT_PER_TURN * p.completion);
    total += usd;
    rows.push(m.padEnd(34) + "$" + usd.toFixed(2));
  }
  console.log(rows.join("\n"));
  console.log("\nSZACOWANY KOSZT CAŁOŚCI: $" + total.toFixed(2));
  console.log("(górna granica — nie uwzględnia cache, który na produkcji zdejmuje ~80% wejścia)");
}

async function main(): Promise<number> {
  const cli = parseCli(process.argv.slice(2));
  const cases = selectCases(cli);

  if (cli.dryRun) {
    dryRun(cli, cases);
    return 0;
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
      totalCostUsd: results.reduce((a, r) => a + r.costUsd, 0),
      promptTokens: results.reduce((a, r) => a + r.promptTokens, 0),
      completionTokens: results.reduce((a, r) => a + r.completionTokens, 0),
      cachedTokens: results.reduce((a, r) => a + r.cachedTokens, 0),
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
