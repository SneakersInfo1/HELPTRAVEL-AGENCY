/**
 * Testy E2E dla naprawy FINAL FIX (brief 2026-08-08).
 *
 * Każdy test pilnuje JEDNEJ udowodnionej przyczyny, nie ogólnego wrażenia:
 *   • znacznik mapy nie może uciekać spod kursora po kliknięciu,
 *   • podgląd mapy nad filtrami musi zwracać obraz (zwracał 502),
 *   • hotel z listy musi mieć pokoje na swojej stronie (oferty widmo),
 *   • paczka mapy nie może pobierać się przed pierwszymi wynikami.
 *
 * Osobny plik od `v3.spec.ts`, bo te testy psują się z innych powodów: tam
 * chodzi o układ, tu o zgodność danych i o stabilność interakcji.
 */
import { test, expect, type Page } from "@playwright/test";

const SEARCH =
  "/hotele/szukaj?destination=Rhodes&country=Grecja&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";

async function dismissCookies(page: Page) {
  const btn = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function waitForScan(page: Page) {
  await expect(page.getByText(/Szukamy najlepszych ofert/)).toBeHidden({ timeout: 60_000 });
}

/** Czeka, aż liczba i pozycje znaczników przestaną się zmieniać (2 pomiary z rzędu). */
async function ustabilizujZnaczniki(page: Page, cisza = 1200) {
  let poprzedni = "";
  for (let proba = 0; proba < 20; proba++) {
    const teraz = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".maplibregl-marker")]
        .map((m) => `${m.style.transform}|${m.dataset.kind}`)
        .join(";"),
    );
    if (teraz && teraz === poprzedni) return;
    poprzedni = teraz;
    await page.waitForTimeout(cisza);
  }
}

test.describe("FINAL FIX — mapa", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("podgląd mapy nad filtrami zwraca OBRAZ, nie błąd", async ({ request }) => {
    // Trasa zwracała 502 na KAŻDYM wyszukiwaniu: `URLSearchParams` kodowało
    // ponownie `%23` w kolorze znacznika, więc Geoapify odrzucał zapytanie.
    // Gość widział szary prostokąt i miał prawo uznać sekcję za niedokończoną.
    const res = await request.get("/api/map/static?lat=36.2&lng=28.0&w=600&h=352&zoom=11");
    expect(res.status(), "podgląd mapy musi zwracać obraz").toBe(200);
    expect(res.headers()["content-type"] ?? "").toMatch(/^image\//);
  });

  test("znacznik NIE ucieka spod kursora po kliknięciu", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });

    const znacznik = page.locator('.maplibregl-marker[data-kind="single"]').first();
    await expect(znacznik).toBeVisible({ timeout: 20_000 });
    // Czekamy, aż warstwa znaczników przestanie się zmieniać.
    //
    // Pula kierunku dociąga się w tle stronami metadanych, więc dopóki rosną
    // WYNIKI, komórki grupujące mogą się legalnie przegrupować (pojedynczy
    // obiekt staje się paczką). Test nie ma tego mierzyć — ma mierzyć to, na co
    // skarżył się właściciel: że znacznik ucieka spod kursora W REAKCJI NA
    // KLIKNIĘCIE, na mapie, która stoi.
    await ustabilizujZnaczniki(page);
    const przed = await znacznik.boundingBox();
    await znacznik.click();
    await page.waitForTimeout(900);
    const po = await znacznik.boundingBox();

    expect(przed, "znacznik zniknął przed pomiarem").not.toBeNull();
    expect(po, "znacznik zniknął po kliknięciu — nie da się go trafić drugi raz").not.toBeNull();
    // Zmierzone PRZED naprawą: 46×43 px na desktopie, 44×−263 px na tablecie.
    // Powód: reprezentant komórki grupującej brał się z KOLEJNOŚCI punktów,
    // a ta zmienia się przy każdej dochodzącej cenie.
    expect(Math.abs(po!.x - przed!.x), "znacznik przesunął się w poziomie").toBeLessThanOrEqual(2);
    expect(Math.abs(po!.y - przed!.y), "znacznik przesunął się w pionie").toBeLessThanOrEqual(2);
  });

  test("klik w znacznik otwiera podgląd obiektu z ceną i CTA", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    const znacznik = page.locator('.maplibregl-marker[data-kind="single"]').first();
    await expect(znacznik).toBeVisible({ timeout: 20_000 });
    await ustabilizujZnaczniki(page);
    await znacznik.click();
    await expect(page.getByRole("button", { name: "Zamknij podgląd obiektu" })).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("FINAL FIX — dostępność ofert", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("hotel pokazany na liście MA pokoje na swojej stronie", async ({ page }) => {
    // OFERTY WIDMO. Strona hotelu pytała o stawki z `roomMapping: true`, co
    // u dostawcy działa jak FILTR — zwraca tylko taryfy dające się powiązać
    // z wpisem w `rooms[]`. Zmierzone na żywym API: 3/40 hoteli traciło CAŁĄ
    // dostępność, a łącznie znikało 4462 z 5031 taryf. Lista pokazywała cenę,
    // a strona obiektu „Brak dostępności".
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);

    const karta = page.locator('a[href*="/hotele/lp"]').first();
    await expect(karta).toBeVisible({ timeout: 25_000 });
    // Karta z listy ma cenę tylko wtedy, gdy dostawca potwierdził dostępność.
    await expect(karta.getByText(/zł/).first()).toBeVisible();
    const href = await karta.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    const sekcja = page.locator("#rooms");
    await expect(sekcja).toBeVisible({ timeout: 30_000 });
    await expect(
      sekcja.getByText(/nie ma wolnych pokoi/i),
      "lista obiecała cenę, a strona obiektu nie ma ani jednego pokoju",
    ).toHaveCount(0);
    await expect(sekcja.getByText(/Warianty cenowe|Wybierz/).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("FINAL FIX — górne paski", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  // PRZEPISANE 2026-08-08 po decyzji właściciela. Poprzednia wersja tego testu
  // utrwalała design, który został ODRZUCONY: wymagała, żeby pasek kierunku
  // miał TEN SAM promień co nagłówek („jeden system wizualny") i szukała go
  // przez selektor `main > div.sticky > div`, czyli wymagała też, żeby był
  // przyklejony. Właściciel odrzucił oba założenia wprost: „nie chcę dwóch
  // podobnych zaokrąglonych kart" i „ten element nie ma być sticky".
  //
  // Teraz test pilnuje NOWEGO wymagania: nagłówek zostaje pływającą pastylką,
  // pasek kierunku jest prostokątny (promień 0–8 px), a spójność ma wynikać
  // z kolorów, typografii i ikon — nie z jednakowego kształtu.
  test("nagłówek i pasek kierunku to DWA różne kształty, nie dwie pastylki", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await expect(page.locator('a[href*="/hotele/lp"]').first()).toBeVisible({ timeout: 25_000 });

    const geometria = await page.evaluate(() => {
      const header = document.querySelector("header") as HTMLElement;
      const pasek = document.querySelector('[data-ht="destination-bar"]') as HTMLElement;
      const wnetrze = pasek.firstElementChild as HTMLElement;
      const promien = (el: HTMLElement) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      return {
        promienNaglowka: promien(header),
        promienPaska: Math.max(promien(pasek), promien(wnetrze)),
        pozycjaPaska: getComputedStyle(pasek).position,
      };
    });

    // Pasek jest prostokątny — górna granica z briefu to 8 px.
    expect(
      geometria.promienPaska,
      `pasek kierunku ma promień ${geometria.promienPaska} px — miał być prostokątny (0–8 px)`,
    ).toBeLessThanOrEqual(8);
    // Nagłówek zostaje pastylką, więc kształty MUSZĄ się różnić.
    expect(
      geometria.promienNaglowka,
      "nagłówek przestał być pływającą pastylką — to nie było w zakresie zmiany",
    ).toBeGreaterThan(8);
    // I pasek nadal nie może być przyklejony.
    expect(["static", "relative"], "pasek kierunku znowu jest przyklejony").toContain(geometria.pozycjaPaska);
  });

  test("filtry mają ikony, nie same etykiety", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await expect(page.getByRole("heading", { name: "Sortuj" })).toBeVisible({ timeout: 25_000 });
    const ikony = await page.locator("aside h3 svg").count();
    expect(ikony, "sekcje filtrów renderują się bez ikon").toBeGreaterThanOrEqual(6);
  });
});

test.describe("FINAL FIX — telefon", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("podgląd obiektu na mapie NIE zmienia rozmiaru mapy", async ({ page }) => {
    // Karta była SĄSIADEM mapy w kolumnie, więc jej pojawienie się odbierało
    // mapie wysokość i cały obraz przeskakiwał (zmierzone: 263 px).
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    const canvas = page.locator("canvas.maplibregl-canvas");
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    const przed = await canvas.boundingBox();

    const znacznik = page.locator('.maplibregl-marker[data-kind="single"]').first();
    await expect(znacznik).toBeVisible({ timeout: 20_000 });
    await ustabilizujZnaczniki(page);
    await znacznik.click();
    await page.waitForTimeout(700);
    const po = await canvas.boundingBox();

    expect(Math.abs(po!.height - przed!.height), "mapa zmieniła wysokość po wyborze obiektu").toBeLessThanOrEqual(2);
  });

  test("ostatnia karta wyników nie chowa się pod pływającym przyciskiem filtrów", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);

    const zasloniete = await page.evaluate(() => {
      const fab = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Filtry i sortowanie"),
      );
      if (!fab) return false;
      const f = fab.getBoundingClientRect();
      const karty = [...document.querySelectorAll('a[href*="/hotele/lp"]')];
      const ostatnia = karty[karty.length - 1]?.getBoundingClientRect();
      if (!ostatnia) return false;
      return ostatnia.bottom > f.top && ostatnia.top < f.bottom;
    });
    expect(zasloniete, "pływający przycisk filtrów zasłania ostatnią kartę i nie da się jej odsłonić").toBe(false);
  });
});
