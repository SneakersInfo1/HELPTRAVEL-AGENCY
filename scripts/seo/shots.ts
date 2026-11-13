// Zrzuty stron treści w trzech szerokościach + dziennik konsoli i żądań.
//
//   pnpm seo:shots -- --base https://helptravel.pl --label before --out docs/seo/screenshots
//   pnpm seo:shots -- --base http://localhost:3000 --label after --paths /porownanie/a-vs-b,/wyjazdy/city-break
//
// Dla każdej strony i szerokości zapisuje kadr nad linią zgięcia oraz całą
// stronę (JPEG), a do `<label>-report.json` — błędy konsoli, przepełnienie
// poziome i żądania do endpointów, których strona treści nie ma prawa wołać
// przy samym wczytaniu (wyszukiwarka, rezerwacja, loty).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "tablet-768", width: 768, height: 1024, deviceScaleFactor: 1, isMobile: false, hasTouch: true },
  { name: "desktop-1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
] as const;

const DEFAULT_PATHS = [
  "/porownanie/athens-greece-vs-rome-italy",
  "/kierunki/barcelona-spain/styczen",
  "/wyjazdy/city-break",
];

/** Endpointy produktu, których samo wczytanie strony treści nie może dotykać. */
const FORBIDDEN_ON_LOAD = /\/api\/(hotels\/(search|rates)|flights|booking|liteapi|stays|trips)|liteapi\.travel|nuitee/i;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slugOf(path: string): string {
  return path.replace(/^\//, "").replace(/[/?=&]+/g, "_") || "home";
}

async function main() {
  const base = (arg("base") ?? "http://localhost:3000").replace(/\/$/, "");
  const label = arg("label") ?? "shot";
  const out = arg("out") ?? "docs/seo/screenshots";
  const paths = (arg("paths") ?? DEFAULT_PATHS.join(",")).split(",").map((p) => p.trim()).filter(Boolean);
  const fullPage = !process.argv.includes("--fold-only");
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  const report: Array<Record<string, unknown>> = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      locale: "pl-PL",
      reducedMotion: "reduce",
    });
    for (const path of paths) {
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      const forbidden: string[] = [];
      const failed: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
      });
      page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`));
      page.on("request", (request) => {
        if (FORBIDDEN_ON_LOAD.test(request.url())) forbidden.push(`${request.method()} ${request.url().slice(0, 160)}`);
      });
      page.on("requestfailed", (request) => failed.push(`${request.url().slice(0, 160)} — ${request.failure()?.errorText ?? ""}`));

      const response = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      // Baner zgody zasłania pierwszą klatkę i zmienia się niezależnie od szablonu.
      await page.addStyleTag({ content: '[data-cookie-banner],[aria-labelledby="cookie-consent-title"],[aria-label*="cookie" i],[aria-label*="zgod" i][role="dialog"]{display:none!important}' }).catch(() => undefined);
      await page.waitForTimeout(600);

      // Skrypt jako NAPIS: tsx/esbuild dokleja do funkcji pomocnik `__name`,
      // którego nie ma w kontekście strony (znana pułapka page.evaluate).
      const metrics = (await page.evaluate(`(() => {
        const doc = document.documentElement;
        const h1 = document.querySelector("h1");
        const firstCta = [...document.querySelectorAll("main a")].find((a) => /hotel|lot|szukaj|sprawd/i.test(a.textContent || ""));
        const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; };
        const smallTargets = [...document.querySelectorAll("main a, main button")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).length;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
          pageHeight: doc.scrollHeight,
          h1: h1 && h1.textContent ? h1.textContent.trim().slice(0, 120) : null,
          h1Rect: box(h1),
          firstCtaRect: box(firstCta),
          firstCtaText: firstCta && firstCta.textContent ? firstCta.textContent.trim().slice(0, 60) : null,
          smallTargets,
        };
      })()`)) as {
        scrollWidth: number;
        clientWidth: number;
        horizontalOverflow: boolean;
        pageHeight: number;
        h1: string | null;
        h1Rect: { top: number; height: number } | null;
        firstCtaRect: { top: number; height: number } | null;
        firstCtaText: string | null;
        smallTargets: number;
      };

      const name = `${label}__${slugOf(path)}__${viewport.name}`;
      await page.screenshot({ path: join(out, `${name}__fold.jpg`), type: "jpeg", quality: 72 });
      if (fullPage) await page.screenshot({ path: join(out, `${name}__full.jpg`), type: "jpeg", quality: 60, fullPage: true });
      report.push({
        path,
        viewport: viewport.name,
        status: response?.status() ?? null,
        ...metrics,
        firstCtaAboveFold: metrics.firstCtaRect ? metrics.firstCtaRect.top < viewport.height : false,
        consoleErrors,
        forbiddenRequestsOnLoad: forbidden,
        failedRequests: failed.slice(0, 10),
      });
      console.log(`✓ ${name}  h=${metrics.pageHeight}px overflow=${metrics.horizontalOverflow} errors=${consoleErrors.length} forbidden=${forbidden.length}`);
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  writeFileSync(join(out, `${label}-report.json`), `${JSON.stringify({ base, label, capturedAt: new Date().toISOString(), pages: report }, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
