// Crawler technicznego SEO HelpTravel — powtarzalna inwentaryzacja adresów.
//
//   pnpm seo:crawl -- --base https://helptravel.pl --out docs/seo/crawl/prod
//   pnpm seo:crawl -- --base http://localhost:3000 --out docs/seo/crawl/local --limit 200
//
// ZASADY BEZPIECZEŃSTWA (misja SEO V4):
//  • tylko GET stron treści; NIGDY wyszukiwarka, prebook, book, verify, API;
//  • adresy zasilane przez dostawców (karta hotelu, wyniki lotów, kroki
//    zakupu) są pomijane ze statusem SKIPPED_PROVIDER — crawler nie może
//    generować ruchu do LiteAPI ani zapisów do cache stawek;
//  • przekierowania czytamy ręcznie (`redirect: "manual"`), więc cel
//    przekierowania do wyszukiwarki zostaje zapisany, ale nie pobrany;
//  • współbieżność domyślnie 3, odstęp 150 ms na workera, uczciwy User-Agent.
//
// Źródła adresów: sitemap.xml bazy, opcjonalny plik z listą adresów (np.
// strony z eksportu GSC) oraz linki wewnętrzne odkryte na pobranych stronach
// (jeden poziom — wykrywa strony osierocone w sitemapie i linki do 404).

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { auditHtml } from "../../src/lib/seo-ops/html-audit";

interface Args {
  base: string;
  out: string;
  limit: number;
  concurrency: number;
  delayMs: number;
  extra: string | null;
  userAgent: string;
  discover: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    base: (get("base") ?? "https://helptravel.pl").replace(/\/$/, ""),
    out: get("out") ?? "docs/seo/crawl/latest",
    limit: Number(get("limit") ?? 5000),
    concurrency: Math.min(4, Number(get("concurrency") ?? 3)),
    delayMs: Number(get("delay") ?? 150),
    extra: get("extra") ?? null,
    userAgent: get("ua") ?? "HelpTravelSeoAudit/1.0 (+https://helptravel.pl/o-nas; audyt wlasnej witryny)",
    discover: !argv.includes("--no-discover"),
  };
}

/** Ścieżki, których crawler nie pobiera — zasilane przez dostawców albo krok zakupu. */
const SKIP_FETCH: Array<{ test: RegExp; reason: string }> = [
  { test: /^\/api\//, reason: "SKIPPED_API" },
  { test: /^\/admin(\/|$)/, reason: "SKIPPED_ADMIN" },
  { test: /^\/hotele\/szukaj/, reason: "SKIPPED_PROVIDER_SEARCH" },
  { test: /^\/hotele\/rezerwacja/, reason: "SKIPPED_PURCHASE_FLOW" },
  { test: /^\/hotele\/lp[0-9a-f]+/i, reason: "SKIPPED_PROVIDER_HOTEL" },
  { test: /^\/loty\/(wyniki|pasazerowie|platnosc|dodatki|potwierdzenie)/, reason: "SKIPPED_PROVIDER_FLIGHTS" },
  { test: /^\/trips\//, reason: "SKIPPED_PRIVATE" },
  { test: /^\/_next\//, reason: "SKIPPED_ASSET" },
  { test: /\.(png|jpe?g|webp|avif|svg|ico|xml|txt|json|css|js|woff2?)$/i, reason: "SKIPPED_ASSET" },
];

export function skipReason(pathWithQuery: string): string | null {
  const path = pathWithQuery.split("?")[0];
  for (const rule of SKIP_FETCH) if (rule.test.test(path)) return rule.reason;
  return null;
}

interface Row {
  url: string;
  path: string;
  source: string;
  status: number | string;
  redirectTo: string;
  finalStatus: number | string;
  hops: number;
  contentType: string;
  xRobotsTag: string;
  lang: string;
  title: string;
  titleCount: number;
  titleInHead: boolean | string;
  titleLength: number;
  description: string;
  descriptionLength: number;
  metaRobots: string;
  canonical: string;
  canonicalCount: number;
  canonicalSelf: boolean | string;
  h1: string;
  h1Count: number;
  h2Count: number;
  jsonLdTypes: string;
  jsonLdErrors: number;
  mainWords: number;
  internalLinks: number;
  externalLinks: number;
  images: number;
  imagesWithoutAlt: number;
  ogImage: string;
  ogTitle: string;
  twitterTitle: string;
  bytes: number;
  ms: number;
  textHash: string;
  inSitemap: boolean;
  note: string;
}

const COLUMNS: Array<keyof Row> = [
  "url", "path", "source", "status", "redirectTo", "finalStatus", "hops", "contentType", "xRobotsTag", "lang",
  "title", "titleCount", "titleInHead", "titleLength", "description", "descriptionLength", "metaRobots",
  "canonical", "canonicalCount", "canonicalSelf", "h1", "h1Count", "h2Count", "jsonLdTypes", "jsonLdErrors",
  "mainWords", "internalLinks", "externalLinks", "images", "imagesWithoutAlt", "ogImage", "ogTitle", "twitterTitle", "bytes", "ms",
  "textHash", "inSitemap", "note",
];

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function emptyRow(url: string, path: string, source: string, inSitemap: boolean): Row {
  return {
    url, path, source, status: "", redirectTo: "", finalStatus: "", hops: 0, contentType: "", xRobotsTag: "", lang: "",
    title: "", titleCount: 0, titleInHead: "", titleLength: 0, description: "", descriptionLength: 0, metaRobots: "",
    canonical: "", canonicalCount: 0, canonicalSelf: "", h1: "", h1Count: 0, h2Count: 0, jsonLdTypes: "",
    jsonLdErrors: 0, mainWords: 0, internalLinks: 0, externalLinks: 0, images: 0, imagesWithoutAlt: 0, ogImage: "", ogTitle: "", twitterTitle: "",
    bytes: 0, ms: 0, textHash: "", inSitemap, note: "",
  };
}

async function fetchOnce(url: string, userAgent: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml", "accept-language": "pl-PL,pl;q=0.9" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readSitemap(base: string, userAgent: string): Promise<string[]> {
  const response = await fetch(`${base}/sitemap.xml`, { headers: { "user-agent": userAgent } });
  if (!response.ok) throw new Error(`sitemap.xml → ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = new URL(args.base);
  mkdirSync(args.out, { recursive: true });

  const sitemapUrls = await readSitemap(args.base, args.userAgent);
  // Sitemap produkcyjny podaje domenę kanoniczną; przy crawlu lokalnym
  // przepinamy host na bazę, zachowując ścieżki.
  const toPath = (raw: string) => {
    const u = new URL(raw, args.base);
    return u.pathname + u.search;
  };
  const sitemapPaths = new Set(sitemapUrls.map(toPath));

  const queue: Array<{ path: string; source: string }> = [];
  const seen = new Set<string>();
  const enqueue = (path: string, source: string) => {
    if (seen.has(path) || seen.size >= args.limit) return;
    seen.add(path);
    queue.push({ path, source });
  };
  for (const path of sitemapPaths) enqueue(path, "sitemap");
  if (args.extra && existsSync(args.extra)) {
    for (const line of readFileSync(args.extra, "utf8").split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith("#")) continue;
      try {
        enqueue(toPath(value), "extra");
      } catch {
        // wiersz niebędący adresem — pomijamy
      }
    }
  }

  const rows: Row[] = [];
  const discovered = new Map<string, string>();
  const startedAt = new Date();
  let cursor = 0;

  async function crawlOne(item: { path: string; source: string }): Promise<void> {
    const url = `${baseUrl.origin}${item.path}`;
    const row = emptyRow(url, item.path, item.source, sitemapPaths.has(item.path));
    const skip = skipReason(item.path);
    if (skip) {
      row.status = skip;
      row.finalStatus = skip;
      rows.push(row);
      return;
    }
    const t0 = Date.now();
    try {
      let response = await fetchOnce(url, args.userAgent);
      row.status = response.status;
      let current = url;
      while (response.status >= 300 && response.status < 400 && row.hops < 5) {
        const location = response.headers.get("location");
        if (!location) break;
        const next = new URL(location, current);
        row.hops += 1;
        if (row.hops === 1) row.redirectTo = next.host === baseUrl.host ? next.pathname + next.search : next.toString();
        if (next.host !== baseUrl.host) {
          row.note = "redirect poza host";
          break;
        }
        const nextSkip = skipReason(next.pathname + next.search);
        if (nextSkip) {
          row.finalStatus = nextSkip;
          row.note = "cel przekierowania niepobierany";
          break;
        }
        current = next.toString();
        await response.body?.cancel();
        response = await fetchOnce(current, args.userAgent);
      }
      if (row.finalStatus === "") row.finalStatus = response.status;
      row.contentType = response.headers.get("content-type") ?? "";
      row.xRobotsTag = response.headers.get("x-robots-tag") ?? "";
      if (response.status === 200 && row.contentType.includes("text/html")) {
        const html = await response.text();
        row.bytes = Buffer.byteLength(html);
        const audit = auditHtml(html, current);
        row.lang = audit.lang ?? "";
        row.title = audit.titles[0] ?? "";
        row.titleCount = audit.titles.length;
        row.titleInHead = audit.titleInHead;
        row.titleLength = row.title.length;
        row.description = audit.metaDescription ?? "";
        row.descriptionLength = row.description.length;
        row.metaRobots = audit.metaRobots ?? "";
        row.canonical = audit.canonicals[0] ?? "";
        row.canonicalCount = audit.canonicals.length;
        if (row.canonical) {
          const canonicalPath = new URL(row.canonical, current).pathname;
          row.canonicalSelf = canonicalPath === new URL(current).pathname;
        }
        row.h1 = audit.h1[0] ?? "";
        row.h1Count = audit.h1.length;
        row.h2Count = audit.h2.length;
        row.jsonLdTypes = [...new Set(audit.jsonLd.flatMap((b) => b.types))].sort().join("|");
        row.jsonLdErrors = audit.jsonLdErrors;
        row.mainWords = audit.mainWordCount;
        row.internalLinks = audit.internalLinks.length;
        row.externalLinks = audit.externalLinkCount;
        row.images = audit.imageCount;
        row.imagesWithoutAlt = audit.imagesWithoutAlt;
        row.ogImage = audit.ogImage ?? "";
        row.ogTitle = audit.ogTitle ?? "";
        row.twitterTitle = audit.twitterTitle ?? "";
        row.textHash = createHash("sha1").update(audit.mainText).digest("hex").slice(0, 12);
        if (args.discover && row.hops === 0) {
          for (const link of audit.internalLinks) if (!discovered.has(link)) discovered.set(link, item.path);
        }
      } else {
        await response.body?.cancel();
      }
    } catch (error) {
      row.status = "ERROR";
      row.finalStatus = "ERROR";
      row.note = error instanceof Error ? error.message : String(error);
    }
    row.ms = Date.now() - t0;
    rows.push(row);
  }

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const item = queue[cursor];
      cursor += 1;
      await crawlOne(item);
      if (rows.length % 100 === 0) console.log(`[crawl] ${rows.length}/${queue.length}`);
      await new Promise((resolve) => setTimeout(resolve, args.delayMs));
    }
  }

  await Promise.all(Array.from({ length: args.concurrency }, worker));

  // Drugi przebieg: linki wewnętrzne, których nie ma w sitemapie ani w liście dodatkowej.
  if (args.discover) {
    const before = queue.length;
    for (const [path, from] of discovered) enqueue(path, `link:${from}`);
    console.log(`[crawl] odkryte linki wewnętrzne spoza kolejki: ${queue.length - before}`);
    await Promise.all(Array.from({ length: args.concurrency }, worker));
  }

  rows.sort((a, b) => a.path.localeCompare(b.path));
  const csv = [COLUMNS.join(","), ...rows.map((row) => COLUMNS.map((c) => csvCell(row[c])).join(","))].join("\n");
  writeFileSync(join(args.out, "crawl.csv"), `${csv}\n`, "utf8");

  const count = (predicate: (row: Row) => boolean) => rows.filter(predicate).length;
  const html = rows.filter((r) => r.finalStatus === 200 && r.title !== "");
  const dupes = (key: (row: Row) => string) => {
    const groups = new Map<string, string[]>();
    for (const row of html) {
      // Adres po przekierowaniu pokazuje treść celu — to nie jest duplikat.
      if (row.hops > 0) continue;
      const value = key(row);
      if (!value) continue;
      groups.set(value, [...(groups.get(value) ?? []), row.path]);
    }
    return [...groups.entries()].filter(([, paths]) => paths.length > 1).sort((a, b) => b[1].length - a[1].length);
  };
  const indexable = html.filter((r) => !/noindex/i.test(`${r.metaRobots} ${r.xRobotsTag}`));
  const summary = {
    base: args.base,
    userAgent: args.userAgent,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    sitemapUrls: sitemapPaths.size,
    fetched: count((r) => typeof r.status === "number"),
    skipped: count((r) => typeof r.status === "string" && r.status.startsWith("SKIPPED")),
    errors: count((r) => r.status === "ERROR"),
    byFinalStatus: Object.fromEntries(
      [...new Set(rows.map((r) => String(r.finalStatus)))].sort().map((s) => [s, count((r) => String(r.finalStatus) === s)]),
    ),
    redirects: count((r) => r.hops > 0),
    redirectChains: count((r) => r.hops > 1),
    sitemapNot200: rows.filter((r) => r.inSitemap && r.status !== 200).map((r) => `${r.path} → ${r.status}`),
    sitemapNoindex: html.filter((r) => r.inSitemap && /noindex/i.test(r.metaRobots)).map((r) => r.path),
    indexableNotInSitemap: indexable.filter((r) => !r.inSitemap && r.hops === 0).map((r) => r.path),
    htmlPages: html.length,
    indexablePages: indexable.length,
    langNotPl: html.filter((r) => r.lang !== "pl").map((r) => r.path),
    titleMissing: count((r) => r.finalStatus === 200 && r.contentType.includes("text/html") && r.title === ""),
    titleNotInHead: html.filter((r) => r.titleInHead === false).length,
    multipleTitles: html.filter((r) => r.titleCount > 1).length,
    h1Missing: html.filter((r) => r.h1Count === 0).map((r) => r.path),
    h1Multiple: html.filter((r) => r.h1Count > 1).map((r) => r.path),
    canonicalMissing: indexable.filter((r) => r.canonicalCount === 0).map((r) => r.path),
    canonicalNotSelf: indexable.filter((r) => r.canonicalSelf === false).map((r) => `${r.path} → ${r.canonical}`),
    descriptionMissing: indexable.filter((r) => r.description === "").map((r) => r.path),
    titleOver60: indexable.filter((r) => r.titleLength > 60).length,
    descriptionOver160: indexable.filter((r) => r.descriptionLength > 160).length,
    jsonLdErrors: html.filter((r) => r.jsonLdErrors > 0).map((r) => r.path),
    duplicateTitles: dupes((r) => r.title).slice(0, 40).map(([value, paths]) => ({ value, count: paths.length, sample: paths.slice(0, 4) })),
    duplicateDescriptions: dupes((r) => r.description).slice(0, 40).map(([value, paths]) => ({ value, count: paths.length, sample: paths.slice(0, 4) })),
    duplicateH1: dupes((r) => r.h1).slice(0, 40).map(([value, paths]) => ({ value, count: paths.length, sample: paths.slice(0, 4) })),
    duplicateBodies: dupes((r) => r.textHash).slice(0, 40).map(([value, paths]) => ({ value, count: paths.length, sample: paths.slice(0, 4) })),
    thinUnder150Words: indexable.filter((r) => r.mainWords < 150).length,
    thinUnder300Words: indexable.filter((r) => r.mainWords < 300).length,
    brokenInternalLinks: rows
      .filter((r) => r.source.startsWith("link:") && (r.finalStatus === 404 || r.finalStatus === 410 || r.finalStatus === 500))
      .map((r) => `${r.path} (${r.finalStatus}) ← ${r.source.slice(5)}`),
    ogImageMissing: indexable.filter((r) => r.ogImage === "" && r.hops === 0).map((r) => r.path),
    twitterTitleNotPageSpecific: (() => {
      // Tytuł Twittera dziedziczony z layoutu: ten sam napis na wielu różnych stronach.
      const groups = new Map<string, number>();
      for (const row of indexable) if (row.twitterTitle) groups.set(row.twitterTitle, (groups.get(row.twitterTitle) ?? 0) + 1);
      return [...groups.entries()].filter(([, n]) => n > 3).map(([value, count]) => ({ value, count }));
    })(),
    slowOver3s: html.filter((r) => r.ms > 3000).length,
  };
  writeFileSync(join(args.out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...summary, duplicateTitles: summary.duplicateTitles.length, duplicateDescriptions: summary.duplicateDescriptions.length, duplicateH1: summary.duplicateH1.length, duplicateBodies: summary.duplicateBodies.length }, null, 2));
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seo/crawl.ts");
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
