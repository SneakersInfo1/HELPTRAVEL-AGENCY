// Klient benchmarku narzedzi konsjerza (V2.1 §26/§41). Wola
// /api/concierge/tool-bench na WSKAZANYM wdrozeniu, drukuje raport i zapisuje
// surowy JSON, zeby dalo sie porownac BEFORE z AFTER na tej samej infrastrukturze.
//
//   npx tsx --env-file=.env.local bench/concierge/tool-latency.ts \
//     --base=https://<preview>.vercel.app --repeat=2 --out=bench/out/before.json
//
//   npx tsx bench/concierge/tool-latency.ts --compare=before.json --with=after.json
//
// Sekret bierze z CRON_SECRET (ten sam, ktorym chodza crony). ZERO kosztu LLM.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface Stats { n: number; p50: number; p75: number; p95: number; max: number }
interface CaseResult {
  id: string; tool: string; what: string; expectWarm: boolean; pass: number;
  totalMs: number; spans: Record<string, number>; state: string;
  candidates: number | null; hasOffer: boolean; hotel: boolean; flight: boolean; error?: string;
}
interface BenchReport {
  ok: boolean; cases: number; ran: number; skipped: number; repeat: number;
  concurrency: number; durationMs: number;
  all: Stats; firstPass: Stats; laterPasses: Stats | null;
  expectedWarm: Stats; expectedCold: Stats;
  byTool: Record<string, Stats>;
  spans: Record<string, Stats>;
  states: Record<string, number>;
  results: CaseResult[];
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function row(label: string, s: Stats): string {
  return `  ${label.padEnd(26)} n=${String(s.n).padStart(3)}  p50 ${String(s.p50).padStart(6)}  p75 ${String(s.p75).padStart(6)}  p95 ${String(s.p95).padStart(6)}  max ${String(s.max).padStart(6)}`;
}

function print(report: BenchReport): void {
  console.log(`\nPRZYPADKI ${report.cases} · przebiegow ${report.repeat} · wykonano ${report.ran} · pominieto ${report.skipped} · caly przebieg ${(report.durationMs / 1000).toFixed(1)} s\n`);
  console.log("CZAS NARZEDZI (ms):");
  console.log(row("WSZYSTKO", report.all));
  console.log(row("przebieg 1 (zimniej)", report.firstPass));
  if (report.laterPasses) console.log(row("przebiegi 2+ (cieplej)", report.laterPasses));
  console.log(row("spodziewane CIEPLE", report.expectedWarm));
  console.log(row("spodziewane ZIMNE", report.expectedCold));
  console.log(row("search_trips", report.byTool.search_trips));
  console.log(row("get_trip_offer", report.byTool.get_trip_offer));

  console.log("\nROZBICIE NA ZALEZNOSCI (ms):");
  for (const [name, s] of Object.entries(report.spans).sort((a, b) => b[1].p50 - a[1].p50)) {
    console.log(row(name, s));
  }

  console.log("\nSTANY WYNIKU:");
  for (const [state, count] of Object.entries(report.states).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state.padEnd(20)} ${count}`);
  }

  console.log("\n10 NAJWOLNIEJSZYCH:");
  for (const r of report.results.slice(0, 10)) {
    const spans = Object.entries(r.spans).map(([k, v]) => `${k}=${v}`).join(" ");
    console.log(`  ${String(r.totalMs).padStart(6)} ms  ${r.id.padEnd(34)} ${r.state.padEnd(16)} ${spans}`);
  }

  const broken = report.results.filter((r) => r.state === "THROWN" || r.state === "ERROR");
  if (broken.length > 0) {
    console.log("\nBLEDY:");
    for (const r of broken) console.log(`  ${r.id}: ${r.state} ${r.error ?? ""}`);
  }
}

function compare(before: BenchReport, after: BenchReport): void {
  const delta = (b: number, a: number) => {
    if (b === 0) return "     —";
    const pct = ((a - b) / b) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
  };
  const line = (label: string, b: Stats, a: Stats) =>
    console.log(
      `  ${label.padEnd(24)} p50 ${String(b.p50).padStart(6)} → ${String(a.p50).padStart(6)} (${delta(b.p50, a.p50)})   ` +
        `p95 ${String(b.p95).padStart(6)} → ${String(a.p95).padStart(6)} (${delta(b.p95, a.p95)})   ` +
        `max ${String(b.max).padStart(6)} → ${String(a.max).padStart(6)} (${delta(b.max, a.max)})`,
    );
  console.log("\nBEFORE vs AFTER (ms):");
  line("WSZYSTKO", before.all, after.all);
  line("przebieg 1", before.firstPass, after.firstPass);
  if (before.laterPasses && after.laterPasses) line("przebiegi 2+", before.laterPasses, after.laterPasses);
  line("spodziewane CIEPLE", before.expectedWarm, after.expectedWarm);
  line("spodziewane ZIMNE", before.expectedCold, after.expectedCold);
  line("search_trips", before.byTool.search_trips, after.byTool.search_trips);
  line("get_trip_offer", before.byTool.get_trip_offer, after.byTool.get_trip_offer);

  console.log("\nZALEZNOSCI:");
  const names = new Set([...Object.keys(before.spans), ...Object.keys(after.spans)]);
  const zero: Stats = { n: 0, p50: 0, p75: 0, p95: 0, max: 0 };
  for (const name of names) line(name, before.spans[name] ?? zero, after.spans[name] ?? zero);

  console.log("\nSTANY WYNIKU (before → after):");
  const states = new Set([...Object.keys(before.states), ...Object.keys(after.states)]);
  for (const st of states) console.log(`  ${st.padEnd(20)} ${before.states[st] ?? 0} → ${after.states[st] ?? 0}`);

  console.log("\nNAJWIEKSZE ZMIANY PER PRZYPADEK:");
  const beforeById = new Map(before.results.filter((r) => r.pass === 1).map((r) => [r.id, r.totalMs]));
  const rows = after.results
    .filter((r) => r.pass === 1 && beforeById.has(r.id))
    .map((r) => ({ id: r.id, b: beforeById.get(r.id)!, a: r.totalMs }))
    .sort((x, y) => y.b - y.a - (x.b - x.a));
  for (const r of [...rows.slice(0, 8), ...rows.slice(-4)]) {
    console.log(`  ${r.id.padEnd(34)} ${String(r.b).padStart(6)} → ${String(r.a).padStart(6)} ms (${delta(r.b, r.a)})`);
  }
}

async function main(): Promise<void> {
  const cmp = arg("compare");
  if (cmp) {
    const withFile = arg("with");
    if (!withFile) throw new Error("--compare wymaga --with=<plik>");
    compare(
      JSON.parse(readFileSync(cmp, "utf8")) as BenchReport,
      JSON.parse(readFileSync(withFile, "utf8")) as BenchReport,
    );
    return;
  }

  const base = arg("base");
  if (!base) throw new Error("podaj --base=https://<wdrozenie>");
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("brak CRON_SECRET (uruchom z --env-file=.env.local)");

  const params = new URLSearchParams();
  const repeat = arg("repeat");
  const only = arg("only");
  const concurrency = arg("concurrency");
  if (repeat) params.set("repeat", repeat);
  if (only) params.set("only", only);
  if (concurrency) params.set("concurrency", concurrency);
  const url = `${base.replace(/\/$/, "")}/api/concierge/tool-bench${params.size ? `?${params}` : ""}`;

  console.log(`BENCH NARZEDZI → ${url}`);
  const started = Date.now();
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
    process.exitCode = 1;
    return;
  }
  const report = (await res.json()) as BenchReport;
  console.log(`odpowiedz po ${((Date.now() - started) / 1000).toFixed(1)} s`);
  print(report);

  const out = arg("out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nzapisano ${out}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
