/**
 * Straż nad tym, czego przebudowa hoteli NIE MIAŁA ruszyć (brief §25).
 *
 * Powłoka serwisu (`site-shell.tsx`) jest wspólna dla całej strony, a sekcja
 * hotelowa dostała w niej wyjątek na szerokość. Ten plik pilnuje, żeby wyjątek
 * został wyjątkiem: homepage, loty, strony treściowe i checkout mają zachować
 * dotychczasowy kontener 1280 px.
 */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1920, height: 1080 } });

/**
 * Szerokość ramy serwisu (`site-shell.tsx`).
 *
 * Namierzana przez `#main-content`, a nie przez „pierwsze dziecko body":
 * przed ramą stoją jeszcze skrypty i link „przejdź do treści", więc pozycja
 * w drzewie nie jest stabilna.
 */
async function szerokoscRamy(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const rama = document.getElementById("main-content")?.parentElement;
    return rama ? Math.round(rama.getBoundingClientRect().width) : -1;
  });
}

/**
 * Szerokość KOLUMNY TREŚCI strony — nie pudełka powłoki.
 *
 * Potrzebna od 2026-09-01. Wcześniej wystarczyła `szerokoscRamy`, bo rama
 * nakładała `max-w-7xl` na wszystko poza homepage, hotelami i lotami. Po
 * przebudowie powłoki (nagłówek musiał być pasem na pełną szerokość, brief §2)
 * rama jest CELOWO pełnoszerokościowa na każdej trasie, a limit należy do
 * `<main>` konkretnej strony — tak jak od dawna w hotelach i lotach.
 *
 * Bez tej miary testy strony miasta i checkoutu raportowały 1920 px i
 * wyglądały na regresję szerokości, choć treść nie drgnęła.
 */
async function szerokoscTresciStrony(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return -1;
    const szerMain = Math.round(main.getBoundingClientRect().width);
    // `<main>` z własnym limitem JEST kolumną treści.
    if (szerMain < window.innerWidth) return szerMain;
    // Jeśli nie ma limitu, jest tylko pełnoszerokościowym tłem (checkout,
    // wyniki hoteli), a limit siedzi na jego BEZPOŚREDNICH dzieciach.
    // Bierzemy najszersze z nich — najwęższe byłoby zwykłą kartą w środku
    // sekcji i mówiłoby o czymś zupełnie innym.
    let najszersze = 0;
    for (const el of Array.from(main.children) as HTMLElement[]) {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > najszersze) najszersze = w;
    }
    return najszersze || szerMain;
  });
}

test("homepage zostaje pełnoszerokościowa i się renderuje", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  // Home celowo nie ma kontenera (`max-w-none`) — sprawdzone od 2026-08-02.
  expect(await szerokoscRamy(page)).toBeGreaterThan(1800);
});

/**
 * Loty: rama ZDJĘTA, szerokość pilnowana u siebie.
 *
 * Do 2026-08-29 ten test wymagał 1280 px, bo tak wyglądał kontrakt przed
 * Flights V2. V2 świadomie zdjął ograniczenie ramy dla `/loty/*`
 * (`site-shell.tsx`, commit c9ed2ec) — zmierzone na 1920: treść 779 px,
 * 59,4 % ekranu białe, karta oferty 463 px. Szerokościami steruje teraz
 * `lib/flights/layout.ts`, osobno dla każdego kroku lejka.
 *
 * Test nie znika, tylko pilnuje NOWEGO kontraktu: rama się nie ogranicza,
 * ale powłoka treści ma twardy sufit. Bez tego przypadkowe `max-w-none`
 * na `main` przeszłoby niezauważone.
 */
test("wyszukiwarka lotów działa; rama zdjęta, ale treść ma sufit 1720", async ({ page }) => {
  // `depart=`, nie `date=`. Stary adres używał parametru, którego strona nie
  // rozumie, więc renderowała ekran „Brak poprawnych parametrów" w wąskiej
  // powłoce 760 px — a test mierzył ramę WOKÓŁ TEGO EKRANU i przechodził
  // z niewłaściwego powodu. Dopiero zdjęcie ograniczenia ramy przez V2 to
  // ujawniło.
  await page.goto("/loty/wyniki?origin=WAW&destination=BCN&depart=2026-09-15&adults=1");
  // Strona ma się wyrenderować bez błędu — treść zależy od dostawcy, więc
  // sprawdzamy powłokę, nie konkretne oferty.
  await expect(page.locator("body")).not.toContainText("Application error", { timeout: 25_000 });
  expect(await szerokoscRamy(page)).toBeGreaterThan(1800);

  const szerokoscTresci = await page.evaluate(() => {
    const m = document.querySelector("main");
    return m ? Math.round(m.getBoundingClientRect().width) : -1;
  });
  expect(szerokoscTresci, "powłoka wyników przekroczyła FLIGHT_SHELL_WIDE").toBeLessThanOrEqual(1720);
  expect(szerokoscTresci, "powłoka wyników zwęziła się do stanu sprzed V2").toBeGreaterThan(1280);
});

test("strona miasta nie dostaje szerokości wyników hoteli", async ({ page }) => {
  await page.goto("/hotele/w/hurghada");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  const szerokosc = await szerokoscTresciStrony(page);

  // GRANICA, KTÓREJ PILNUJE TEN TEST — bez zmian: `/hotele/w/<miasto>` ma DWA
  // segmenty po /hotele/, więc nie łapie się w wyjątek szerokości sekcji
  // hotelowej (1840 px) i nie może go dostać przypadkiem.
  expect(szerokosc, "strona miasta dostała szerokość wyników hoteli").toBeLessThan(1700);

  // ZMIANA WARTOŚCI 2026-09-01 (brief §6). Test wymagał wcześniej ≤1280 px,
  // bo tak wyglądał kontrakt przed przebudową powłoki. Strona miasta to
  // landing z siatkami kart (statystyki 4 kolumny, polecane hotele 3 kolumny,
  // dzielnice, miesiące), a nie długi tekst — należy więc do rodziny
  // MARKETPLACE/DISCOVERY i dostaje `SHELL_DISCOVERY` (1600 px).
  // Ten próg pilnuje, żeby nie wróciła po cichu do 1280.
  expect(szerokosc, "strona miasta zwęziła się z powrotem do 1280").toBeGreaterThan(1280);
});

test("checkout zostaje wąski i skupiony", async ({ page }) => {
  await page.goto("/hotele/rezerwacja");
  await expect(page.locator("body")).not.toContainText("Application error", { timeout: 20_000 });
  // Wymaganie bez zmian — checkout ma zostać wąski. Zmienił się tylko sposób
  // pomiaru: limit siedzi na sekcji w środku `<main>`, bo rama powłoki jest
  // teraz celowo pełnoszerokościowa na każdej trasie.
  expect(await szerokoscTresciStrony(page)).toBeLessThanOrEqual(1280);
});
