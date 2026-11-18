// Zrzuty pojedynczych sekcji strony (po id) w szerokości telefonu.
//
//   pnpm exec tsx scripts/seo/element-shots.ts --base http://localhost:3000 --path wyjazdy/city-break --ids w-liczbach,porownaj --out seo-private/screenshots/elements
//
// Baner zgody jest ukrywany, bo zasłania sekcje i nie należy do ocenianego szablonu.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const base = arg("base", "http://localhost:3000").replace(/\/$/, "");
  const rawPath = arg("path", "/");
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const ids = arg("ids", "").split(",").filter(Boolean);
  const out = arg("out", "seo-private/screenshots/elements");
  const width = Number(arg("width", "390"));
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: width < 768, hasTouch: width < 768, locale: "pl-PL" });
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await page.addStyleTag({ content: '[aria-labelledby="cookie-consent-title"]{display:none!important}' });
  for (const id of ids) {
    const section = page.locator(`[id="${id}"]`).locator("xpath=ancestor-or-self::section[1]");
    const file = join(out, `${path.replace(/^\//, "").replace(/\//g, "_")}__${id}__${width}.png`);
    await section.screenshot({ path: file });
    console.log(`✓ ${file}`);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
