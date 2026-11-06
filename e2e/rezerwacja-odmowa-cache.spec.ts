/**
 * Gość wybiera pokój → LiteAPI odmawia prebooku (2001) → komunikat → powrót do
 * hotelu → ta oferta nie jest już pokazywana jako dostępna.
 *
 * Cały tor idzie przez prawdziwy serwer Nexta, jego Data Cache i prawdziwą trasę
 * prebooku, ale LiteAPI i Upstash to atrapy (patrz playwright.odmowa.config.ts).
 * Liczniki atrapy pokazują, ile zapytań wyszło „do dostawcy”.
 *
 * Uruchomienie: `pnpm build && pnpm e2e:odmowa`
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

import { isoZaDni } from "./_daty";

const FAKE = process.env.E2E_FAKE_LITEAPI;
// Inny hotel w każdym przebiegu: Data Cache zostaje na dysku, a trafienie w stary
// wpis dałoby przeterminowaną listę i przypadkowe liczniki.
const HOTEL_ID = `lpe2e${Date.now().toString(36)}`;
const SOLD_OUT_OFFER = 'a[href*="offerId=e2e-wyprzedany-"]';
const OTHER_OFFER = 'a[href*="offerId=e2e-dostepny-"]';

test.skip(!FAKE, "wymaga atrapy LiteAPI: pnpm e2e:odmowa");

// Telefon, bo 90% ruchu to telefon. Każdy test ma własny termin, żeby zaczynać
// od zimnego wpisu.
const MOBILE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
test.use(MOBILE);

const CONSENT = `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({ version: 1, decidedAt: 1767225600000, decision: { necessary: true, analytics: false, marketing: false } })); } catch (e) {}`;

let dayOffset = 40;
function newStay() {
  dayOffset += 7;
  return { checkin: isoZaDni(dayOffset), checkout: isoZaDni(dayOffset + 3), adults: "2", rooms: "1" };
}
type Stay = ReturnType<typeof newStay>;
const hotelUrl = (stay: Stay) => `/hotele/${HOTEL_ID}?${new URLSearchParams(stay).toString()}`;

async function resetFake(params: Record<string, string> = {}) {
  await fetch(`${FAKE}/__e2e/reset?${new URLSearchParams({ delayMs: "1500", ...params }).toString()}`);
}
async function fakeStats() {
  const res = await fetch(`${FAKE}/__e2e/stats`);
  return (await res.json()) as {
    ratesAvailability: number;
    ratesMapped: number;
    prebook: number;
    unknown: string[];
  };
}

async function submitReservationForm(page: Page) {
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

/** Wejście na hotel, wybór pokoju, który dostawca odrzuci. Zwraca adres rezerwacji. */
async function pickRoomThatGetsRefused(page: Page, stay: Stay): Promise<string> {
  await page.goto(hotelUrl(stay));
  await expect(page.locator(OTHER_OFFER).first()).toBeVisible({ timeout: 30_000 });
  await page.locator(SOLD_OUT_OFFER).first().click();
  await page.waitForURL(/\/hotele\/rezerwacja\?/);
  const reservationUrl = page.url();
  await submitReservationForm(page);
  return reservationUrl;
}

async function newMobilePage(browser: Browser): Promise<Page> {
  const context = await browser.newContext(MOBILE);
  await context.addInitScript({ content: CONSENT });
  return context.newPage();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: CONSENT });
});

test("2001: oferta nie wraca nawet pod nowym offerId, jedno świeże zapytanie, ląduje na liście z tymi samymi parametrami", async ({
  page,
}) => {
  await resetFake();
  const stay = newStay();

  await page.goto(hotelUrl(stay));
  await expect(page.locator(SOLD_OUT_OFFER).first()).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.locator(SOLD_OUT_OFFER).first()).toBeVisible({ timeout: 30_000 });
  expect((await fakeStats()).ratesAvailability, "drugie wejście czyta Data Cache").toBe(1);

  await pickRoomThatGetsRefused(page, stay);

  const panel = page.getByRole("alert").filter({ hasText: "wyprzedał" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("button", { name: /Przejdź do płatności/ })).toHaveCount(0);
  expect((await fakeStats()).prebook).toBe(1);

  await panel.getByRole("link", { name: "Zobacz pokoje i ceny" }).click();
  await page.waitForURL(new RegExp(`/hotele/${HOTEL_ID}\\?.*refused=.*#rooms$`));
  await expect(page.locator(OTHER_OFFER).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(SOLD_OUT_OFFER)).toHaveCount(0);

  const url = new URL(page.url());
  for (const [name, value] of Object.entries(stay)) expect(url.searchParams.get(name)).toBe(value);

  // Powrót jest zawsze zimny (stawki właśnie unieważnione), więc tu widać, czy
  // przewinięcie do listy działa także po szkielecie z loading.tsx.
  const heading = page.locator("#rooms h2");
  await expect(heading).toBeInViewport();
  const measured = await heading.evaluate((h2) => ({
    top: h2.getBoundingClientRect().top,
    bar: document.querySelector("header")?.getBoundingClientRect().bottom ?? 0,
    offset: h2.getBoundingClientRect().top + window.scrollY,
    viewport: window.innerHeight,
  }));
  expect(measured.offset, "lista musi leżeć pod zgięciem, inaczej test niczego nie mierzy").toBeGreaterThan(
    measured.viewport,
  );
  expect(measured.top, "nagłówek listy nie chowa się pod sticky paskiem").toBeGreaterThanOrEqual(measured.bar);
  // Sam `toBeInViewport` nie wystarcza: wystarcza mu jeden widoczny piksel, a bez
  // przewinięcia nagłówek stał przy dolnej krawędzi (zmierzone: top 779 przy 812).
  expect(measured.top, "gość ląduje na liście pokoi, nie przy dolnej krawędzi").toBeLessThan(measured.viewport / 2);

  const afterReturn = await fakeStats();
  expect(afterReturn.ratesAvailability, "odświeżenie to dokładnie jedno zapytanie o dostępność").toBe(2);
  expect(afterReturn.ratesMapped, "zdjęcia pokoi zostają z cache").toBe(1);
  expect(afterReturn.unknown).toEqual([]);

  await page.reload();
  await expect(page.locator(OTHER_OFFER).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(SOLD_OUT_OFFER)).toHaveCount(0);
  expect((await fakeStats()).ratesAvailability, "przeładowanie nie pyta dostawcy drugi raz").toBe(2);
});

test("przycisk Wstecz po odmowie: lista sama się poprawia, bez odrzuconej oferty i kolejnego prebooku", async ({
  page,
}) => {
  await resetFake();
  await pickRoomThatGetsRefused(page, newStay());
  await expect(page.getByRole("alert").filter({ hasText: "wyprzedał" })).toBeVisible();

  await page.goBack();

  await page.waitForURL(/refused=/);
  await expect(page.locator(OTHER_OFFER).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(SOLD_OUT_OFFER)).toHaveCount(0);
  const stats = await fakeStats();
  expect(stats.prebook).toBe(1);
  expect(stats.ratesAvailability, "jedno świeże zapytanie, bez pętli przekierowań").toBe(2);
});

test("drugi gość z tą samą martwą ofertą: panel wyprzedania bez kolejnego prebooku", async ({
  page,
  browser,
}) => {
  await resetFake();
  const reservationUrl = await pickRoomThatGetsRefused(page, newStay());
  await expect(page.getByRole("alert").filter({ hasText: "wyprzedał" })).toBeVisible();

  const other = await newMobilePage(browser);
  await other.goto(reservationUrl);
  await submitReservationForm(other);

  const panel = other.getByRole("alert").filter({ hasText: "wyprzedał" });
  await expect(panel).toBeVisible();
  await expect(other.getByRole("button", { name: /Przejdź do płatności/ })).toHaveCount(0);
  expect((await fakeStats()).prebook, "bez drugiego zapytania do dostawcy").toBe(1);

  // Odcisk jedzie w linku gościa, więc i on wraca na listę bez tej oferty.
  await panel.getByRole("link", { name: "Zobacz pokoje i ceny" }).click();
  await other.waitForURL(/refused=/);
  await expect(other.locator(OTHER_OFFER).first()).toBeVisible({ timeout: 30_000 });
  await expect(other.locator(SOLD_OUT_OFFER)).toHaveCount(0);
});

test("inny gość bez znacznika dostaje świeże stawki, a kolejni czytają je z cache", async ({ page, browser }) => {
  await resetFake({ afterRefusal: "gone" });
  const stay = newStay();
  await pickRoomThatGetsRefused(page, stay);
  await expect(page.getByRole("alert").filter({ hasText: "wyprzedał" })).toBeVisible();

  const stranger = await newMobilePage(browser);
  await stranger.goto(hotelUrl(stay));
  await expect(stranger.locator(OTHER_OFFER).first()).toBeVisible({ timeout: 30_000 });
  await expect(stranger.locator(SOLD_OUT_OFFER)).toHaveCount(0);
  expect((await fakeStats()).ratesAvailability).toBe(2);

  const next = await newMobilePage(browser);
  await next.goto(hotelUrl(stay));
  await expect(next.locator(OTHER_OFFER).first()).toBeVisible({ timeout: 30_000 });
  expect((await fakeStats()).ratesAvailability, "wpis znów jest w cache").toBe(2);
});

test("wygasła oferta: świeże stawki i ten sam pokój dostępny pod nowym offerId", async ({ page }) => {
  await resetFake({ prebook: "expired" });
  const reservationUrl = await pickRoomThatGetsRefused(page, newStay());
  const oldOfferId = new URL(reservationUrl).searchParams.get("offerId")!;

  const panel = page.getByRole("alert").filter({ hasText: /wygasła/ });
  await expect(panel).toBeVisible();
  await panel.getByRole("link", { name: /Wybierz ofertę ponownie/ }).click();
  await page.waitForURL(new RegExp(`/hotele/${HOTEL_ID}\\?`));
  expect(new URL(page.url()).searchParams.has("refused"), "wygasła oferta nie ukrywa pokoju").toBe(false);

  const offer = page.locator(SOLD_OUT_OFFER).first();
  await expect(offer).toBeVisible({ timeout: 30_000 });
  expect(await offer.getAttribute("href")).not.toContain(oldOfferId);
  expect((await fakeStats()).ratesAvailability).toBe(2);
});
