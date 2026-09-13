import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import sitemap from "@/app/sitemap";
import { findCommercialCityBySlug } from "@/lib/mvp/commercial-cities";
import { getComparisonPairBySlug } from "@/lib/mvp/comparisons";
import { isMonthIndexable } from "@/lib/mvp/month-index-policy";
import { getMonthIndex, isPolishMonthSlug, seasonSlugs } from "@/lib/mvp/months";
import { getDestinationGuideBySlug, getEditorialArticleBySlug } from "@/lib/mvp/publisher-content";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

const APP_DIR = path.join(process.cwd(), "src", "app");

// Adresy, które audyt SEO Growth V1 (12.09.2026) zastał w sitemapie jako 404.
const KNOWN_404 = [
  "/tanie-podróże",
  "/inspiracje/najlepsze-kierunki-na-krótki-urlop",
  "/inspiracje/kierunki-z-plaża-i-zwiedzaniem",
  "/inspiracje/pomysły-na-city-break-w-europie",
  "/inspiracje/krótkie-wakacje-w-europie",
];

function sitemapPaths(): string[] {
  return sitemap().map((entry) => {
    const { origin } = new URL(entry.url);
    return entry.url.slice(origin.length) || "/";
  });
}

function hasPage(...segments: string[]): boolean {
  return existsSync(path.join(APP_DIR, ...segments, "page.tsx"));
}

/**
 * Powód, dla którego adres z sitemapy nie otworzy się jako indeksowalne 200,
 * albo null. Każda gałąź powtarza warunek, po którym szablon woła notFound()
 * albo ustawia noindex.
 */
function whyNotIndexable(route: string): string | null {
  const [head, second, third, ...rest] = route.split("/").filter(Boolean);
  if (rest.length > 0) return "za głęboka ścieżka";
  if (!head) return hasPage() ? null : "brak strony głównej";
  if (!second) return hasPage(head) ? null : "brak pliku strony";

  switch (head) {
    case "kierunki": {
      const guide = getDestinationGuideBySlug(second);
      if (!guide) return "nieznany kierunek";
      if (third === undefined) return null;
      if (!isPolishMonthSlug(third)) return "nieznany miesiąc";
      return isMonthIndexable(guide.destination, getMonthIndex(third)) ? null : "strona miesiąca ma noindex";
    }
    case "inspiracje":
      return !third && getEditorialArticleBySlug(second) ? null : "nieznany artykuł";
    case "porownanie": {
      const pair = third === undefined ? getComparisonPairBySlug(second) : undefined;
      if (!pair) return "nieznana para";
      return getDestinationGuideBySlug(pair.a) && getDestinationGuideBySlug(pair.b) ? null : "brak przewodnika w parze";
    }
    case "najlepsze-kierunki":
      return !third && (seasonSlugs as readonly string[]).includes(second) ? null : "nieznany sezon";
    case "wyjazdy":
      return !third && TRAVEL_MOODS.some((mood) => mood.slug === second) ? null : "nieznany typ wyjazdu";
    case "hotele":
      return second === "w" && third && findCommercialCityBySlug(third) ? null : "nieznane miasto";
    default:
      return "szablon nieobsługiwany przez test";
  }
}

describe("sitemap.xml (test H)", () => {
  const routes = sitemapPaths();

  it("zawiera strony serwisu", () => {
    assert.ok(routes.length > 100, `tylko ${routes.length} adresów`);
  });

  it("nie zawiera adresów, które audyt zastał jako 404", () => {
    for (const known of KNOWN_404) {
      assert.ok(!routes.includes(known), known);
      assert.ok(!routes.includes(encodeURI(known)), encodeURI(known));
    }
  });

  it("każdy adres jest ASCII, bez parametrów, fragmentów i prefiksu /en", () => {
    const invalid = routes.filter(
      (route) =>
        /[^\x21-\x7e]/.test(route) ||
        route.includes("%") ||
        route.includes("?") ||
        route.includes("#") ||
        route === "/en" ||
        route.startsWith("/en/"),
    );
    assert.deepEqual(invalid, []);
  });

  it("nie zawiera plików, które nie są stronami", () => {
    assert.deepEqual(
      routes.filter((route) => /\.[a-z0-9]+$/i.test(route)),
      [],
    );
  });

  it("adresy się nie powtarzają", () => {
    assert.equal(new Set(routes).size, routes.length);
  });

  it("każdy adres trafia w istniejącą, indeksowalną stronę", () => {
    const failures = routes
      .map((route) => ({ route, reason: whyNotIndexable(route) }))
      .filter((item) => item.reason !== null);
    assert.deepEqual(failures.slice(0, 20), []);
  });
});
