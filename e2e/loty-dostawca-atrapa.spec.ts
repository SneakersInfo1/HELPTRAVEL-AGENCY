/**
 * Cały tor wyszukiwania lotów: przeglądarka → trasa Nexta → bramka slotów →
 * gubernator → cache → dostawca. Prawdziwe są dwa procesy serwera, klient Upstash
 * i kod przeglądarki; LiteAPI i Upstash to atrapy (patrz playwright.loty.config.ts).
 *
 * Atrapa dostawcy zachowuje się jak konto na produkcji: zapytanie za blisko
 * poprzedniego dostaje HTTP 429, kod 4290, nawet gdy poprzednie już się skończyło.
 * Wynik czytamy z JEJ liczników, więc test mówi, co faktycznie doszło „do
 * dostawcy”, a nie co kod deklaruje.
 *
 * Uruchomienie: `pnpm build && pnpm e2e:loty`
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

import { zablokujZapisyLotow } from "./_bezpiecznik-lotow";
import { isoZaDni } from "./_daty";

const FAKE = process.env.E2E_FAKE_LITEAPI;
const FIRST_INSTANCE = process.env.E2E_FIRST_INSTANCE;
const SECOND_INSTANCE = process.env.E2E_SECOND_INSTANCE;

test.skip(!FAKE || !SECOND_INSTANCE, "wymaga atrapy dostawcy: pnpm e2e:loty");

// Telefon, bo 90% ruchu to telefon.
test.use({ locale: "pl-PL", viewport: { width: 375, height: 812 } });

const WARSZAWA = ["WAW", "WMI", "RDO"];
const POLSKA = ["WAW", "KRK", "KTW", "GDN", "WRO", "POZ"];

// Każde wyszukiwanie ma własny termin: atrapa Upstash żyje cały przebieg, a
// trafienie w cache wcześniejszego testu zafałszowałoby liczniki. Z zegara, nie
// ze zwykłego licznika: po nieudanym teście Playwright restartuje proces roboczy
// i licznik zacząłby od nowa, od terminów już zapisanych w cache.
let searches = 0;
function search(origins: string[], destination: string, destLabel: string): string {
  searches += 1;
  const dayOffset = 60 + (Math.floor(Date.now() / 1000) + searches * 7) % 600;
  const params = new URLSearchParams({
    origin: origins.join(","),
    originLabel: origins.length === 3 ? "Warszawa — wszystkie lotniska" : "Polska — dowolne lotnisko",
    destination,
    destLabel,
    depart: isoZaDni(dayOffset),
    return: isoZaDni(dayOffset + 7),
    adults: "2",
  });
  return `/loty/wyniki?${params.toString()}`;
}

interface Stats {
  flightRates: number;
  flightOrigins: string[];
  flightMaxInFlight: number;
  flightThrottled: number;
  flightStartGapsMs: number[];
}

async function resetFake(params: Record<string, string> = {}) {
  await fetch(`${FAKE}/__e2e/reset?${new URLSearchParams(params).toString()}`);
}
async function stats(): Promise<Stats> {
  return (await (await fetch(`${FAKE}/__e2e/stats`)).json()) as Stats;
}

const CONSENT = `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({ version: 1, decidedAt: 1767225600000, decision: { necessary: true, analytics: false, marketing: false } })); } catch (e) {}`;

async function preparePage(page: Page) {
  await page.addInitScript({ content: CONSENT });
  await zablokujZapisyLotow(page);
}

async function newGuest(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, locale: "pl-PL", viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await preparePage(page);
  return page;
}

const offerCards = (page: Page) => page.locator("main article[data-offer-card]");

// Konto z produkcji w skali testu: zapytanie bliżej niż 3,5 s od poprzedniego = 429.
const MIN_GAP = { flightsMinGapMs: "3500" };
const CALL_TIMEOUT = { timeout: 45_000 };

test.beforeEach(async ({ page }) => {
  await preparePage(page);
  await resetFake(MIN_GAP);
});

test("REGRESJA z produkcji 2026-11-06: Warszawa → Madera bez 429, oferty od razu, gość widzi odliczanie", async ({ page }) => {
  await page.goto(search(WARSZAWA, "FNC", "Madera"), { waitUntil: "domcontentloaded" });
  await expect(offerCards(page).first()).toBeVisible();
  await expect(page.getByText(/Kolejne lotnisko sprawdzimy za \d+ s/)).toBeVisible();
  await expect.poll(async () => (await stats()).flightRates, CALL_TIMEOUT).toBe(3);

  const s = await stats();
  expect(s.flightOrigins).toEqual(WARSZAWA);
  expect(s.flightMaxInFlight).toBe(1);
  expect(s.flightThrottled).toBe(0);
  for (const gap of s.flightStartGapsMs) expect(gap).toBeGreaterThanOrEqual(3_500);
  await expect(page.getByText(/Kolejne lotnisko sprawdzimy/)).toHaveCount(0);
  await expect(page.getByText(/Nie udało się sprawdzić/)).toHaveCount(0);
  await expect(page.getByText("Brak lotów dla wybranych dat")).toHaveCount(0);
});

for (const [name, destination] of [["Malta", "MLA"], ["Madryt", "MAD"]] as const) {
  test(`Warszawa → ${name}: wyniki bez 429`, async ({ page }) => {
    await page.goto(search(WARSZAWA, destination, name), { waitUntil: "domcontentloaded" });
    await expect(offerCards(page).first()).toBeVisible();
    await expect.poll(async () => (await stats()).flightRates, CALL_TIMEOUT).toBe(3);
    expect((await stats()).flightThrottled).toBe(0);
  });
}

test("dwie instancje serwera, dwóch gości naraz, różne trasy: u dostawcy nadal jedno zapytanie w locie", async ({ browser }) => {
  const [a, b] = await Promise.all([newGuest(browser, FIRST_INSTANCE), newGuest(browser, SECOND_INSTANCE)]);
  await Promise.all([
    a.goto(search(WARSZAWA, "FNC", "Madera"), { waitUntil: "domcontentloaded" }),
    b.goto(search(WARSZAWA, "MLA", "Malta"), { waitUntil: "domcontentloaded" }),
  ]);
  // Jeden slot na dwóch gości: każdy może czekać, aż drugi przejdzie swoje lotniska.
  await expect(offerCards(a).first()).toBeVisible(CALL_TIMEOUT);
  await expect(offerCards(b).first()).toBeVisible(CALL_TIMEOUT);
  await expect.poll(async () => (await stats()).flightRates, { timeout: 60_000 }).toBe(6);

  const s = await stats();
  expect(s.flightMaxInFlight).toBe(1);
  expect(s.flightThrottled).toBe(0);
  for (const gap of s.flightStartGapsMs) expect(gap).toBeGreaterThanOrEqual(3_500);
  await a.context().close();
  await b.context().close();
});

test("dwie instancje, to samo wyszukiwanie naraz: dostawca pytany raz na lotnisko, reszta z cache", async ({ browser }) => {
  const url = search(WARSZAWA, "MAD", "Madryt");
  const [a, b] = await Promise.all([newGuest(browser, FIRST_INSTANCE), newGuest(browser, SECOND_INSTANCE)]);
  await Promise.all([
    a.goto(url, { waitUntil: "domcontentloaded" }),
    b.goto(url, { waitUntil: "domcontentloaded" }),
  ]);
  await expect(offerCards(a).first()).toBeVisible(CALL_TIMEOUT);
  await expect(offerCards(b).first()).toBeVisible(CALL_TIMEOUT);
  await expect.poll(async () => (await stats()).flightRates, CALL_TIMEOUT).toBeGreaterThanOrEqual(3);
  await a.waitForTimeout(5_000);

  const s = await stats();
  expect(s.flightRates).toBe(3);
  expect(s.flightThrottled).toBe(0);
  await a.context().close();
  await b.context().close();
});

test("prawdziwy brak lotów: komunikat o braku, licznik 0 ofert i żadnego przycisku ponowienia", async ({ page }) => {
  await resetFake({ ...MIN_GAP, flights: "empty" });
  await page.goto(search(WARSZAWA, "FNC", "Madera"), { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Brak lotów dla wybranych dat")).toBeVisible(CALL_TIMEOUT);
  await expect(page.getByText(/· 0 ofert/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Spróbuj ponownie/ })).toHaveCount(0);
  expect((await stats()).flightRates).toBe(3);
});

test("wynik częściowy: WAW odpowiada, WMI pada na 500 → oferty i uczciwa informacja o nieudanym lotnisku", async ({ page }) => {
  await resetFake({ ...MIN_GAP, flightsFor: "WMI:500" });
  await page.goto(search(WARSZAWA, "FNC", "Madera"), { waitUntil: "domcontentloaded" });
  await expect(offerCards(page).first()).toBeVisible();
  await expect(page.getByRole("status").getByText(/Nie udało się sprawdzić lotów z: .*WMI/)).toBeVisible(CALL_TIMEOUT);
  await expect(page.getByText("Brak lotów dla wybranych dat")).toHaveCount(0);

  await resetFake(MIN_GAP);
  await page.getByRole("button", { name: /Spróbuj ponownie/ }).click();
  await expect.poll(async () => (await stats()).flightOrigins, CALL_TIMEOUT).toEqual(["WMI"]);
  await expect(page.getByRole("status").getByText(/Nie udało się sprawdzić/)).toHaveCount(0);
  await expect(page.getByText("Szukam w pozostałych lotniskach…")).toHaveCount(0);
});

test("awaria dostawcy na grupie „Polska”: dwa zapytania i stop, po naprawie ponowienie tylko nieudanych", async ({ page }) => {
  await resetFake({ ...MIN_GAP, flights: "500" });
  await page.goto(search(POLSKA, "FNC", "Madera"), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert").getByText(/Dostawca lotów zwrócił błąd/)).toBeVisible(CALL_TIMEOUT);
  await expect(page.getByText("Brak lotów dla wybranych dat")).toHaveCount(0);
  await expect(page.getByText(/0 ofert/)).toHaveCount(0);
  expect((await stats()).flightOrigins).toEqual(["WAW", "KRK"]);

  await resetFake(MIN_GAP);
  await page.getByRole("button", { name: /Spróbuj ponownie/ }).click();
  await expect(offerCards(page).first()).toBeVisible(CALL_TIMEOUT);
  await expect.poll(async () => (await stats()).flightRates, { timeout: 60_000 }).toBe(6);
  const s = await stats();
  expect(s.flightOrigins).toEqual(POLSKA);
  expect(s.flightThrottled).toBe(0);
});

test("miniona data: zero zapytań do dostawcy, komunikat zamiast ślepego zaułka", async ({ page }) => {
  await page.goto(
    `/loty/wyniki?origin=${POLSKA.join(",")}&originLabel=Polska&destination=FNC&destLabel=Madera&depart=2026-01-10&return=2026-01-17&adults=2`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByRole("alert").getByText("Data wylotu już minęła", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Spróbuj ponownie/ })).toHaveCount(0);
  await page.waitForTimeout(800);
  expect((await stats()).flightRates).toBe(0);
});

// OSTATNI: pauza po 429 trwa minimum 15 s i obejmuje wszystkich, więc zablokowałaby
// kolejne testy. Sam test sprawdza pełny cykl, z czekaniem na koniec pauzy.
test("429 od dostawcy: jedno zapytanie, odliczanie z Retry-After, po pauzie ponowienie tylko nieudanych", async ({ page }) => {
  await resetFake({ flights: "429" });
  await page.goto(search(WARSZAWA, "FNC", "Madera"), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert").getByText(/chwilowo przeciążona/)).toBeVisible(CALL_TIMEOUT);
  const retry = page.getByRole("button", { name: /Spróbuj ponownie/ });
  await expect(retry).toBeDisabled();
  await expect(retry).toHaveText(/za \d+ s/);
  await expect(page.getByText(/0 ofert/)).toHaveCount(0);
  expect((await stats()).flightOrigins).toEqual(["WAW"]);

  await resetFake(MIN_GAP);
  await expect(retry).toBeEnabled({ timeout: 20_000 });
  await retry.click();
  await expect(offerCards(page).first()).toBeVisible(CALL_TIMEOUT);
  await expect.poll(async () => (await stats()).flightRates, CALL_TIMEOUT).toBe(3);
  expect((await stats()).flightOrigins).toEqual(WARSZAWA);
});
