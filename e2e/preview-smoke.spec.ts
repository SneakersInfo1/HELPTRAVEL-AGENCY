/**
 * SMOKE PREVIEW — ponumerowana lista kontrolna.
 *
 * Punkty 1–21 poprzedniej sesji były LICZBĄ W RAPORCIE, nie uruchamialnym
 * plikiem — dlatego nie wyłapały niczego, gdy właściciel ręcznie sprawdził
 * preview. Ten plik jest uruchamialny:
 *
 *     npx playwright test preview-smoke --reporter=list
 *
 * Punkty 22–31 pochodzą wprost z briefu właściciela (2026-08-08, sekcja N),
 * punkty 32–36 domykają macierz zoomu z sekcji G.
 *
 * ZASADA: każdy punkt mierzy PROSTOKĄT albo styl obliczony, nigdy nazwę klasy.
 * Klasę można podmienić i odtworzyć ten sam błąd innym zapisem.
 */
import { test, expect, type Page } from "@playwright/test";

import { ustawZoom, MACIERZ_ZOOMU } from "./_zoom";

const SZUKAJ =
  "/hotele/szukaj?destination=Heraklion&country=Grecja&checkin=2026-08-11&checkout=2026-08-18&adults=2&rooms=1";

const PASEK = '[data-ht="destination-bar"]';
const EKRAN = { width: 1920, height: 1080 };
const GLEBOKOSCI = [0, 250, 500, 800, 1200];

async function odklikZgode(page: Page) {
  const btn = page.getByRole("button", { name: /Tylko niezbędne|Akceptuję wszystkie/ }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function wejdz(page: Page, zoom?: number) {
  if (zoom !== undefined) await ustawZoom(page, EKRAN, zoom);
  await page.goto(SZUKAJ, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(PASEK, { timeout: 60_000 });
  await odklikZgode(page);
  await page.waitForSelector('a[href^="/hotele/"]', { timeout: 60_000 });
  await page.waitForTimeout(1500);
}

async function wejdzWMape(page: Page) {
  const mapa = page.getByRole("button", { name: "Mapa", exact: true });
  await mapa.waitFor({ state: "visible", timeout: 60_000 });
  await mapa.click();
  // Kafelki Geoapify idą przez nasze proxy — zmierzone 2,7–3,0 s do ostatniego.
  await page.waitForTimeout(4000);
}

/** Prostokąt paska + nakładanie z tym, co pod nim stoi. */
async function stanPaska(page: Page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const b = el.getBoundingClientRect();
    const nachodzi = (r: DOMRect) =>
      Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 2 &&
      Math.min(b.right, r.right) - Math.max(b.left, r.left) > 2;

    const karty = [...document.querySelectorAll('a[href^="/hotele/"]')]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 200 && r.height > 80);
    const canvas = document.querySelector("canvas.maplibregl-canvas");

    return {
      position: getComputedStyle(el).position,
      top: Math.round(b.top),
      bottom: Math.round(b.bottom),
      vh: window.innerHeight,
      wSrodku: b.top > window.innerHeight * 0.2 && b.top < window.innerHeight * 0.8,
      kolizjeZKartami: karty.filter(nachodzi).length,
      kolizjaZMapa: canvas ? Number(nachodzi(canvas.getBoundingClientRect())) : 0,
    };
  }, PASEK);
}

/**
 * Tożsamość paska w drzewie — do porównania Lista vs Mapa.
 *
 * Ścieżka liczona TYLKO do `<main>`. Wersja sięgająca `<body>` była chwiejna:
 * `next dev` dokłada do body własną nakładkę (przycisk narzędzi, overlay
 * błędów), a liczba tych węzłów zmienia się w trakcie sesji — indeks
 * rodzeństwa najwyższej ramki skakał z 3 na 23 i test wywracał się, choć
 * w DOM aplikacji nic się nie ruszyło.
 */
async function tozsamoscPaska(page: Page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const kroki: string[] = [];
    let n: HTMLElement | null = el;
    while (n && n.tagName !== "MAIN" && n.tagName !== "BODY") {
      kroki.push(`${n.tagName}:${[...(n.parentElement?.children ?? [])].indexOf(n)}`);
      n = n.parentElement;
    }
    return {
      sciezka: kroki.join("/"),
      yWDokumencie: Math.round(el.getBoundingClientRect().top + window.scrollY),
      position: getComputedStyle(el).position,
    };
  }, PASEK);
}

async function stanMapy(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement | null;
    if (!canvas) return null;
    const kontener = canvas.closest(".maplibregl-map")?.parentElement as HTMLElement;
    const cr = kontener.getBoundingClientRect();
    const kr = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    return {
      kontenerW: Math.round(cr.width),
      kontenerH: Math.round(cr.height),
      canvasW: Math.round(kr.width),
      canvasH: Math.round(kr.height),
      buforW: canvas.width,
      buforH: canvas.height,
      dpr,
      // Bufor musi odpowiadać wymiarowi CSS przemnożonemu przez DPR — inaczej
      // mapa jest rozmyta (bufor za mały) albo marnuje pamięć (za duży).
      bladBuforaW: Math.abs(canvas.width - kr.width * dpr),
      bladBuforaH: Math.abs(canvas.height - kr.height * dpr),
      znaczniki: document.querySelectorAll(".maplibregl-marker").length,
      wOknie: Math.round(kr.bottom) <= window.innerHeight + 2,
    };
  });
}

test.describe("Smoke preview — pasek kierunku", () => {
  test.use({ viewport: EKRAN });

  test("22-24, 28, 30 — pasek jest statyczny, opuszcza okno i nie dotyka kart", async ({ page }) => {
    await wejdz(page, 1);

    // 22 — sposób pozycjonowania.
    const start = await stanPaska(page);
    expect(["static", "relative"], "22: pasek musi być static albo relative").toContain(start.position);

    // 24 — dokładnie jeden pasek w DOM.
    expect(await page.locator(PASEK).count(), "24: w DOM musi być dokładnie jeden pasek kierunku").toBe(1);

    for (const y of GLEBOKOSCI) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(280);
      const p = await stanPaska(page);

      // 28 — nigdy w środku okna.
      expect(p.wSrodku, `28: pasek stoi w środku okna przy scroll ${y} (top=${p.top}, vh=${p.vh})`).toBe(false);
      // 30 — zero nakładania z kartami hoteli.
      expect(p.kolizjeZKartami, `30: pasek nachodzi na kartę hotelu przy scroll ${y}`).toBe(0);
    }

    // 23 — po przewinięciu do 1200 pasek jest NAD oknem.
    const koniec = await stanPaska(page);
    expect(koniec.bottom, `23: pasek nie opuścił okna (bottom=${koniec.bottom})`).toBeLessThanOrEqual(0);
  });

  test("25, 31 — pasek stoi w tym samym miejscu w Liście i w Mapie, nie dotyka mapy", async ({ page }) => {
    await wejdz(page, 1);
    const wLiscie = await tozsamoscPaska(page);

    await wejdzWMape(page);
    const wMapie = await tozsamoscPaska(page);

    // 25 — ta sama ścieżka w drzewie, ta sama wysokość w dokumencie, ten sam
    // sposób pozycjonowania. Przełączenie widoku nie może przenosić paska.
    expect(wMapie.sciezka, "25: tryb mapy przeniósł pasek w inne miejsce drzewa").toBe(wLiscie.sciezka);
    expect(wMapie.position, "25: tryb mapy zmienił sposób pozycjonowania paska").toBe(wLiscie.position);
    expect(
      Math.abs(wMapie.yWDokumencie - wLiscie.yWDokumencie),
      "25: tryb mapy przesunął pasek w dokumencie",
    ).toBeLessThanOrEqual(4);
    expect(await page.locator(PASEK).count(), "25: tryb mapy zduplikował pasek").toBe(1);

    // 31 — zero nakładania z canvasem mapy na każdej głębokości.
    for (const y of GLEBOKOSCI) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(280);
      const p = await stanPaska(page);
      expect(p.kolizjaZMapa, `31: pasek nachodzi na mapę przy scroll ${y}`).toBe(0);
    }
  });
});

test.describe("Smoke preview — mapa przy realnym zoomie przeglądarki", () => {
  test.use({ viewport: EKRAN });

  // 26 + 27 — dla każdego z trzech zoomów wymaganych w briefie (sekcja G:
  // „Browser zoom musi zostać przetestowany realnie przynajmniej dla 80, 100
  // i 125"). 100% jest celem głównym, więc idzie pierwszy.
  for (const zoom of [1, 1.25, 0.8]) {
    const procent = Math.round(zoom * 100);
    test(`26-27 — zoom ${procent}%: canvas mapy wypełnia kontener i rysuje kafelki`, async ({ page }) => {
      await wejdz(page, zoom);
      await wejdzWMape(page);

      const m = await stanMapy(page);
      expect(m, `27: przy zoomie ${procent}% mapa w ogóle się nie zbudowała`).not.toBeNull();
      const mapa = m!;

      // 26 — canvas MUSI wypełniać kontener. Poprzedni test („100% niebiałych
      // pikseli") tego nie dowodził: canvas może być narysowany w całości,
      // a mimo to mniejszy od panelu, w którym siedzi.
      expect(
        Math.abs(mapa.canvasW - mapa.kontenerW),
        `26: przy zoomie ${procent}% szerokość canvasa (${mapa.canvasW}) odbiega od kontenera (${mapa.kontenerW})`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(mapa.canvasH - mapa.kontenerH),
        `26: przy zoomie ${procent}% wysokość canvasa (${mapa.canvasH}) odbiega od kontenera (${mapa.kontenerH})`,
      ).toBeLessThanOrEqual(2);

      // 26 — bufor canvasa musi odpowiadać DPR. To jest ta połowa zoomu,
      // której nie widać po samej zmianie szerokości okna.
      expect(
        mapa.bladBuforaW,
        `26: przy zoomie ${procent}% bufor canvasa (${mapa.buforW}) nie odpowiada ${mapa.canvasW}×DPR ${mapa.dpr}`,
      ).toBeLessThanOrEqual(2);
      expect(
        mapa.bladBuforaH,
        `26: przy zoomie ${procent}% bufor canvasa (${mapa.buforH}) nie odpowiada ${mapa.canvasH}×DPR ${mapa.dpr}`,
      ).toBeLessThanOrEqual(2);

      // 27 — mapa faktycznie coś pokazuje.
      expect(mapa.canvasW, `27: przy zoomie ${procent}% canvas ma zerową szerokość`).toBeGreaterThan(100);
      expect(mapa.canvasH, `27: przy zoomie ${procent}% canvas ma zerową wysokość`).toBeGreaterThan(100);
      expect(mapa.znaczniki, `27: przy zoomie ${procent}% mapa nie postawiła ani jednego znacznika`).toBeGreaterThan(0);
    });
  }
});

test.describe("Smoke preview — mapa otwierana wielokrotnie", () => {
  test.use({ viewport: EKRAN });

  // 37 — dziesięć przełączeń Lista↔Mapa z rzędu.
  //
  // Jednorazowe otwarcie nie dowodzi niczego o cyklu życia MapLibre: wyciek
  // pokazuje się dopiero przy powtórzeniach. Sprawdzamy DWIE rzeczy naraz —
  // czy po każdym otwarciu canvas nadal wypełnia kontener (czyli czy `resize()`
  // wciąż działa po przemontowaniu) oraz czy w DOM nie zostaje drugi canvas
  // po poprzedniej instancji. `hotel-map.tsx` sprząta znaczniki i mapę
  // w `sprzataj()`; ten test pilnuje, że to sprzątanie faktycznie działa.
  test("37 — dziesięć otwarć mapy: canvas zawsze jeden i zawsze wypełnia kontener", async ({ page }) => {
    await wejdz(page, 1);

    for (let i = 1; i <= 10; i++) {
      await wejdzWMape(page);

      const ile = await page.locator("canvas.maplibregl-canvas").count();
      expect(ile, `37: po ${i}. otwarciu w DOM jest ${ile} canvasów mapy zamiast jednego`).toBe(1);

      const m = await stanMapy(page);
      expect(m, `37: przy ${i}. otwarciu mapa się nie zbudowała`).not.toBeNull();
      expect(
        Math.abs(m!.canvasW - m!.kontenerW),
        `37: przy ${i}. otwarciu szerokość canvasa (${m!.canvasW}) odbiega od kontenera (${m!.kontenerW})`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(m!.canvasH - m!.kontenerH),
        `37: przy ${i}. otwarciu wysokość canvasa (${m!.canvasH}) odbiega od kontenera (${m!.kontenerH})`,
      ).toBeLessThanOrEqual(2);
      expect(m!.znaczniki, `37: przy ${i}. otwarciu mapa nie postawiła znaczników`).toBeGreaterThan(0);

      await page.getByRole("button", { name: "Lista", exact: true }).click();
      await page.waitForTimeout(600);
      const poZamknieciu = await page.locator("canvas.maplibregl-canvas").count();
      expect(
        poZamknieciu,
        `37: po ${i}. zamknięciu został osierocony canvas mapy (${poZamknieciu})`,
      ).toBe(0);
    }
  });
});

test.describe("Smoke preview — telefon", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("29 — pasek kierunku opuszcza okno po przewinięciu", async ({ page }) => {
    await wejdz(page);
    for (const y of [0, 200, 400, 600, 900]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(280);
      const p = await stanPaska(page);
      expect(p.wSrodku, `29: pasek stoi w środku ekranu telefonu przy scroll ${y}`).toBe(false);
      expect(p.kolizjeZKartami, `29: pasek nachodzi na kartę hotelu przy scroll ${y}`).toBe(0);
    }
    const koniec = await stanPaska(page);
    expect(koniec.bottom, `29: pasek nie opuścił ekranu telefonu (bottom=${koniec.bottom})`).toBeLessThanOrEqual(0);
  });
});

test.describe("Smoke preview — macierz zoomu dla układu", () => {
  test.use({ viewport: EKRAN });

  // 32–36 — pięć poziomów zoomu z sekcji G briefu. Sprawdzamy dwie rzeczy,
  // które właściciel zgłosił jako różne przy 80% i przy 100%: czy strona nie
  // przewija się w poziomie i czy mapa mieści się w oknie.
  MACIERZ_ZOOMU.forEach((zoom, i) => {
    const procent = Math.round(zoom * 100);
    test(`${32 + i} — zoom ${procent}%: brak poziomego przewijania, mapa mieści się w oknie`, async ({ page }) => {
      await wejdz(page, zoom);

      const poziomoLista = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(
        poziomoLista.scrollW,
        `${32 + i}: przy zoomie ${procent}% widok listy przewija się w poziomie ` +
          `(${poziomoLista.scrollW} > ${poziomoLista.clientW})`,
      ).toBeLessThanOrEqual(poziomoLista.clientW + 2);

      await wejdzWMape(page);

      const poziomoMapa = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(
        poziomoMapa.scrollW,
        `${32 + i}: przy zoomie ${procent}% widok mapy przewija się w poziomie ` +
          `(${poziomoMapa.scrollW} > ${poziomoMapa.clientW})`,
      ).toBeLessThanOrEqual(poziomoMapa.clientW + 2);

      const mapa = await stanMapy(page);
      expect(mapa, `${32 + i}: przy zoomie ${procent}% mapa się nie zbudowała`).not.toBeNull();
      expect(
        mapa!.wOknie,
        `${32 + i}: przy zoomie ${procent}% mapa wystaje poniżej dolnej krawędzi okna`,
      ).toBe(true);
    });
  });
});
