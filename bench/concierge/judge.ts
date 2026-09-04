// Sędzia LLM (master prompt §46) — ocenia WYŁĄCZNIE to, czego nie da się
// sprawdzić mechanicznie: trafność, naturalność polszczyzny, pomocność,
// prowadzenie do działania. Twarde naruszenia (zmyślona cena, brak narzędzia,
// markdown, długość) rozstrzyga checks.ts i sędzia ich NIE dubluje.
//
// Ochrona przed autotendencyjnością: sędzia NIE wie, który model odpowiadał —
// dostaje wyłącznie zapytanie użytkownika, notatkę rubryki i tekst odpowiedzi.
//
// Uruchom po benchmarku:
//   npx tsx --env-file=.env.local bench/concierge/judge.ts --model=<sędzia>

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const JUDGE_DEFAULT = "google/gemini-2.5-flash";

const RUBRIC = `Jesteś surowym recenzentem jakości polskiego czatbota-konsjerża podróżniczego.
Oceniasz JEDNĄ odpowiedź bota. Nie wiesz, jaki model ją napisał, i nie ma to znaczenia.

Oceń w skali 0-5 (0 = fatalnie, 5 = wzorowo):
- relevance: czy odpowiedź trafia w to, o co pytał użytkownik
- helpfulness: czy realnie posuwa sprawę do przodu (konkret, nie lanie wody)
- polish: czy polszczyzna jest naturalna — odmiana, szyk, brak kalek z angielskiego, brak sztywnego tonu tłumaczenia maszynowego
- actionability: czy kończy się konkretnym następnym krokiem
- tone: czy brzmi jak kompetentny doradca sprzedawca, a nie jak formularz ani nachalny akwizytor

Zwróć WYŁĄCZNIE JSON, bez komentarza i bez markdownu:
{"relevance":N,"helpfulness":N,"polish":N,"actionability":N,"tone":N,"why":"jedno zdanie po polsku"}`;

interface CaseRow {
  id: string;
  category: string;
  replies: string[];
  finalText: string;
}
interface ResultFile {
  summary: { model: string };
  results: CaseRow[];
}

interface Scores {
  relevance: number;
  helpfulness: number;
  polish: number;
  actionability: number;
  tone: number;
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
    concurrency: get("concurrency") ? Number(get("concurrency")) : 6,
    limit: get("limit") ? Number(get("limit")) : undefined,
  };
}

async function judgeOne(
  apiKey: string,
  judgeModel: string,
  userTurns: string,
  rubricNote: string,
  reply: string,
): Promise<Scores | null> {
  const body = {
    model: judgeModel,
    messages: [
      { role: "system", content: RUBRIC },
      {
        role: "user",
        content:
          "ZAPYTANIE UŻYTKOWNIKA:\n" +
          userTurns +
          "\n\nNA CO PATRZEĆ (rubryka przypadku):\n" +
          rubricNote +
          "\n\nODPOWIEDŹ BOTA:\n" +
          reply,
      },
    ],
    temperature: 0,
    max_tokens: 300,
    response_format: { type: "json_object" },
  };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://helptravel.pl",
        "X-Title": "HelpTravel judge",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) return null;
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Scores;
    for (const k of ["relevance", "helpfulness", "polish", "actionability", "tone"] as const) {
      if (typeof parsed[k] !== "number") return null;
    }
    return parsed;
  } catch {
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

async function main(): Promise<number> {
  const cli = parseCli(process.argv.slice(2));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Brak OPENROUTER_API_KEY");
    return 1;
  }

  // Rubryki z datasetu — sędzia dostaje tę samą wskazówkę, co autor przypadku.
  const { EVAL_CASES } = (await import("./cases")) as { EVAL_CASES: Array<{ id: string; turns: string[]; rubricNotes: string }> };
  const { SEED_CASES } = (await import("./cases-seed")) as { SEED_CASES: Array<{ id: string; turns: string[]; rubricNotes: string }> };
  const byId = new Map<string, { turns: string[]; rubricNotes: string }>();
  for (const c of [...EVAL_CASES, ...SEED_CASES]) byId.set(c.id, c);

  const dir = join(process.cwd(), cli.dir);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("JUDGE"));
  const latest = new Map<string, { file: string; data: ResultFile }>();
  for (const f of files.sort()) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as ResultFile;
    latest.set(data.summary.model, { file: f, data });
  }

  const out: Record<string, Record<string, number>> = {};
  for (const [model, { data }] of latest) {
    let rows = data.results;
    if (cli.limit) rows = rows.slice(0, cli.limit);
    process.stdout.write("\nsędzia → " + model + " (" + rows.length + " odpowiedzi) ");

    const scored = await pool(rows, cli.concurrency, async (r) => {
      const c = byId.get(r.id);
      if (!c) return null;
      const s = await judgeOne(
        apiKey,
        cli.judge,
        c.turns.join("\n"),
        c.rubricNotes,
        r.finalText,
      );
      process.stdout.write(s ? "." : "x");
      return s;
    });

    const ok = scored.filter((s): s is Scores => s !== null);
    const avg = (k: keyof Scores) =>
      ok.length === 0 ? 0 : ok.reduce((a, s) => a + (s[k] as number), 0) / ok.length;
    out[model] = {
      judged: ok.length,
      relevance: Number(avg("relevance").toFixed(2)),
      helpfulness: Number(avg("helpfulness").toFixed(2)),
      polish: Number(avg("polish").toFixed(2)),
      actionability: Number(avg("actionability").toFixed(2)),
      tone: Number(avg("tone").toFixed(2)),
      srednia: Number(
        (
          (avg("relevance") + avg("helpfulness") + avg("polish") + avg("actionability") + avg("tone")) /
          5
        ).toFixed(2),
      ),
    };
  }

  const file = join(dir, "JUDGE__" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  writeFileSync(file, JSON.stringify({ judge: cli.judge, scores: out }, null, 1), "utf8");

  console.log("\n\nSĘDZIA: " + cli.judge + "  (0-5, wyżej = lepiej)\n");
  const head =
    "MODEL".padEnd(32) +
    ["trafność", "pomocność", "polski", "działanie", "ton", "ŚREDNIA"]
      .map((h) => h.padStart(11))
      .join("");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const [m, s] of Object.entries(out).sort((a, b) => b[1].srednia - a[1].srednia)) {
    console.log(
      m.padEnd(32) +
        [s.relevance, s.helpfulness, s.polish, s.actionability, s.tone, s.srednia]
          .map((v) => String(v).padStart(11))
          .join(""),
    );
  }
  console.log("\nzapisano: " + file);
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
