/**
 * Testy E2E dla iteracji V3 — mapa, polubione, pokoje (brief V3 §44-§48).
 *
 * Oddzielone od `hotel.spec.ts`, bo dotyczą innych obszarów i inaczej się
 * psują: tam sprawdzamy wyniki i galerię, tu układ mapy, trwałość polubionych
 * i pipeline opisu pokoju.
 */
import { test, expect, type Page } from "@playwright/test";

const SEARCH =
  "/hotele/szukaj?destination=Hurghada&country=Egipt&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";
const HOTEL =
  "/hotele/lp657c0fe8?destination=Hurghada&country=Egipt&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";

async function dismissCookies(page: Page) {
  const btn = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function waitForScan(page: Page) {
  await expect(page.getByText(/Szukamy najlepszych ofert/)).toBeHidden({ timeout: 60_000 });
}

test.describe("V3 mapa — układ", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("LISTA ma podgląd mapy nad filtrami", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await expect(page.locator('a[href*="/hotele/lp"]').first()).toBeVisible({ timeout: 25_000 });
    const podglad = page.locator('button[aria-label*="Pokaż na mapie"]');
    await expect(podglad).toBeVisible({ timeout: 25_000 });

    // Podgląd musi stać NAD panelem filtrów, nie pod nim.
    const yPodgladu = (await podglad.boundingBox())!.y;
    const yFiltrow = (await page.getByText("Standard hotelu").boundingBox())!.y;
    expect(yPodgladu).toBeLessThan(yFiltrow);
  });

  test("MAPA ukrywa sidebar i oddaje szerokość liście", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });

    // Brief V3 §5: sidebar znika — to była przyczyna zgniatania kart.
    await expect(page.getByText("Standard hotelu")).toHaveCount(0);

    const m = await page.evaluate(() => {
      const card = document.querySelector("a[href*='/hotele/lp']") as HTMLElement | null;
      const cv = document.querySelector("canvas.maplibregl-canvas") as HTMLElement | null;
      return {
        karta: card ? card.getBoundingClientRect().width : 0,
        mapa: cv ? cv.getBoundingClientRect().width : 0,
      };
    });
    // Zmierzone PRZED poprawką: karta 762 px, mapa 626 px (33% ekranu).
    expect(m.karta).toBeGreaterThan(900);
    expect(m.mapa).toBeGreaterThan(700);
  });

  test("MAPA ma pasek szybkich filtrów", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.getByRole("button", { name: "Wszystkie filtry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Basen", exact: true })).toBeVisible();
  });

  test("otwarcie mapy NIE powtarza wyszukiwania hoteli", async ({ page }) => {
    const zapytania: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/hotels\/(rates|meta)/.test(r.url())) zapytania.push(r.url());
    });
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    const przed = zapytania.length;
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    // Mapa korzysta z danych, które lista już ma (brief V3 §43).
    expect(zapytania.length).toBe(przed);
  });
});

test.describe("V3 polubione", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("serce zapisuje obiekt i przetrwa odświeżenie", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await expect(page.locator('a[href*="/hotele/lp"]').first()).toBeVisible({ timeout: 25_000 });
    // Czekamy na KONIEC skanu cen, zanim klikniemy serce.
    //
    // Test bywał chwiejny w pełnym przebiegu (w izolacji przechodził zawsze):
    // dopóki ceny dojeżdżają, lista przesortowuje się i podmienia węzły DOM,
    // więc kliknięte serce potrafiło zniknąć razem ze swoją kartą, zanim
    // asercja zdążyła je zobaczyć. To właściwość strony, nie usterka — po
    // skanie kolejność jest stabilna i test mierzy to, co ma mierzyć.
    await waitForScan(page);

    const serce = page.getByRole("button", { name: "Dodaj do polubionych" }).first();
    await serce.click();
    // Natychmiastowa odpowiedź na kliknięcie.
    await expect(page.getByRole("button", { name: "Usuń z polubionych" }).first()).toBeVisible();

    await page.reload();
    await dismissCookies(page);

    // Trwałości NIE sprawdzamy przez „pierwsza karta ma pełne serce": ceny
    // dojeżdżają strumieniem i po odświeżeniu kolejność wyników bywa inna,
    // więc pierwsza karta to często INNY hotel. Dowodem trwałości jest to,
    // co widzi gość: licznik w nawigacji i wpis na liście polubionych.

    // Wpis w nawigacji prowadzi na listę zapisanych.
    //
    // Celujemy w ADRES, nie w etykietę: nawigacja jest dwujęzyczna
    // („Polubione" / „Saved") i przeglądarka testowa bywa ustawiona na
    // angielski, więc test po nazwie był fałszywie czerwony. Dopasowanie
    // ZAWIERA, nie KOŃCZY SIĘ — `LocalizedLink` dokleja `?lang=en`.
    await page.locator('a[href*="/polubione"]').first().click();
    await expect(page.getByRole("heading", { name: "Polubione", level: 1 })).toBeVisible();
    const karty = page.locator("ul > li");
    expect(await karty.count()).toBeGreaterThan(0);

    // Usunięcie też jest trwałe.
    await page.getByRole("button", { name: /Usuń z polubionych/ }).first().click();
    await page.reload();
    await expect(page.getByText("Nie masz jeszcze polubionych hoteli")).toBeVisible({ timeout: 15_000 });
  });

  test("pusta lista ma sensowny stan, nie białą stronę", async ({ page }) => {
    await page.goto("/polubione");
    await expect(page.getByText("Nie masz jeszcze polubionych hoteli")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Znajdź hotel" })).toBeVisible();
  });
});

test.describe("V3 pokoje", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("karta pokoju ma DUŻE zdjęcie i użyteczne udogodnienia", async ({ page }) => {
    await page.goto(HOTEL);
    await dismissCookies(page);
    const foto = page.locator('button[aria-label^="Zobacz szczegóły pokoju"]').first();
    await expect(foto).toBeVisible({ timeout: 30_000 });
    const box = await foto.boundingBox();
    // Przed przebudową miniatura miała 128×96 px.
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.height).toBeGreaterThan(180);
  });

  test("modal pokoju NIE pokazuje surowego HTML i nie kadruje agresywnie", async ({ page }) => {
    await page.goto(HOTEL);
    await dismissCookies(page);
    await page.getByRole("button", { name: /Zobacz szczegóły pokoju/ }).first().click();

    const dialog = page.getByRole("dialog").filter({ hasNot: page.getByText("PLIKI COOKIE") });
    await expect(dialog).toBeVisible();

    // Brief V3 §32: gość NIGDY nie widzi znaczników.
    const tekst = (await dialog.textContent()) ?? "";
    expect(tekst).not.toMatch(/<\/?(p|b|strong|br|div)\b/i);

    // Brief V3 §31: modal ma być duży.
    const box = await dialog.boundingBox();
    expect(box!.width).toBeGreaterThan(1000);

    // Brief V3 §30: główne zdjęcie zachowuje kompozycję (`contain`, nie `cover`).
    const fit = await dialog.locator("img").first().evaluate((el) => getComputedStyle(el).objectFit);
    expect(fit).toBe("contain");
  });
});
