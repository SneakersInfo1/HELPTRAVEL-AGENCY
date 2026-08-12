/**
 * REGRESJA: na telefonie przewijanie zaczęte NA polu „Dokąd" nie otwiera
 * wyboru kierunku, a dotknięcie tego samego pola — otwiera.
 *
 * PRZYCZYNA (potwierdzona w kodzie, nie zgadnięta): stała progu nazywała się
 * `MOBILE_DESTINATION_BREAKPOINT`, a jej zapytanie to `(min-width: 640px)`,
 * czyli `.matches === true` znaczy DESKTOP. Nazwa mówiła odwrotnie niż
 * wartość i przewróciła każdą gałąź, która z niej korzystała — picker
 * otwierał się na telefonie już przy `pointerdown`, czyli w chwili dotknięcia,
 * zanim przeglądarka rozstrzygnęła tap vs przewinięcie.
 *
 * Poprawka z 9 sierpnia (b9a1727) opisywała właściwe zachowanie w komentarzu,
 * ale wstawiła warunek po złej stronie i na telefonie nie zmieniła nic.
 *
 * DRUGA PRZYCZYNA, znaleziona pomiarem w tej samej sesji: samo przeniesienie
 * otwierania na `click` NIE WYSTARCZYŁO. Zmierzona sekwencja prawdziwego
 * dotknięcia to `pointerdown → focus → click → arkusz się montuje → autoFocus
 * arkusza zabiera fokus wyzwalaczowi → onBlur`, a `onBlur` uznawał arkusz za
 * „element poza komponentem" (jego `ref` nie ma jeszcze węzła) i natychmiast
 * go zamykał. Dlatego poprzednie podejście dawało „przewijanie OK, tap zepsuty".
 *
 * OGRANICZENIA TEGO TESTU, uczciwie:
 *   • `Input.synthesizeScrollGesture` (CDP) generuje prawdziwy przeciąg palcem
 *     po polu — zmierzone: `pointerdown, touchstart, 15-21 × pointermove,
 *     pointerup, touchend` — ale w tym Chromium NIE przewija strony (mierzone
 *     `scrollY` zostaje 0 także dla gestu zaczętego na nagłówku, podczas gdy
 *     `mouse.wheel` przewija normalnie). Test sprawdza więc to, co ma
 *     sprawdzać — że PRZECIĄGNIĘCIE PALCEM PO POLU nie otwiera panelu — i nie
 *     udaje, że mierzy natywne przewijanie.
 *   • To nadal Chromium na desktopie, nie fizyczny palec na Androidzie.
 *     Nie zastępuje sprawdzenia na urządzeniu.
 */
import { test, expect, type Page } from "@playwright/test";

const ROZMIARY = [
  { nazwa: "375×812", width: 375, height: 812 },
  { nazwa: "390×844", width: 390, height: 844 },
  { nazwa: "430×932", width: 430, height: 932 },
];

async function dismissCookies(page: Page) {
  // Baner zgód MUSI zniknąć, zanim zaczniemy dotykać ekranu — inaczej
  // przechwytuje gesty i test mierzyłby nakładkę, nie pole kierunku.
  const btn = page
    .getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie|Only necessary|Accept all/i })
    .first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await page.waitForTimeout(200);
}

function picker(page: Page) {
  return page.getByRole("dialog", { name: "Wyszukiwanie kierunku" });
}

function pole(page: Page) {
  return page.locator("[data-mini-planner-destination]").first();
}

async function srodekPola(page: Page): Promise<{ x: number; y: number }> {
  const box = await pole(page).boundingBox();
  if (!box) throw new Error("pole Dokąd nie jest widoczne");
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

for (const rozmiar of ROZMIARY) {
  test.describe(`wybór kierunku na telefonie ${rozmiar.nazwa}`, () => {
    test.use({
      viewport: { width: rozmiar.width, height: rozmiar.height },
      hasTouch: true,
      isMobile: true,
    });

    test("przeciągnięcie palcem ZACZĘTE NA POLU nie otwiera pickera (5/5)", async ({ page }) => {
      await page.goto("/");
      await dismissCookies(page);
      await expect(pole(page)).toBeVisible();
      const cdp = await page.context().newCDPSession(page);

      // Liczymy `pointermove` na polu — dowód, że gest był PRZECIĄGNIĘCIEM,
      // a nie dotknięciem w miejscu. Bez tego test mógłby przechodzić dlatego,
      // że gest w ogóle nie doszedł do elementu.
      await page.evaluate(() => {
        const w = window as unknown as { __ruchy: number };
        w.__ruchy = 0;
        document
          .querySelector("[data-mini-planner-destination]")
          ?.addEventListener("pointermove", () => (w.__ruchy += 1), { passive: true });
      });

      for (let i = 1; i <= 5; i++) {
        await page.evaluate(() => {
          window.scrollTo({ top: 0, behavior: "auto" });
          (window as unknown as { __ruchy: number }).__ruchy = 0;
        });
        await page.waitForTimeout(250);
        const { x, y } = await srodekPola(page);

        await cdp.send("Input.synthesizeScrollGesture", {
          x,
          y,
          xDistance: 0,
          yDistance: -320,
          gestureSourceType: "touch",
          speed: 900,
        });
        await page.waitForTimeout(500);

        const ruchy = await page.evaluate(() => (window as unknown as { __ruchy: number }).__ruchy);
        expect(ruchy, `przebieg ${i}: gest nie dotarł do pola jako przeciągnięcie`).toBeGreaterThan(3);
        await expect(picker(page), `przebieg ${i}: przeciągnięcie otworzyło picker`).toBeHidden();
      }
    });

    test("dotknięcie pola otwiera picker (5/5)", async ({ page }) => {
      await page.goto("/");
      await dismissCookies(page);
      await expect(pole(page)).toBeVisible();

      for (let i = 1; i <= 5; i++) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
        await page.waitForTimeout(250);
        const { x, y } = await srodekPola(page);

        await page.touchscreen.tap(x, y);
        await expect(picker(page), `przebieg ${i}: dotknięcie NIE otworzyło pickera`).toBeVisible({
          timeout: 5_000,
        });

        await page.getByRole("button", { name: "Zamknij" }).first().click();
        await expect(picker(page)).toBeHidden({ timeout: 5_000 });
      }
    });

    test("dotknięcie działa także PO wcześniejszym przeciągnięciu na tym polu", async ({ page }) => {
      await page.goto("/");
      await dismissCookies(page);
      await expect(pole(page)).toBeVisible();
      const cdp = await page.context().newCDPSession(page);

      for (let i = 1; i <= 5; i++) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
        await page.waitForTimeout(250);
        const start = await srodekPola(page);
        await cdp.send("Input.synthesizeScrollGesture", {
          x: start.x,
          y: start.y,
          xDistance: 0,
          yDistance: -240,
          gestureSourceType: "touch",
          speed: 900,
        });
        await page.waitForTimeout(450);
        await expect(picker(page), `przebieg ${i}: przeciągnięcie otworzyło picker`).toBeHidden();

        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
        await page.waitForTimeout(300);
        const cel = await srodekPola(page);
        await page.touchscreen.tap(cel.x, cel.y);
        await expect(picker(page), `przebieg ${i}: tap po przewinięciu nie zadziałał`).toBeVisible({
          timeout: 5_000,
        });
        await page.getByRole("button", { name: "Zamknij" }).first().click();
        await expect(picker(page)).toBeHidden({ timeout: 5_000 });
      }
    });
  });
}
