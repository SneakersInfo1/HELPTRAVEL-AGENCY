// Inwentarz adresów i backlog szans z crawla (przed/po) i eksportu GSC.
//
//   pnpm seo:inventory -- --before seo-private/crawl/prod-2026-11-13/crawl.csv \
//     --after seo-private/crawl/local-build/crawl.csv --gsc-dir seo-private/gsc/2026-11-10
//
// INVENTORY.csv: wszystkie strony HTML 200 z crawla produkcji, z wartościami po
// zmianach z crawla buildu tej gałęzi. Bez danych GSC (to informacja publiczna:
// każdy może pobrać te strony).
// OPPORTUNITY_BACKLOG.csv: 20 adresów priorytetowych z metrykami GSC na poziomie
// strony (agregaty, bez surowych zapytań) i decyzją: co zrobiono, co dalej.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseGscCsv, type GscRow } from "../../src/lib/seo-ops/gsc/csv";
import { referenceCtrForPosition, scoreOpportunity } from "../../src/lib/seo-ops/gsc/analysis";
import { classifyQuery, classifyUrl } from "../../src/lib/seo-ops/gsc/segments";
import { comparisonViewFor } from "../../src/lib/seo/comparison-view-data";

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (!value) throw new Error(`Brak --${name}`);
  return value;
}

function readCsv(file: string): Array<Record<string, string>> {
  const text = readFileSync(file, "utf8");
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      cur.push(cell);
      cell = "";
    } else if (c === "\n") {
      cur.push(cell);
      rows.push(cur);
      cur = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  const head = rows.shift() ?? [];
  return rows.filter((row) => row.length === head.length).map((row) => Object.fromEntries(head.map((h, index) => [h, row[index]])));
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file: string, columns: string[], rows: Array<Record<string, unknown>>) {
  writeFileSync(file, `${[columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n")}\n`, "utf8");
}

const bare = (title: string) => title.replace(/ \| HelpTravel$/, "").length;

function inventory(beforeFile: string, afterFile: string, out: string) {
  const before = readCsv(beforeFile).filter((row) => row.finalStatus === "200" && row.hops === "0" && row.title);
  const after = new Map(readCsv(afterFile).map((row) => [row.path, row]));
  const rows = before.map((row) => {
    const next = after.get(row.path);
    return {
      path: row.path,
      segment: classifyUrl(`https://helptravel.pl${row.path}`).segment,
      in_sitemap: row.inSitemap,
      indexable_before: /noindex/.test(row.metaRobots) ? "nie" : "tak",
      indexable_after: next ? (/noindex/.test(next.metaRobots) ? "nie" : "tak") : "",
      title_before: row.title,
      title_after: next?.title ?? "",
      title_len_bare_before: bare(row.title),
      title_len_bare_after: next ? bare(next.title) : "",
      h1_before: row.h1,
      h1_after: next?.h1 ?? "",
      words_before: row.mainWords,
      words_after: next?.mainWords ?? "",
      og_image_before: row.ogImage ? "tak" : "nie",
      og_image_after: next ? (next.ogImage ? "tak" : "nie") : "",
      jsonld_after: next?.jsonLdTypes ?? "",
      canonical_self_after: next?.canonicalSelf ?? "",
    };
  });
  rows.sort((a, b) => a.path.localeCompare(b.path));
  writeCsv(out, Object.keys(rows[0]), rows);
  console.log(`INVENTORY: ${rows.length} adresów → ${out}`);
}

// 20 adresów priorytetowych: 10 z misji + 10 następnych wg rankingu szans.
const MISSION_PRIORITY = [
  "/porownanie/malaga-spain-vs-valencia-spain",
  "/porownanie/funchal-portugal-vs-santa-cruz-de-tenerife-spain",
  "/porownanie/athens-greece-vs-rome-italy",
  "/porownanie/barcelona-spain-vs-valencia-spain",
  "/kierunki/barcelona-spain/styczen",
  "/kierunki/barcelona-spain/listopad",
  "/kierunki/malaga-spain/luty",
  "/kierunki/marrakesh-morocco/styczen",
  "/wyjazdy/city-break",
  "/wyjazdy/budzet",
];

const ENRICHED = new Set(MISSION_PRIORITY.slice(0, 4));

interface Decision {
  status: "DONE_W_GAŁĘZI" | "BACKLOG" | "WSTRZYMANE";
  action: string;
  risk: string;
  cost: string;
}

function decisionFor(path: string): Decision {
  const segment = classifyUrl(`https://helptravel.pl${path}`).segment;
  if (ENRICHED.has(path)) {
    return {
      status: "DONE_W_GAŁĘZI",
      action: "Nowy szablon + dokument treści ze źródłami (UNESCO, oficjalne portale), krótszy tytuł i opis, werdykt z podstawą, tabela faktów, okruszki przez /porownanie, dateModified tylko z treści.",
      risk: "niskie (strona istnieje; tytuł/opis zmienione — pomiar CTR po 28 dniach)",
      cost: "średni (redakcja + weryfikacja źródeł)",
    };
  }
  if (segment === "comparison") {
    return {
      status: "BACKLOG",
      action: "Szablon „Werdykt” już wdrożony; następny krok: dokument treści ze źródłami (pierwsze zadanie silnika — tryb DRAFT_AND_PR).",
      risk: "niskie",
      cost: "średni",
    };
  }
  if (segment === "month") {
    return {
      status: "DONE_W_GAŁĘZI",
      action: "Nowy szablon: odpowiedź pod nagłówkiem, „na co ten termin / kiedy odpuścić” z jawną podstawą, widoczne FAQ = FAQPage, tytuł ≤ 60 znaków. Polityka indeksu bez zmian (decyzja właściciela).",
      risk: "niskie; SERP pogodowy zabiera kliknięcia (Faza 2.1) — nie oczekiwać dużego wzrostu CTR",
      cost: "niski (szablon)",
    };
  }
  if (segment === "mood_hub") {
    return {
      status: "DONE_W_GAŁĘZI",
      action: "Tytuł bez sufiksu marki, tabela faktów z bramki, linki do porównań, ItemList bez /hotele/szukaj, og:image i karta Twittera.",
      risk: "niskie; ruch huba budżetu jest głównie markowy (Faza 2.1)",
      cost: "niski",
    };
  }
  return { status: "BACKLOG", action: "Do oceny w kolejnym przebiegu (ranking szans).", risk: "—", cost: "—" };
}

function backlog(dir: string, out: string) {
  const find = (pattern: RegExp) => join(dir, readdirSync(dir).find((file) => pattern.test(file))!);
  const pages = parseGscCsv(readFileSync(find(/pages.*\.csv$/), "utf8")).rows;
  const queries = parseGscCsv(readFileSync(find(/queries.*\.csv$/), "utf8")).rows;
  const byPath = new Map<string, GscRow>();
  for (const row of pages) {
    const info = classifyUrl(row.key);
    if (!info.hasQuery && info.segment !== "legacy") byPath.set(info.path, row);
  }
  const ranked = [...byPath.values()]
    .map((row) => ({ row, score: scoreOpportunity({ url: row.key, clicks: row.clicks, impressions: row.impressions, position: row.position }) }))
    .filter((item) => item.score.score > 0)
    .sort((a, b) => b.score.score - a.score.score);
  const chosen = [...MISSION_PRIORITY];
  for (const item of ranked) {
    const path = classifyUrl(item.row.key).path;
    if (chosen.length >= 20) break;
    if (!chosen.includes(path)) chosen.push(path);
  }

  // Dowód z zapytań bez surowych fraz: liczba wariantów klastra i suma wyświetleń.
  const clusterEvidence = (path: string): string => {
    const info = classifyUrl(`https://helptravel.pl${path}`);
    if (info.segment === "comparison" && info.slug) {
      // Zapytania są po polsku („walencja”), slugi po angielsku („valencia”) — dopasowanie
      // po rdzeniach polskich nazw z modelu widoku, bez znaków diakrytycznych.
      const view = comparisonViewFor(info.slug)?.view;
      const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
      const stems = view ? [view.nameA, view.nameB].map((name) => fold(name).slice(0, 4)) : [];
      const matched = queries.filter((q) => classifyQuery(q.key) === "comparison" && stems.length === 2 && stems.every((stem) => fold(q.key).includes(stem)));
      const impressions = matched.reduce((sum, q) => sum + q.impressions, 0);
      return matched.length ? `klaster porównawczy pary — wariantów zapytań: ${matched.length}, wyświetleń: ${impressions}` : "brak zapytań porównawczych pary w eksporcie (anonimizacja / długi ogon)";
    }
    if (info.segment === "month") return "klaster pogodowy „miasto + miesiąc” (SERP z widżetem pogody)";
    if (info.segment === "mood_hub") {
      if (path.endsWith("city-break")) return "klaster „city break” (głównie pozycje 30–50)";
      if (path.endsWith("budzet")) return "kliknięcia głównie z linków dodatkowych przy marce (Faza 2.1: 288/288)";
      return "brak przypisania zapytań do strony (wymaga eksportu strona×zapytanie)";
    }
    return "—";
  };

  const rows = chosen.map((path, index) => {
    const row = byPath.get(path);
    const decision = decisionFor(path);
    const ctr = row && row.impressions > 0 ? row.clicks / row.impressions : null;
    return {
      priority: index + 1,
      url: path,
      intent_cluster: classifyUrl(`https://helptravel.pl${path}`).segment,
      query_evidence: clusterEvidence(path),
      gsc_clicks_92d: row?.clicks ?? "",
      gsc_impressions_92d: row?.impressions ?? "",
      gsc_ctr_92d: ctr === null ? "" : (ctr * 100).toFixed(2),
      gsc_position_92d: row?.position ?? "",
      reference_ctr_at_position: row ? (referenceCtrForPosition(row.position) * 100).toFixed(1) : "",
      device_note: "eksport bez podziału urządzeń per strona; całość: mobile 69% wyświetleń, 84% kliknięć",
      impression_trend: "brak danych per strona w czasie (wymaga eksportu strona×data)",
      content_audit: "",
      business_relevance: ["comparison", "mood_hub"].includes(classifyUrl(`https://helptravel.pl${path}`).segment) ? "wysoka (CTA do hoteli z kierunkiem)" : "średnia",
      risk: decision.risk,
      cost: decision.cost,
      impact_rationale: row ? scoreOpportunity({ url: row.key, clicks: row.clicks, impressions: row.impressions, position: row.position }).rationale : "",
      recommended_action: decision.action,
      status: decision.status,
      baseline_snapshot: "GSC 2026-08-11–2026-11-10; crawl produkcji 2026-11-13",
    };
  });
  writeCsv(out, Object.keys(rows[0]), rows);
  console.log(`BACKLOG: ${rows.length} adresów → ${out}`);
}

inventory(arg("before"), arg("after"), arg("inventory-out", "docs/seo/INVENTORY.csv"));
backlog(arg("gsc-dir"), arg("backlog-out", "docs/seo/OPPORTUNITY_BACKLOG.csv"));
