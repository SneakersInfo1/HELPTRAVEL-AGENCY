/**
 * Testy E2E sekcji hotelowej — scenariusze A–E z briefu §27.
 *
 * Uruchomienie: `pnpm e2e` (serwer musi działać na :3000).
 *
 * Zakres świadomie NIE obejmuje rezerwacji: `BOOKING_FLOW_MODE` jest domyślnie
 * wyłączony, a testy płatności ruszają realne pieniądze.
 */
import { test, expect, type Page } from "@playwright/test";

const SEARCH =
  "/hotele/szukaj?destination=Hurghada&country=Egipt&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";
const HOTEL =
  "/hotele/lp657c0fe8?destination=Hurghada&country=Egipt&checkin=2026-09-15&checkout=2026-09-17&adults=2&rooms=1";

/** Baner cookie zasłania dolną część ekranu — w testach domykamy go od razu. */
async function dismissCookies(page: Page) {
  const btn = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

/** Skan cen trwa kilka sekund; czekamy aż nagłówek pokaże ostateczną liczbę. */
async function waitForScan(page: Page) {
  await expect(page.getByText(/Szukamy najlepszych ofert/)).toBeHidden({ timeout: 45_000 });
}

test.describe("A — wyniki wyszukiwania", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("pierwsze karty pojawiają się przed końcem skanu", async ({ page }) => {
    await page.goto(SEARCH);
    await expect(page.locator('a[href*="/hotele/lp"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test("podczas skanu NIE ma technicznego licznika", async ({ page }) => {
    await page.goto(SEARCH);
    await expect(page.locator('a[href*="/hotele/lp"]').first()).toBeVisible({ timeout: 20_000 });
    // Brief §6: żadnego „1500/2099" ani „Sprawdzam dostępność".
    await expect(page.getByText(/Sprawdzam dostępność/)).toHaveCount(0);

    // Licznika szukamy w WIDOCZNYM tekście i w jego dokładnym kształcie.
    // Wcześniejszy `getByText(/\d+\s*\/\s*\d+/)` trafiał w ładunek RSC
    // wewnątrz `<script>` — czyli w coś, czego gość nigdy nie zobaczy.
    const licznik = await page.evaluate(() =>
      /(^|\s)\d{1,5}\s*\/\s*\d{1,5}(\s|$)/.test(document.body.innerText),
    );
    expect(licznik, "na ekranie jest licznik postępu w postaci N/N").toBe(false);
  });

  test("po skanie jest ostateczna liczba i ANI SŁOWA o braku miejsc", async ({ page }) => {
    await page.goto(SEARCH);
    await waitForScan(page);
    // Brief §5.
    await expect(page.getByText(/bez miejsc/)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hurghada");
    await expect(page.getByText(/\d+\s+(obiekt|obiekty|obiektów)/).first()).toBeVisible();
  });

  test("treść wykorzystuje szerokość 1920 (brief §4)", async ({ page }) => {
    await page.goto(SEARCH);
    await expect(page.locator('a[href*="/hotele/lp"]').first()).toBeVisible({ timeout: 20_000 });
    const m = await page.evaluate(() => {
      const grid = document.querySelector("main .grid") as HTMLElement;
      const r = grid.getBoundingClientRect();
      return { szer: r.width, lewa: r.left, prawa: innerWidth - r.right };
    });
    // Przed przebudową: treść 1216 px, po 352 px pustki z każdej strony.
    expect(m.szer).toBeGreaterThan(1700);
    expect(m.lewa).toBeLessThanOrEqual(60);
    expect(m.prawa).toBeLessThanOrEqual(60);
  });
});

test.describe("B — mapa na desktopie", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("split view: lista obok mapy, znaczniki z cenami", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);

    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });

    // Znaczniki niosą cenę albo licznik grupy — nigdy pustego kółka.
    const marker = page.locator(".maplibregl-marker").first();
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await expect(marker).toHaveText(/zł|obiekt/);

    // Podział 55/45 — mapa musi zajmować istotną część ekranu.
    const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
    expect(box!.width).toBeGreaterThan(600);
    expect(box!.height).toBeGreaterThan(500);
  });

  test("biblioteka mapy jest poza pierwszym pakietem (brief §29)", async ({ page }) => {
    const pobrane: string[] = [];
    page.on("request", (r) => {
      const u = r.url();
      if (/maplibre/i.test(u) || /\/api\/map\/tiles/.test(u)) pobrane.push(u);
    });

    await page.goto(SEARCH);
    await dismissCookies(page);

    // Do chwili, gdy widać PIERWSZE WYNIKI, nic z mapy nie może być pobrane —
    // to jest ta ścieżka krytyczna, o którą chodzi w §29.
    await expect(page.locator('a[href*="/hotele/lp"]').first()).toBeVisible({ timeout: 25_000 });
    expect(pobrane, `pierwsze wyniki pobrały zasoby mapy: ${pobrane.join(", ")}`).toHaveLength(0);

    // ZMIANA V3: po wyrenderowaniu wyników paczka mapy dociąga się w tle
    // (`requestIdleCallback`), żeby klik w „Mapa" był natychmiastowy.
    // Kafelki mają POCZEKAĆ na realne otwarcie mapy.
    await page.waitForTimeout(4000);
    const kafelkiPrzed = pobrane.filter((u) => u.includes("/api/map/tiles")).length;
    expect(kafelkiPrzed, "lista pobrała kafelki mapy, których nikt nie ogląda").toBe(0);

    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    expect(pobrane.filter((u) => u.includes("/api/map/tiles")).length).toBeGreaterThan(0);
  });

  test("klik w znacznik zaznacza odpowiadającą kartę", async ({ page }) => {
    // Zawężone wyszukiwanie (5 gwiazdek + bezpłatna anulacja). Powód jest
    // rzeczowy, nie kosmetyczny: Hurghada bez filtrów to 400+ obiektów na
    // wąskim pasie wybrzeża, więc przy domyślnym kadrze KAŻDY znacznik jest
    // grupą i nie ma czego kliknąć pojedynczo. Rzadsza pula daje pojedyncze
    // znaczniki od razu — a jest to przy okazji realny scenariusz gościa,
    // który wie, czego szuka.
    await page.goto(`${SEARCH}&minStars=5&cancel=free`);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });

    const single = page.locator('.maplibregl-marker[data-kind="single"]').first();
    await expect(single).toBeVisible({ timeout: 25_000 });

    // UCHWYT do konkretnego węzła, nie ponownie rozwiązywany lokator: ceny
    // dojeżdżają strumieniem, więc „pierwszy pojedynczy znacznik" może być
    // innym elementem w chwili odczytu atrybutu i w chwili kliknięcia.
    // Przy takim rozjeździe test porównywał dwa różne hotele i migotał.
    const node = await single.elementHandle();
    const hotelId = await node!.getAttribute("data-hotel-id");
    // `dispatchEvent`, nie `click({force})`. Kliknięcie wymuszone i tak leci
    // na WSPÓŁRZĘDNE, więc w gęstym centrum trafia w znacznik leżący na
    // wierzchu — czyli w inny hotel niż ten, którego identyfikator właśnie
    // odczytaliśmy. Tu sprawdzamy logikę wyboru, a nie trafialność kursora,
    // więc zdarzenie idzie wprost do wskazanego elementu.
    await node!.dispatchEvent("click");

    // Wybrany obiekt pokazuje się jako podgląd na mapie — i jest to TEN hotel,
    // w którego znacznik kliknęliśmy.
    await expect(page.locator(`.shadow-2xl a[href*="${hotelId}"]`)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("C — strona hotelu", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("kolaż ma pięć kafli i nie ładuje wszystkich zdjęć do DOM", async ({ page }) => {
    await page.goto(HOTEL);
    await dismissCookies(page);
    const tiles = page.locator("div.lg\\:grid > button");
    await expect(tiles.first()).toBeVisible({ timeout: 20_000 });
    expect(await tiles.count()).toBeLessThanOrEqual(5);
  });

  test("pełnoekranowa galeria otwiera się i przełącza zdjęcia", async ({ page }) => {
    await page.goto(HOTEL);
    await dismissCookies(page);
    await page.getByRole("button", { name: /Pokaż wszystkie zdjęcia/ }).click();
    // UWAGA: baner cookie też ma `role="dialog"`, więc samo `getByRole` łapie
    // dwa elementy. Zawężamy po nazwie dostępnej.
    const dialog = page.getByRole("dialog").filter({ hasNot: page.getByText("PLIKI COOKIE") });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^1 \/ \d+$/)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByText(/^2 \/ \d+$/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("D — pokoje", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("klik w pokój otwiera modal ze zdjęciami i wariantami", async ({ page }) => {
    await page.goto(HOTEL);
    await dismissCookies(page);
    const trigger = page.getByRole("button", { name: /Zobacz szczegóły pokoju/ }).first();
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.click();

    // UWAGA: baner cookie też ma `role="dialog"`, więc samo `getByRole` łapie
    // dwa elementy. Zawężamy po nazwie dostępnej.
    const dialog = page.getByRole("dialog").filter({ hasNot: page.getByText("PLIKI COOKIE") });
    await expect(dialog).toBeVisible();
    // ZMIANA V3: nagłówkiem modalu jest NAZWA POKOJU, a „Szczegóły pokoju"
    // zeszło do podtytułu — tytuł ma mówić, co gość ogląda, a nie jak nazywa
    // się okno.
    await expect(dialog.getByText("Szczegóły pokoju")).toBeVisible();
    // Warianty taryf muszą być w modalu — inaczej to tylko galeria.
    await expect(dialog.getByRole("link", { name: /Wybierz/ }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("E — telefon", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("wyniki nie przewijają się w poziomie", async ({ page }) => {
    await page.goto(SEARCH);
    await expect(page.locator('a[href*="/hotele/lp"]').first()).toBeVisible({ timeout: 20_000 });
    const o = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    expect(o.s).toBeLessThanOrEqual(o.c);
  });

  test("strona hotelu nie przewija się w poziomie", async ({ page }) => {
    await page.goto(HOTEL);
    await page.waitForTimeout(2500);
    const o = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    expect(o.s).toBeLessThanOrEqual(o.c);
  });

  test("mapa otwiera się na pełny ekran", async ({ page }) => {
    await page.goto(SEARCH);
    await dismissCookies(page);
    await waitForScan(page);
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.getByRole("button", { name: /Wróć do listy/ })).toBeVisible({ timeout: 20_000 });
    const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
    expect(box!.width).toBeGreaterThan(350);
  });
});
