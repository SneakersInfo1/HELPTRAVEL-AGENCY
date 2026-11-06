// E2E: wyszukiwanie lotów przy limicie dostawcy (incydent 2026-11-03).
//
// Produkcja: „Warszawa — wszystkie lotniska → Madera” wysyłało WAW/WMI/RDO
// w tej samej milisekundzie, dostawca odpowiadał 1 × 200 + 2 × HTTP 429,
// a lista pokazywała błąd razem z „0 ofert” (albo fałszywe „Brak lotów”).
//
// Wszystko na PRZECHWYCONYCH odpowiedziach naszego API (`page.route`) —
// dostawca nie jest dotykany, zero prebooków i płatności (§43).

import { expect, test, type Page, type Route } from "@playwright/test";

import { zablokujZapisyLotow } from "./_bezpiecznik-lotow";
import { POWROT, WYLOT } from "./_daty";

test.use({ locale: "pl-PL" });

test.beforeEach(async ({ page }) => {
  await zablokujZapisyLotow(page);
});

const WARSZAWA_MADERA =
  "/loty/wyniki?origin=WAW,WMI,RDO&originLabel=" +
  encodeURIComponent("Warszawa — wszystkie lotniska") +
  `&destination=FNC&destLabel=Madera&depart=${WYLOT}&return=${POWROT}&adults=2`;

function offer(i: number, origin: string, total: number) {
  const leg = (direction: "OUTBOUND" | "INBOUND", d: string) => ({
    direction,
    originCode: direction === "OUTBOUND" ? origin : "FNC",
    destinationCode: direction === "OUTBOUND" ? "FNC" : origin,
    departureTime: `${d}T07:20:00`,
    arrivalTime: `${d}T14:10:00`,
    durationMinutes: 410,
    stops: 1,
    carriers: ["TAP Air Portugal"],
    carrierCode: "TP",
    segments: [
      {
        originCode: direction === "OUTBOUND" ? origin : "FNC",
        destinationCode: direction === "OUTBOUND" ? "FNC" : origin,
        departureTime: `${d}T07:20:00`,
        arrivalTime: `${d}T14:10:00`,
        carrierName: "TAP Air Portugal",
        carrierCode: "TP",
      },
    ],
  });
  return {
    offerId: `OFFER_${origin}_${i}`,
    total,
    currency: "PLN",
    legs: [leg("OUTBOUND", WYLOT), leg("INBOUND", POWROT)],
    maxDurationMinutes: 410,
    hasCheckedBag: false,
    hasCarryOnBag: true,
    fares: [{ offerId: `OFFER_${origin}_${i}`, fareName: "Basic", total, currency: "PLN", hasCheckedBag: false, hasCarryOnBag: true }],
  };
}

type Reply = { status: number; body: unknown; headers?: Record<string, string>; delayMs?: number };

/** Przechwytuje /api/flights/rates: odpowiedź per lotnisko wylotu + dziennik i licznik równoległości. */
async function mockRates(page: Page, reply: (origin: string, call: number) => Reply) {
  const log: string[] = [];
  const stats = { inFlight: 0, max: 0 };
  await page.route("**/api/flights/rates**", async (route: Route) => {
    const body = route.request().postDataJSON() as { legs: { origin: string }[] };
    const origin = body.legs[0].origin;
    log.push(origin);
    stats.inFlight += 1;
    stats.max = Math.max(stats.max, stats.inFlight);
    const r = reply(origin, log.length);
    if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
    stats.inFlight -= 1;
    await route.fulfill({
      status: r.status,
      contentType: "application/json",
      headers: r.headers,
      body: JSON.stringify(r.body),
    });
  });
  return { log, stats };
}

const ok = (offers: unknown[]): Reply => ({ status: 200, body: { offers, count: offers.length, cached: false }, delayMs: 150 });
const throttled = (retryAfterS: number): Reply => ({
  status: 503,
  body: { error: "PROVIDER_ERROR", reason: "PROVIDER_THROTTLED", message: "Wyszukiwarka lotów jest chwilowo przeciążona. Spróbuj ponownie za chwilę." },
  headers: { "Retry-After": String(retryAfterS) },
  delayMs: 100,
});

async function zamknijZgody(page: Page) {
  const btn = page.getByRole("button", { name: "Tylko niezbędne" });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await expect(btn).toBeHidden();
  }
}

test("lotniska grupy idą PO KOLEI (najpierw WAW), nigdy równolegle", async ({ page }) => {
  const { log, stats } = await mockRates(page, (o) => (o === "WAW" ? ok([offer(1, "WAW", 1890), offer(2, "WAW", 2140)]) : ok([])));
  await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
  await zamknijZgody(page);
  await expect(page.getByText("2 oferty").or(page.getByText(/· 2 ofert/))).toBeVisible();
  await expect.poll(() => log.length).toBe(3);
  expect(log).toEqual(["WAW", "WMI", "RDO"]);
  expect(stats.max).toBe(1);
});

test("429/pauza na WAW: komunikat błędu i odliczanie zamiast „0 ofert” i „Brak lotów”; reszta lotnisk NIE jest wysyłana", async ({ page }) => {
  const { log } = await mockRates(page, () => throttled(4));
  await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
  await zamknijZgody(page);
  await expect(page.getByRole("alert").getByText("Wyszukiwarka lotów jest chwilowo przeciążona.", { exact: false })).toBeVisible();
  await expect(page.getByText("Brak lotów dla wybranych dat")).toHaveCount(0);
  await expect(page.locator("header").getByText(/0 ofert/)).toHaveCount(0);
  const retry = page.getByRole("button", { name: /Spróbuj ponownie/ });
  await expect(retry).toBeDisabled();
  await expect(retry).toHaveText(/za \d+ s/);
  expect(log).toEqual(["WAW"]);
});

test("ponowienie po odliczaniu wysyła TYLKO nieudane lotniska, jednym przebiegiem", async ({ page }) => {
  let wawCalls = 0;
  const { log } = await mockRates(page, (o) => {
    if (o !== "WAW") return ok([]);
    wawCalls += 1;
    return wawCalls === 1 ? throttled(2) : ok([offer(1, "WAW", 1990)]);
  });
  await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
  await zamknijZgody(page);
  const retry = page.getByRole("button", { name: /Spróbuj ponownie/ });
  await expect(retry).toBeEnabled({ timeout: 6_000 });
  await retry.dblclick(); // drugi klik nic nie dokłada: jeden przebieg naraz
  await expect(page.getByText(/1 oferta/)).toBeVisible();
  await expect.poll(() => log.length).toBe(4);
  expect(log).toEqual(["WAW", "WAW", "WMI", "RDO"]);
});

test("tempo dostawcy: oferty z WAW od razu, odliczanie zamiast błędu, potem sam wraca do WMI i idzie dalej", async ({ page }) => {
  let wmi = 0;
  const { log, stats } = await mockRates(page, (o) => {
    if (o === "WAW") return ok([offer(1, "WAW", 1790)]);
    if (o === "WMI" && (wmi += 1) === 1) {
      return {
        status: 503,
        body: { error: "PROVIDER_ERROR", reason: "PROVIDER_BUSY", message: "Dostawca lotów ogranicza liczbę wyszukiwań. Spróbuj ponownie za chwilę." },
        headers: { "Retry-After": "2" },
      };
    }
    return ok([]);
  });
  await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
  await zamknijZgody(page);
  await expect(page.getByText(/1 oferta/)).toBeVisible();
  await expect(page.getByText(/Kolejne lotnisko sprawdzimy za \d+ s/)).toBeVisible();
  await expect(page.getByText(/Nie udało się sprawdzić/)).toHaveCount(0);
  await expect.poll(() => log.length).toBe(4);
  expect(log).toEqual(["WAW", "WMI", "WMI", "RDO"]);
  expect(stats.max).toBe(1);
  await expect(page.getByText(/Kolejne lotnisko sprawdzimy/)).toHaveCount(0);
});

test("tempo dostawcy na pierwszym lotnisku: bez ofert szkielet i odliczanie, nie błąd i nie „Brak lotów”", async ({ page }) => {
  let waw = 0;
  await mockRates(page, (o) => {
    if (o !== "WAW") return ok([]);
    return (waw += 1) === 1
      ? {
          status: 503,
          body: { error: "PROVIDER_ERROR", reason: "PROVIDER_BUSY", message: "Dostawca lotów ogranicza liczbę wyszukiwań." },
          headers: { "Retry-After": "3" },
        }
      : ok([offer(1, "WAW", 1990)]);
  });
  await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
  await zamknijZgody(page);
  await expect(page.getByText(/Szukamy dalej za \d+ s, nic nie musisz robić/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Spróbuj ponownie/ })).toHaveCount(0);
  await expect(page.getByText("Brak lotów dla wybranych dat")).toHaveCount(0);
  await expect(page.getByText(/1 oferta/)).toBeVisible();
});

test("oferty z WAW, WMI zajęte → wyniki + uczciwa informacja o nieudanym lotnisku", async ({ page }) => {
  await mockRates(page, (o) =>
    o === "WAW"
      ? ok([offer(1, "WAW", 1790)])
      : o === "WMI"
        ? { status: 503, body: { error: "PROVIDER_ERROR", reason: "PROVIDER_BUSY", message: "Dostawca lotów ogranicza liczbę wyszukiwań." } }
        : ok([]),
  );
  await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
  await zamknijZgody(page);
  await expect(page.getByRole("status").getByText(/Nie udało się sprawdzić lotów z: .*WMI/)).toBeVisible();
  await expect(page.getByText(/1 oferta/)).toBeVisible();
});

test("wszystkie lotniska bez lotów → prawdziwy „Brak lotów” (i licznik 0 ofert)", async ({ page }) => {
  await mockRates(page, () => ok([]));
  await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
  await zamknijZgody(page);
  await expect(page.getByText("Brak lotów dla wybranych dat")).toBeVisible();
  await expect(page.getByRole("button", { name: /Spróbuj ponownie/ })).toHaveCount(0);
});

test("odpowiedź 200 z uszkodzoną treścią to błąd, nie „Brak lotów” i nie „0 ofert”", async ({ page }) => {
  await page.route("**/api/flights/rates**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"offers":[{"offerId"' }),
  );
  await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
  await zamknijZgody(page);
  await expect(page.getByRole("button", { name: /Spróbuj ponownie/ })).toBeVisible();
  await expect(page.getByText("Brak lotów dla wybranych dat")).toHaveCount(0);
  await expect(page.locator("main").getByText(/0 ofert/)).toHaveCount(0);
});

test("miniona data wylotu → komunikat i formularz, ZERO zapytań o loty", async ({ page }) => {
  const { log } = await mockRates(page, () => ok([]));
  await page.goto(
    "/loty/wyniki?origin=WAW,KRK,KTW,GDN,WRO,POZ&originLabel=Polska&destination=FNC&destLabel=Madera&depart=2026-01-10&return=2026-01-17&adults=1",
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByRole("alert").getByText("Data wylotu już minęła", { exact: false })).toBeVisible();
  await page.waitForTimeout(800);
  expect(log).toEqual([]);
});

test("dwa błędy z rzędu (timeout, 5xx) na grupie „Polska” przerywają przebieg: 4 lotniska bez zapytań", async ({ page }) => {
  const down: Reply = { status: 502, body: { error: "PROVIDER_ERROR", message: "Dostawca lotów zwrócił błąd. Spróbuj ponownie za chwilę." }, delayMs: 50 };
  const { log } = await mockRates(page, () => down);
  await page.goto(
    `/loty/wyniki?origin=WAW,KRK,KTW,GDN,WRO,POZ&originLabel=Polska&destination=FNC&destLabel=Madera&depart=${WYLOT}&return=${POWROT}&adults=2`,
    { waitUntil: "domcontentloaded" },
  );
  await zamknijZgody(page);
  await expect(page.getByRole("alert").getByText("Dostawca lotów zwrócił błąd", { exact: false })).toBeVisible();
  await page.waitForTimeout(400);
  expect(log).toEqual(["WAW", "KRK"]);
  await expect(page.getByRole("button", { name: /Spróbuj ponownie/ })).toBeEnabled();
});

for (const vp of [
  { width: 375, height: 812 },
  { width: 1366, height: 900 },
]) {
  const bezPoziomegoPrzewijania = async (page: Page) => {
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  };

  test(`stan błędu: bez poziomego przewijania, przycisk ma 44 px (${vp.width} px)`, async ({ page }) => {
    await page.setViewportSize(vp);
    await mockRates(page, () => throttled(30));
    await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
    await zamknijZgody(page);
    const retry = page.getByRole("button", { name: /Spróbuj ponownie/ });
    await expect(retry).toBeVisible();
    expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await bezPoziomegoPrzewijania(page);
  });

  test(`wyniki częściowe: pasek mieści się w ekranie, przycisk ma 44 px (${vp.width} px)`, async ({ page }) => {
    await page.setViewportSize(vp);
    await mockRates(page, (o) =>
      o === "WAW"
        ? ok([offer(1, "WAW", 1790)])
        : { status: 502, body: { error: "PROVIDER_ERROR", message: "Dostawca lotów zwrócił błąd." }, delayMs: 50 },
    );
    await page.goto(WARSZAWA_MADERA, { waitUntil: "domcontentloaded" });
    await zamknijZgody(page);
    const banner = page.getByRole("status").filter({ hasText: "Nie udało się sprawdzić" });
    await expect(banner).toBeVisible();
    const retry = banner.getByRole("button", { name: /Spróbuj ponownie/ });
    expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    const box = await banner.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vp.width);
    await bezPoziomegoPrzewijania(page);
  });

  test(`brak pływającego przycisku „Zaplanuj wyjazd” (${vp.width} px)`, async ({ page }) => {
    await page.setViewportSize(vp);
    for (const path of ["/kierunki", "/przewodniki", "/o-nas"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await zamknijZgody(page);
      await expect(page.getByRole("button", { name: /Zaplanuj wyjazd/ })).toHaveCount(0);
    }
  });
}
