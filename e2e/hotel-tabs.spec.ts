/**
 * Pasek zakładek na stronie hotelu — ma być STATYCZNY i jedyny.
 *
 * Decyzja właściciela: pasek istnieje w jednym miejscu w przepływie dokumentu
 * i naturalnie znika nad krawędzią okna. Wcześniej miał `sticky top-[72px]`,
 * więc razem ze sticky nagłówkiem serwisu jechały za treścią dwa paski.
 */
import { test, expect, type Page } from "@playwright/test";

const HOTEL =
  "/hotele/lp657c0fe8?destination=Hurghada&country=Egipt&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";

const TABS = '[data-ht="hotel-tabs"]';

async function przygotuj(page: Page) {
  await page.goto(HOTEL);
  const cookies = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await cookies.isVisible().catch(() => false)) await cookies.click();
  await expect(page.locator(TABS)).toBeVisible({ timeout: 30_000 });
}

for (const [nazwa, viewport] of [
  ["desktop 1920", { width: 1920, height: 1080 }],
  ["telefon 390", { width: 390, height: 844 }],
] as const) {
  test.describe(`Zakładki hotelu — ${nazwa}`, () => {
    test.use({ viewport });

    test("dokładnie JEDNA kopia w DOM", async ({ page }) => {
      await przygotuj(page);
      expect(await page.locator(TABS).count()).toBe(1);
    });

    test("position NIE jest sticky ani fixed", async ({ page }) => {
      await przygotuj(page);
      const pos = await page.locator(TABS).evaluate((el) => getComputedStyle(el).position);
      expect(pos, `pasek ma position: ${pos}`).not.toBe("sticky");
      expect(pos).not.toBe("fixed");
    });

    test("po przewinięciu pasek OPUSZCZA okno i nie wraca", async ({ page }) => {
      await przygotuj(page);
      const gora = (await page.locator(TABS).boundingBox())!.y;
      for (const y of [600, 1200, 2000]) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(250);
        const box = await page.locator(TABS).boundingBox();
        // Statyczny pasek jedzie razem z treścią, więc jego pozycja w oknie
        // MUSI maleć. Przyklejony stałby w miejscu przy każdej głębokości.
        expect(box!.y, `przy scrollu ${y} pasek stoi na ${box!.y}`).toBeLessThan(gora);
      }
    });

    test("każda zakładka ma ikonę i cel dotyku >= 44 px", async ({ page }) => {
      await przygotuj(page);
      const btns = page.locator(`${TABS} button`);
      const n = await btns.count();
      expect(n).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < n; i++) {
        expect(await btns.nth(i).locator("svg").count(), `zakładka ${i} bez ikony`).toBeGreaterThan(0);
        const box = await btns.nth(i).boundingBox();
        expect(box!.height, `zakładka ${i} ma ${box!.height} px wysokości`).toBeGreaterThanOrEqual(43.5);
      }
    });

    test("strona nie przewija się w poziomie", async ({ page }) => {
      await przygotuj(page);
      const o = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth,
        c: document.documentElement.clientWidth,
      }));
      expect(o.s).toBeLessThanOrEqual(o.c);
    });

    test("kliknięcie zakładki przewija do jej sekcji", async ({ page }) => {
      await przygotuj(page);
      const btn = page.locator(`${TABS} button`).nth(1);
      const etykieta = (await btn.textContent())?.trim() ?? "";
      await btn.click();
      await page.waitForTimeout(1200);
      expect(await page.evaluate(() => window.scrollY), `„${etykieta}" nie przewinęło strony`).toBeGreaterThan(200);
    });
  });
}
