/**
 * Zrzuty referencyjne sekcji hotelowej (brief §31 — BEFORE/AFTER).
 *
 * Nie jest to test — to narzędzie do oglądania. Uruchamiane ręcznie:
 *   npx tsx e2e/capture.ts before
 *   npx tsx e2e/capture.ts after
 *
 * Zrzuty lądują w docs/hotel-redesign/shots/<etykieta>/.
 * Serwer musi już działać na :3000 (`pnpm dev` albo `pnpm start`).
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const LABEL = process.argv[2] ?? "before";
const OUT = join(process.cwd(), "docs", "hotel-redesign", "shots", LABEL);

const SEARCH =
  "/hotele/szukaj?destination=Hurghada&country=Egipt&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";
const HOTEL =
  "/hotele/lp657c0fe8?destination=Hurghada&country=Egipt&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";

/** Zdjęcia dojeżdżają leniwie — bez tego kadr łapie szare prostokąty. */
async function settle(page: Page, ms = 2500) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string, fullPage = false) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
  console.log(`  ✓ ${name}${fullPage ? " (cała strona)" : ""}`);
}

async function main() {
  const browser = await chromium.launch();

  // ── DESKTOP 1920 ────────────────────────────────────────────────────────
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const d = await desktop.newPage();

  console.log(`\n[${LABEL}] desktop 1920×1080`);
  await d.goto(BASE + SEARCH, { waitUntil: "domcontentloaded" });
  await settle(d, 1200);
  await shot(d, "01-wyniki-pierwsza-klatka");

  // Poczekaj aż skan się skończy (nagłówek przestaje pulsować) — max 30 s.
  await d
    .waitForFunction(() => !document.body.innerText.includes("Sprawdzam dostępność"), null, {
      timeout: 30_000,
    })
    .catch(() => console.log("  ! skan nie skończył się w 30 s"));
  await d.waitForTimeout(1500);
  await shot(d, "02-wyniki-po-skanie");

  // Pomiar wykorzystania szerokości — liczby, nie wrażenia.
  const metrics = await d.evaluate(() => {
    const grid = document.querySelector("main .grid") as HTMLElement | null;
    const card = document.querySelector('a[href*="/hotele/lp"]') as HTMLElement | null;
    const g = grid?.getBoundingClientRect();
    const c = card?.getBoundingClientRect();
    return {
      viewport: innerWidth,
      tresc: g ? Math.round(g.width) : null,
      pustkaLewa: g ? Math.round(g.left) : null,
      pustkaPrawa: g ? Math.round(innerWidth - g.right) : null,
      karta: c ? Math.round(c.width) : null,
      naglowek: document.querySelector("h1")?.textContent?.trim(),
      podtytul:
        (document.querySelector("h1")?.parentElement?.parentElement as HTMLElement | null)?.innerText
          ?.split("\n")
          .slice(0, 3)
          .join(" | ") ?? null,
    };
  });
  console.log("  pomiar:", JSON.stringify(metrics));

  console.log(`\n[${LABEL}] strona hotelu 1920×1080`);
  await d.goto(BASE + HOTEL, { waitUntil: "domcontentloaded" });
  await settle(d, 3000);
  await shot(d, "03-hotel-gora");
  await shot(d, "04-hotel-cala-strona", true);

  const rooms = d.locator("#rooms");
  if (await rooms.count()) {
    await rooms.scrollIntoViewIfNeeded();
    await d.waitForTimeout(1500);
    await shot(d, "05-hotel-pokoje");
  }

  const hotelMetrics = await d.evaluate(() => {
    const sec = document.querySelector("section.mx-auto") as HTMLElement | null;
    const r = sec?.getBoundingClientRect();
    const hero = document.querySelector('section img') as HTMLImageElement | null;
    return {
      viewport: innerWidth,
      tresc: r ? Math.round(r.width) : null,
      pustkaLewa: r ? Math.round(r.left) : null,
      heroCss: hero ? `${Math.round(hero.getBoundingClientRect().width)}×${Math.round(hero.getBoundingClientRect().height)}` : null,
      heroNatural: hero ? `${hero.naturalWidth}×${hero.naturalHeight}` : null,
      heroSrc: hero?.currentSrc?.slice(0, 160) ?? null,
      liczbaImg: document.querySelectorAll("img").length,
    };
  });
  console.log("  pomiar hotelu:", JSON.stringify(hotelMetrics, null, 1));

  await desktop.close();

  // ── MOBILE 390 ──────────────────────────────────────────────────────────
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const m = await mobile.newPage();

  console.log(`\n[${LABEL}] mobile 390×844`);
  await m.goto(BASE + SEARCH, { waitUntil: "domcontentloaded" });
  await settle(m, 2500);
  await shot(m, "10-mobile-wyniki");

  await m.goto(BASE + HOTEL, { waitUntil: "domcontentloaded" });
  await settle(m, 3000);
  await shot(m, "11-mobile-hotel");
  const mRooms = m.locator("#rooms");
  if (await mRooms.count()) {
    await mRooms.scrollIntoViewIfNeeded();
    await m.waitForTimeout(1200);
    await shot(m, "12-mobile-pokoje");
  }

  const overflow = await m.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  console.log("  overflow-x:", JSON.stringify(overflow), overflow.scrollW > overflow.clientW ? "← PRZEWIJANIE POZIOME" : "OK");

  await mobile.close();
  await browser.close();
  console.log(`\nZrzuty: ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
