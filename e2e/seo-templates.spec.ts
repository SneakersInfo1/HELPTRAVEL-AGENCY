/**
 * Szablony treści SEO: porównanie, kierunek w miesiącu, hub — w trzech szerokościach.
 *
 *   pnpm build && pnpm start      (albo E2E_BASE=<adres Preview>)
 *   pnpm exec playwright test e2e/seo-templates.spec.ts
 *
 * Sprawdza: brak przewijania w poziomie, widoczny H1, główne CTA nad linią
 * zgięcia na telefonie, CTA z kierunkiem w adresie, brak błędów konsoli, brak
 * żądań do wyszukiwarki/dostawców przy samym wczytaniu, axe (WCAG 2 A/AA)
 * w obrębie <main>, widoczny fokus klawiatury i przejście CTA → wyszukiwarka.
 *
 * Wyszukiwarka hoteli jest PRZECHWYTYWANA (route.fulfill) — test sprawdza adres
 * docelowy, ale nie wysyła zapytania do dostawcy.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TEMPLATES = [
  { name: "porównanie", path: "/porownanie/athens-greece-vs-rome-italy", cta: /^Hotele: Ateny$/, destination: "Athens" },
  { name: "miesiąc", path: "/kierunki/barcelona-spain/styczen", cta: /^Sprawdź hotele w styczniu$/, destination: "Barcelona" },
  { name: "hub", path: "/wyjazdy/city-break", cta: /^Zobacz hotele$/, destination: "Prague" },
] as const;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "768", width: 768, height: 1024, mobile: false },
  { name: "1440", width: 1440, height: 900, mobile: false },
] as const;

const FORBIDDEN_ON_LOAD = /\/api\/(hotels\/(search|rates)|flights|booking|liteapi|stays|trips)|liteapi\.travel|nuitee/i;

async function hideConsentBanner(page: Page) {
  // Baner zgody należy do powłoki serwisu, nie do ocenianego szablonu.
  await page.addStyleTag({ content: '[aria-labelledby="cookie-consent-title"]{display:none!important}' });
}

for (const viewport of VIEWPORTS) {
  test.describe(`szerokość ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile, hasTouch: viewport.mobile });

    for (const template of TEMPLATES) {
      test(`${template.name}: układ, CTA, konsola, żądania, axe`, async ({ page }) => {
        const consoleErrors: string[] = [];
        const forbidden: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("pageerror", (error) => consoleErrors.push(error.message));
        page.on("request", (request) => {
          if (FORBIDDEN_ON_LOAD.test(request.url())) forbidden.push(request.url());
        });

        const response = await page.goto(template.path, { waitUntil: "networkidle" });
        expect(response?.status()).toBe(200);
        await hideConsentBanner(page);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "przewijanie w poziomie").toBeLessThanOrEqual(1);

        const h1 = page.locator("main h1");
        await expect(h1).toHaveCount(1);
        await expect(h1).toBeVisible();

        const cta = page.locator("main a", { hasText: template.cta }).first();
        await expect(cta).toBeVisible();
        const href = (await cta.getAttribute("href")) ?? "";
        expect(href).toContain("/hotele/szukaj?");
        expect(new URL(href, "https://helptravel.pl").searchParams.get("destination")).toBe(template.destination);

        if (viewport.mobile && template.name !== "hub") {
          // Na telefonie główne CTA ma być w pierwszym ekranie (hub ma CTA w hero, karta kierunku niżej).
          const box = await cta.boundingBox();
          expect(box, "CTA bez wymiarów").not.toBeNull();
          expect(box!.y + box!.height, "CTA poniżej pierwszego ekranu").toBeLessThanOrEqual(viewport.height);
          expect(box!.height, "cel dotykowy CTA").toBeGreaterThanOrEqual(44);
        }

        const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const serious = axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
        expect(
          serious.map((violation) => `${violation.id}: ${violation.nodes.length} × ${violation.nodes[0]?.target.join(" ")}`),
          "axe: naruszenia poważne/krytyczne w <main>",
        ).toEqual([]);

        expect(forbidden, "żądania do wyszukiwarki/dostawców przy wczytaniu").toEqual([]);
        expect(consoleErrors, "błędy konsoli").toEqual([]);
      });
    }
  });
}

test.describe("klawiatura i przejście do wyszukiwarki", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("fokus na pierwszym CTA porównania jest widoczny", async ({ page }) => {
    await page.goto("/porownanie/athens-greece-vs-rome-italy", { waitUntil: "networkidle" });
    await hideConsentBanner(page);
    const cta = page.locator("main a", { hasText: /^Hotele: Ateny$/ }).first();
    await cta.focus();
    const outline = await cta.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  for (const template of TEMPLATES) {
    test(`${template.name}: klik CTA prowadzi do wyszukiwarki z kierunkiem (bez zapytania do dostawcy)`, async ({ page }) => {
      const searchRequests: string[] = [];
      await page.route("**/hotele/szukaj**", async (route) => {
        searchRequests.push(route.request().url());
        await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>wyszukiwarka (atrapa)</title><p>ok</p>" });
      });
      await page.goto(template.path, { waitUntil: "networkidle" });
      await hideConsentBanner(page);
      const cta = page.locator("main a", { hasText: template.cta }).first();
      await Promise.all([page.waitForURL(/\/hotele\/szukaj\?/), cta.click()]);
      const url = new URL(page.url());
      expect(url.pathname).toBe("/hotele/szukaj");
      expect(url.searchParams.get("destination")).toBe(template.destination);
      expect(searchRequests.length).toBeGreaterThan(0);
    });
  }
});

// „Szukaj lotów” ze stron treści (17.11.2026): wyszukiwarka lotów na stronie
// głównej otwiera się z wpisanym celem i — na stronie miesiąca — terminem.
// Sam link NIE uruchamia wyszukiwania; adres wyników sprawdzamy po wpisaniu
// lotniska wylotu, a stronę wyników PRZECHWYTUJEMY, żeby nic nie poszło do dostawcy.
const FLIGHT_ENTRIES = [
  { name: "miesiąc", path: "/kierunki/barcelona-spain/styczen", link: /^Szukaj lotów$/, field: "Barcelona", iata: "BCN", dates: true },
  { name: "porównanie", path: "/porownanie/athens-greece-vs-rome-italy", link: /^Rzym$/, field: "Rzym", iata: "ROM", dates: false },
  { name: "przewodnik", path: "/kierunki/barcelona-spain", link: /Sprawdź loty: Barcelona/, field: "Barcelona", iata: "BCN", dates: false },
] as const;

test.describe("przejście do wyszukiwarki lotów z celem i terminem", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const entry of FLIGHT_ENTRIES) {
    test(`${entry.name}: ${entry.dates ? "cel i termin trafiają" : "cel trafia"} do formularza lotów, wyszukiwanie dopiero po decyzji`, async ({ page }) => {
      const providerRequests: string[] = [];
      const resultsRequests: string[] = [];
      await page.route("**/api/flights/**", async (route) => {
        providerRequests.push(route.request().url());
        await route.abort();
      });
      await page.route("**/loty/wyniki**", async (route) => {
        resultsRequests.push(route.request().url());
        await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>wyniki lotów (atrapa)</title><p>ok</p>" });
      });

      await page.goto(entry.path, { waitUntil: "networkidle" });
      await hideConsentBanner(page);
      const link = page.locator("main a", { hasText: entry.link }).first();
      const href = (await link.getAttribute("href")) ?? "";
      const linked = new URLSearchParams(href.split("#")[1] ?? "");
      expect(href.split("#")[0]).toBe("/?tab=loty");
      expect(linked.get("destination")).toBe(entry.iata);
      expect(Boolean(linked.get("depart") && linked.get("return"))).toBe(entry.dates);

      await Promise.all([page.waitForURL(/\/\?tab=loty#/), link.click()]);
      await hideConsentBanner(page);
      await expect(page.locator('[role="tab"][aria-selected="true"]')).toContainText("Loty");
      await expect(page.getByPlaceholder("Miasto lub kraj")).toHaveValue(entry.field);
      const dateButton = page.locator("form button", { hasText: /–/ }).first();
      if (entry.dates) await expect(dateButton).not.toContainText("Wylot – Powrót");
      else await expect(dateButton).toContainText("Wylot – Powrót");
      expect(providerRequests).toEqual([]);
      expect(resultsRequests).toEqual([]);

      if (!entry.dates) return;
      // Po wpisaniu lotniska wylotu formularz prowadzi do wyników z celem i terminem z linku.
      await page.getByLabel("Skąd (lotnisko wylotu)").fill("Warszawa");
      await Promise.all([
        page.waitForURL(/\/loty\/wyniki\?/),
        page.locator("form button[type='submit']", { hasText: "Szukaj lotów" }).click(),
      ]);
      const results = new URL(page.url());
      expect(results.searchParams.get("destination")).toBe(entry.iata);
      expect(results.searchParams.get("depart")).toBe(linked.get("depart"));
      expect(results.searchParams.get("return")).toBe(linked.get("return"));
      expect(results.searchParams.get("origin")).toMatch(/WAW/);
      expect(providerRequests).toEqual([]);
    });
  }
});
