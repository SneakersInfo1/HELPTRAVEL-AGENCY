/**
 * SEO GROWTH V1 — PR #1: fundament techniczny, sprawdzany na żywym wdrożeniu.
 *
 *   A — przeglądarka w en-US (jak renderer Google) dostaje lang="pl", zero linków /en i ?lang=
 *   B — ?lang= przekierowuje 301 na adres bez parametru
 *   C, F — tytuły bez kwot i bez roku w wyrenderowanym HTML
 *   E — JSON-LD przechodzi walidację; Offer tylko na stronie hotelu z realną ceną
 *   G — historyczne adresy: 301 na odpowiednik, który odpowiada 200
 *   H — sitemap: zero adresów 404, tylko ASCII, bez feed.xml
 *   J — dla UA Googlebota title, canonical i robots są w <head> także na stronach dynamicznych
 *
 * Uruchamiane na Preview, nie na produkcji:
 *
 *   E2E_BASE=https://<deploy>.vercel.app E2E_SHARE=<token _vercel_share> npx playwright test seo-foundation --reporter=list
 *
 * Preview stoi za Vercel SSO. Token `_vercel_share` ustawia ciasteczko przy
 * pierwszym wejściu i traci ważność po każdym deployu — trzeba pobrać nowy.
 */
import { test, expect, type Page } from "@playwright/test";

import { validateJsonLd } from "../src/lib/seo/jsonld-validate";

const SHARE = process.env.E2E_SHARE?.trim();

const GOOGLEBOT_SMARTPHONE =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.127 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// Szablony, które audyt zastał z błędami języka, tytułów lub JSON-LD.
const TEMPLATES = [
  "/",
  "/kierunki/malaga-spain",
  "/kierunki/malaga-spain/pazdziernik",
  "/kierunki/rome-italy/wrzesien",
  "/hotele/w/barcelona",
  "/inspiracje/europa-na-5-dni",
  "/porownanie/malaga-spain-vs-valencia-spain",
  "/najlepsze-kierunki/zima",
  "/tanie-podroze",
];

function warsawToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}

function isoPlusDays(days: number): string {
  const date = new Date(`${warsawToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Otwiera Preview z tokenem SSO, żeby kolejne zapytania kontekstu miały ciasteczko. */
async function authorize(page: Page) {
  if (SHARE) await page.goto(`/?_vercel_share=${encodeURIComponent(SHARE)}`, { waitUntil: "domcontentloaded" });
}

function pathOf(location: string | undefined): string {
  const url = new URL(location ?? "", "https://placeholder.invalid");
  return `${url.pathname}${url.search}`;
}

function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1]),
  );
}

test.describe("A — przeglądarka w en-US dostaje polski serwis", () => {
  test.use({ locale: "en-US", extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" } });

  for (const path of TEMPLATES) {
    test(`${path}: lang="pl", zero linków /en i ?lang=, bez błędu hydratacji`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await authorize(page);
      await page.goto(path, { waitUntil: "load" });
      // Hydratacja i efekty klienta — to one przełączały język po załadowaniu.
      await page.waitForTimeout(2500);

      const state = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        localeLinks: [...document.querySelectorAll("a[href]")]
          .map((anchor) => anchor.getAttribute("href") ?? "")
          .filter((href) => /^\/en(\/|$|\?)/.test(href) || /[?&]lang=/.test(href)),
      }));

      expect(state.lang, "A: <html lang> po hydratacji").toBe("pl");
      expect(state.localeLinks, "A: linki do wersji językowych").toEqual([]);
      expect(errors.filter((text) => /#418|hydrat/i.test(text)), "A: błędy hydratacji").toEqual([]);
    });
  }
});

test.describe("B — ?lang nie tworzy osobnego adresu", () => {
  test("/?lang=en → 301 na /", async ({ page }) => {
    await authorize(page);
    const response = await page.request.get("/?lang=en", { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(pathOf(response.headers().location)).toBe("/");
  });

  test("parametry kampanii zostają po usunięciu lang", async ({ page }) => {
    await authorize(page);
    const response = await page.request.get("/kierunki/malaga-spain?lang=en&utm_source=tiktok", { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(pathOf(response.headers().location)).toBe("/kierunki/malaga-spain?utm_source=tiktok");
  });
});

test.describe("G — historyczne adresy prowadzą na odpowiednik", () => {
  for (const [from, to] of [
    ["/porownanie/malaga-vs-valencia", "/porownanie/malaga-spain-vs-valencia-spain"],
    ["/tanie-podr%C3%B3%C5%BCe", "/tanie-podroze"],
  ] as const) {
    test(`${decodeURIComponent(from)} → 301 → ${to} (200)`, async ({ page }) => {
      await authorize(page);
      const redirect = await page.request.get(from, { maxRedirects: 0 });
      expect(redirect.status()).toBe(301);
      expect(pathOf(redirect.headers().location)).toBe(to);

      const target = await page.request.get(to, { maxRedirects: 0 });
      expect(target.status()).toBe(200);
    });
  }
});

test.describe("H — sitemap bez adresów 404", () => {
  test("każdy adres z sitemapy odpowiada 200, jest ASCII i jest stroną", async ({ page }) => {
    test.setTimeout(30 * 60_000);
    await authorize(page);

    const xml = await (await page.request.get("/sitemap.xml")).text();
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locations.length).toBeGreaterThan(100);
    expect(locations.filter((loc) => /[^\x21-\x7e]/.test(loc) || loc.endsWith(".xml"))).toEqual([]);

    // Host w <loc> to adres gałęzi Preview; sprawdzamy ścieżki na wdrożeniu z E2E_BASE.
    const paths = locations.map((loc) => new URL(loc).pathname);
    const failures: string[] = [];
    const queue = [...paths];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
          const response = await page.request.get(path, { maxRedirects: 0, timeout: 60_000 });
          if (response.status() !== 200) failures.push(`${response.status()} ${path}`);
        }
      }),
    );
    expect(failures, `adresy z sitemapy bez 200 (${paths.length} sprawdzonych)`).toEqual([]);
  });
});

test.describe("C, E, F — tytuły i JSON-LD w wyrenderowanym HTML", () => {
  const hotelPath = `/hotele/lp3723e?checkin=${isoPlusDays(30)}&checkout=${isoPlusDays(33)}&adults=2&rooms=1`;

  for (const path of [...TEMPLATES, hotelPath]) {
    test(`${path}: tytuł bez kwoty i roku, JSON-LD bez uwag`, async ({ page }) => {
      await authorize(page);
      const html = await (await page.request.get(path)).text();
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";

      expect(title, "C/F: brak <title>").not.toBe("");
      expect(title, "F: rok w tytule").not.toMatch(/\b20\d{2}\b/);
      expect(title, "C: kwota w tytule").not.toMatch(/\d\s*zł/);

      const blocks = jsonLdBlocks(html);
      expect(blocks.length, "E: brak JSON-LD").toBeGreaterThan(0);
      expect(blocks.flatMap((block) => validateJsonLd(block, { todayIso: warsawToday() })), "E: uwagi walidatora").toEqual([]);
      if (path !== hotelPath) {
        expect(JSON.stringify(blocks), "E: Offer bez realnej oferty").not.toContain('"Offer"');
      }
    });
  }
});

test.describe("J — metadane w <head> dla Googlebota", () => {
  const cases = [
    {
      path: `/hotele/lp3723e?checkin=${isoPlusDays(30)}&checkout=${isoPlusDays(33)}&adults=2&rooms=1`,
      canonical: true,
    },
    { path: "/kierunki/malaga-spain/pazdziernik", canonical: true },
    { path: "/hotele/szukaj?destination=Barcelona&country=Spain", canonical: false },
  ];

  for (const { path, canonical } of cases) {
    test(`${path}: title${canonical ? ", canonical" : ""} i robots przed </head>`, async ({ page }) => {
      await authorize(page);
      const response = await page.request.get(path, { headers: { "user-agent": GOOGLEBOT_SMARTPHONE } });
      expect(response.status()).toBe(200);

      const html = await response.text();
      const headEnd = html.indexOf("</head>");
      expect(headEnd, "J: brak </head>").toBeGreaterThan(0);
      const head = html.slice(0, headEnd);

      expect(head, "J: <title> poza <head>").toMatch(/<title>[^<]+<\/title>/);
      expect(head, "J: meta robots poza <head>").toMatch(/<meta name="robots"/);
      if (canonical) {
        expect(head, "J: canonical poza <head>").toMatch(/<link rel="canonical"/);
      } else {
        expect(head, "J: wyniki wyszukiwania mają noindex").toMatch(/<meta name="robots" content="noindex/);
      }
    });
  }
});
