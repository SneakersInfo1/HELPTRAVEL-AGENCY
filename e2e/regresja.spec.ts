/**
 * Straż nad szerokościami rodzin tras.
 *
 * POWSTAŁ przy przebudowie hoteli (2026-08, brief §25), kiedy rama powłoki
 * nakładała `max-w-7xl` na wszystko poza homepage, a sekcja hotelowa dostała
 * w niej wyjątek. Plik pilnował wtedy, żeby wyjątek został wyjątkiem.
 *
 * OD 2026-09 rama nie ogranicza szerokości NIGDZIE i nie ma już wyjątków —
 * szerokość należy do `<main>` każdej strony (`lib/{ui,hotels,flights}/layout.ts`).
 * Plik pilnuje więc czegoś innego, ale równie konkretnego: każda rodzina tras
 * trzyma się SWOJEJ szerokości i nie przejmuje cudzej. Homepage pełna, loty
 * z sufitem 1720, discovery szerokie, checkout wąski.
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

test("strona miasta jest szeroka i mieści się w systemie discovery", async ({ page }) => {
  await page.goto("/hotele/w/hurghada");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  const szerokosc = await szerokoscTresciStrony(page);

  // HISTORIA TEGO PROGU — warto ją znać, zanim ktoś go znowu ruszy:
  //
  //  • do 2026-09-01 wymagał ≤1280 px. Pilnował, żeby wyjątek szerokości
  //    zrobiony w ramie powłoki dla `/hotele/szukaj` i `/hotele/<id>` NIE
  //    wyciekł na `/hotele/w/<miasto>`, które ma dwa segmenty po /hotele/.
  //  • rama nie ma już żadnego wyjątku do wycieknięcia — nie ogranicza
  //    szerokości nigdzie, więc tamten mechanizm przestał istnieć.
  //  • strona miasta to landing z siatkami kart (statystyki 4 kolumny,
  //    polecane hotele 3 kolumny, dzielnice, miesiące), a nie długi tekst,
  //    więc należy do rodziny MARKETPLACE/DISCOVERY.
  //
  // Test pilnuje dziś tego, co nadal może się zepsuć: że strona miasta jest
  // SZEROKA (nie wróciła po cichu do 1280) i że nie ma własnej, wymyślonej
  // szerokości poza systemem — czyli mieści się w `SHELL_DISCOVERY`.
  expect(szerokosc, "strona miasta zwęziła się z powrotem do wąskiego kontenera").toBeGreaterThan(1700);
  expect(szerokosc, "strona miasta wyszła poza SHELL_DISCOVERY").toBeLessThanOrEqual(2000);
});

test("checkout zostaje wąski i skupiony", async ({ page }) => {
  await page.goto("/hotele/rezerwacja");
  await expect(page.locator("body")).not.toContainText("Application error", { timeout: 20_000 });
  // Wymaganie bez zmian — checkout ma zostać wąski. Zmienił się tylko sposób
  // pomiaru: limit siedzi na sekcji w środku `<main>`, bo rama powłoki jest
  // teraz celowo pełnoszerokościowa na każdej trasie.
  expect(await szerokoscTresciStrony(page)).toBeLessThanOrEqual(1280);
});
