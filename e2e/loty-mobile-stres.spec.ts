// E2E: lejek lotów na TRZECH szerokościach telefonu + przypadki brzegowe,
// których nie ma w happy-pathcie, plus pomiary wydajności listy.
//
// Dlaczego osobny plik: `loty.spec.ts` jeździ po jednej szerokości (390) i po
// dwóch pasażerach. To za mało dla serwisu, w którym 90 % ruchu to telefon —
// przepełnienie w poziomie i zasłonięte CTA pojawiają się DOKŁADNIE na
// wariantach, których happy-path nie dotyka: 375 px, sześciu podróżnych,
// nazwiska na 40 znaków, kwoty pięciocyfrowe.
//
// BEZPIECZEŃSTWO: zero prebooków, zero płatności (§43). Lista jest
// przechwytywana (`page.route`), więc dostawca nie jest dotykany w ogóle.

import { expect, test, type Page } from "@playwright/test";

import { zablokujZapisyLotow } from "./_bezpiecznik-lotow";

test.use({ locale: "pl-PL" });

// BEZPIECZNIK: niezamockowany zapis w lejku lotów (prebook / book / finalizacja
// po powrocie z płatności) wywala test, zamiast utworzyć prawdziwy lock taryfy
// na produkcyjnym kluczu. Testy, które mockują te trasy same, rejestrują swoje
// przechwycenie PÓŹNIEJ, więc mają pierwszeństwo.
test.beforeEach(async ({ page }) => {
  await zablokujZapisyLotow(page);
});

const WIDTHS = [
  { name: "375x812 (iPhone SE/13 mini)", width: 375, height: 812 },
  { name: "390x844 (iPhone 14)", width: 390, height: 844 },
  { name: "412x915 (Pixel 7)", width: 412, height: 915 },
] as const;

const SEARCH =
  "/loty/wyniki?origin=WAW&originLabel=Warszawa&destination=BCN&destLabel=Barcelona" +
  "&depart=2026-09-20&return=2026-09-27&adults=2";

/** Wyszukiwanie z sześcioma podróżnymi — 4 dorosłych, 2 dzieci. */
const SEARCH_6 =
  "/loty/wyniki?origin=WAW&originLabel=Warszawa&destination=BCN&destLabel=Barcelona" +
  "&depart=2026-09-20&return=2026-09-27&adults=4&children=2";

/**
 * Wyszukiwanie z najdłuższymi realnymi nazwami lotnisk.
 *
 * Etykiety idą z adresu do paska wyszukiwania, a pasek jest na 375 px
 * najciaśniejszym miejscem w całym lejku — jeśli coś ma wypchnąć stronę
 * w poziomie, to właśnie „Barcelona–El Prat Josep Tarradellas".
 */
const SEARCH_DLUGIE =
  "/loty/wyniki?origin=WAW&originLabel=" +
  encodeURIComponent("Warszawa im. Fryderyka Chopina") +
  "&destination=BCN&destLabel=" +
  encodeURIComponent("Barcelona–El Prat Josep Tarradellas") +
  "&depart=2026-09-20&return=2026-09-27&adults=2";

function offer(i: number, total: number) {
  const leg = (direction: "OUTBOUND" | "INBOUND", d: string) => ({
    direction,
    originCode: direction === "OUTBOUND" ? "WAW" : "BCN",
    destinationCode: direction === "OUTBOUND" ? "BCN" : "WAW",
    departureTime: `${d}T0${(i % 9) + 1}:20:00`,
    arrivalTime: `${d}T1${(i % 9)}:10:00`,
    durationMinutes: 170 + (i % 300),
    stops: i % 3,
    carriers: ["Wizz Air"],
    carrierCode: "W6",
    segments: [
      {
        originCode: direction === "OUTBOUND" ? "WAW" : "BCN",
        destinationCode: direction === "OUTBOUND" ? "BCN" : "WAW",
        departureTime: `${d}T0${(i % 9) + 1}:20:00`,
        arrivalTime: `${d}T1${(i % 9)}:10:00`,
        carrierName: "Wizz Air",
        carrierCode: "W6",
      },
    ],
  });
  return {
    offerId: `OFFER_STRESS_${i}`,
    total,
    currency: "PLN",
    legs: [leg("OUTBOUND", "2026-09-20"), leg("INBOUND", "2026-09-27")],
    maxDurationMinutes: 170 + (i % 300),
    hasCheckedBag: i % 2 === 0,
    hasCarryOnBag: true,
    fares: [
      { offerId: `OFFER_STRESS_${i}`, fareName: "Basic", total, currency: "PLN", hasCheckedBag: false, hasCarryOnBag: true },
      { offerId: `OFFER_STRESS_${i}_F`, fareName: "Z bagażem", total: total + 320, currency: "PLN", hasCheckedBag: true, hasCarryOnBag: true },
    ],
  };
}

/** Podstawia listę ofert o zadanej długości i cenach. */
async function mockOffers(page: Page, totals: number[]) {
  await page.route("**/api/flights/rates**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ offers: totals.map((t, i) => offer(i, t)), count: totals.length, cached: true }),
    });
  });
}

async function zamknijZgody(page: Page) {
  const btn = page.getByRole("button", { name: "Tylko niezbędne" });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await expect(btn).toBeHidden();
  }
}

/** Największe przepełnienie w poziomie na CAŁEJ stronie, w pikselach. */
async function przepelnienie(page: Page): Promise<{ px: number; winowajca: string }> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    let px = 0;
    let winowajca = "";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const over = Math.round(r.right - limit);
      if (over > px) {
        px = over;
        winowajca = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`;
      }
    }
    return { px, winowajca };
  });
}

// ── 1. Przepełnienie w poziomie na każdym kroku i każdej szerokości ──────────

for (const w of WIDTHS) {
  test(`${w.name}: żaden krok lejka nie przewija się w poziomie`, async ({ page }) => {
    await page.setViewportSize({ width: w.width, height: w.height });
    await mockOffers(page, [999, 1999, 12999, 485.49, 2727.5]);

    await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
    await zamknijZgody(page);

    const kroki: Array<[string, () => Promise<void>]> = [
      ["wyniki", async () => {}],
      [
        "taryfa",
        async () => {
          await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
          await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
          await expect(page.locator("main")).toBeVisible();
        },
      ],
      [
        "pasażerowie",
        async () => {
          await page.goto("/loty/pasazerowie", { waitUntil: "domcontentloaded" });
          await expect(page.locator("main form")).toBeVisible({ timeout: 30_000 });
        },
      ],
    ];

    for (const [nazwa, idz] of kroki) {
      await idz();
      // Scrollowanie do dołu ujawnia elementy, które renderują się dopiero
      // poniżej zgięcia (sticky CTA, stopka) — one też potrafią wystawać.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);
      const { px, winowajca } = await przepelnienie(page);
      const scrollowalne = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(px, `${nazwa} @ ${w.width}px — wystaje ${px}px: ${winowajca}`).toBeLessThanOrEqual(1);
      expect(scrollowalne, `${nazwa} @ ${w.width}px — dokument przewija się w poziomie`).toBeLessThanOrEqual(1);
    }
  });
}

// ── 2. Kwoty: 999 / 1 999 / 12 999 mieszczą się i nie łamią wiersza ─────────

test("375: kwoty 999 / 1 999 / 12 999 zł mieszczą się w karcie bez łamania", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockOffers(page, [999, 1999, 12999]);
  await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
  await zamknijZgody(page);

  const karty = page.locator("main article[data-offer-card]");
  for (let i = 0; i < 3; i++) {
    const cena = karty.nth(i).locator("[data-offer-total]").first();
    await expect(cena).toBeVisible();
    const box = (await cena.boundingBox())!;
    expect(box.x + box.width, `kwota #${i} wystaje poza ekran`).toBeLessThanOrEqual(375);
    // Jedna linia: wysokość nie może być wielokrotnością wiersza.
    expect(box.height, `kwota #${i} złamała się na dwie linie (${box.height}px)`).toBeLessThan(48);
  }
  // Najdroższa oferta musi pokazać separator tysięcy, a nie „12999".
  // Celujemy w kwote NA KARCIE, nie w pierwszy pasujacy tekst na stronie:
  // ten sam ciag jest w zwinietym arkuszu filtrow (zakres cen), ktory jest
  // ukryty, wiec `.first()` trafialo w niewidoczny wezel.
  const najdrozsza = await karty.nth(2).locator("[data-offer-total]").innerText();
  expect(najdrozsza.replace(/ /g, " ")).toBe("12 999 zł");
});

// ── 2b. Bardzo długie nazwy lotnisk w pasku wyszukiwania ────────────────────

test("375: długie nazwy lotnisk nie wypychają paska wyszukiwania poza ekran", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockOffers(page, [1999]);
  await page.goto(SEARCH_DLUGIE, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
  await zamknijZgody(page);

  const { px, winowajca } = await przepelnienie(page);
  expect(px, `pasek z długimi nazwami wystaje ${px}px: ${winowajca}`).toBeLessThanOrEqual(1);

  // Nazwa musi być SKRÓCONA (ellipsis/clamp), a nie zawinięta na pół ekranu.
  const naglowek = page.locator("main").getByText(/Barcelona/).first();
  await expect(naglowek).toBeVisible();
  const box = (await naglowek.boundingBox())!;
  expect(box.x + box.width, "nazwa lotniska wychodzi poza ekran").toBeLessThanOrEqual(376);
});

// ── 3. Sześciu podróżnych + bardzo długie nazwiska ──────────────────────────

test("375: sześciu podróżnych — formularz nie przepełnia się, błędy prowadzą do pola", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockOffers(page, [1999]);
  await page.goto(SEARCH_6, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
  await zamknijZgody(page);
  await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
  await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
  await page.goto("/loty/pasazerowie", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main form")).toBeVisible({ timeout: 30_000 });

  // 6 podróżnych + kontakt = 7 sekcji.
  const fieldsety = await page.locator("main fieldset").count();
  expect(fieldsety, "formularz nie rozwinął pól dla sześciu osób").toBe(7);

  // Bardzo długie nazwisko (40 znaków) w pierwszym pasażerze.
  const dlugie = "Brzęczyszczykiewicz-Wolskadamskiegorska";
  await page.fill("#p0-first", "Grzegorzżółć");
  await page.fill("#p0-last", dlugie);
  const wartosc = await page.inputValue("#p0-last");
  expect(wartosc.length, "pole ucięło długie nazwisko po stronie klienta").toBe(dlugie.length);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const { px, winowajca } = await przepelnienie(page);
  expect(px, `formularz 6 osób wystaje ${px}px: ${winowajca}`).toBeLessThanOrEqual(1);

  // Walidacja: submit z niepełnymi danymi zostaje na stronie i pokazuje błąd.
  await page.getByRole("button", { name: /Przejd/ }).first().click();
  await page.waitForTimeout(400);
  expect(page.url(), "niepełny formularz opuścił stronę (mógł ruszyć prebook)").toContain("/loty/pasazerowie");
  await expect(page.locator("main p.text-danger, main [role=alert]").first()).toBeVisible();
});

// ── 4. Klawiatura ekranowa i sticky CTA ─────────────────────────────────────

test("375: fokus w polu nie chowa CTA pod klawiaturą (CTA w przepływie, nie fixed)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockOffers(page, [1999]);
  await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
  await zamknijZgody(page);
  await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
  await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
  await page.goto("/loty/pasazerowie", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main form")).toBeVisible({ timeout: 30_000 });

  await page.focus("#c-email");
  // Emulacja klawiatury: viewport skraca się do ~45 % wysokości.
  await page.setViewportSize({ width: 375, height: 380 });
  await page.waitForTimeout(200);

  const cta = page.getByRole("button", { name: /Przejd/ }).first();
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeVisible();
  const box = (await cta.boundingBox())!;
  expect(box.width, "CTA zwęziło się przy skróconym viewporcie").toBeGreaterThan(200);
  expect(box.height, "CTA poniżej progu dotykowego 44 px").toBeGreaterThanOrEqual(44);
});

// ── 5. Baner zgód nie przechwytuje CTA ──────────────────────────────────────

test("375: przy WIDOCZNYM banerze zgód nic nie udaje klikalnego CTA", async ({ page, context }) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 375, height: 812 });
  await mockOffers(page, [1999, 2999]);
  await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });

  // Baner wisi — sticky CTA NIE powinno się w tym stanie renderować (regresja
  // z 2026-08-29: baner `fixed bottom-2 z-40` przechwytywał kliknięcia w pasek).
  const banerWidoczny = await page.getByRole("button", { name: "Tylko niezbędne" }).isVisible().catch(() => false);
  if (banerWidoczny) {
    const sticky = page.locator("[data-flight-sticky-cta]");
    expect(await sticky.count(), "sticky CTA renderuje się pod banerem zgód").toBe(0);
  }
});

// ── 6. Nawigacja wstecz ─────────────────────────────────────────────────────

test("390: wstecz z taryfy wraca na wyniki z ZACHOWANYMI filtrami", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOffers(page, Array.from({ length: 40 }, (_, i) => 900 + i * 25));
  await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
  await zamknijZgody(page);

  await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
  await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
  await page.goBack();
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
  expect(page.url()).toContain("/loty/wyniki");
  const { px } = await przepelnienie(page);
  expect(px, "po powrocie strona przewija się w poziomie").toBeLessThanOrEqual(1);
});

// ── 7. Czat nie wchodzi w lejek lotów ───────────────────────────────────────

test("412: konsjerż jest wyłączony na każdym kroku lejka", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await mockOffers(page, [1999]);

  const dymki = () =>
    page.evaluate(
      () =>
        Array.from(document.querySelectorAll("div")).filter((e) =>
          /z-40 flex flex-col items-end/.test(String((e as HTMLElement).className)),
        ).length,
    );

  await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
  await zamknijZgody(page);
  expect(await dymki(), "konsjerż widoczny na /loty/wyniki").toBe(0);

  // Kolejne kroki MUSZĄ być osiągane przepływem, nie wpisaniem adresu: bez
  // stanu w `sessionStorage` `/loty/dodatki` przekierowuje na stronę główną,
  // gdzie konsjerż ma pełne prawo być. Poprzednia wersja tego testu mierzyła
  // właśnie homepage i „wykrywała" nieistniejącą regresję.
  await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
  await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
  await expect(page.locator("main")).toBeVisible();
  expect(page.url(), "nie dotarliśmy na krok taryfy").toContain("/loty/dodatki");
  expect(await dymki(), "konsjerż widoczny na /loty/dodatki").toBe(0);

  await page.goto("/loty/pasazerowie", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main form")).toBeVisible({ timeout: 30_000 });
  expect(page.url(), "nie dotarliśmy na krok danych").toContain("/loty/pasazerowie");
  expect(await dymki(), "konsjerż widoczny na /loty/pasazerowie").toBe(0);
});

// ── 8. WYDAJNOŚĆ: 1000+ ofert ───────────────────────────────────────────────

test("perf: 1000 ofert — DOM zostaje mały, filtr i sort nie blokują wątku", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const totals = Array.from({ length: 1000 }, (_, i) => 450 + (i % 700) * 3.37);
  await mockOffers(page, totals);

  // Zbieramy długie zadania i przesunięcia layoutu OD SAMEGO POCZĄTKU.
  await page.addInitScript(() => {
    const w = window as unknown as { __long: number[]; __cls: number };
    w.__long = [];
    w.__cls = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__long.push(Math.round(e.duration));
      }).observe({ type: "longtask", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!s.hadRecentInput) w.__cls += s.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });

  const zapytania: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/flights/")) zapytania.push(r.url());
  });

  const t0 = Date.now();
  await page.goto(SEARCH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main article[data-offer-card]").first()).toBeVisible({ timeout: 60_000 });
  const doPierwszejKarty = Date.now() - t0;
  await zamknijZgody(page);

  const kartyNaStarcie = await page.locator("main article[data-offer-card]").count();
  const wezlyNaStarcie = await page.evaluate(() => document.getElementsByTagName("*").length);

  // Filtrowanie na pełnej puli.
  const tFiltr = Date.now();
  const bezposrednie = page.getByRole("button", { name: /bezpośredni/i }).first();
  if (await bezposrednie.isVisible().catch(() => false)) {
    await bezposrednie.click();
    await page.waitForTimeout(120);
  }
  const czasFiltra = Date.now() - tFiltr;

  // „Pokaż więcej" ×5 → 120 kart. Sprawdzamy, czy DOM rośnie liniowo, a nie
  // wybuchowo (każda karta ma stały koszt węzłów).
  for (let i = 0; i < 5; i++) {
    const wiecej = page.getByRole("button", { name: /Pokaż kolejne|Pokaż więcej|więcej ofert/i }).first();
    if (!(await wiecej.isVisible().catch(() => false))) break;
    await wiecej.click();
    await page.waitForTimeout(120);
  }
  const kartyPo = await page.locator("main article[data-offer-card]").count();
  const wezlyPo = await page.evaluate(() => document.getElementsByTagName("*").length);

  const { long, cls } = await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __cls: number };
    return { long: w.__long ?? [], cls: w.__cls ?? 0 };
  });
  const najdluzsze = long.length ? Math.max(...long) : 0;
  const duplikaty = zapytania.length - new Set(zapytania).size;

  console.log(
    `[perf 1000 ofert] pierwsza karta ${doPierwszejKarty} ms | karty ${kartyNaStarcie}→${kartyPo} | ` +
      `węzły DOM ${wezlyNaStarcie}→${wezlyPo} | filtr ${czasFiltra} ms | ` +
      `long tasks ${long.length} (max ${najdluzsze} ms) | CLS ${cls.toFixed(4)} | duplikaty zapytań ${duplikaty}`,
  );

  // Progi celowo z zapasem — to bramka na REGRESJĘ, nie konkurs.
  expect(kartyNaStarcie, "lista renderuje całą pulę zamiast strony").toBeLessThanOrEqual(30);
  expect(wezlyNaStarcie, "za dużo węzłów DOM na starcie").toBeLessThan(3000);
  expect(wezlyPo, "DOM rośnie nieproporcjonalnie po „pokaż więcej”").toBeLessThan(9000);
  expect(czasFiltra, "filtrowanie 1000 ofert trwa zbyt długo").toBeLessThan(1500);
  expect(najdluzsze, "pojedyncze zadanie blokuje wątek > 400 ms").toBeLessThan(400);
  expect(cls, "przeskoki layoutu powyżej progu Core Web Vitals").toBeLessThan(0.1);
  expect(duplikaty, "to samo zapytanie do /api/flights poszło dwa razy").toBe(0);
});
