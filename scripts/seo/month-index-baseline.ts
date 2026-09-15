// Zamrożony zbiór indeksowalnych stron /kierunki/[slug]/[miesiac] (SEO Data Integrity, PR #1.5).
//
// Do cd2aaee (produkcja od 13.09.2026) o index/noindex strony miesiąca decydował
// predykat z temperaturą, która dla 212 z 235 kierunków pochodzi z tablicy regionu
// (audyt Faza 2.2). Przeliczenie indeksu na nowych zasadach zmieniłoby setki URL-i
// jednym deployem, więc zamiast tego zamrażamy dokładnie stan produkcji. Nowa
// polityka indeksu powstanie dopiero po danych klimatycznych i GSC.
//
// Tryby (uruchamiane z katalogu repo):
//   pnpm exec tsx scripts/seo/month-index-baseline.ts freeze --verify-sitemap https://helptravel.pl/sitemap.xml [--force]
//       liczy predykat produkcyjny (kopia 1:1 niżej) na obecnych profilach, porównuje z sitemapą
//       i zapisuje src/lib/mvp/month-index-baseline.ts; przy jakiejkolwiek różnicy przerywa
//   pnpm exec tsx scripts/seo/month-index-baseline.ts check-legacy
//       predykat produkcyjny vs zapisana baza (ważne, dopóki dane profili są jak w cd2aaee)
//   pnpm exec tsx scripts/seo/month-index-baseline.ts check-policy
//       obecne isMonthIndexable dla 235 × 12 stron vs zapisana baza
//   pnpm exec tsx scripts/seo/month-index-baseline.ts verify-sitemap <url> [--share <token _vercel_share>]
//       ścieżki miesięcy z sitemapy (produkcja albo Preview) vs zapisana baza
//
// Kod wyjścia 1 = różnica albo błąd.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { commercialCities } from "../../src/lib/mvp/commercial-cities";
import { getStoryBySlug } from "../../src/lib/mvp/destination-content";
import { getAllDestinationProfiles } from "../../src/lib/mvp/destinations";
import { polishMonthSlugs, type PolishMonthSlug } from "../../src/lib/mvp/months";
import type { DestinationProfile } from "../../src/lib/mvp/types";

const PREDICATE_COMMIT = "cd2aaee80dd34371ebaad7ff4abafaf3fb52cf57";
const BASELINE_FILE = path.join(process.cwd(), "src", "lib", "mvp", "month-index-baseline.ts");
const MONTH_PATH = new RegExp(`^/kierunki/([a-z0-9-]+)/(${polishMonthSlugs.join("|")})$`);

type Baseline = Record<string, PolishMonthSlug[]>;

const commercialDestIds = new Set(commercialCities.map((city) => city.destinationId));

/**
 * Kopia 1:1 `isMonthIndexable` z src/lib/mvp/month-index-policy.ts@cd2aaee
 * (`git show cd2aaee:src/lib/mvp/month-index-policy.ts`). Nie poprawiać —
 * to zapis tego, co decydowało na produkcji, a nie polityka do dalszego użycia.
 */
function productionMonthIndexable(dest: DestinationProfile, monthIndex: number): boolean {
  const temp = dest.avgTempByMonth[monthIndex];
  if (typeof temp !== "number") return false;

  const curated = Boolean(getStoryBySlug(dest.slug));
  const commercial = commercialDestIds.has(dest.slug);
  const beach = dest.beachScore >= 0.6;
  const strongCity = dest.cityScore >= 0.78;
  const isDecember = monthIndex === 11;

  if ((curated || commercial) && temp >= 10) return true;
  if (beach && temp >= 22) return true;
  if (strongCity && temp >= 16 && temp <= 32) return true;
  if (isDecember && strongCity) return true;
  return false;
}

function computeBaseline(decide: (dest: DestinationProfile, monthIndex: number) => boolean): Baseline {
  const bySlug = new Map<string, Set<PolishMonthSlug>>();
  for (const dest of getAllDestinationProfiles()) {
    polishMonthSlugs.forEach((month, monthIndex) => {
      if (!decide(dest, monthIndex)) return;
      const months = bySlug.get(dest.slug) ?? new Set<PolishMonthSlug>();
      months.add(month);
      bySlug.set(dest.slug, months);
    });
  }
  return Object.fromEntries(
    [...bySlug.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([slug, months]) => [slug, polishMonthSlugs.filter((month) => months.has(month))]),
  );
}

function toPaths(baseline: Readonly<Record<string, readonly string[]>>): string[] {
  return Object.entries(baseline)
    .flatMap(([slug, months]) => months.map((month) => `/kierunki/${slug}/${month}`))
    .sort();
}

function sha256(paths: string[]): string {
  return createHash("sha256").update(paths.join("\n"), "utf8").digest("hex");
}

function diff(expected: string[], actual: string[]) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((item) => !actualSet.has(item)),
    extra: actual.filter((item) => !expectedSet.has(item)),
  };
}

function report(label: string, expected: string[], actual: string[]): boolean {
  const { missing, extra } = diff(expected, actual);
  console.log(`${label}: oczekiwane ${expected.length}, sprawdzane ${actual.length}, brakujące ${missing.length}, nadmiarowe ${extra.length}`);
  for (const item of missing.slice(0, 20)) console.log(`  - brak: ${item}`);
  for (const item of extra.slice(0, 20)) console.log(`  + nadmiar: ${item}`);
  return missing.length === 0 && extra.length === 0 && expected.length === actual.length;
}

async function shareCookie(sitemapUrl: string, token: string | undefined): Promise<string | undefined> {
  if (!token) return undefined;
  const { origin } = new URL(sitemapUrl);
  const response = await fetch(`${origin}/?_vercel_share=${encodeURIComponent(token)}`, { redirect: "manual" });
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  if (cookies.length === 0) throw new Error(`token _vercel_share nie ustawił ciasteczka (status ${response.status})`);
  return cookies.join("; ");
}

async function sitemapMonthPaths(sitemapUrl: string, token?: string): Promise<string[]> {
  const cookie = await shareCookie(sitemapUrl, token);
  const response = await fetch(sitemapUrl, { redirect: "manual", headers: cookie ? { cookie } : undefined });
  if (response.status !== 200) throw new Error(`sitemap ${sitemapUrl}: status ${response.status}`);
  const xml = await response.text();
  const paths = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  if (paths.length < 100) throw new Error(`sitemap ${sitemapUrl}: tylko ${paths.length} adresów`);
  return paths.filter((pathname) => MONTH_PATH.test(pathname)).sort();
}

async function loadCommittedBaseline() {
  if (!existsSync(BASELINE_FILE)) throw new Error(`brak ${BASELINE_FILE} — najpierw tryb freeze`);
  const baselineModule = await import(pathToFileURL(BASELINE_FILE).href);
  return {
    baseline: baselineModule.CURRENT_INDEX_BASELINE as Readonly<Record<string, readonly string[]>>,
    meta: baselineModule.MONTH_INDEX_BASELINE_META as { count: number; sha256: string },
  };
}

function renderModule(baseline: Baseline, meta: Record<string, unknown>): string {
  const entries = Object.entries(baseline)
    .map(([slug, months]) => `  ${JSON.stringify(slug)}: [${months.map((month) => JSON.stringify(month)).join(", ")}],`)
    .join("\n");
  return `// WYGENEROWANE przez scripts/seo/month-index-baseline.ts (tryb freeze). Nie edytować ręcznie.
//
// Zamrożony zbiór indeksowalnych stron /kierunki/[slug]/[miesiac]: dokładnie te
// strony, które na produkcji (cd2aaee) miały index i stały w sitemapie. Do cd2aaee
// decydował o tym predykat z temperaturą, która dla 212 z 235 kierunków pochodzi
// z tablicy regionu. Od PR #1.5 temperatura nie steruje indeksem: strona jest
// indeksowalna wtedy i tylko wtedy, gdy stoi w tej bazie. Nowa polityka indeksu
// powstanie po danych klimatycznych i GSC — jako świadoma zmiana tej bazy.

import type { PolishMonthSlug } from "./months";

export const MONTH_INDEX_BASELINE_META = ${JSON.stringify(meta, null, 2)} as const;

export const CURRENT_INDEX_BASELINE: Readonly<Record<string, readonly PolishMonthSlug[]>> = {
${entries}
};
`;
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);

  if (mode === "freeze") {
    if (existsSync(BASELINE_FILE) && !args.includes("--force")) {
      throw new Error("baza już istnieje — zamrożenie jest jednorazowe (--force tylko świadomie)");
    }
    const baseline = computeBaseline(productionMonthIndexable);
    const paths = toPaths(baseline);
    const sitemapUrl = argValue(args, "--verify-sitemap");
    let verifiedAgainst: Record<string, unknown> | null = null;
    if (sitemapUrl) {
      const sitemapPaths = await sitemapMonthPaths(sitemapUrl, argValue(args, "--share"));
      if (!report(`predykat ${PREDICATE_COMMIT.slice(0, 7)} vs ${sitemapUrl}`, paths, sitemapPaths)) {
        throw new Error("predykat produkcyjny nie odtwarza sitemapy — baza NIE zapisana");
      }
      verifiedAgainst = {
        sitemap: sitemapUrl,
        sitemapMonthUrls: sitemapPaths.length,
        missingInSitemap: 0,
        extraInSitemap: 0,
        checkedAt: new Date().toISOString().slice(0, 10),
      };
    }
    const meta = {
      predicateCommit: PREDICATE_COMMIT,
      generatedAtCommit: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
      generator: "pnpm exec tsx scripts/seo/month-index-baseline.ts freeze",
      predicate: "isMonthIndexable z src/lib/mvp/month-index-policy.ts@cd2aaee: kuratorowane/komercyjne ≥ 10°C, plaża ≥ 22°C, city break 16–32°C, grudzień city break",
      verifiedAgainst,
      count: paths.length,
      sha256: sha256(paths),
    };
    writeFileSync(BASELINE_FILE, renderModule(baseline, meta), "utf8");
    console.log(`zapisano ${path.relative(process.cwd(), BASELINE_FILE)}: ${paths.length} stron, sha256 ${meta.sha256}`);
    return;
  }

  const { baseline, meta } = await loadCommittedBaseline();
  const committed = toPaths(baseline);
  let ok = committed.length === meta.count && sha256(committed) === meta.sha256;
  console.log(`zapisana baza: ${committed.length} stron, sha256 ${ok ? "zgodny" : "NIEZGODNY"} z META`);

  if (mode === "check-legacy") {
    ok = report("predykat produkcyjny vs baza", committed, toPaths(computeBaseline(productionMonthIndexable))) && ok;
  } else if (mode === "check-policy") {
    const { isMonthIndexable } = await import("../../src/lib/mvp/month-index-policy");
    ok = report("isMonthIndexable vs baza", committed, toPaths(computeBaseline(isMonthIndexable))) && ok;
  } else if (mode === "verify-sitemap") {
    const sitemapUrl = args.find((arg) => !arg.startsWith("--") && arg !== argValue(args, "--share"));
    if (!sitemapUrl) throw new Error("podaj adres sitemapy");
    ok = report(`${sitemapUrl} vs baza`, committed, await sitemapMonthPaths(sitemapUrl, argValue(args, "--share"))) && ok;
  } else {
    throw new Error(`nieznany tryb: ${mode ?? "(brak)"}`);
  }
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
