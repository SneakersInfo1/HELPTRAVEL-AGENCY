/**
 * Zrzuty audytowe FINAL FIX (brief 2026-08-08).
 *
 * Nie jest to test — to narzędzie do OGLĄDANIA. Uruchamiane ręcznie:
 *   npx tsx e2e/audit-shots.ts przed
 *   npx tsx e2e/audit-shots.ts po
 *
 * Zrzuty lądują w docs/hotel-redesign/shots/audyt-<etykieta>/.
 * Serwer musi już działać na :3000.
 *
 * Poza zrzutami skrypt MIERZY to, czego na obrazku nie widać: poziomy
 * overflow, nakładanie się elementów, cele dotykowe poniżej 44 px oraz czasy
 * pojawienia się mapy. Liczby lądują w `pomiary.json` obok zrzutów.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const LABEL = process.argv[2] ?? "przed";
const OUT = join(process.cwd(), "docs", "hotel-redesign", "shots", `audyt-${LABEL}`);

const Q = "checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";
const SZUKAJ = `/hotele/szukaj?destination=Rhodes&country=Grecja&${Q}`;
const HOTEL = `/hotele/lp6558036a?destination=Rhodes&country=Grecja&${Q}`;

const WIDOKI = [
  { nazwa: "desktop-1920", width: 1920, height: 1080 },
  { nazwa: "laptop-1440", width: 1440, height: 900 },
  { nazwa: "tablet-768", width: 768, height: 1024 },
  { nazwa: "mobile-390", width: 390, height: 844 },
] as const;

const pomiary: Record<string, unknown> = {};

/**
 * Baner zgody zasłania pół ekranu na każdym świeżym kontekście przeglądarki,
 * więc bez tego zrzuty pokazują baner, a nie stronę. Wybieramy „Tylko
 * niezbędne" — najbardziej ograniczający wariant, więc zrzuty odpowiadają
 * gościowi, który NIE zgodził się na analitykę.
 */
async function odklikBanerZgody(page: Page) {
  const btn = page.getByRole("button", { name: "Tylko niezbędne" });
  if (await btn.count()) {
    await btn.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function shot(page: Page, name: string, fullPage = false) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
  console.log(`  ✓ ${name}${fullPage ? " (cała strona)" : ""}`);
}

/** Czekamy aż skan cen się skończy — inaczej łapiemy szkielety zamiast oferty. */
async function poSkanie(page: Page, ms = 25_000) {
  await page
    .waitForFunction(() => !document.body.innerText.includes("Szukamy najlepszych ofert"), null, { timeout: ms })
    .catch(() => console.log("  ! skan nie skończył się w czasie"));
  await page.waitForTimeout(1200);
}

/** Twarde pomiary układu — to, czego zrzut nie pokaże. */
async function zmierzUklad(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;

    // 1. Poziomy overflow — elementy wystające poza szerokość okna.
    const wystajace: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const st = getComputedStyle(el);
      if (st.position === "fixed") continue;
      if (r.right > vw + 1 || r.left < -1) {
        const opis = `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 3).join(".") : ""}`;
        if (!wystajace.includes(opis)) wystajace.push(opis);
      }
    }

    // 2. Cele dotykowe poniżej 44 px (WCAG 2.2 AA) — tylko widoczne.
    const zaMale: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("a, button, input, select, [role=button]"),
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      if (r.height < 44 || r.width < 44) {
        const txt = (el.textContent ?? "").trim().slice(0, 28);
        zaMale.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)} „${txt}"`);
      }
    }

    // 3. Nakładanie się elementów przyklejonych/pływających na treść.
    const plywajace = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
      const st = getComputedStyle(el);
      return st.position === "fixed" && el.getBoundingClientRect().height > 0;
    });
    const nakladki = plywajace.map((el) => {
      const r = el.getBoundingClientRect();
      const srodek = document.elementFromPoint(
        Math.min(vw - 2, Math.max(2, r.left + r.width / 2)),
        Math.min(window.innerHeight - 2, Math.max(2, r.top + r.height / 2)),
      );
      return {
        el: `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join(".")}`,
        box: `${Math.round(r.width)}×${Math.round(r.height)} @ ${Math.round(r.left)},${Math.round(r.top)}`,
        naWierzchu: srodek === el || el.contains(srodek),
      };
    });

    // 4. Szerokość karty wyniku i wykorzystanie ekranu.
    const karta = document.querySelector<HTMLElement>('a[href*="/hotele/lp"]');
    const kartaW = karta ? Math.round(karta.getBoundingClientRect().width) : null;

    return {
      vw,
      scrollW: doc.scrollWidth,
      poziomyOverflow: doc.scrollWidth > vw + 1,
      wystajace: wystajace.slice(0, 12),
      zaMaleCele: zaMale.slice(0, 15),
      zaMaleCeleRazem: zaMale.length,
      nakladki,
      kartaSzerokosc: kartaW,
    };
  });
}

async function stronaWyniki(browser: Browser, widok: (typeof WIDOKI)[number]) {
  const ctx = await browser.newContext({
    viewport: { width: widok.width, height: widok.height },
    isMobile: widok.width < 768,
    hasTouch: widok.width < 768,
  });
  const page = await ctx.newPage();
  console.log(`\n[${LABEL}] ${widok.nazwa}`);

  await page.goto(BASE + SZUKAJ, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await odklikBanerZgody(page);
  await page.waitForTimeout(400);
  await shot(page, `${widok.nazwa}-01-wyniki-pierwsza-klatka`);
  await poSkanie(page);
  await shot(page, `${widok.nazwa}-02-wyniki`);
  pomiary[`${widok.nazwa}/wyniki`] = await zmierzUklad(page);

  // Zachowanie paska przy scrollu — zrzut po przewinięciu o 900 px.
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(600);
  await shot(page, `${widok.nazwa}-03-wyniki-po-scrollu`);
  pomiary[`${widok.nazwa}/po-scrollu`] = await zmierzUklad(page);

  // Mapa — czas od kliknięcia do pierwszego znacznika.
  await page.evaluate(() => window.scrollTo(0, 0));
  const przyciskMapy = page.getByRole("button", { name: "Mapa", exact: true });
  if (await przyciskMapy.count()) {
    const t0 = Date.now();
    await przyciskMapy.first().click();
    let doPowloki: number | null = null;
    let doZnacznika: number | null = null;
    try {
      await page.waitForSelector(".maplibregl-map", { timeout: 20_000 });
      doPowloki = Date.now() - t0;
      await page.waitForSelector(".maplibregl-marker", { timeout: 20_000 });
      doZnacznika = Date.now() - t0;
    } catch {
      /* zapisujemy null */
    }
    await page.waitForTimeout(1800);
    await shot(page, `${widok.nazwa}-04-mapa`);
    pomiary[`${widok.nazwa}/mapa`] = {
      doPowlokiMs: doPowloki,
      doZnacznikaMs: doZnacznika,
      znaczniki: await page.locator(".maplibregl-marker").count(),
      uklad: await zmierzUklad(page),
    };

    // Klik w pojedynczy znacznik — czy karta się otwiera i czy nic nie ucieka.
    const pojedynczy = page.locator('.maplibregl-marker[data-kind="single"]').first();
    if (await pojedynczy.count()) {
      const przed = await pojedynczy.boundingBox();
      await pojedynczy.click({ timeout: 5000 }).catch(() => console.log("  ! nie udało się kliknąć znacznika"));
      await page.waitForTimeout(900);
      const po = await pojedynczy.boundingBox().catch(() => null);
      pomiary[`${widok.nazwa}/klik-znacznika`] = {
        przesuniecie:
          przed && po ? { dx: Math.round(po.x - przed.x), dy: Math.round(po.y - przed.y) } : "znacznik zniknął",
      };
      await shot(page, `${widok.nazwa}-05-mapa-po-kliku`);
    }
  } else {
    console.log("  ! brak przełącznika mapy");
  }

  // Filtry — na mobile przez FAB, na desktopie panel jest zawsze widoczny.
  if (widok.width < 1024) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const fab = page.getByRole("button", { name: /Filtry i sortowanie/ });
    if (await fab.count()) {
      await fab.first().click();
      await page.waitForTimeout(800);
      await shot(page, `${widok.nazwa}-06-filtry`);
      pomiary[`${widok.nazwa}/filtry`] = await zmierzUklad(page);
    }
  } else {
    await shot(page, `${widok.nazwa}-06-filtry`, true);
  }

  await ctx.close();
}

async function stronaHotelu(browser: Browser, widok: (typeof WIDOKI)[number]) {
  const ctx = await browser.newContext({
    viewport: { width: widok.width, height: widok.height },
    isMobile: widok.width < 768,
    hasTouch: widok.width < 768,
  });
  const page = await ctx.newPage();
  console.log(`\n[${LABEL}] ${widok.nazwa} — hotel`);
  const t0 = Date.now();
  await page.goto(BASE + HOTEL, { waitUntil: "domcontentloaded" });
  const ttfb = Date.now() - t0;
  await page.waitForTimeout(1500);
  await odklikBanerZgody(page);
  await page.waitForTimeout(1200);
  await shot(page, `${widok.nazwa}-10-hotel-gora`);
  pomiary[`${widok.nazwa}/hotel`] = { domMs: ttfb, uklad: await zmierzUklad(page) };

  const pokoje = page.locator("#rooms");
  if (await pokoje.count()) {
    await pokoje.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await shot(page, `${widok.nazwa}-11-pokoje`);
    pomiary[`${widok.nazwa}/pokoje`] = {
      grup: await page.locator('#rooms [data-testid="room-group"], #rooms > div').count(),
      brakDostepnosci: (await page.locator("#rooms").innerText()).includes("Brak dostępności"),
      uklad: await zmierzUklad(page),
    };
    const szczegoly = page.getByRole("button", { name: /Szczegóły pokoju|Zobacz szczegóły/ }).first();
    if (await szczegoly.count()) {
      await szczegoly.click().catch(() => {});
      await page.waitForTimeout(900);
      await shot(page, `${widok.nazwa}-12-modal-pokoju`);
      await page.keyboard.press("Escape");
    }
  }
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();
  for (const w of WIDOKI) {
    await stronaWyniki(browser, w);
    await stronaHotelu(browser, w);
  }
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "pomiary.json"), JSON.stringify(pomiary, null, 2), "utf8");
  console.log(`\nPomiary → ${join(OUT, "pomiary.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
