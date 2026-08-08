/**
 * Zrzuty przy PRAWDZIWYM zoomie przeglądarki 100% (brief 2026-08-08, sekcja H).
 *
 * Nie jest to test — to narzędzie do oglądania. Uruchamiane ręcznie:
 *   npx tsx e2e/shots-100.ts
 * Serwer musi już działać na :3000.
 *
 * DLACZEGO OSOBNO OD `audit-shots.ts`. Tamten skrypt ustawia rozmiar okna
 * (`viewport`), co NIE jest zoomem: nie zmienia `devicePixelRatio`, więc nie
 * odwzorowuje tego, na co patrzy właściciel przy Ctrl+0. Tutaj zoom idzie przez
 * CDP, tak jak w testach — patrz e2e/_zoom.ts.
 *
 * Zrzuty lądują w docs/hotel-redesign/shots/pasek-kierunku/.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { ustawZoom } from "./_zoom";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const OUT = join(process.cwd(), "docs", "hotel-redesign", "shots", "pasek-kierunku");
const SZUKAJ =
  "/hotele/szukaj?destination=Heraklion&country=Grecja&checkin=2026-08-11&checkout=2026-08-18&adults=2&rooms=1";

async function odklikZgode(page: Page) {
  const btn = page.getByRole("button", { name: "Tylko niezbędne" });
  if (await btn.count()) {
    await btn.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function zrzut(page: Page, nazwa: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${nazwa}.png`) });
  process.stdout.write(`  zapisano ${nazwa}.png\n`);
}

async function przewin(page: Page, y: number) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(700);
}

async function przebieg(ekran: { width: number; height: number }, etykieta: string) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: ekran });
  const page = await ctx.newPage();
  await ustawZoom(page, ekran, 1); // realne 100%
  await page.goto(BASE + SZUKAJ, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-ht="destination-bar"]', { timeout: 60_000 });
  await page.waitForSelector('a[href^="/hotele/"]', { timeout: 60_000 });
  // Baner zgody montuje się PO pierwszym renderze wyników — klikany wcześniej
  // jeszcze nie istnieje i zostaje na zrzutach.
  await page.waitForTimeout(2500);
  await odklikZgode(page);
  await page.waitForTimeout(4000);

  process.stdout.write(`${etykieta} @ 100%\n`);
  await zrzut(page, `${etykieta}-lista-gora`);
  await przewin(page, 700);
  await zrzut(page, `${etykieta}-lista-scroll-700`);

  await przewin(page, 0);
  await page.getByRole("button", { name: "Mapa", exact: true }).click();
  await page.waitForTimeout(5000);
  await zrzut(page, `${etykieta}-mapa-gora`);
  await przewin(page, 700);
  await zrzut(page, `${etykieta}-mapa-scroll-700`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  await zrzut(page, `${etykieta}-mapa-dol`);

  await browser.close();
}

void (async () => {
  await przebieg({ width: 1920, height: 1080 }, "1920x1080");
  await przebieg({ width: 1440, height: 900 }, "1440x900");
})();
