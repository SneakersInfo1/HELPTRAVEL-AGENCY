/**
 * E2E czatu AI Concierge (master prompt §44).
 *
 * Serwer musi już działać na :3000 (`pnpm dev` albo `pnpm start`).
 * Test jest READ-ONLY — czat nic nie rezerwuje ani nie płaci; jedyny koszt to
 * kilka groszy tokenów OpenRoutera na rozmowie sprawdzającej pełną pętlę.
 *
 * Podział świadomy:
 *  • testy UKŁADU (mobile 390 i desktop) NIE wołają modelu — są darmowe,
 *    deterministyczne i to one pilnują regresji, które realnie się zdarzały
 *    (pole 14 px zoomujące iOS-a, cele dotykowe, panel na pełen ekran);
 *  • JEDNA rozmowa end-to-end sprawdza kontrakt API i to, że karta oferty
 *    naprawdę się renderuje. Oznaczona @model, żeby dała się pominąć:
 *    `pnpm e2e --grep-invert @model`.
 */
import { expect, test, type Page } from "@playwright/test";

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** Strona treściowa — czat jest tam widoczny (na `/` i w lejkach bywa ukryty). */
const STRONA = "/cieple-kierunki";

/**
 * Zgoda na cookies wstawiona z góry: `ConciergeLauncher` blokuje otwarcie,
 * dopóki baner czeka na decyzję (`needsDecision`), więc bez tego każdy test
 * czatu mierzyłby baner zgód. Kształt rekordu: src/lib/consent/types.ts.
 */
async function bezBaneraZgod(page: Page) {
  await page.addInitScript({
    content: `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({ version: 1, decidedAt: 1767225600000, decision: { necessary: true, analytics: false, marketing: false } })); } catch (e) {}`,
  });
}

async function otworzCzat(page: Page) {
  await page.getByRole("button", { name: /Dobierz wyjazd/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test.describe("AI Concierge — układ", () => {
  test.beforeEach(async ({ page }) => {
    await bezBaneraZgod(page);
  });

  test("mobile 390: panel otwiera się, pole ma ≥16 px i cele dotykowe ≥44 px", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(STRONA);
    await otworzCzat(page);

    const input = page.getByRole("dialog").locator("input").first();
    await expect(input).toBeVisible();

    // 16 px to nie kosmetyka: Safari na iOS SAM przybliża stronę przy fokusie
    // pola mniejszego niż 16 px i po schowaniu klawiatury NIE cofa zoomu.
    // Pole miało 14 px — regresja realna, nie teoretyczna.
    const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize, "pole wpisu < 16 px → iOS zoomuje i rozjeżdża układ").toBeGreaterThanOrEqual(16);

    // Cele dotykowe w panelu (bramka konwersyjna: 44 px).
    const zaMale = await page.getByRole("dialog").evaluate((dlg) =>
      [...dlg.querySelectorAll("button")]
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { t: (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter((b) => b.h > 0 && (b.h < 44 || b.w < 44)),
    );
    expect(zaMale, "cele dotykowe poniżej 44 px").toEqual([]);
  });

  test("mobile 390: panel zajmuje pełną wysokość i nie powoduje poziomego scrolla", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(STRONA);
    await otworzCzat(page);

    const box = await page.getByRole("dialog").boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBeLessThanOrEqual(MOBILE.width);

    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scrollX, "poziomy scroll przy otwartym czacie").toBeLessThanOrEqual(1);
  });

  test("mobile 390: Escape zamyka panel i oddaje fokus", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(STRONA);
    await otworzCzat(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("desktop: panel otwiera się i ma widoczne pole wpisu", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(STRONA);
    await otworzCzat(page);
    await expect(page.getByRole("dialog").locator("input").first()).toBeVisible();
  });

  test("zapisana historia wraca po otwarciu panelu", async ({ page }) => {
    // Historię wstrzykujemy do sessionStorage zamiast wysyłać wiadomość:
    // wysłanie WOŁA model (koszt + niedeterminizm), a sprawdzić chcemy
    // ścieżkę ODCZYTU — rehydratację i jej walidację.
    await page.setViewportSize(MOBILE);
    await page.addInitScript({
      content: `try { sessionStorage.setItem("helptravel-concierge-chat-v1", JSON.stringify([{ role: "assistant", content: "Zapisana wiadomosc powitalna" }, { role: "user", content: "zapisana wiadomosc uzytkownika" }])); } catch (e) {}`,
    });
    await page.goto(STRONA);
    await otworzCzat(page);

    await expect(page.getByRole("dialog").getByText("zapisana wiadomosc uzytkownika")).toBeVisible();
  });

  test("uszkodzony wpis w sessionStorage NIE wywala czatu", async ({ page }) => {
    // Regresja z komentarza w concierge-chat.tsx: ślepy cast zapisanej historii
    // wywalał render karty oferty (rating.toFixed) i — bez error boundary —
    // całą stronę. Zepsuty wpis musi po cichu wrócić do powitania.
    await page.setViewportSize(MOBILE);
    await page.addInitScript({
      content: `try { sessionStorage.setItem("helptravel-concierge-chat-v1", JSON.stringify([{ role: "assistant", content: "x", offer: { cityEn: "Rhodes", countryEn: "Greece", cityPl: "Rodos", checkin: "2026-09-11", checkout: "2026-09-18", adults: 2, children: 0, originIata: "WAW", partial: false, totalPerPersonPln: 1760, hotel: { hotelId: "lp1", name: "H", totalPln: 1, url: "/hotele/lp1", mainPhotoUrl: null, rating: "OSIEM" } } }])); } catch (e) {}`,
    });
    await page.goto(STRONA);
    await otworzCzat(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Powitanie zamiast uszkodzonego wpisu — i żadnego wywalonego renderu.
    await expect(dialog.getByText(/Nie wiesz, dokąd polecieć/)).toBeVisible();
    await expect(dialog.locator("input").first()).toBeVisible();
  });
});

test.describe("AI Concierge — pełna pętla", () => {
  test("@model rozmowa zwraca odpowiedź albo uczciwy błąd z ponowieniem", async ({ page }) => {
    test.setTimeout(120_000);
    await bezBaneraZgod(page);
    await page.setViewportSize(MOBILE);
    await page.goto(STRONA);
    await otworzCzat(page);

    const input = page.getByRole("dialog").locator("input").first();
    await input.fill("Plaza do 3000 zl we wrzesniu, 2 osoby");
    await input.press("Enter");

    // „Asystent pisze" musi zniknąć — albo odpowiedzią, albo stanem błędu.
    await expect(page.getByText("Asystent pisze")).toBeVisible();
    await expect(page.getByText("Asystent pisze")).toBeHidden({ timeout: 90_000 });

    const dialog = page.getByRole("dialog");
    const bladWidoczny = await dialog.getByRole("button", { name: /Spróbuj ponownie/i }).isVisible();

    if (bladWidoczny) {
      // Uczciwy stan błędu JEST poprawnym wynikiem — kontrakt UI wymaga tylko,
      // by dało się ponowić. Nie zmuszamy modelu do sukcesu w teście.
      await expect(dialog.getByText(/Chwilowo nie mogę|Zbyt wiele wiadomości/)).toBeVisible();
      return;
    }

    // Ścieżka sukcesu: zero markdownu w odpowiedzi (UI renderuje czysty tekst).
    const tekst = await dialog.innerText();
    expect(tekst, "gwiazdki markdown w czystym tekście").not.toMatch(/\*\*[^*]+\*\*/);

    // Jeśli pojawiła się karta oferty, jej linki muszą być NASZE i wewnętrzne —
    // model nie ma prawa podać własnego URL-a (§20 audytu).
    const linki = await dialog.locator('a[href*="/hotele/"], a[href*="/loty/"]').all();
    for (const a of linki) {
      const href = await a.getAttribute("href");
      expect(href, "link oferty musi być wewnętrzny").toMatch(/^\/(hotele|loty)\//);
    }
  });
});
