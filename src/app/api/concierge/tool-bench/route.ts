// GET /api/concierge/tool-bench — benchmark NARZĘDZI konsjerża (V2.1 §26).
//
// PO CO ROUTE, A NIE SKRYPT LOKALNY: pytanie brzmi „ile trwają narzędzia na
// produkcji", a to zależy od regionu funkcji, od tego samego Upstasha i od
// tego samego klucza LiteAPI. Lokalny pomiar odpowiadałby na inne pytanie.
// Ten endpoint mierzy dokładnie tę ścieżkę, którą wykonuje tura czatu
// (dispatchToolCall — razem z auto-ofertą), tylko BEZ modelu, więc jeden
// pełny przebieg kosztuje 0 zł w LLM.
//
// BEZPIECZEŃSTWO: dokładnie ta sama bramka co crony — `Authorization: Bearer
// ${CRON_SECRET}`. Bez sekretu nikt z zewnątrz nie spali limitu LiteAPI.
//
// TYLKO ODCZYT: wyszukiwanie hoteli i lotów. Zero prebooka, zero rezerwacji,
// zero płatności — te ścieżki nie są tu w ogóle importowane.

import { NextRequest, NextResponse } from "next/server";

import { buildBenchCases, type BenchCase } from "@/lib/concierge/bench-cases";
import { dispatchToolCall } from "@/lib/concierge/orchestrator";
import { createToolExecutors } from "@/lib/concierge/tools";
import { buildProductionToolDeps } from "@/lib/concierge/tool-deps";
import { createTurnTrace } from "@/lib/concierge/trace";
import type { TripOffer } from "@/lib/concierge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/** Twardy budżet — zostawiamy margines pod maxDuration, jak w cronach. */
const TIME_BUDGET_MS = 250_000;
/** Domyślna równoległość. 2, bo mierzymy CZAS — zbyt wiele naraz zniekształca. */
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 6;
const MAX_REPEAT = 3;

const executors = createToolExecutors(buildProductionToolDeps());

interface CaseResult {
  id: string;
  tool: string;
  what: string;
  expectWarm: boolean;
  pass: number;
  totalMs: number;
  spans: Record<string, number>;
  /** VALID / PARTIAL / UNAVAILABLE / EMPTY / ERROR — patrz classify(). */
  state: string;
  candidates: number | null;
  hasOffer: boolean;
  hotel: boolean;
  flight: boolean;
  error?: string;
}

/**
 * Stan wyniku widziany z zewnątrz. Świadomie liczony TU z surowego wyniku
 * narzędzia, a nie z pola w odpowiedzi — dzięki temu ten sam benchmark
 * pokazuje regresję także wtedy, gdy ktoś zepsuje wyliczanie stanu w kodzie.
 */
function classify(tool: string, result: unknown, offer: TripOffer | null): string {
  if (result && typeof result === "object" && "error" in result) return "ERROR";
  if (tool === "search_trips") {
    const r = result as { candidates?: unknown[]; autoOffer?: TripOffer };
    const auto = r.autoOffer;
    const count = Array.isArray(r.candidates) ? r.candidates.length : 0;
    if (auto) {
      const hotel = auto.hotel !== null;
      const flight = auto.flight !== null;
      if (!hotel && !flight) return "AUTO_UNAVAILABLE";
      return hotel && flight ? "AUTO_VALID" : "AUTO_PARTIAL";
    }
    return count > 0 ? "LIST_ONLY" : "EMPTY";
  }
  const o = offer ?? (result as TripOffer | null);
  if (!o) return "EMPTY";
  const wantsHotel = o.wantsHotel !== false;
  const wantsFlight = o.wantsFlight !== false;
  const hotelOk = !wantsHotel || o.hotel !== null;
  const flightOk = !wantsFlight || o.flight !== null;
  if (o.hotel === null && o.flight === null) return "UNAVAILABLE";
  return hotelOk && flightOk ? "VALID" : "PARTIAL";
}

async function runCase(c: BenchCase, pass: number): Promise<CaseResult> {
  const trace = createTurnTrace();
  const started = Date.now();
  const base = {
    id: c.id,
    tool: c.tool,
    what: c.what,
    expectWarm: c.expectWarm,
    pass,
  };
  try {
    // Ścieżka 1:1 z turą czatu — razem z auto-ofertą po search_trips, bo
    // to jest koszt, który realnie ponosi użytkownik.
    const { result, offer } = await dispatchToolCall(
      {
        id: `bench-${c.id}-${pass}`,
        type: "function",
        function: { name: c.tool, arguments: JSON.stringify(c.args) },
      },
      executors,
      trace,
    );
    const summary = trace.summary();
    const r = result as { candidates?: unknown[] } | null;
    return {
      ...base,
      totalMs: Date.now() - started,
      spans: summary.totals,
      state: classify(c.tool, result, offer),
      candidates: Array.isArray(r?.candidates) ? r.candidates.length : null,
      hasOffer: offer !== null,
      hotel: offer?.hotel != null,
      flight: offer?.flight != null,
    };
  } catch (err) {
    return {
      ...base,
      totalMs: Date.now() - started,
      spans: trace.summary().totals,
      state: "THROWN",
      candidates: null,
      hasOffer: false,
      hotel: false,
      flight: false,
      error: err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160),
    };
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function stats(values: number[]) {
  return {
    n: values.length,
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : 0,
  };
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) await worker(items[i++]);
    }),
  );
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "bench_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const only = url.searchParams.get("only");
  const repeat = Math.min(MAX_REPEAT, Math.max(1, Number(url.searchParams.get("repeat") ?? 1) || 1));
  const concurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(1, Number(url.searchParams.get("concurrency") ?? DEFAULT_CONCURRENCY) || DEFAULT_CONCURRENCY),
  );

  const all = buildBenchCases();
  const filter = only ? only.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const selected = filter ? all.filter((c) => filter.some((f) => c.id.includes(f))) : all;

  // Kolejka: przebieg 1 = ZIMNO (to, co trafi w cache crona, będzie ciepłe),
  // przebiegi kolejne = CIEPŁO (ten sam klucz po naszym własnym zapisie).
  const queue: Array<{ c: BenchCase; pass: number }> = [];
  for (let pass = 1; pass <= repeat; pass++) for (const c of selected) queue.push({ c, pass });

  const startedAt = Date.now();
  const results: CaseResult[] = [];
  let skipped = 0;
  await runPool(queue, concurrency, async ({ c, pass }) => {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skipped += 1;
      return;
    }
    results.push(await runCase(c, pass));
  });

  const byPass = (pass: number) => results.filter((r) => r.pass === pass);
  const spanTotals: Record<string, number[]> = {};
  for (const r of results) {
    for (const [name, ms] of Object.entries(r.spans)) {
      (spanTotals[name] ??= []).push(ms);
    }
  }

  const summary = {
    ok: true,
    cases: selected.length,
    ran: results.length,
    skipped,
    repeat,
    concurrency,
    durationMs: Date.now() - startedAt,
    all: stats(results.map((r) => r.totalMs)),
    firstPass: stats(byPass(1).map((r) => r.totalMs)),
    laterPasses: repeat > 1 ? stats(results.filter((r) => r.pass > 1).map((r) => r.totalMs)) : null,
    expectedWarm: stats(results.filter((r) => r.expectWarm).map((r) => r.totalMs)),
    expectedCold: stats(results.filter((r) => !r.expectWarm).map((r) => r.totalMs)),
    byTool: {
      search_trips: stats(results.filter((r) => r.tool === "search_trips").map((r) => r.totalMs)),
      get_trip_offer: stats(results.filter((r) => r.tool === "get_trip_offer").map((r) => r.totalMs)),
    },
    spans: Object.fromEntries(Object.entries(spanTotals).map(([k, v]) => [k, stats(v)])),
    states: results.reduce<Record<string, number>>((acc, r) => {
      acc[r.state] = (acc[r.state] ?? 0) + 1;
      return acc;
    }, {}),
    results: results.sort((a, b) => b.totalMs - a.totalMs),
  };
  console.log("[concierge/tool-bench]", JSON.stringify({ ...summary, results: undefined }));
  return NextResponse.json(summary);
}
