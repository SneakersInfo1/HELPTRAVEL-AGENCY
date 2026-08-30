// E2E: stany błędu i zmiana ceny w lejku lotów.
//
// Wszystko tutaj działa na PRZECHWYCONYCH odpowiedziach naszego własnego API
// (`page.route`). Dostawca nie jest dotykany, więc testy są deterministyczne
// i — co najważniejsze — nie tworzą żadnych prebooków ani płatności (§43).
//
// Wyjątkiem jest samo wyszukiwanie, które musi być prawdziwe, żeby mieć realną
// ofertę do wybrania; jest read-only.

import { expect, test, type Page } from "@playwright/test";

import { zablokujZapisyLotow } from "./_bezpiecznik-lotow";

// Serwis jest polski i `LanguageProvider` czyta jezyk przegladarki. Playwright
// startuje domyslnie z `en-US`, wiec provider przelaczal UI na angielski JUZ PO
// hydracji — serwer renderowal `/kierunki`, klient `/en/kierunki` i React
// zglaszal „Hydration failed", po czym odtwarzal drzewo od nowa. Skutek dla
// testow byl taki, ze lista wynikow potrafila zostac na szkielecie mimo
// odpowiedzi 200 z `/api/flights/rates` w 300 ms.
//
// `pl-PL` to jednoczesnie realny warunek uzytkownika tego serwisu (>90 % ruchu
// z Polski), wiec test staje sie BLIZSZY produkcji, a nie dalszy.
test.use({ locale: "pl-PL" });

// BEZPIECZNIK: niezamockowany zapis w lejku lotów (prebook / book / finalizacja
// po powrocie z płatności) wywala test, zamiast utworzyć prawdziwy lock taryfy
// na produkcyjnym kluczu. Testy, które mockują te trasy same, rejestrują swoje
// przechwycenie PÓŹNIEJ, więc mają pierwszeństwo.
test.beforeEach(async ({ page }) => {
  await zablokujZapisyLotow(page);
});

const SEARCH =
  "/loty/wyniki?origin=WAW&originLabel=Warszawa&destination=BCN&destLabel=Barcelona" +
  "&depart=2026-09-20&return=2026-09-27&adults=2";

/**
 * Rozstrzyga baner zgód, wybierając „Tylko niezbędne".
 *
 * DLACZEGO TO JEST W KAŻDYM TEŚCIE: baner stoi `fixed bottom-2 z-40`, więc
 * dopóki wisi, PRZECHWYTUJE kliknięcia w dolnej części ekranu — Playwright
 * odmawia wtedy kliknięcia w „Wybierz" i w sticky pasek, i ma rację, bo realny
 * palec też trafiłby w baner. To samo zgłoszenie doprowadziło do tego, że
 * `FlightStickyCta` w ogóle się nie renderuje, dopóki zgoda nie jest podjęta.
 *
 * Wybieramy opcję najbardziej ochronną dla prywatności — nie „Akceptuję
 * wszystkie" — więc testy chodzą po ścieżce BEZ analityki, czyli tej samej,
 * którą dostaje użytkownik odmawiający zgody.
 */
async function zamknijZgody(page: Page) {
  const tylkoNiezbedne = page.getByRole("button", { name: "Tylko niezbędne" });
  if (await tylkoNiezbedne.isVisible().catch(() => false)) {
    await tylkoNiezbedne.click();
    await expect(tylkoNiezbedne).toBeHidden();
  }
}

async function otworzWyniki(page: Page) {
  await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 90_000 });
  await zamknijZgody(page);
}

/** Doprowadza do formularza pasażerów i wypełnia go poprawnymi danymi. */
async function doFormularzaZDanymi(page: Page) {
  await otworzWyniki(page);
  await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
  await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
  // Wprost na formularz — bez klikania "Dalej", żeby nie wołać verify u dostawcy.
  await page.goto("/loty/pasazerowie", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main form")).toBeVisible({ timeout: 30_000 });

  const fieldsety = await page.locator("main fieldset").count();
  const paxy = Math.max(0, fieldsety - 1); // ostatni fieldset to dane kontaktowe
  for (let i = 0; i < paxy; i++) {
    await page.fill(`#p${i}-first`, i === 0 ? "Jan" : "Anna");
    await page.fill(`#p${i}-last`, "Kowalski");
    await page.fill(`#p${i}-bday`, "1990-05-04");
    await page.selectOption(`#p${i}-gender`, i === 0 ? "M" : "F");
    await page.fill(`#p${i}-docnum`, `AB123456${i}`);
    await page.fill(`#p${i}-docexp`, "2031-01-01");
  }
  await page.fill("#c-first", "Jan");
  await page.fill("#c-last", "Kowalski");
  await page.fill("#c-email", "jan@example.com");
  await page.fill("#c-phone", "500600700");
  await page.getByRole("checkbox").last().check();
}

async function klikDoPlatnosci(page: Page) {
  await page.getByRole("button", { name: /Przejdz do platnosci|Przejdź do płatności|Do płatności/ }).first().click();
}

test.describe("Zmiana ceny przy prebooku", () => {
  test("wzrost ceny: modal z obiema kwotami; odmowa nie tworzy platnosci", async ({ page }) => {
    let prebookCalls = 0;
    await page.route("**/api/flights/prebook", async (route) => {
      prebookCalls += 1;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "PRICE_CHANGED",
          acceptedTotal: 2727,
          lockedTotal: 2900,
          currency: "PLN",
        }),
      });
    });

    await doFormularzaZDanymi(page);
    await klikDoPlatnosci(page);

    const modal = page.getByRole("alertdialog");
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(modal).toContainText("wzros");
    await expect(modal).toContainText("2");
    await expect(modal).toContainText("727");
    await expect(modal).toContainText("900");

    // Domyslny fokus NIE moze stac na akceptacji wyzszej ceny.
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(focused).toMatch(/wr/i);

    await modal.getByRole("button", { name: /wr/i }).click();
    await expect(modal).toBeHidden();
    await expect(page).toHaveURL(/\/loty\/pasazerowie/);
    expect(prebookCalls).toBe(1);
  });

  test("spadek ceny tez idzie przez akceptacje (nie wolno milczec)", async ({ page }) => {
    await page.route("**/api/flights/prebook", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "PRICE_CHANGED", acceptedTotal: 2727, lockedTotal: 2500, currency: "PLN" }),
      }),
    );
    await doFormularzaZDanymi(page);
    await klikDoPlatnosci(page);

    const modal = page.getByRole("alertdialog");
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(modal).toContainText("spad");
    await expect(modal).toContainText("taniej");
  });

  test("akceptacja ponawia prebook z NOWA kwota jako zaakceptowana", async ({ page }) => {
    const wyslaneKwoty: number[] = [];
    let n = 0;
    await page.route("**/api/flights/prebook", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      wyslaneKwoty.push(body.acceptedTotal);
      n += 1;
      if (n === 1) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "PRICE_CHANGED",
            acceptedTotal: body.acceptedTotal,
            lockedTotal: 2900,
            currency: "PLN",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "00000000-0000-4000-8000-000000000000",
          secretKey: "sk_test_fake",
          widgetEnv: "sandbox",
          price: 2900,
          currency: "PLN",
        }),
      });
    });
    await page.route("**/api/flights/session/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ amount: 2900, currency: "PLN", payable: true, bookingStatus: "prebooked" }),
      }),
    );

    await doFormularzaZDanymi(page);
    await klikDoPlatnosci(page);
    const modal = page.getByRole("alertdialog");
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await modal.getByRole("button", { name: /Akceptuj/ }).click();

    await page.waitForURL(/\/loty\/platnosc/, { timeout: 30_000 });
    expect(wyslaneKwoty).toHaveLength(2);
    // Druga proba deklaruje zgode na NOWA kwote, nie na stara.
    expect(wyslaneKwoty[1]).toBe(2900);
    // Strona platnosci pokazuje dokladnie to, co powiedzial SERWER.
    await expect(page.locator("main")).toContainText("900");
  });
});

test.describe("Stany bledu", () => {
  test("zero wynikow: rozroznia brak lotow od awarii", async ({ page }) => {
    await page.route("**/api/flights/rates**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ offers: [], count: 0 }) }),
    );
    await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Brak lot/)).toBeVisible({ timeout: 30_000 });
    await zamknijZgody(page);
    // Pusta trasa nie jest naprawialna odswiezeniem — nie proponujemy go.
    await expect(page.getByRole("button", { name: /Sprobuj ponownie|Spróbuj ponownie/ })).toBeHidden();
  });

  test("awaria dostawcy: uczciwy komunikat + akcja naprawcza", async ({ page }) => {
    await page.route("**/api/flights/rates**", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "PROVIDER_ERROR", message: "Dostawca zwrocil blad. Sprobuj ponownie za chwile." }),
      }),
    );
    await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Dostawca zwrocil blad/)).toBeVisible({ timeout: 30_000 });
    await zamknijZgody(page);
    await expect(page.getByRole("button", { name: /Spr.buj ponownie/ })).toBeVisible();
  });

  test("wygasla oferta na kroku taryfy: komunikat + powrot po SWIEZE wyniki", async ({ page }) => {
    await otworzWyniki(page);
    await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
    await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });

    await page.route("**/api/flights/verify", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "OFFER_UNAVAILABLE", message: "Ta oferta lotu jest juz niedostepna." }),
      }),
    );
    // Automatyczne odzyskiwanie tez ma sie nie udac — sprawdzamy sciezke reczna.
    await page.route("**/api/flights/rates**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ offers: [] }) }),
    );

    await page.getByRole("button", { name: /Dalej do danych/ }).first().click();
    await expect(page.getByText(/wygas/i).first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Pokaż świeże wyniki" }).click();
    await page.waitForURL(/\/loty\/wyniki/, { timeout: 20_000 });
    // `fresh=1` MUSI byc w URL-u — inaczej cache odda te sama martwa oferte.
    expect(page.url()).toContain("fresh=1");
  });

  test("platnosc bez potwierdzonej kwoty NIE pokazuje formularza karty", async ({ page }) => {
    await page.route("**/api/flights/prebook", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "00000000-0000-4000-8000-000000000001",
          secretKey: "sk_test_fake",
          widgetEnv: "sandbox",
          price: 1918.34,
          currency: "PLN",
        }),
      }),
    );
    // Serwer mowi: tej sesji nie wolno oplacic.
    await page.route("**/api/flights/session/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ amount: 1918.34, currency: "PLN", payable: false, bookingStatus: "prebooked" }),
      }),
    );

    await doFormularzaZDanymi(page);
    await klikDoPlatnosci(page);
    await page.waitForURL(/\/loty\/platnosc/, { timeout: 30_000 });

    await expect(page.getByText(/Nie uda.o si. potwierdzi. kwoty/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#payment-element")).toBeHidden();
  });

  test("wygasla sesja platnosci: mowi CO sie stalo i CO zrobic", async ({ page }) => {
    await page.route("**/api/flights/prebook", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "00000000-0000-4000-8000-000000000002",
          secretKey: "sk_test_fake",
          widgetEnv: "sandbox",
          price: 1918.34,
          currency: "PLN",
        }),
      }),
    );
    await page.route("**/api/flights/session/**", (route) =>
      route.fulfill({ status: 410, contentType: "application/json", body: JSON.stringify({ error: "session_expired" }) }),
    );

    await doFormularzaZDanymi(page);
    await klikDoPlatnosci(page);
    await page.waitForURL(/\/loty\/platnosc/, { timeout: 30_000 });
    await expect(page.getByText(/Sesja rezerwacji wygas/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Wr.. do wynik.w/ })).toBeVisible();
  });

  test("oferta wygasla przy prebooku: komunikat zamiast technicznego bledu", async ({ page }) => {
    await page.route("**/api/flights/prebook", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "OFFER_UNAVAILABLE", message: "Ta oferta lotu jest juz niedostepna." }),
      }),
    );
    await doFormularzaZDanymi(page);
    await klikDoPlatnosci(page);
    await expect(page.getByText(/oferta wygas/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/loty\/pasazerowie/);
  });
});
