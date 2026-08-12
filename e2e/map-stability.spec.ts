/**
 * REGRESJA: mapa wyników nie ma prawa zostać pusta.
 *
 * Zgłoszenie właściciela (produkcja, 2026-08): po kilku przejściach
 * lista → mapa → hotel → Wstecz → mapa panel mapy bywał PUSTY — bez kafelków,
 * czasem bez samego canvasa.
 *
 * Forensyka na produkcyjnym buildzie (2026-08-11) pokazała, że cykl życia
 * MapLibre jest tu czysty: 50 kontekstów WebGL utworzonych, 50 zwolnionych,
 * zero osieroconych canvasów. Przyczyną był WARUNEK RENDERU w results-list.tsx
 * (`mapAvailable` liczone z aktualnie widocznych punktów), przez który przy
 * zerze punktów nie renderowała się ANI mapa, ANI lista — czyli pusty panel.
 *
 * Ten plik pilnuje obu warstw naraz:
 *   • niezmienników cyklu życia mapy (dokładnie jeden canvas, zero sierot),
 *   • gwarancji „nigdy pusty ekran" przy zerze punktów.
 */
import { test, expect, type Page } from "@playwright/test";

const SEARCH =
  "/hotele/szukaj?destination=Rhodes&country=Grecja&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";

interface Snapshot {
  canvases: number;
  mapContainers: number;
  containerW: number;
  containerH: number;
  canvasW: number;
  canvasH: number;
  bufferW: number;
  bufferH: number;
  detached: number;
}

function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const maps = [...document.querySelectorAll(".maplibregl-map")];
    const canvases = [...document.querySelectorAll("canvas.maplibregl-canvas")];
    const m = maps[0] as HTMLElement | undefined;
    const c = m ? (m.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement | null) : null;
    const mr = m ? m.getBoundingClientRect() : null;
    const cr = c ? c.getBoundingClientRect() : null;
    return {
      canvases: canvases.length,
      mapContainers: maps.length,
      containerW: mr ? Math.round(mr.width) : 0,
      containerH: mr ? Math.round(mr.height) : 0,
      canvasW: cr ? Math.round(cr.width) : 0,
      canvasH: cr ? Math.round(cr.height) : 0,
      bufferW: c ? c.width : 0,
      bufferH: c ? c.height : 0,
      detached: canvases.filter((x) => !x.isConnected).length,
    };
  });
}

async function dismissCookies(page: Page) {
  const btn = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function waitForScan(page: Page) {
  await expect(page.getByText(/Szukamy najlepszych ofert/)).toBeHidden({ timeout: 90_000 });
}

/** Otwarta mapa: dokładnie jedna instancja, canvas pokrywa kontener. */
function sprawdzOtwarta(s: Snapshot, gdzie: string) {
  expect(s.mapContainers, `${gdzie}: liczba instancji mapy`).toBe(1);
  expect(s.canvases, `${gdzie}: liczba canvasów`).toBe(1);
  expect(s.detached, `${gdzie}: osierocone canvasy`).toBe(0);
  expect(s.containerW, `${gdzie}: szerokość kontenera`).toBeGreaterThan(0);
  expect(s.containerH, `${gdzie}: wysokość kontenera`).toBeGreaterThan(0);
  expect(s.bufferW, `${gdzie}: szerokość bufora canvasa`).toBeGreaterThan(0);
  expect(s.bufferH, `${gdzie}: wysokość bufora canvasa`).toBeGreaterThan(0);
  // Canvas rozjechany z kontenerem to niepokryty pas mapy — biały prostokąt
  // ze zrzutu właściciela.
  expect(Math.abs(s.canvasW - s.containerW), `${gdzie}: rozjazd szerokości`).toBeLessThanOrEqual(2);
  expect(Math.abs(s.canvasH - s.containerH), `${gdzie}: rozjazd wysokości`).toBeLessThanOrEqual(2);
}

test.describe("stabilność mapy wyników", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });
  test.setTimeout(15 * 60_000);

  test("30 × lista↔mapa: za każdym razem dokładnie jedna żywa mapa", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);

    for (let i = 1; i <= 30; i++) {
      await page.getByRole("button", { name: "Mapa", exact: true }).click();
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(250);
      sprawdzOtwarta(await snapshot(page), `otwarcie #${i}`);

      await page.getByRole("button", { name: "Lista", exact: true }).click();
      await page.waitForTimeout(200);
      const po = await snapshot(page);
      expect(po.canvases, `zamknięcie #${i}: canvas po zamknięciu`).toBe(0);
      expect(po.mapContainers, `zamknięcie #${i}: instancja po zamknięciu`).toBe(0);
    }
  });

  test("20 × mapa → hotel → Wstecz: mapa wraca sprawna, bez samoczynnego przewijania", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);

    for (let i = 1; i <= 20; i++) {
      await page.getByRole("button", { name: "Mapa", exact: true }).click();
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500);

      await page.locator('a[href^="/hotele/"]').first().click();
      await page.waitForURL(/\/hotele\/[^/?]+\?/, { timeout: 40_000 });
      await page.waitForTimeout(500);

      const przedPowrotem = await page.evaluate(() => Math.round(window.scrollY));
      await page.goBack();
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(700);
      sprawdzOtwarta(await snapshot(page), `powrót #${i}`);

      // §7 briefu: „Wstecz" NIE MA prawa samo przewijać strony. Wcześniej
      // robił to efekt zależny od trybu widoku, który odpalał się także przy
      // ODTWORZENIU trybu mapy, a nie tylko po kliknięciu gościa.
      const poPowrocie = await page.evaluate(() => Math.round(window.scrollY));
      expect(
        Math.abs(poPowrocie - przedPowrotem),
        `powrót #${i}: strona przewinęła się sama o ${poPowrocie - przedPowrotem} px`,
      ).toBeLessThanOrEqual(80);

      await page.getByRole("button", { name: "Lista", exact: true }).click();
      await page.waitForTimeout(150);
    }
  });

  test("filtry wykluczające WSZYSTKO w trybie mapy nie dają pustego ekranu", async ({ page }) => {
    // To jest udowodniona przyczyna zgłoszenia „mapa czasem zostaje pusta":
    // przy zerze punktów blok mapy i blok listy miały niezależne warunki
    // i OBA renderowały `null`.
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });

    // Cena maksymalna 1 zł nie przepuści żadnego obiektu.
    const url = new URL(page.url());
    url.searchParams.set("maxPrice", "1");
    await page.goto(url.toString());
    await dismissCookies(page);
    await waitForScan(page);

    // Cokolwiek się stanie, gość MUSI widzieć albo mapę, albo listę
    // z komunikatem — nigdy pustki.
    const maMape = (await page.locator("canvas.maplibregl-canvas").count()) > 0;
    const maKomunikat = await page
      .getByText(/Filtry wykluczyły|Brak dostępnych hoteli|Nie udało się sprawdzić/)
      .first()
      .isVisible()
      .catch(() => false);
    expect(maMape || maKomunikat, "ani mapa, ani komunikat — pusty ekran").toBe(true);
  });
});
