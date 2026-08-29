// Zrzuty + pomiary lejka lotów (PRZED/PO) — dowód do raportu Flights V2.
//
// Uruchomienie:
//   pnpm exec tsx e2e/flights-shots.ts before
//   pnpm exec tsx e2e/flights-shots.ts after
//
// Wymaga działającego `pnpm dev` na :3000. Skrypt NIE dotyka płatności ani
// prebooka — kończy na formularzu pasażerów (żadnych skutków u dostawcy).

import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const LABEL = process.argv[2] === "after" ? "after" : "before";
const OUT = join("docs", "flights-v2", "shots", LABEL);

const SEARCH =
  "/loty/wyniki?origin=WAW&originLabel=Warszawa&destination=BCN&destLabel=Barcelona" +
  "&depart=2026-09-20&return=2026-09-27&adults=2";

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 667 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-412", width: 412, height: 915 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
];

interface Measure {
  screen: string;
  viewport: string;
  vw: number;
  scrollWidth: number;
  overflow: boolean;
  mainX: number | null;
  mainW: number | null;
  gutterPct: number | null;
  cardW: number | null;
  cardH: number | null;
  docH: number;
  headerRadius: string | null;
  headerW: number | null;
  priceInFirstViewport: boolean;
  ctaInFirstViewport: boolean;
  bottomRightOwner: string | null;
}

// UWAGA: wewnątrz `page.evaluate` NIE deklaruj nazwanych funkcji ani
// `const f = () => …`. tsx/esbuild kompiluje je z `keepNames`, czyli owija
// wywołaniem `__name(...)`, którego w kontekście strony nie ma → cały evaluate
// wywala się na `ReferenceError: __name is not defined`. Wszystko musi być
// wyrażeniem albo anonimowym callbackiem przekazanym wprost do metody.
async function measure(page: Page, screen: string, viewport: string): Promise<Measure> {
  return page.evaluate(
    (arg: { screen: string; viewport: string }) => {
      const main = document.querySelector("main")?.getBoundingClientRect() ?? null;
      const header = document.querySelector("header");
      const headerRect = header?.getBoundingClientRect() ?? null;
      const card = document.querySelector("main article")?.getBoundingClientRect() ?? null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const all = Array.from(document.querySelectorAll("main *")) as HTMLElement[];
      const priceEl = all.find(
        (el) => el.children.length === 0 && /\d[\d\s]*(,\d{2})?\s*zł/.test(el.textContent ?? ""),
      );
      const ctaEl = all.find(
        (el) =>
          (el.tagName === "BUTTON" || el.tagName === "A") &&
          /Wybierz|Dalej|Przejdź do płatności|Zapłać/.test(el.textContent ?? ""),
      );
      const priceRect = priceEl?.getBoundingClientRect() ?? null;
      const ctaRect = ctaEl?.getBoundingClientRect() ?? null;

      const owner = document.elementFromPoint(vw - 40, vh - 40);
      const ownerLabel = owner
        ? owner.tagName.toLowerCase() + "|" + String(owner.className || "").split(" ").slice(0, 3).join(".")
        : null;

      return {
        screen: arg.screen,
        viewport: arg.viewport,
        vw,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > vw + 1,
        mainX: main ? Math.round(main.x) : null,
        mainW: main ? Math.round(main.width) : null,
        gutterPct: main ? Math.round(((vw - main.width) / vw) * 1000) / 10 : null,
        cardW: card ? Math.round(card.width) : null,
        cardH: card ? Math.round(card.height) : null,
        docH: document.documentElement.scrollHeight,
        headerRadius: header ? getComputedStyle(header).borderTopLeftRadius : null,
        headerW: headerRect ? Math.round(headerRect.width) : null,
        priceInFirstViewport: priceRect ? priceRect.top >= 0 && priceRect.top < vh : false,
        ctaInFirstViewport: ctaRect ? ctaRect.top >= 0 && ctaRect.top < vh : false,
        bottomRightOwner: ownerLabel,
      };
    },
    { screen, viewport },
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results: Measure[] = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "pl-PL",
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}${SEARCH}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main article", { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    results.push(await measure(page, "wyniki", vp.name));
    await page.screenshot({ path: join(OUT, `${vp.name}-01-wyniki.png`) });

    const picked = await page
      .evaluate(() => {
        const b = Array.from(document.querySelectorAll("main article button")).find(
          (x) => x.textContent?.trim() === "Wybierz",
        ) as HTMLButtonElement | undefined;
        if (!b) return false;
        b.click();
        return true;
      })
      .catch(() => false);

    if (picked) {
      await page.waitForURL(/\/loty\/dodatki/, { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      results.push(await measure(page, "dodatki", vp.name));
      await page.screenshot({ path: join(OUT, `${vp.name}-02-taryfa.png`) });

      // Pasażerowie: wchodzimy wprost (flow siedzi w sessionStorage), żeby nie
      // mnożyć wywołań verify u dostawcy.
      await page.goto(`${BASE}/loty/pasazerowie`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("main form", { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(1000);
      results.push(await measure(page, "pasazerowie", vp.name));
      await page.screenshot({ path: join(OUT, `${vp.name}-03-pasazerowie.png`) });
    }

    await ctx.close();
  }

  await browser.close();
  writeFileSync(join(OUT, "pomiary.json"), JSON.stringify(results, null, 2), "utf8");

  const head =
    "screen | viewport | vw | mainW | gutter% | cardW | cardH | docH | overflow | price@1st | cta@1st | hdr-radius";
  const rows = results.map(
    (r) =>
      `${r.screen} | ${r.viewport} | ${r.vw} | ${r.mainW} | ${r.gutterPct} | ${r.cardW} | ${r.cardH} | ${r.docH} | ${r.overflow} | ${r.priceInFirstViewport} | ${r.ctaInFirstViewport} | ${r.headerRadius}`,
  );
  console.log([head, ...rows].join("\n"));
  console.log(`\nZapisano: ${OUT}`);
}

void main();
