/**
 * Straż nad tym, czego przebudowa hoteli NIE MIAŁA ruszyć (brief §25).
 *
 * Powłoka serwisu (`site-shell.tsx`) jest wspólna dla całej strony, a sekcja
 * hotelowa dostała w niej wyjątek na szerokość. Ten plik pilnuje, żeby wyjątek
 * został wyjątkiem: homepage, loty, strony treściowe i checkout mają zachować
 * dotychczasowy kontener 1280 px.
 */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1920, height: 1080 } });

/**
 * Szerokość ramy serwisu (`site-shell.tsx`).
 *
 * Namierzana przez `#main-content`, a nie przez „pierwsze dziecko body":
 * przed ramą stoją jeszcze skrypty i link „przejdź do treści", więc pozycja
 * w drzewie nie jest stabilna.
 */
async function szerokoscRamy(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const rama = document.getElementById("main-content")?.parentElement;
    return rama ? Math.round(rama.getBoundingClientRect().width) : -1;
  });
}

test("homepage zostaje pełnoszerokościowa i się renderuje", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  // Home celowo nie ma kontenera (`max-w-none`) — sprawdzone od 2026-08-02.
  expect(await szerokoscRamy(page)).toBeGreaterThan(1800);
});

test("wyszukiwarka lotów działa i ZOSTAJE w kontenerze 1280", async ({ page }) => {
  await page.goto("/loty/wyniki?origin=WAW&destination=BCN&date=2026-09-15&adults=1");
  // Strona ma się wyrenderować bez błędu — treść zależy od dostawcy, więc
  // sprawdzamy powłokę, nie konkretne oferty.
  await expect(page.locator("body")).not.toContainText("Application error", { timeout: 25_000 });
  expect(await szerokoscRamy(page)).toBeLessThanOrEqual(1280);
});

test("strona treściowa hotelu (miasto) zostaje w kontenerze 1280", async ({ page }) => {
  await page.goto("/hotele/w/hurghada");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  // `/hotele/w/<miasto>` ma DWA segmenty po /hotele/, więc nie łapie się
  // w wyjątek szerokości — to jest ta granica, której pilnuje ten test.
  expect(await szerokoscRamy(page)).toBeLessThanOrEqual(1280);
});

test("checkout zostaje wąski i skupiony", async ({ page }) => {
  await page.goto("/hotele/rezerwacja");
  await expect(page.locator("body")).not.toContainText("Application error", { timeout: 20_000 });
  expect(await szerokoscRamy(page)).toBeLessThanOrEqual(1280);
});
