// Ile stron miesięcy niesie własną informację, a ile jest tym samym tekstem
// po podstawieniu nazwy kierunku i miesiąca.
//
//   pnpm seo:month-diversity -- --base http://localhost:3000 --out seo-private/audit/month-diversity.json
//
// Dla każdej strony `/kierunki/<slug>/<miesiac>` pobiera HTML, wyciąga tekst treści
// głównej i liczy:
//  • „szkielet”: tekst po zamaskowaniu nazwy kierunku, nazw miesięcy i liczb —
//    strony o tym samym szkielecie różnią się wyłącznie podstawionymi wartościami;
//  • udział zdań, które po zamaskowaniu występują na ponad połowie stron (szablon);
//  • liczbę faktów liczbowych z jednostką (°C, mm, dni, h) widocznych na stronie.
// Tylko GET stron treści; żadnych tras wyszukiwarki ani dostawców.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { getAllDestinationProfiles } from "../../src/lib/mvp/destinations";
import { isMonthIndexable } from "../../src/lib/mvp/month-index-policy";
import { polishMonthSlugs } from "../../src/lib/mvp/months";
import { auditHtml } from "../../src/lib/seo-ops/html-audit";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const BASE = arg("base", "http://localhost:3000").replace(/\/$/, "");
const OUT = arg("out", "seo-private/audit/month-diversity.json");

const MONTH_WORDS =
  /\b(stycz(?:eń|nia|niu|niowy\p{L}*)|lut(?:y|ego|ym|owy\p{L}*)|mar(?:zec|ca|cu|cow\p{L}*)|kwie(?:cień|tnia|tniu|tniow\p{L}*)|maj(?:a|u|ow\p{L}*)?|czerw(?:iec|ca|cu|cow\p{L}*)|lip(?:iec|ca|cu|cow\p{L}*)|sierp(?:ień|nia|niu|niow\p{L}*)|wrze(?:sień|śnia|śniu|śniow\p{L}*)|październik\p{L}*|listopad\p{L}*|grud(?:zień|nia|niu|niow\p{L}*))\b/giu;

interface PageRow {
  path: string;
  slug: string;
  indexable: boolean;
  words: number;
  numericFacts: number;
  skeleton: string;
  sentences: string[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mask(text: string, name: string): string {
  // Nazwa bywa odmieniona („w Barcelonie”), więc maskujemy po rdzeniu.
  const stem = name.length > 5 ? name.slice(0, -2) : name;
  return text
    .replace(new RegExp(`${escapeRegExp(stem)}\\p{L}*`, "giu"), "{MIASTO}")
    .replace(MONTH_WORDS, "{MIESIAC}")
    .replace(/\d+(?:[.,]\d+)?/g, "{N}")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPage(path: string): Promise<string | null> {
  const response = await fetch(`${BASE}${path}`, { headers: { "user-agent": "HelpTravelSeoAudit/1.0", "accept-language": "pl-PL" } });
  return response.status === 200 ? response.text() : null;
}

async function main() {
  const profiles = getAllDestinationProfiles();
  const tasks = profiles.flatMap((profile) =>
    polishMonthSlugs.map((month, monthIndex) => ({ profile, path: `/kierunki/${profile.slug}/${month}`, indexable: isMonthIndexable(profile, monthIndex) })),
  );
  const rows: PageRow[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      const html = await fetchPage(task.path);
      if (!html) continue;
      const audit = auditHtml(html, `${BASE}${task.path}`);
      const name = (audit.h1[0] ?? "").split(/ w[e]? /)[0].trim() || task.profile.city;
      const text = audit.mainText;
      const masked = mask(text, name);
      rows.push({
        path: task.path,
        slug: task.profile.slug,
        indexable: task.indexable,
        words: audit.mainWordCount,
        numericFacts: (text.match(/\d+(?:[.,]\d+)?\s?(?:°C|mm|dni[a]?\b|h\b|%)/g) ?? []).length,
        skeleton: createHash("sha1").update(masked).digest("hex").slice(0, 12),
        sentences: masked.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.split(" ").length >= 5),
      });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  const sentencePages = new Map<string, number>();
  for (const row of rows) for (const sentence of new Set(row.sentences)) sentencePages.set(sentence, (sentencePages.get(sentence) ?? 0) + 1);
  const templateShare = (row: PageRow) => {
    if (row.sentences.length === 0) return 1;
    return row.sentences.filter((sentence) => (sentencePages.get(sentence) ?? 0) > rows.length / 2).length / row.sentences.length;
  };
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  const summarize = (label: string, group: PageRow[]) => {
    const skeletons = new Map<string, number>();
    for (const row of group) skeletons.set(row.skeleton, (skeletons.get(row.skeleton) ?? 0) + 1);
    const sizes = [...skeletons.values()].sort((a, b) => b - a);
    return {
      label,
      pages: group.length,
      medianWords: median(group.map((row) => row.words)),
      medianNumericFacts: median(group.map((row) => row.numericFacts)),
      pagesWithoutNumericFacts: group.filter((row) => row.numericFacts === 0).length,
      distinctSkeletons: skeletons.size,
      pagesSharingSkeletonWith10Plus: sizes.filter((size) => size >= 10).reduce((sum, size) => sum + size, 0),
      largestSkeletonGroups: sizes.slice(0, 5),
      medianTemplateSentenceShare: Math.round(median(group.map(templateShare)) * 100) / 100,
    };
  };
  const indexable = rows.filter((row) => row.indexable);
  const report = {
    base: BASE,
    measuredAt: new Date().toISOString(),
    groups: [
      summarize("wszystkie strony miesięcy", rows),
      summarize("indeksowalne", indexable),
      summarize("indeksowalne z liczbami pogodowymi", indexable.filter((row) => row.numericFacts > 0)),
      summarize("indeksowalne bez żadnej liczby pogodowej", indexable.filter((row) => row.numericFacts === 0)),
      summarize("bez indeksu", rows.filter((row) => !row.indexable)),
    ],
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const group of report.groups) console.log(JSON.stringify(group));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
