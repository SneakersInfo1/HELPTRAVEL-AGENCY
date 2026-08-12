/**
 * REGRESJA: na listingu hoteli NIC nie goni przewijania.
 *
 * Decyzja produktowa właściciela (2026-08-12), ta sama zasada, którą dostały
 * już pasek kierunku i zakładki na stronie hotelu: panel boczny z filtrami,
 * mini-mapa nad nimi, sortowanie i kolumna mapy mają JEDNO miejsce
 * w normalnym przepływie dokumentu i mają naturalnie znikać nad krawędzią
 * okna.
 *
 * Przyklejone zostaje wyłącznie: nagłówek serwisu (poza zakresem) oraz
 * wnętrza nakładek pełnoekranowych (mobilny arkusz filtrów, mobilna mapa) —
 * te mają własny kontekst przewijania i nie gonią strony.
 */
import { test, expect, type Page } from "@playwright/test";

const SEARCH =
  "/hotele/szukaj?destination=Rhodes&country=Grecja&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";

async function dismissCookies(page: Page) {
  const btn = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function waitForScan(page: Page) {
  await expect(page.getByText(/Szukamy najlepszych ofert/)).toBeHidden({ timeout: 90_000 });
}

test.describe("listing bez przyklejania", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });
  test.setTimeout(5 * 60_000);

  test("panel filtrów i mini-mapa mają position static i odjeżdżają z przewijaniem", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);

    const aside = page.locator("aside").first();
    await expect(aside).toBeVisible();

    // Żaden przodek mini-mapy aż do <main> nie może być sticky ani fixed.
    const przyklejeni = await page.evaluate(() => {
      const mini = document.querySelector('aside img, aside [data-ht="mini-map"]') ?? document.querySelector("aside");
      const zle: string[] = [];
      let el: HTMLElement | null = mini as HTMLElement | null;
      while (el && el.tagName.toLowerCase() !== "main" && el !== document.body) {
        const pos = getComputedStyle(el).position;
        if (pos === "sticky" || pos === "fixed") {
          zle.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 80)} → ${pos}`);
        }
        el = el.parentElement;
      }
      return zle;
    });
    expect(przyklejeni, `przyklejone przodki panelu: ${przyklejeni.join(" | ")}`).toEqual([]);

    // I dowód zachowania, nie tylko deklaracji: po przewinięciu panel MUSI
    // odjechać razem ze stroną.
    const przed = await aside.boundingBox();
    await page.evaluate(() => window.scrollTo({ top: 1400, behavior: "auto" }));
    await page.waitForTimeout(400);
    const po = await aside.boundingBox();

    expect(przed, "panel filtrów zniknął przed pomiarem").not.toBeNull();
    expect(po, "panel filtrów zniknął po przewinięciu").not.toBeNull();
    // Przesunięcie w górę o mniej więcej tyle, ile wyniosło przewinięcie.
    const przesuniecie = przed!.y - po!.y;
    expect(przesuniecie, `panel przesunął się tylko o ${przesuniecie} px przy przewinięciu 1400`).toBeGreaterThan(1000);
  });

  test("kolumna mapy w trybie mapy też nie jest przyklejona", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });

    const przyklejeni = await page.evaluate(() => {
      const mapa = document.querySelector(".maplibregl-map");
      const zle: string[] = [];
      let el: HTMLElement | null = mapa as HTMLElement | null;
      while (el && el.tagName.toLowerCase() !== "main" && el !== document.body) {
        const pos = getComputedStyle(el).position;
        // `fixed` jest legalne WYŁĄCZNIE dla mobilnej mapy pełnoekranowej,
        // a ten test biegnie na 1920 px, gdzie renderuje się wariant desktop.
        if (pos === "sticky" || pos === "fixed") {
          zle.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 80)} → ${pos}`);
        }
        el = el.parentElement;
      }
      return zle;
    });
    expect(przyklejeni, `przyklejone przodki mapy: ${przyklejeni.join(" | ")}`).toEqual([]);
  });
});
