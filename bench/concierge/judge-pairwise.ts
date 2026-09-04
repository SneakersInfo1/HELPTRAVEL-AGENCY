// ŚLEPY SĘDZIA PARAMI (master prompt §46: „Jeżeli możesz: blind pairwise
// comparison").
//
// Dlaczego parami, a nie ocena 0–5 per odpowiedź: sędzia LLM jest kiepskim
// miernikiem bezwzględnym (te same odpowiedzi dostają różne noty w różnych
// przebiegach), ale porównanie „która z tych dwóch jest lepsza" jest wyraźnie
// stabilniejsze.
//
// Trzy zabezpieczenia przed autotendencyjnością:
//  1. ŚLEPO — sędzia nigdy nie widzi nazw modeli, tylko „ODPOWIEDŹ 1/2".
//  2. LOSOWA KOLEJNOŚĆ (deterministyczna, z hasza) — model A bywa raz
//     pierwszy, raz drugi, więc preferencja pozycji się znosi.
//  3. POMIAR STRONNICZOŚCI — próbka par jest sędziowana DWA razy, w obu
//     kolejnościach; niezgodność to bezpośrednia miara szumu sędziego.
//
// Uruchom po benchmarku:
//   npx tsx --env-file=.env.local bench/concierge/judge-pairwise.ts --dir=... --max-usd=...

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadPricing } from "./openrouter-bench";

const JUDGE_DEFAULT = "google/gemini-2.5-flash";

const RUBRIC = `Jesteś surowym recenzentem polskiego czatbota-konsjerża podróżniczego HelpTravel.
Dostajesz zapytanie użytkownika i DWIE odpowiedzi bota. Nie wiesz, jakie modele je napisały.

Wybierz lepszą według tego, co realnie pomaga klientowi kupić wyjazd:
- trafność wobec pytania i pamięć wcześniejszych tur,
- konkret zamiast lania wody i zamiast ankiety pytań,
- prowadzenie do następnego kroku,
- uczciwość: żadnych cen, godzin ani obietnic bez pokrycia w danych.

OSOBNO oceń samą polszczyznę: naturalność, odmianę, szyk, brak kalek z angielskiego
i brak sztywnego tonu tłumaczenia maszynowego.

Zwróć WYŁĄCZNIE JSON, bez komentarza i bez markdownu:
{"overall":"1"|"2"|"remis","polish":"1"|"2"|"remis","why":"jedno krótkie zdanie po polsku"}`;

interface CaseRow {
  id: string;
  finalText: string;
}
interface ResultFile {
  summary: { model: string };
  results: CaseRow[];
}
interface Verdict {
  overall: "1" | "2" | "remis";
  polish: "1" | "2" | "remis";
  why?: string;
}

function parseCli(argv: string[]) {
  const get = (n: string) => {
    const hit = argv.find((a) => a.startsWith("--" + n + "="));
    return hit ? hit.slice(n.length + 3) : undefined;
  };
  return {
    judge: get("model") ?? JUDGE_DEFAULT,
    dir: get("dir") ?? "bench/concierge/results",
    concurrency: get("concurrency") ? Number(get("concurrency")) : 4,
    maxUsd: get("max-usd") ? Number(get("max-usd")) : null,
    /** Ile par przesędzić w OBU kolejnościach, by zmierzyć stronniczość pozycji. */
    biasProbe: get("bias-probe") ? Number(get("bias-probe")) : 20,
  };
}

/** FNV-1a — kolejność w parze musi być losowa, ale POWTARZALNA między przebiegami. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

async function askJudge(
  apiKey: string,
  judgeModel: string,
  question: string,
  first: string,
  second: string,
  usage: { inTok: number; outTok: number; calls: number; fails: number },
): Promise<Verdict | null> {
  const body = {
    model: judgeModel,
    messages: [
      { role: "system", content: RUBRIC },
      {
        role: "user",
        content:
          "ZAPYTANIE UŻYTKOWNIKA:\n" +
          question +
          "\n\n--- ODPOWIEDŹ 1 ---\n" +
          first +
          "\n\n--- ODPOWIEDŹ 2 ---\n" +
          second,
      },
    ],
    temperature: 0,
    max_tokens: 200,
    usage: { include: true },
    response_format: { type: "json_object" },
  };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://helptravel.pl",
        "X-Title": "HelpTravel pairwise judge",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    usage.calls += 1;
    usage.inTok += json.usage?.prompt_tokens ?? 0;
    usage.outTok += json.usage?.completion_tokens ?? 0;
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) {
      usage.fails += 1;
      return null;
    }
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const v = JSON.parse(cleaned) as Verdict;
    if (!["1", "2", "remis"].includes(v.overall)) {
      usage.fails += 1;
      return null;
    }
    return v;
  } catch {
    usage.fails += 1;
    return null;
  }
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

interface Job {
  caseId: string;
  question: string;
  modelA: string;
  modelB: string;
  textA: string;
  textB: string;
  /** true = w promptcie A jest jako „ODPOWIEDŹ 1". */
  aFirst: boolean;
  /** Zadanie kontrolne: ta sama para w odwróconej kolejności. */
  isBiasProbe: boolean;
}

async function main(): Promise<number> {
  const cli = parseCli(process.argv.slice(2));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Brak OPENROUTER_API_KEY");
    return 1;
  }

  const { EVAL_CASES } = (await import("./cases")) as {
    EVAL_CASES: Array<{ id: string; turns: string[] }>;
  };
  const { SEED_CASES } = (await import("./cases-seed")) as {
    SEED_CASES: Array<{ id: string; turns: string[] }>;
  };
  const questionById = new Map<string, string>();
  for (const c of [...EVAL_CASES, ...SEED_CASES]) questionById.set(c.id, c.turns.join("\n"));

  const dir = join(process.cwd(), cli.dir);
  const byModel = new Map<string, Map<string, string>>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("JUDGE"))) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as ResultFile;
    const m = new Map<string, string>();
    for (const r of data.results) m.set(r.id, r.finalText);
    byModel.set(data.summary.model, m);
  }

  const models = [...byModel.keys()].sort();
  if (models.length < 2) {
    console.error("Potrzebne co najmniej dwa modele w " + cli.dir);
    return 1;
  }

  // Wszystkie pary bez powtórzeń.
  const jobs: Job[] = [];
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const [ma, mb] = [models[i], models[j]];
      const ids = [...byModel.get(ma)!.keys()].filter((id) => byModel.get(mb)!.has(id));
      ids.sort();
      ids.forEach((id, idx) => {
        const ta = byModel.get(ma)!.get(id)!;
        const tb = byModel.get(mb)!.get(id)!;
        if (!ta.trim() || !tb.trim()) return;
        const aFirst = hash32(ma + "|" + mb + "|" + id) % 2 === 0;
        jobs.push({
          caseId: id,
          question: questionById.get(id) ?? id,
          modelA: ma,
          modelB: mb,
          textA: ta,
          textB: tb,
          aFirst,
          isBiasProbe: false,
        });
        // Co k-ta para leci DRUGI raz w odwróconej kolejności (pomiar stronniczości).
        if (cli.biasProbe > 0 && idx % Math.ceil(ids.length / cli.biasProbe) === 0) {
          jobs.push({
            caseId: id,
            question: questionById.get(id) ?? id,
            modelA: ma,
            modelB: mb,
            textA: ta,
            textB: tb,
            aFirst: !aFirst,
            isBiasProbe: true,
          });
        }
      });
    }
  }

  // Sufit kosztu PRZED wydaniem (§47). ~1200 tok. wejścia i 150 wyjścia na parę.
  const p = loadPricing()[cli.judge];
  const est = p ? jobs.length * (1200 * p.prompt + 150 * p.completion) : 0;
  console.log("porównań do wykonania: " + jobs.length + " (w tym kontrolnych: " + jobs.filter((j) => j.isBiasProbe).length + ")");
  console.log("szacowany koszt sędziego: $" + est.toFixed(3));
  if (cli.maxUsd !== null && est > cli.maxUsd) {
    console.error("STOP — szacunek przekracza sufit $" + cli.maxUsd.toFixed(2));
    return 2;
  }

  const usage = { inTok: 0, outTok: 0, calls: 0, fails: 0 };
  let done = 0;
  const verdicts = await pool(jobs, cli.concurrency, async (j) => {
    const [first, second] = j.aFirst ? [j.textA, j.textB] : [j.textB, j.textA];
    const v = await askJudge(apiKey, cli.judge, j.question, first, second, usage);
    done++;
    if (done % 25 === 0) process.stdout.write(".");
    return { job: j, verdict: v };
  });

  // Zliczanie: głos „1"/„2" tłumaczymy z pozycji NA MODEL.
  interface Tally { wins: number; losses: number; ties: number; polishWins: number; polishLosses: number; polishTies: number }
  const tally = new Map<string, Tally>();
  const blank = (): Tally => ({ wins: 0, losses: 0, ties: 0, polishWins: 0, polishLosses: 0, polishTies: 0 });
  for (const m of models) tally.set(m, blank());

  const pairTally = new Map<string, { a: number; b: number; tie: number }>();
  let biasAgree = 0;
  let biasTotal = 0;
  const biasSeen = new Map<string, string>();

  for (const { job, verdict } of verdicts) {
    if (!verdict) continue;
    const winnerModel =
      verdict.overall === "remis"
        ? null
        : (verdict.overall === "1") === job.aFirst
          ? job.modelA
          : job.modelB;
    const polishModel =
      verdict.polish === "remis" || !verdict.polish
        ? null
        : (verdict.polish === "1") === job.aFirst
          ? job.modelA
          : job.modelB;

    const key = job.modelA + " vs " + job.modelB + " #" + job.caseId;
    if (job.isBiasProbe) {
      const prev = biasSeen.get(key);
      if (prev !== undefined) {
        biasTotal++;
        if (prev === (winnerModel ?? "remis")) biasAgree++;
      }
      continue; // kontrolne NIE liczą się do wyniku
    }
    biasSeen.set(key, winnerModel ?? "remis");

    const pk = job.modelA + " vs " + job.modelB;
    const pt = pairTally.get(pk) ?? { a: 0, b: 0, tie: 0 };
    if (winnerModel === job.modelA) pt.a++;
    else if (winnerModel === job.modelB) pt.b++;
    else pt.tie++;
    pairTally.set(pk, pt);

    const ta = tally.get(job.modelA)!;
    const tb = tally.get(job.modelB)!;
    if (winnerModel === job.modelA) { ta.wins++; tb.losses++; }
    else if (winnerModel === job.modelB) { tb.wins++; ta.losses++; }
    else { ta.ties++; tb.ties++; }

    if (polishModel === job.modelA) { ta.polishWins++; tb.polishLosses++; }
    else if (polishModel === job.modelB) { tb.polishWins++; ta.polishLosses++; }
    else { ta.polishTies++; tb.polishTies++; }
  }

  const judgeCost = p ? usage.inTok * p.prompt + usage.outTok * p.completion : 0;

  console.log("\n\nŚLEPY SĘDZIA PARAMI — " + cli.judge);
  console.log("wywołań: " + usage.calls + ", nieudanych: " + usage.fails + ", REALNY koszt: $" + judgeCost.toFixed(4));
  if (biasTotal > 0) {
    console.log(
      "zgodność przy odwróconej kolejności: " +
        Math.round((biasAgree / biasTotal) * 100) +
        "% (" + biasAgree + "/" + biasTotal + ") — im wyżej, tym mniej sędzia patrzy na pozycję",
    );
  }

  const head = "MODEL".padEnd(32) + ["wygrane", "przegrane", "remisy", "win%", "polski win%"].map((h) => h.padStart(13)).join("");
  console.log("\n" + head);
  console.log("-".repeat(head.length));
  const rows = [...tally.entries()].map(([m, t]) => {
    const decided = t.wins + t.losses;
    const pdecided = t.polishWins + t.polishLosses;
    return {
      m,
      t,
      winPct: decided ? (t.wins / decided) * 100 : 0,
      polishPct: pdecided ? (t.polishWins / pdecided) * 100 : 0,
    };
  });
  rows.sort((a, b) => b.winPct - a.winPct);
  for (const r of rows) {
    console.log(
      r.m.padEnd(32) +
        [String(r.t.wins), String(r.t.losses), String(r.t.ties), r.winPct.toFixed(0) + "%", r.polishPct.toFixed(0) + "%"]
          .map((v) => v.padStart(13))
          .join(""),
    );
  }

  console.log("\nPARAMI:");
  for (const [pair, t] of pairTally) {
    const [ma, mb] = pair.split(" vs ");
    console.log("  " + ma + " " + t.a + " : " + t.b + " " + mb + "  (remisy: " + t.tie + ")");
  }

  const file = join(dir, "JUDGE-PAIRWISE__" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  writeFileSync(
    file,
    JSON.stringify(
      {
        judge: cli.judge,
        judgeCostUsd: judgeCost,
        calls: usage.calls,
        fails: usage.fails,
        positionBiasAgreementPct: biasTotal ? (biasAgree / biasTotal) * 100 : null,
        table: rows.map((r) => ({ model: r.m, ...r.t, winPct: r.winPct, polishWinPct: r.polishPct })),
        pairs: [...pairTally.entries()].map(([k, v]) => ({ pair: k, ...v })),
      },
      null,
      1,
    ),
    "utf8",
  );
  console.log("\nzapisano: " + file);
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
