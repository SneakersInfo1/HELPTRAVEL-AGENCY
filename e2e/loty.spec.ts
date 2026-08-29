// E2E lejka lotów (Flights V2).
//
// ZASADA BEZPIECZEŃSTWA: te testy NIGDY nie dotykają prebooka ani płatności —
// prebook tworzy lock taryfy u dostawcy i otwiera PaymentIntent, a brief §43
// zabrania realnych rezerwacji i obciążeń. Kończymy na formularzu pasażerów
// i na sprawdzeniu WALIDACJI, która nie wychodzi poza przeglądarkę.
// Wyszukiwanie i verify są read-only i wolno je wołać.
//
// Serwer podnosisz sam (`pnpm dev` albo `pnpm start`), jak w pozostałych
// spec-ach tego repo — patrz `playwright.config.ts`.

import { expect, test, type Page } from "@playwright/test";

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

const SEARCH =
  "/loty/wyniki?origin=WAW&originLabel=Warszawa&destination=BCN&destLabel=Barcelona" +
  "&depart=2026-09-20&return=2026-09-27&adults=2";

/** Wejście na wyniki + poczekanie na pierwszą realną kartę oferty. */
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

test.describe("Wyniki lotów", () => {
  test("karta oferty niesie komplet informacji do decyzji", async ({ page }) => {
    await otworzWyniki(page);
    const karta = page.locator("main article[data-offer-card]").first();

    // Godziny, kody lotnisk, czas, przesiadki, przewoźnik, cena, CTA.
    await expect(karta).toContainText(/\d{2}:\d{2}/);
    await expect(karta).toContainText(/[A-Z]{3}/);
    await expect(karta).toContainText(/\d+ h \d{2} min/);
    await expect(karta).toContainText(/bezpośredni|przesiadk/);
    await expect(karta.getByRole("button", { name: "Wybierz" })).toBeVisible();
    // Kwota po polsku, z „zł" — nie „PLN", nie kropka dziesiętna.
    await expect(karta).toContainText(/\d(\s| )?\d*\s?zł/);
  });

  test("desktop 1920: karta wykorzystuje szerokość ekranu, nagłówek jest pasem", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await otworzWyniki(page);

    const geo = await page.evaluate(() => {
      const h = document.querySelector("header")!;
      const card = document.querySelector("main article[data-offer-card]")!;
      const main = document.querySelector("main")!;
      return {
        radius: getComputedStyle(h).borderTopLeftRadius,
        headerW: Math.round(h.getBoundingClientRect().width),
        cardW: Math.round(card.getBoundingClientRect().width),
        gutterPct: Math.round(((window.innerWidth - main.getBoundingClientRect().width) / window.innerWidth) * 100),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    // Pływająca pastylka miała 19,2 px promienia — nagłówek lotów ma być pasem.
    expect(Number.parseFloat(geo.radius)).toBeLessThanOrEqual(4);
    expect(geo.headerW).toBeGreaterThan(1800);
    // Przed przebudową: 463 px karty i 59 % białego ekranu.
    expect(geo.cardW).toBeGreaterThan(900);
    expect(geo.gutterPct).toBeLessThanOrEqual(12);
    expect(geo.overflow).toBe(false);
  });

  test("mobile 390: brak poziomego przewijania i sensowna gęstość listy", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzWyniki(page);

    const m = await page.evaluate(() => {
      const card = document.querySelector("main article[data-offer-card]")!.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        cardH: Math.round(card.height),
        firstCardTop: Math.round(card.top + window.scrollY),
      };
    });
    expect(m.overflow).toBe(false);
    // Przed przebudową: 402 px na kartę i pierwsza oferta poniżej 840 px.
    expect(m.cardH).toBeLessThanOrEqual(340);
    expect(m.firstCardTop).toBeLessThan(600);
  });

  test("sortowanie zmienia kolejność, a najtańsza oferta faktycznie jest najtańsza", async ({ page }) => {
    await otworzWyniki(page);
    const cena = async () =>
      page.evaluate(() => {
        const el = document.querySelector("main article[data-offer-card]");
        const txt = el?.textContent ?? "";
        const m = txt.match(/(\d[\d \s]*(?:,\d{2})?)\s*zł/);
        return m ? Number.parseFloat(m[1].replace(/[ \s]/g, "").replace(",", ".")) : NaN;
      });

    await page.getByLabel("Sortowanie ofert").selectOption("price");
    await page.waitForTimeout(400);
    const najtansza = await cena();

    await page.getByLabel("Sortowanie ofert").selectOption("duration");
    await page.waitForTimeout(400);
    const najszybsza = await cena();

    expect(Number.isNaN(najtansza)).toBe(false);
    // Sort po cenie musi dać ofertę nie droższą niż sort po czasie.
    expect(najtansza).toBeLessThanOrEqual(najszybsza);
  });

  test("filtr „bezpośrednie” zawęża listę i pokazuje licznik aktywnych filtrów", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await otworzWyniki(page);

    const przed = await page.locator("main article[data-offer-card]").count();
    const bezposrednie = page.getByRole("checkbox", { name: /Bezpośrednie/ });
    test.skip((await bezposrednie.count()) === 0, "ta trasa nie ma filtra przesiadek");
    await bezposrednie.first().check();
    await page.waitForTimeout(400);

    await expect(page.getByRole("button", { name: /Wyczyść wszystko/ })).toBeVisible();
    const po = await page.locator("main article[data-offer-card]").count();
    expect(po).toBeLessThanOrEqual(przed);
    // Każda pozostała karta musi być bezpośrednia w obie strony.
    const teksty = await page.locator("main article[data-offer-card]").allTextContents();
    for (const t of teksty.slice(0, 5)) expect(t).not.toMatch(/przesiadk/);
  });

  // Wartości `FLIGHT_CONTROLS_STICKY_TOP` są twarde (zmierzone: nagłówek 65/73 px
  // + pasek wyszukiwania 69 px). Ten test jest ich jedynym zabezpieczeniem:
  // pierwsza wersja przyklejała OBA paski do tej samej krawędzi i pasek
  // wyszukiwania po prostu przykrywał filtry.
  test("pasek filtrów zostaje widoczny i klikalny po przewinięciu listy", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzWyniki(page);
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 1500);
    });
    await page.waitForTimeout(400);

    const stan = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
        (b.textContent ?? "").trim().startsWith("Filtry"),
      );
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      const naWierzchu = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        widoczny: r.top >= 0 && r.bottom <= window.innerHeight,
        klikalny: Boolean(naWierzchu && (btn.contains(naWierzchu) || naWierzchu === btn)),
      };
    });
    expect(stan?.widoczny).toBe(true);
    expect(stan?.klikalny).toBe(true);
  });

  test("filtry na mobile otwierają się arkuszem i dają się zamknąć", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzWyniki(page);

    await page.getByRole("button", { name: /^Filtry$/ }).click();
    const arkusz = page.getByRole("dialog", { name: "Filtry lotów" });
    await expect(arkusz).toBeVisible();
    await expect(arkusz.getByRole("button", { name: /Pokaż \d+ ofert/ })).toBeVisible();
    await page.getByRole("button", { name: "Zamknij filtry" }).click();
    await expect(arkusz).toBeHidden();
  });
});

test.describe("Krok taryfy", () => {
  test("wybór lotu prowadzi do taryf; ceny mają grosze i widać różnice bagażowe", async ({ page }) => {
    await otworzWyniki(page);
    await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
    await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });

    await expect(page.getByRole("heading", { name: "Bagaż i taryfa" })).toBeVisible();
    // Wskaźnik kroku — użytkownik ma wiedzieć, gdzie jest (§28).
    await expect(page.getByRole("navigation", { name: "Postęp rezerwacji" })).toBeVisible();
    // Podsumowanie lotu, nie sam identyfikator oferty.
    await expect(page.getByText("Twój lot")).toBeVisible();
    await expect(page.locator("main")).toContainText(/Bagaż podręczny/);
    await expect(page.locator("main")).toContainText(/Bagaż rejestrowany/);
  });

  test("mobile: kwota i akcja są widoczne bez przewijania", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzWyniki(page);
    await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
    await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
    await page.waitForTimeout(600);

    const widok = await page.evaluate(() => {
      const bar = document.querySelector(".fixed.inset-x-0.bottom-0");
      if (!bar) return null;
      const r = bar.getBoundingClientRect();
      return { widoczny: r.top < window.innerHeight && r.bottom > 0, tekst: bar.textContent ?? "" };
    });
    expect(widok?.widoczny).toBe(true);
    expect(widok?.tekst).toMatch(/zł/);
    expect(widok?.tekst).toMatch(/Dalej do danych|Chwila/);
  });
});

test.describe("Dane podróżnych", () => {
  test.beforeEach(async ({ page }) => {
    await otworzWyniki(page);
    await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
    await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
    // Wchodzimy WPROST, bez verify — kontekst jest już w sessionStorage.
    // Nie klikamy „Dalej", żeby nie mnożyć wywołań dostawcy.
    await page.goto("/loty/pasazerowie", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main form")).toBeVisible({ timeout: 30_000 });
  });

  test("pusty formularz nie idzie dalej: pokazuje błędy i przewija do pierwszego", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Submit przez sticky pasek (droga mobilna).
    await page.getByRole("button", { name: /Do płatności/ }).click();
    await page.waitForTimeout(700);

    await expect(page.getByText("Wpisz imię").first()).toBeVisible();
    await expect(page.getByText("Zaakceptuj regulamin i politykę prywatności")).toBeVisible();
    // Nie opuściliśmy strony — żadnego prebooka.
    await expect(page).toHaveURL(/\/loty\/pasazerowie/);

    // Pierwsze błędne pole musi być W POLU WIDZENIA (przed poprawką auto-scroll
    // czytał stary stan i nie przewijał w ogóle).
    const wPolu = await page.evaluate(() => {
      const el = document.getElementById("field-p0.firstName");
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top > 0 && r.bottom < window.innerHeight;
    });
    expect(wPolu).toBe(true);
  });

  test("pola mają autofill i właściwe klawiatury (telefon = tel, e-mail = email)", async ({ page }) => {
    const pola = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main input")).map((i) => {
        const el = i as HTMLInputElement;
        return { id: el.id, type: el.type, autocomplete: el.getAttribute("autocomplete"), inputmode: el.getAttribute("inputmode") };
      }),
    );
    const imie = pola.find((p) => p.id === "p0-first");
    const email = pola.find((p) => p.id === "c-email");
    const tel = pola.find((p) => p.id === "c-phone");

    expect(imie?.autocomplete).toContain("given-name");
    expect(email?.type).toBe("email");
    expect(tel?.type).toBe("tel");
    expect(tel?.inputmode).toBe("tel");
  });

  test("dokument wygasający przed podróżą jest odrzucany po stronie klienta", async ({ page }) => {
    await page.fill("#p0-first", "Jan");
    await page.fill("#p0-last", "Kowalski");
    await page.fill("#p0-bday", "1990-05-04");
    await page.selectOption("#p0-gender", "M");
    await page.fill("#p0-docnum", "AB1234567");
    // Data ważności PRZED datą powrotu (2026-09-27).
    await page.fill("#p0-docexp", "2026-09-01");
    await page.getByRole("button", { name: /Do płatności|Przejdź do płatności/ }).first().click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Dokument musi być ważny po dacie podróży").first()).toBeVisible();
    await expect(page).toHaveURL(/\/loty\/pasazerowie/);
  });

  test("mobile: cena i CTA widoczne od razu, bez przewijania przez formularz", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const bar = await page.evaluate(() => {
      const el = document.querySelector(".fixed.inset-x-0.bottom-0");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { widoczny: r.top < window.innerHeight, tekst: el.textContent ?? "" };
    });
    expect(bar?.widoczny).toBe(true);
    expect(bar?.tekst).toMatch(/zł/);
  });
});

test.describe("Kolizje i dostępność", () => {
  test("w lejku lotów nie ma dymka konsjerża, a sticky CTA jest naprawdę klikalne", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzWyniki(page);

    // Konsjerż siedział na cenie taryfy „Smart" (zmierzone na 390 px), więc
    // w lejku lotów go nie ma. `QuickSearchLauncher` był wyłączony od początku.
    const dymek = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *")).some(
        (e) =>
          getComputedStyle(e).position === "fixed" &&
          /z-40 flex flex-col items-end/.test(String((e as HTMLElement).className)),
      ),
    );
    expect(dymek).toBe(false);

    await page.locator("main article[data-offer-card]").first().getByRole("button", { name: "Wybierz" }).click();
    await page.waitForURL(/\/loty\/dodatki/, { timeout: 30_000 });
    await page.waitForTimeout(600);

    // Sticky pasek musi być nie tylko WIDOCZNY, ale i klikalny — Playwright
    // odmawia kliknięcia, gdy cokolwiek przechwytuje zdarzenia w tym punkcie.
    // Dokładnie tak wyszło, że robił to baner zgód.
    await page.getByRole("button", { name: /Dalej do danych/ }).last().click({ trial: true });

    // Sticky pasek Z DEFINICJI przykrywa to, co akurat jest przy dolnej
    // krawędzi — to nie jest defekt, tylko sposób działania paska. Defektem
    // byłoby, gdyby coś zostało zasłonięte NA STAŁE, czyli po dojechaniu na sam
    // dół. Dlatego najpierw scrollujemy do końca (bez płynnego przewijania,
    // które psuje pomiar), a dopiero potem sprawdzamy przykrycie.
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(500);

    const zasłonięte = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll("main label p"))) {
        const t = el.textContent ?? "";
        if (!/zł/.test(t)) continue;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) continue;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (top && !el.contains(top) && !top.contains(el)) out.push(t.trim());
      }
      return out;
    });
    expect(zasłonięte).toEqual([]);
  });

  test("modal filtrów jest zamykalny z klawiatury i ma semantykę dialogu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzWyniki(page);
    await page.getByRole("button", { name: /^Filtry$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Filtry lotów" });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await page.getByRole("button", { name: "Zamknij filtry" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
  });

  test("arkusz filtrów zamyka się Escape i oddaje fokus przyciskowi", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzWyniki(page);
    await page.getByRole("button", { name: /^Filtry$/ }).click();
    await expect(page.getByRole("dialog", { name: "Filtry lotów" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Filtry lotów" })).toBeHidden();
    const focus = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim());
    expect(focus).toContain("Filtry");
  });

  test("cele dotykowe na mobile mają co najmniej 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzWyniki(page);
    const zaMałe = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main button, main a[href], main select"))
        .map((e) => ({ t: (e.textContent ?? "").trim().slice(0, 25), r: e.getBoundingClientRect() }))
        .filter((x) => x.r.width > 0 && x.r.height > 0 && x.r.height < 44)
        .map((x) => `${x.t} (${Math.round(x.r.height)}px)`),
    );
    // „Szczegóły lotu" jest linkiem tekstowym w pasie o wysokości ≥44 px —
    // gdyby coś zeszło niżej, chcemy o tym wiedzieć.
    expect(zaMałe).toEqual([]);
  });
});
