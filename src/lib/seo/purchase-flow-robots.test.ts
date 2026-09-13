import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

// Test K. Techniczne strony zakupu nie są stronami do wyszukiwarki:
//   - noindex w metadanych strony albo jej layoutu. Strona bez własnego
//     `robots` dziedziczy `index, follow` z src/app/layout.tsx — tak
//     /loty/pasazerowie i /loty/platnosc (komponenty klienckie bez metadanych)
//     zostały indeksowalne, gdy PR #1 zdjął canonical z layoutu;
//   - bez canonicala: kroków zakupu nie kanonikalizujemy do strony głównej;
//   - poza sitemapą;
//   - bez Disallow w robots.txt, bo zablokowanej strony Googlebot nie pobierze
//     i noindex nie zobaczy.

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

// Wszystkie strony ścieżki zakupu. Nowa trasa, która wygląda na krok zakupu,
// a nie ma jej tutaj, wywala pierwszy test.
const PURCHASE_FLOW_ROUTES = [
  "/hotele/rezerwacja",
  "/hotele/rezerwacja/return",
  "/loty/dodatki",
  "/loty/pasazerowie",
  "/loty/platnosc",
  "/loty/platnosc/return",
  "/loty/potwierdzenie/[bookingId]",
];

const PURCHASE_SEGMENT =
  /rezerwacj|platnos|płatnoś|pasazer|pasażer|dodatk|potwierdz|zamowien|zamówien|koszyk|checkout|payment|booking|return|callback|success|sukces|cancel|anulow|failure|niepowodz/i;

// Disallow sprzed PR #1 (src/app/robots.ts). Noindex tych stron jest dla
// Googlebota niewidoczny; zdjęcie blokady wymaga danych z GSC i nie należy do PR #1.
const DISALLOWED_BEFORE_PR1 = ["/hotele/rezerwacja", "/hotele/rezerwacja/return"];

interface AppRoute {
  route: string;
  dir: string;
}

/** Strony z src/app. Foldery prywatne (`_components`) nie są trasami, grupy `(x)` nie dodają segmentu. */
function listRoutes(dir = APP_DIR, segments: string[] = []): AppRoute[] {
  const routes: AppRoute[] = existsSync(path.join(dir, "page.tsx")) ? [{ route: `/${segments.join("/")}`, dir }] : [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry.startsWith("_") || (dir === APP_DIR && entry === "api") || !statSync(full).isDirectory()) continue;
    routes.push(...listRoutes(full, /^\(.+\)$/.test(entry) ? segments : [...segments, entry]));
  }
  return routes;
}

/**
 * Kod pliku bez komentarzy — komentarze w tych plikach wspominają „noindex" i „canonical".
 * Jedno przejście z napisami i komentarzami razem: `/en/*` w komentarzu
 * src/app/layout.tsx otwierałby „blok" aż do najbliższego `*\/` i zjadał `robots`.
 */
function codeOf(file: string): string {
  return readFileSync(file, "utf8").replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_match, literal: string | undefined) => literal ?? "",
  );
}

/** Pliki, z których Next składa metadane trasy, od najbliższego: strona, potem layouty w górę drzewa. */
function metadataFiles(dir: string): string[] {
  const files = [path.join(dir, "page.tsx")];
  for (let current = dir; ; current = path.dirname(current)) {
    files.push(path.join(current, "layout.tsx"));
    if (current === APP_DIR || current === path.dirname(current)) return files;
  }
}

/** Obowiązujące `robots`: najbliższa deklaracja zastępuje deklaracje z layoutów wyżej. */
function effectiveRobots(dir: string): string {
  for (const file of metadataFiles(dir)) {
    if (!existsSync(file)) continue;
    const value = codeOf(file).match(/\brobots:\s*("[^"]*"|\{[^}]*\})/)?.[1];
    if (value) return `${path.relative(ROOT, file)}: ${value.replace(/\s+/g, " ")}`;
  }
  return "brak robots";
}

function robotsTxtDisallow(): string[] {
  return [robots().rules]
    .flat()
    .filter((rule) => [rule.userAgent].flat().some((agent) => !agent || agent === "*" || /googlebot/i.test(agent)))
    .flatMap((rule) => [rule.disallow ?? []].flat());
}

describe("techniczne strony zakupu (test K)", () => {
  const routes = listRoutes();
  const dirOf = new Map(routes.map(({ route, dir }) => [route, dir]));

  it("lista stron zakupu obejmuje każdą trasę, która wygląda na krok zakupu", () => {
    const unlisted = routes
      .map(({ route }) => route)
      .filter((route) => PURCHASE_SEGMENT.test(route) && !PURCHASE_FLOW_ROUTES.includes(route));
    assert.deepEqual(unlisted, []);
    assert.deepEqual(
      PURCHASE_FLOW_ROUTES.filter((route) => !dirOf.has(route)),
      [],
    );
  });

  it("każda strona zakupu ma noindex w stronie albo w swoim layoucie", () => {
    const indexable = PURCHASE_FLOW_ROUTES.flatMap((route) => {
      const dir = dirOf.get(route);
      if (!dir) return [];
      const declared = effectiveRobots(dir);
      return /\bnoindex\b|\bindex:\s*false\b/.test(declared) ? [] : [`${route} ← ${declared}`];
    });
    assert.deepEqual(indexable, []);
  });

  it("strony zakupu nie mają canonicala", () => {
    const withCanonical = PURCHASE_FLOW_ROUTES.flatMap((route) => {
      const dir = dirOf.get(route);
      if (!dir) return [];
      return metadataFiles(dir)
        .filter((file) => existsSync(file) && /\bcanonical\s*:/.test(codeOf(file)))
        .map((file) => `${route} ← ${path.relative(ROOT, file)}`);
    });
    assert.deepEqual(withCanonical, []);
  });

  it("sitemap nie zawiera stron zakupu", () => {
    const prefixes = PURCHASE_FLOW_ROUTES.map((route) => route.replace(/\/\[[^\]]+\]$/, ""));
    const listed = sitemap()
      .map((entry) => new URL(entry.url).pathname)
      .filter((pathname) => prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)));
    assert.deepEqual(listed, []);
  });

  it("robots.txt nie blokuje stron zakupu, więc Googlebot widzi noindex", () => {
    const disallow = robotsTxtDisallow();
    // Dopasowanie niżej jest prefiksowe; reguła z * albo $ wymagałaby pełnej składni robots.txt.
    assert.deepEqual(
      disallow.filter((rule) => /[*$]/.test(rule)),
      [],
    );
    const isBlocked = (route: string) => disallow.some((rule) => route.startsWith(rule));

    assert.deepEqual(
      PURCHASE_FLOW_ROUTES.filter((route) => !DISALLOWED_BEFORE_PR1.includes(route) && isBlocked(route)),
      [],
    );
    // Wyjątek ma być aktualny: po zdjęciu blokady usuń trasę z DISALLOWED_BEFORE_PR1.
    assert.deepEqual(
      DISALLOWED_BEFORE_PR1.filter((route) => !isBlocked(route)),
      [],
    );
  });
});
