/**
 * REGRESJA: pasek kierunku nie może podążać za przewijaniem.
 *
 * Zgłoszenie właściciela (2026-08-08, ręczna weryfikacja preview): pasek
 * „Heraklion · Grecja | 11 sierpnia – 18 sierpnia | 2 os. | Edytuj" pojawiał
 * się W ŚRODKU EKRANU podczas przewijania i wchodził na kartę hotelu.
 *
 * DLACZEGO POPRZEDNIE TESTY TEGO NIE ZŁAPAŁY. Przebieg zgłaszał 640/640 testów
 * jednostkowych i 33/33 E2E, a błąd był widoczny gołym okiem. Istniejący test
 * („pasek wyszukiwania przykleja się dokładnie pod nagłówkiem") sprawdzał, czy
 * pasek JEST przyklejony — czyli utrwalał zachowanie, które właściciel zgłosił
 * jako błąd. Żaden test nie mierzył prostokąta paska PO PRZEWINIĘCIU.
 *
 * Stan przed poprawką, zmierzony (Chrome 1920×1080, zoom 100%):
 *   position: sticky, top: 82px
 *   scroll    0 → top  82   scroll  800 → top 82
 *   scroll  250 → top  82   scroll 1200 → top 82
 *   scroll  500 → top  82   scroll 2000 → top 82   (nakładanie z kartą: 1)
 * Górna krawędź stała na 82 px przy KAŻDEJ głębokości przewinięcia.
 *
 * Ten plik mierzy prostokąt, a nie klasy CSS: klasę można podmienić, a błąd
 * odtworzyć innym zapisem. Liczy się to, gdzie element JEST na ekranie.
 */
import { test, expect, type Page } from "@playwright/test";

import { ustawZoom } from "./_zoom";

const SZUKAJ =
  "/hotele/szukaj?destination=Heraklion&country=Grecja&checkin=2026-08-11&checkout=2026-08-18&adults=2&rooms=1";

/** Jedyny stabilny uchwyt paska — nadany w hotele/szukaj/page.tsx. */
const PASEK = '[data-ht="destination-bar"]';

const EKRAN = { width: 1920, height: 1080 };

async function odklikZgode(page: Page) {
  const btn = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function wejdz(page: Page, zoom = 1) {
  await ustawZoom(page, EKRAN, zoom);
  await page.goto(SZUKAJ, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(PASEK, { timeout: 60_000 });
  await odklikZgode(page);
  // Karty muszą się wyrenderować, inaczej strona jest za krótka, żeby ją
  // przewinąć, i test przechodziłby z powodu braku treści.
  await page.waitForSelector('a[href^="/hotele/"]', { timeout: 60_000 });
  await page.waitForTimeout(1500);
}

interface Pomiar {
  position: string;
  top: number;
  bottom: number;
  vh: number;
  scrollY: number;
  /** Górna krawędź względem DOKUMENTU — dla elementu statycznego jest stała. */
  topWDokumencie: number;
  nakladanieZKartami: number;
  nakladanieZMapa: number;
}

async function zmierz(page: Page): Promise<Pomiar> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const b = el.getBoundingClientRect();

    const nachodzi = (inny: DOMRect) => {
      const y = Math.min(b.bottom, inny.bottom) - Math.max(b.top, inny.top);
      const x = Math.min(b.right, inny.right) - Math.max(b.left, inny.left);
      return y > 2 && x > 2;
    };

    const karty = [...document.querySelectorAll('a[href^="/hotele/"]')]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 200 && r.height > 80);

    const canvas = document.querySelector("canvas.maplibregl-canvas");

    return {
      position: getComputedStyle(el).position,
      top: Math.round(b.top),
      bottom: Math.round(b.bottom),
      vh: window.innerHeight,
      scrollY: Math.round(window.scrollY),
      topWDokumencie: Math.round(b.top + window.scrollY),
      nakladanieZKartami: karty.filter(nachodzi).length,
      nakladanieZMapa: canvas && nachodzi(canvas.getBoundingClientRect()) ? 1 : 0,
    };
  }, PASEK);
}

async function przewin(page: Page, y: number) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(300);
}

/**
 * Wspólne twierdzenia dla jednego przebiegu przewijania.
 *
 * @param glebokosci kolejne pozycje `scrollTo`; ostatnia musi wyprowadzić
 *                   pasek ponad okno.
 */
async function sprawdzPrzewijanie(page: Page, glebokosci: number[], etykieta: string) {
  const start = await zmierz(page);

  // 1. Sposób pozycjonowania. `sticky`/`fixed` to jedyne wartości, przy których
  //    element może podążać za przewijaniem.
  expect(start.position, `${etykieta}: pasek nie może być sticky/fixed`).not.toBe("sticky");
  expect(start.position, `${etykieta}: pasek nie może być sticky/fixed`).not.toBe("fixed");

  const slad: number[] = [start.top];
  for (const y of glebokosci) {
    await przewin(page, y);
    const p = await zmierz(page);
    slad.push(p.top);

    // 0. NAJMOCNIEJSZY warunek: element statyczny nie zmienia pozycji względem
    //    DOKUMENTU. Łapie każdy wariant błędu — `sticky`, `fixed`, transform
    //    przeliczany w JS — bo mierzy skutek, nie zapis w CSS. Pasek
    //    przyklejony miałby tu wartość rosnącą razem z przewinięciem.
    expect(
      Math.abs(p.topWDokumencie - start.topWDokumencie),
      `${etykieta}: pasek ZMIENIŁ pozycję w dokumencie przy scroll ${y} ` +
        `(${start.topWDokumencie} → ${p.topWDokumencie}) — czyli podąża za przewijaniem`,
    ).toBeLessThanOrEqual(4);

    // 2. Pasek nie może wisieć w środku ekranu — to jest dokładnie ten obraz,
    //    który właściciel zgłosił.
    const wSrodku = p.top > p.vh * 0.2 && p.top < p.vh * 0.8;
    expect(wSrodku, `${etykieta}: pasek stoi w środku okna przy scroll ${y} (top=${p.top}, vh=${p.vh})`).toBe(false);

    // 3. Nigdy nie wolno mu wejść na kartę hotelu ani na mapę.
    expect(p.nakladanieZKartami, `${etykieta}: pasek nachodzi na kartę hotelu przy scroll ${y}`).toBe(0);
    expect(p.nakladanieZMapa, `${etykieta}: pasek nachodzi na mapę przy scroll ${y}`).toBe(0);
  }

  // 4. Po pełnym przewinięciu pasek musi być NAD oknem.
  const koniec = await zmierz(page);
  expect(koniec.bottom, `${etykieta}: pasek nie opuścił okna (bottom=${koniec.bottom})`).toBeLessThanOrEqual(0);

  // 5. Pozycja NIE MOŻE być stała. To łapie wariant błędu, w którym ktoś
  //    zamiast `sticky` użyje np. transformu albo JS-a przeliczającego `top`:
  //    prostokąt stałby w miejscu, choć `position` byłby „static".
  const unikalne = new Set(slad);
  expect(
    unikalne.size,
    `${etykieta}: górna krawędź paska nie drgnęła przez całe przewijanie (${slad.join(", ")})`,
  ).toBeGreaterThan(1);

  // 6. Pasek musi jechać RAZEM ze stroną. Liczone od pozycji w dokumencie, bo
  //    tryb mapy sam ustawia widok (`kotwicaMapy`) i pomiar startowy nie musi
  //    być zrobiony przy scrollY = 0.
  const oczekiwane = koniec.topWDokumencie - koniec.scrollY;
  expect(
    Math.abs(koniec.top - oczekiwane),
    `${etykieta}: pasek nie przewinął się razem z treścią (jest ${koniec.top}, powinno ${oczekiwane})`,
  ).toBeLessThanOrEqual(4);
}

test.describe("Pasek kierunku — regresja przewijania (desktop 1920×1080 @ 100%)", () => {
  test.use({ viewport: EKRAN });

  test("widok LISTA — pasek wyjeżdża nad okno i nie dotyka kart", async ({ page }) => {
    await wejdz(page, 1);
    await sprawdzPrzewijanie(page, [250, 500, 800, 1200], "lista");
  });

  test("widok MAPA — pasek zachowuje się identycznie", async ({ page }) => {
    await wejdz(page, 1);
    const mapa = page.getByRole("button", { name: "Mapa", exact: true });
    await mapa.waitFor({ state: "visible", timeout: 60_000 });
    await mapa.click();
    await page.waitForTimeout(4000);
    await sprawdzPrzewijanie(page, [250, 500, 800, 1200], "mapa");
  });

  test("przełączenie Lista→Mapa→Lista nie duplikuje ani nie przykleja paska", async ({ page }) => {
    await wejdz(page, 1);

    const policz = () => page.locator(PASEK).count();
    /** Pozycja paska W DOKUMENCIE — niezależna od tego, jak strona jest przewinięta. */
    const wDokumencie = () =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        return {
          y: Math.round(el.getBoundingClientRect().top + window.scrollY),
          position: getComputedStyle(el).position,
          // Ścieżka w drzewie — łapie przeniesienie paska w inne miejsce DOM.
          //
          // Liczona TYLKO do `<main>`, nie do `<body>`. Wersja sięgająca body
          // była chwiejna: `next dev` dokłada do body własną nakładkę
          // („Open Next.js Dev Tools", overlay błędów), a liczba tych węzłów
          // zmienia się w trakcie sesji — indeks rodzeństwa najwyższej ramki
          // skakał wtedy z 3 na 23 i test wywracał się, choć w DOM aplikacji
          // nic się nie ruszyło. Zakres do `<main>` opisuje dokładnie to,
          // czego test pilnuje: czy pasek stoi w tym samym miejscu NASZEGO
          // drzewa.
          sciezka: (() => {
            const kroki: string[] = [];
            let n: HTMLElement | null = el;
            while (n && n.tagName !== "MAIN" && n.tagName !== "BODY") {
              kroki.push(`${n.tagName}:${[...(n.parentElement?.children ?? [])].indexOf(n)}`);
              n = n.parentElement;
            }
            return kroki.join("/");
          })(),
        };
      }, PASEK);

    expect(await policz(), "na starcie musi być dokładnie jeden pasek").toBe(1);
    const przed = await wDokumencie();

    const mapa = page.getByRole("button", { name: "Mapa", exact: true });
    await mapa.waitFor({ state: "visible", timeout: 60_000 });
    await mapa.click();
    await page.waitForTimeout(3000);

    expect(await policz(), "w trybie mapy nadal dokładnie jeden pasek").toBe(1);
    const wMapie = await wDokumencie();
    expect(wMapie.position, "tryb mapy nie może przykleić paska").toBe(przed.position);
    expect(wMapie.sciezka, "tryb mapy nie może przenieść paska w drzewie").toBe(przed.sciezka);

    await page.getByRole("button", { name: "Lista", exact: true }).click();
    await page.waitForTimeout(2000);

    expect(await policz(), "po powrocie do listy nadal jeden pasek").toBe(1);
    const po = await wDokumencie();
    expect(po.position, "powrót do listy nie może przykleić paska").toBe(przed.position);
    expect(po.sciezka, "powrót do listy nie może przenieść paska w drzewie").toBe(przed.sciezka);
    expect(Math.abs(po.y - przed.y), "pasek wrócił na inną wysokość dokumentu").toBeLessThanOrEqual(4);
  });
});

test.describe("Pasek kierunku — regresja przewijania (telefon 390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("pasek wyjeżdża nad okno i nie wchodzi na kartę hotelu", async ({ page }) => {
    // Bez zoomu CDP: na telefonie liczy się układ, a nie skala przeglądarki.
    await page.goto(SZUKAJ, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(PASEK, { timeout: 60_000 });
    await odklikZgode(page);
    await page.waitForSelector('a[href^="/hotele/"]', { timeout: 60_000 });
    await page.waitForTimeout(1500);

    await sprawdzPrzewijanie(page, [200, 400, 600, 900], "telefon");
  });

  test("pasek nie zasłania przycisku „Filtry i sortowanie”", async ({ page }) => {
    await page.goto(SZUKAJ, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(PASEK, { timeout: 60_000 });
    await odklikZgode(page);
    await page.waitForSelector('a[href^="/hotele/"]', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await przewin(page, 600);

    const kolizja = await page.evaluate((sel) => {
      const pasek = (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
      const filtry = [...document.querySelectorAll("button")].find((b) =>
        /Filtry i sortowanie/i.test(b.textContent ?? ""),
      );
      if (!filtry) return null;
      const f = filtry.getBoundingClientRect();
      const y = Math.min(pasek.bottom, f.bottom) - Math.max(pasek.top, f.top);
      const x = Math.min(pasek.right, f.right) - Math.max(pasek.left, f.left);
      return y > 2 && x > 2;
    }, PASEK);

    if (kolizja !== null) expect(kolizja, "pasek nachodzi na przycisk filtrów").toBe(false);
  });
});
