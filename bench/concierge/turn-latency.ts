// Pomiar CALYCH TUR czatu na wskazanym wdrozeniu (V2.1 §40/§41).
//
// Rozni sie od tool-latency.ts tym, ze wola PRAWDZIWY endpoint czatu, wiec
// mierzy model + narzedzia razem — i kosztuje tokeny. Uzywamy `?diag=1`, zeby
// dostac rozbicie (modelMs / toolMs / etapy) prosto z odpowiedzi, zamiast
// zgadywac je z logow.
//
//   npx tsx --env-file=.env.local bench/concierge/turn-latency.ts \
//     --base=https://<preview>.vercel.app --share=<token> --out=bench/out/turns-after.json
//
// TYLKO ODCZYT: sam czat. Zero rezerwacji, prebooka i platnosci.
//
// TEMPO: czat ma limit 10/min/IP, wiec miedzy zapytaniami czekamy domyslnie
// 7 s. Bez tego polowa pomiaru to byly 429, a nie tury.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface Diag {
  traceId: string; totalMs: number; modelMs: number; toolMs: number;
  chatCalls: number; toolCalls: number; outcome: string;
  model: string | null; provider: string | null;
  spans: Record<string, number>; counts: Record<string, number>;
}
interface ChatResponse { text: string; offer: unknown | null; error: boolean; diag?: Diag }

/** Scenariusze z §40 audytu + warianty, zeby uzbierac 20+ tur z narzedziem. */
const SCENARIOS: Array<{ id: string; turns: string[] }> = [
  { id: "1-cieplo-pazdziernik", turns: ["Gdzie jest ciepło w październiku?"] },
  { id: "2-grecja-plaza", turns: ["Gdzie w Grecji na plażę?"] },
  { id: "3-budzet-4000-7nocy", turns: ["Mam 4000 zł dla 2 osób na 7 nocy"] },
  { id: "4-weekend-waw", turns: ["Weekend z Warszawy"] },
  { id: "5-konkretne-miasto", turns: ["Pokaż ofertę do Barcelony na listopad, 2 osoby"] },
  { id: "6-brak-pelnej-oferty", turns: ["Chcę wyjazd do Sliemy na Malcie, 2 osoby, 7 nocy"] },
  { id: "7-followup-taniej", turns: ["Plaża do 3000 zł, 2 osoby", "a coś tańszego?"] },
  { id: "8-kraj-wlochy", turns: ["Chcę Włochy, budżet 3000 zł na osobę"] },
  { id: "9-rodzina", turns: ["Lecimy z dwójką dzieci w wakacje, budżet 12000 zł łącznie"] },
  { id: "10-najtaniej", turns: ["Najtaniej jak się da, obojętnie gdzie"] },
  { id: "11-sam-hotel", turns: ["Chcę sam hotel w Maladze na 5 nocy, bez lotu"] },
  { id: "12-wyspa", turns: ["A coś na Teneryfie do 4 tysięcy na osobę?"] },
  { id: "13-hiszpania-gory", turns: ["Hiszpania, ale w góry — budżet 4000 na osobę"] },
  { id: "14-bez-narzedzia-blik", turns: ["Czy mogę zapłacić BLIKiem?"] },
  { id: "15-bez-narzedzia-proces", turns: ["Jak zarezerwować na HelpTravel?"] },
  { id: "16-kraj-cypr", turns: ["Cypr na tydzień, 2 osoby, do 2500 zł na osobę"] },
  { id: "17-city-break", turns: ["City break na 3 noce, budżet 2000 zł na osobę"] },
  { id: "18-turcja", turns: ["Turcja we wrześniu, 2 osoby, 3500 zł na osobę"] },
  { id: "19-portugalia", turns: ["Portugalia, 7 nocy, 3000 zł na osobę"] },
  { id: "20-zmiana-terminu", turns: ["Grecja w lipcu, 2 osoby, 3000 zł na osobę"] },
];

interface TurnRecord {
  scenario: string; index: number; prompt: number; question: string;
  wallMs: number; ok: boolean; hasOffer: boolean; error: boolean;
  /** ODPOWIEDZ BOTA — do recznego sprawdzenia jakosci (§42: zero zmyslonych
   *  kwot, poprawny stan oferty czesciowej). Bez tego pomiar mowi tylko
   *  „ile trwalo", a nie „czy odpowiedz jest uczciwa". */
  text: string;
  offer: unknown | null;
  diag?: Diag;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
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

function row(label: string, s: ReturnType<typeof stats>): string {
  return `  ${label.padEnd(24)} n=${String(s.n).padStart(3)}  p50 ${String(s.p50).padStart(6)}  p75 ${String(s.p75).padStart(6)}  p95 ${String(s.p95).padStart(6)}  max ${String(s.max).padStart(6)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const base = arg("base");
  if (!base) throw new Error("podaj --base=https://<wdrozenie>");
  const gapMs = Number(arg("gap") ?? 7_000);
  const root = base.replace(/\/$/, "");

  const headers: Record<string, string> = { "content-type": "application/json" };
  const share = arg("share");
  if (share) {
    const gate = await fetch(`${root}/?_vercel_share=${encodeURIComponent(share)}`, { redirect: "manual" });
    const cookie = gate.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (!cookie) throw new Error("token --share nie zwrocil ciasteczka dostepowego");
    headers.cookie = cookie;
  }

  const onlyArg = arg("only");
  const wanted = onlyArg ? onlyArg.split(",").map((x) => x.trim()) : null;
  const records: TurnRecord[] = [];
  let index = 0;
  for (const scenario of SCENARIOS) {
    if (wanted && !wanted.some((w) => scenario.id.includes(w))) continue;
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (let p = 0; p < scenario.turns.length; p++) {
      history.push({ role: "user", content: scenario.turns[p] });
      index += 1;
      const started = Date.now();
      let body: ChatResponse | null = null;
      let ok = false;
      try {
        const res = await fetch(`${root}/api/concierge/chat?diag=1`, {
          method: "POST",
          headers,
          body: JSON.stringify({ messages: history }),
          signal: AbortSignal.timeout(90_000),
        });
        ok = res.ok;
        if (res.ok) body = (await res.json()) as ChatResponse;
        else console.warn(`  ! HTTP ${res.status} na ${scenario.id}/${p + 1}`);
      } catch (err) {
        console.warn(`  ! wyjatek na ${scenario.id}/${p + 1}: ${err instanceof Error ? err.message : err}`);
      }
      const wallMs = Date.now() - started;
      records.push({
        scenario: scenario.id, index, prompt: p + 1, question: scenario.turns[p], wallMs, ok,
        hasOffer: Boolean(body?.offer), error: Boolean(body?.error),
        text: body?.text ?? "", offer: body?.offer ?? null, diag: body?.diag,
      });
      const d = body?.diag;
      console.log(
        `${String(index).padStart(2)}. ${scenario.id.padEnd(24)} ${String(wallMs).padStart(6)} ms  ` +
          (d ? `model ${String(d.modelMs).padStart(5)}  narzedzia ${String(d.toolMs).padStart(5)}  ` +
               `tool_calls ${d.toolCalls}  ${body?.offer ? "KARTA" : "     "}  ${d.outcome}` : "brak diag"),
      );
      if (body) history.push({ role: "assistant", content: body.text });
      await sleep(gapMs);
    }
  }

  const withTool = records.filter((r) => (r.diag?.toolCalls ?? 0) > 0);
  const noTool = records.filter((r) => (r.diag?.toolCalls ?? 0) === 0 && r.diag);
  const ms = (rs: TurnRecord[], f: (d: Diag) => number) => rs.map((r) => (r.diag ? f(r.diag) : 0));

  console.log("\n=== CALE TURY (ms) ===");
  console.log(row("WSZYSTKIE", stats(records.map((r) => r.wallMs))));
  console.log(row("Z NARZEDZIEM", stats(withTool.map((r) => r.wallMs))));
  console.log(row("bez narzedzia", stats(noTool.map((r) => r.wallMs))));
  console.log("\n=== ROZBICIE TUR Z NARZEDZIEM ===");
  console.log(row("czas MODELU", stats(ms(withTool, (d) => d.modelMs))));
  console.log(row("czas NARZEDZI", stats(ms(withTool, (d) => d.toolMs))));
  console.log(row("serwer razem", stats(ms(withTool, (d) => d.totalMs))));

  const spanNames = new Set(records.flatMap((r) => Object.keys(r.diag?.spans ?? {})));
  console.log("\n=== ZALEZNOSCI ===");
  for (const name of spanNames) {
    console.log(row(name, stats(records.map((r) => r.diag?.spans[name]).filter((v): v is number => typeof v === "number"))));
  }

  const cards = records.filter((r) => r.hasOffer).length;
  const errors = records.filter((r) => r.error || !r.ok).length;
  console.log(`\nkart oferty: ${cards}/${records.length} · tur z bledem: ${errors} · model: ${records.find((r) => r.diag?.model)?.diag?.model ?? "?"}`);

  const out = arg("out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(records, null, 2), "utf8");
    console.log(`zapisano ${out}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
