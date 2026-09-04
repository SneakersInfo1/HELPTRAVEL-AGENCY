// Składa tabelę porównawczą z plików wyników (bench/concierge/results/*.json).
// Uruchom: npx tsx bench/concierge/report.ts [katalog]

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface Summary {
  model: string;
  modelEcho: string | null;
  providerEcho: string | null;
  cases: number;
  turns: number;
  deterministicPassRate: number;
  failuresByCode: Record<string, number>;
  p50TurnMs: number;
  p95TurnMs: number;
  totalCostUsd: number;
  totalCostUsdNoCache?: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

interface CaseRow {
  id: string;
  failures: Array<{ code: string }>;
  executorCalls: string[];
  toolsCalledByModel: string[];
  offerShown: boolean;
  finalText: string;
}

const dir = process.argv[2] ?? "bench/concierge/results";
const files = readdirSync(join(process.cwd(), dir)).filter((f) => f.endsWith(".json"));

// Najnowszy plik per model (kolejne przebiegi nadpisują starsze w tabeli).
const latest = new Map<string, { summary: Summary; results: CaseRow[] }>();
for (const f of files.sort()) {
  const parsed = JSON.parse(readFileSync(join(process.cwd(), dir, f), "utf8")) as {
    summary: Summary;
    results: CaseRow[];
  };
  latest.set(parsed.summary.model, parsed);
}

const rows = [...latest.values()].sort(
  (a, b) => b.summary.deterministicPassRate - a.summary.deterministicPassRate,
);

const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);

console.log("");
// „1k rozmów" liczymy z wariantu BEZ CACHE. Na produkcji rozmowy są
// rozrzucone w czasie i pierwsza tura każdej sesji zawsze płaci pełną stawkę,
// więc przenoszenie 60–90% trafień z baterii (gdzie 113 rozmów leci pod rząd
// na jednym prefiksie) zaniżałoby rachunek kilkukrotnie.
const head =
  pad("MODEL", 32) +
  padL("PASS", 6) +
  padL("p50ms", 8) +
  padL("p95ms", 8) +
  padL("USD/1k", 9) +
  padL("USD/10k", 10) +
  padL("cache%", 8);
console.log(head);
console.log("-".repeat(head.length));

for (const { summary: s } of rows) {
  const noCache = s.totalCostUsdNoCache ?? s.totalCostUsd;
  const perConversation = noCache / s.cases;
  const cachePct = s.promptTokens > 0 ? (s.cachedTokens / s.promptTokens) * 100 : 0;
  console.log(
    pad(s.model, 32) +
      padL((s.deterministicPassRate * 100).toFixed(0) + "%", 6) +
      padL(String(s.p50TurnMs), 8) +
      padL(String(s.p95TurnMs), 8) +
      padL("$" + (perConversation * 1000).toFixed(2), 9) +
      padL("$" + (perConversation * 10000).toFixed(1), 10) +
      padL(cachePct.toFixed(0) + "%", 8),
  );
}
console.log("(USD/1k i /10k = prognoza BEZ cache; cache% to obserwacja z baterii)");

console.log("\nNARUSZENIA wg kodu:");
const allCodes = [...new Set(rows.flatMap((r) => Object.keys(r.summary.failuresByCode)))].sort();
console.log(pad("MODEL", 32) + allCodes.map((c) => padL(c.slice(0, 11), 13)).join(""));
console.log("-".repeat(32 + allCodes.length * 13));
for (const { summary: s } of rows) {
  console.log(
    pad(s.model, 32) + allCodes.map((c) => padL(String(s.failuresByCode[c] ?? 0), 13)).join(""),
  );
}

console.log("\nDYSCYPLINA NARZĘDZI (ile razy model SAM sięgnął po dane):");
console.log(pad("MODEL", 32) + padL("search", 8) + padL("offer", 8) + padL("themes", 8) + padL("kart ofert", 12));
console.log("-".repeat(68));
for (const { summary: s, results } of rows) {
  const count = (t: string) =>
    results.reduce((a, r) => a + r.toolsCalledByModel.filter((x) => x === t).length, 0);
  const offers = results.filter((r) => r.offerShown).length;
  console.log(
    pad(s.model, 32) +
      padL(String(count("search_trips")), 8) +
      padL(String(count("get_trip_offer")), 8) +
      padL(String(count("list_themes")), 8) +
      padL(offers + "/" + results.length, 12),
  );
}

console.log("\nPRZYPADKI, KTÓRE OBLAŁY U WIĘKSZOŚCI MODELI (problem produktu, nie modelu):");
const byCase = new Map<string, number>();
for (const { results } of rows) {
  for (const r of results) {
    if (r.failures.length > 0) byCase.set(r.id, (byCase.get(r.id) ?? 0) + 1);
  }
}
for (const [id, n] of [...byCase.entries()].sort((a, b) => b[1] - a[1])) {
  if (n >= Math.ceil(rows.length / 2)) console.log("  " + id + ": oblało " + n + "/" + rows.length + " modeli");
}
