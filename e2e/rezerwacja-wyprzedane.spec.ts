/**
 * Prebook 2001 „no prebook availability" → trasa 410 RATE_UNAVAILABLE →
 * formularz rezerwacji: panel „pokój się wyprzedał", JEDEN przycisk powrotu
 * do listy pokoi tego hotelu (te same daty i goście, `#rooms`) i BRAK
 * przycisku płatności (ta sama oferta dostałaby znów 2001).
 *
 * BEZPIECZEŃSTWO: serwer, w który uderza Playwright, zwykle stoi na
 * produkcyjnym kluczu LiteAPI. Prebook NIE wychodzi z przeglądarki —
 * odpowiedź trasy jest atrapą (`page.route`), a każde inne `/api/booking/*`
 * zatrzymuje bezpiecznik i test pada. Strona rezerwacji wymaga
 * `BOOKING_FLOW_MODE=live` na serwerze.
 *
 * Uruchomienie: `E2E_BASE=http://localhost:3000 pnpm e2e e2e/rezerwacja-wyprzedane.spec.ts`
 */
import { expect, test, type Page } from "@playwright/test";

import { isoZaDni } from "./_daty";

const HOTEL_ID = "lp3723e";
const CHECKIN = isoZaDni(40);
const CHECKOUT = isoZaDni(44);

const ODPOWIEDZ_2001 = {
  error: "RATE_UNAVAILABLE",
  message: "Ten pokój właśnie się wyprzedał — wybierz inną ofertę.",
  debug: { liteApiStatus: 400, liteApiCode: "LITEAPI_SOLD_OUT" },
};

test.use({ viewport: { width: 375, height: 812 } });

test.beforeEach(async ({ page }) => {
  // „Tylko niezbędne" przed pierwszym renderem: bez banera i bez gtag
  // (kształt rekordu: src/lib/consent/types.ts, jak w concierge.spec.ts).
  await page.addInitScript({
    content: `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({ version: 1, decidedAt: 1767225600000, decision: { necessary: true, analytics: false, marketing: false } })); } catch (e) {}`,
  });
});

/** Bezpiecznik + atrapa prebooku. Zwraca liczniki do asercji na końcu testu. */
async function zablokujZapisyIZamockujPrebook(page: Page) {
  const stan = { prebook: 0, zablokowane: [] as string[] };
  // PIERWSZY: `page.route` sprawdza od najpóźniej zarejestrowanej, więc
  // bezpiecznik łapie tylko to, czego atrapa niżej nie obsłużyła.
  await page.route("**/api/booking/**", (route) => {
    stan.zablokowane.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/booking/prebook", (route) => {
    stan.prebook += 1;
    return route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify(ODPOWIEDZ_2001),
    });
  });
  return stan;
}

/** Wypełnia dane rezerwującego dopiero po hydratacji (inaczej React wyzeruje pola). */
async function wyslijFormularz(page: Page) {
  const qs = new URLSearchParams({
    hotelId: HOTEL_ID,
    offerId: "E2E_ATRAPA_OFERTY_2001",
    checkin: CHECKIN,
    checkout: CHECKOUT,
    adults: "2",
    rooms: "1",
    children: "6",
    price: "2480",
    cur: "PLN",
  });
  await page.goto(`/hotele/rezerwacja?${qs.toString()}`);
  await page.waitForFunction(() => {
    const el = document.getElementById("holder-first-name");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  });
  await page.locator("#holder-first-name").fill("Jan");
  await page.locator("#holder-last-name").fill("Testowy");
  await page.locator("#holder-email").fill("jan.testowy@example.com");
  await page.locator("#holder-phone").fill("+48600000000");
  await page.getByRole("button", { name: /Przejdź do płatności/ }).click();
}

test("2001 → „pokój się wyprzedał”, jeden powrót do listy pokoi, bez przycisku płatności", async ({ page }) => {
  const stan = await zablokujZapisyIZamockujPrebook(page);
  await wyslijFormularz(page);

  const panel = page.getByRole("alert").filter({ hasText: "wyprzedał" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Nic nie zostało pobrane");

  const cta = panel.getByRole("link", { name: "Zobacz pokoje i ceny" });
  await expect(cta).toHaveCount(1);
  const href = new URL((await cta.getAttribute("href"))!, "http://e2e.invalid");
  expect(href.pathname).toBe(`/hotele/${HOTEL_ID}`);
  expect(Object.fromEntries(href.searchParams)).toEqual({
    checkin: CHECKIN,
    checkout: CHECKOUT,
    adults: "2",
    rooms: "1",
    children: "6",
  });
  expect(href.hash).toBe("#rooms");
  expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await expect(page.getByRole("button", { name: /Przejdź do płatności/ })).toHaveCount(0);
  expect(stan.prebook).toBe(1);
  expect(stan.zablokowane, "niezamockowane wywołania /api/booking/*").toEqual([]);
});

test("powrót ląduje na liście pokoi: nagłówek sekcji widoczny pod sticky paskiem", async ({ page }) => {
  const stan = await zablokujZapisyIZamockujPrebook(page);
  await wyslijFormularz(page);

  await page.getByRole("link", { name: "Zobacz pokoje i ceny" }).click();
  await page.waitForURL(new RegExp(`/hotele/${HOTEL_ID}\\?.*#rooms$`));

  const naglowek = page.locator("#rooms h2");
  await expect(naglowek).toBeInViewport({ timeout: 45_000 });
  const pomiar = await naglowek.evaluate((h2) => {
    const r = h2.getBoundingClientRect();
    const pasek = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const trafiony = document.elementFromPoint(r.left + 10, r.top + r.height / 2);
    return { top: r.top, pasek, widoczny: !!trafiony && (trafiony === h2 || h2.contains(trafiony)) };
  });
  expect(pomiar.top, `nagłówek pod sticky paskiem (top ${pomiar.top}, pasek ${pomiar.pasek})`).toBeGreaterThanOrEqual(pomiar.pasek);
  expect(pomiar.widoczny).toBe(true);
  expect(stan.zablokowane).toEqual([]);
});
