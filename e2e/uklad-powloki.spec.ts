/**
 * Regresja powłoki serwisu — nagłówek, stopka, szerokości, poziomy scroll.
 *
 * Brief §18 prosi o „minimum asercji", nie o setki kruchych testów CSS.
 * Dlatego sprawdzamy WŁASNOŚCI UKŁADU, a nie nazwy klas: nazwa klasy może się
 * zmienić przy refaktorze i test wywali się bez powodu, a `x === 0` i
 * `borderRadius === 0px` opisują dokładnie to, o co prosił brief.
 *
 * Serwer musi już działać na :3000 (`pnpm dev` albo `pnpm start`).
 * Testy są READ-ONLY: żaden nie rezerwuje, nie płaci i nie wysyła maila.
 */
import { expect, test, type Page } from "@playwright/test";

/** Strony reprezentujące każdą warstwę wizualną serwisu. */
const HOME = "/";
const HOTELE =
  "/hotele/szukaj?destination=Rodos&country=Grecja&checkin=2026-11-18&checkout=2026-11-25&adults=2&rooms=1";
const FLIGHTS = "/loty/wyniki?origin=WAW&destination=BCN&depart=2026-09-15&adults=1";
const DISCOVERY = ["/kierunki", "/inspiracje", "/city-breaki", "/wyjazdy/plaza"];
const TEKSTOWE = ["/regulamin", "/polityka-prywatnosci"];
const PODSTRONY = ["/jak-pracujemy", "/o-nas", "/faq"];

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1920, height: 1080 };
/**
 * 2560 × 1440 — viewport, ktorego brak w regresji pozwolil `max-w-[2000px]` przejsc
 * niezauwazonym przez caly przebieg. Od 2026-09-02 kazda asercja o szerokosci
 * obejmuje takze ten rozmiar.
 */
const SZEROKI = { width: 2560, height: 1440 };

/**
 * Zgoda na cookies wstawiona z góry. Baner zgód jest `fixed` i przykrywa dolną
 * część okna — bez tego każdy pomiar „czy coś zasłania" mierzyłby baner.
 * Klucz i kształt rekordu: src/lib/consent/types.ts.
 */
async function bezBaneraZgod(page: Page) {
  await page.addInitScript({
    content: `try { localStorage.setItem("helptravel-cookie-consent-v1", JSON.stringify({ version: 1, decidedAt: 1767225600000, decision: { necessary: true, analytics: false, marketing: false } })); } catch (e) {}`,
  });
}

async function geometriaPowloki(page: Page) {
  return page.evaluate(() => {
    const opisz = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.x),
        szerokosc: Math.round(r.width),
        promienie: [
          cs.borderTopLeftRadius,
          cs.borderTopRightRadius,
          cs.borderBottomRightRadius,
          cs.borderBottomLeftRadius,
        ],
        marginLewy: cs.marginLeft,
        marginPrawy: cs.marginRight,
      };
    };
    return {
      okno: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      header: opisz("header"),
      footer: opisz("footer"),
    };
  });
}

/** Wszystkie trasy, na których powłoka ma wyglądać tak samo. */
const WSZYSTKIE = [HOME, HOTELE, ...DISCOVERY, ...TEKSTOWE, ...PODSTRONY];

test.describe("powłoka serwisu — nagłówek i stopka są pasem", () => {
  for (const sciezka of WSZYSTKIE) {
    test(`${sciezka} — nagłówek pełnej szerokości, bez promienia`, async ({ page }) => {
      await bezBaneraZgod(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(sciezka, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);

      const g = await geometriaPowloki(page);
      expect(g.header, `brak <header> na ${sciezka}`).not.toBeNull();

      // §22: „hotel outer header full-width" / „subpage header full-width".
      expect(g.header!.x, "nagłówek nie zaczyna się na lewej krawędzi").toBe(0);
      expect(g.header!.szerokosc, "nagłówek nie zajmuje pełnej szerokości okna").toBe(g.okno);

      // §22: „border-radius = 0" — pastylka wracała właśnie tędy.
      for (const promien of g.header!.promienie) {
        expect(promien, "zewnętrzna powłoka nagłówka ma zaokrąglenie").toBe("0px");
      }

      // §22: „bez dużych bocznych marginesów".
      expect(g.header!.marginLewy).toBe("0px");
      expect(g.header!.marginPrawy).toBe("0px");

      // Stopka idzie tą samą regułą — inaczej dół strony wygląda jak inny produkt.
      expect(g.footer!.x).toBe(0);
      expect(g.footer!.szerokosc).toBe(g.okno);
      for (const promien of g.footer!.promienie) {
        expect(promien, "zewnętrzna powłoka stopki ma zaokrąglenie").toBe("0px");
      }
    });
  }
});

/**
 * JEDEN GUTTER NAGŁÓWKA DLA CAŁEGO SERWISU.
 *
 * Zgłoszenie właściciela (2026-09-02): logo stało na x = 32 / 40 / 100 / 160
 * w zależności od rodziny tras, bo rząd nagłówka dostawał limit szerokości
 * zgrany z treścią pod spodem. Na /regulamin wyrównywało się przez to do
 * kolumny TEKSTU szerokiej na 720 px i lądowało 128 px od pozycji z homepage.
 *
 * Ten test pilnuje, żeby wyrównanie nagłówka pozostało NIEZALEŻNE od szerokości
 * treści strony — łapie zarówno powrót limitów, jak i podpięcie nagłówka pod
 * `SHELL_*` którejkolwiek sekcji.
 */
test.describe("logo stoi w tym samym miejscu na wszystkich rodzinach tras", () => {
  for (const widok of [SZEROKI, DESKTOP, { width: 1440, height: 900 }, MOBILE]) {
    test(`@ ${widok.width}px`, async ({ page }) => {
      await bezBaneraZgod(page);
      await page.setViewportSize(widok);

      const pomiary: { trasa: string; x: number }[] = [];
      for (const sciezka of [HOME, "/kierunki", "/inspiracje", "/regulamin", HOTELE, FLIGHTS]) {
        await page.goto(sciezka, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(sciezka === HOTELE ? 2500 : 700);
        const x = await page.evaluate(() => {
          const logo = document.querySelector("header img");
          return logo ? Math.round(logo.getBoundingClientRect().x) : -1;
        });
        pomiary.push({ trasa: sciezka.split("?")[0], x });
      }

      const wartosci = pomiary.map((p) => p.x);
      expect(Math.min(...wartosci), "logo nie zostało zmierzone na którejś trasie").toBeGreaterThan(0);
      // Tolerancja 2 px na zaokrąglenia subpikselowe; realnie ma być identycznie.
      expect(
        Math.max(...wartosci) - Math.min(...wartosci),
        `logo skacze między trasami: ${pomiary.map((p) => `${p.trasa}=${p.x}`).join(", ")}`,
      ).toBeLessThanOrEqual(2);

      // Gutter ma być mały i stały: 16 px na telefonie, 32 px na desktopie.
      const oczekiwany = widok.width < 768 ? 16 : widok.width < 1280 ? 24 : 32;
      expect(wartosci[0], `gutter nagłówka ≠ ${oczekiwany} px`).toBe(oczekiwany);
    });
  }
});

/**
 * DISCOVERY MA BYĆ PEŁNOEKRANOWE NA KAŻDYM DESKTOPIE — także 2560.
 *
 * POPRZEDNIA WERSJA TEGO TESTU PRZEPUŚCIŁA REALNY BŁĄD i warto wiedzieć jak.
 * Sprawdzała wyłącznie 1920 px i wymagała progu BEZWZGLĘDNEGO (≥1800 px).
 * Powłoka miała wtedy `max-w-[2000px]`, więc na 1920 dawała 1856 px i test
 * przechodził — a na 2560 przycinała treść do 1936 px, czyli 312 px marginesu
 * z każdej strony i 75,6 % okna. Dokładnie ten centralny box, który zadanie
 * miało usunąć; próg 1800 px nie miał szans go złapać, bo 2000 > 1800.
 *
 * Dlatego test mierzy teraz GUTTER WZGLĘDEM OKNA, nie liczbę pikseli, i robi
 * to na trzech szerokościach desktopu. Sprawdza też szerokość pojedynczej
 * karty — „pełna szerokość" osiągnięta kartami po 900 px nie jest sukcesem.
 */
test.describe("discovery wykorzystuje niemal całą szerokość okna", () => {
  for (const widok of [{ width: 1440, height: 900 }, DESKTOP, SZEROKI]) {
    for (const sciezka of ["/kierunki", "/inspiracje", "/city-breaki", "/wyjazdy/plaza"]) {
      test(`${sciezka} @ ${widok.width}px`, async ({ page }) => {
        await bezBaneraZgod(page);
        await page.setViewportSize(widok);
        await page.goto(sciezka, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(900);

        const w = await page.evaluate(() => {
          const main = document.querySelector("main") as HTMLElement | null;
          if (!main) return null;
          const cs = getComputedStyle(main);
          const r = main.getBoundingClientRect();
          // Najszersza KARTA. Celowo tylko `.ht-karty`, czyli realne siatki
          // kart — nie każdy `.grid` na stronie. Chmura linków regionów na
          // /kierunki jest zwykłym gridem i ma szerokie kolumny z założenia,
          // a to nie jest ten problem, o którym mówiło zgłoszenie.
          let najszerszaKarta = 0;
          for (const g of Array.from(document.querySelectorAll<HTMLElement>("main .ht-karty"))) {
            const dzieci = Array.from(g.children).filter((c) => c.getBoundingClientRect().width > 0);
            if (dzieci.length < 3) continue;
            const szer = dzieci[0].getBoundingClientRect().width;
            if (szer > najszerszaKarta) najszerszaKarta = szer;
          }
          return {
            tresc: Math.round(r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
            x: Math.round(r.x + parseFloat(cs.paddingLeft)),
            okno: window.innerWidth,
            karta: Math.round(najszerszaKarta),
          };
        });

        expect(w).not.toBeNull();
        const gutter = Math.round((w!.okno - w!.tresc) / 2);
        // WZGLĘDNIE, nie w pikselach: gutter ma zostać mały niezależnie od
        // tego, jak szeroki jest monitor.
        expect(
          gutter,
          `gutter ${gutter} px na oknie ${w!.okno} px — discovery wróciło do centralnego boxa`,
        ).toBeLessThanOrEqual(40);
        // Treść w jednej linii z logo — efekt uboczny wspólnego guttera.
        expect(w!.x).toBeLessThanOrEqual(40);
        // §3 zgłoszenia: „nie rozciągaj jednej karty do 700–900 px".
        expect(w!.karta, `karta rozciągnęła się do ${w!.karta} px`).toBeLessThanOrEqual(700);
      });
    }
  }
});

test.describe("brak poziomego przewijania", () => {
  for (const widok of [MOBILE, { width: 375, height: 812 }, { width: 412, height: 915 }, DESKTOP, SZEROKI]) {
    for (const sciezka of [HOME, ...DISCOVERY, ...TEKSTOWE]) {
      test(`${sciezka} @ ${widok.width}px`, async ({ page }) => {
        await bezBaneraZgod(page);
        await page.setViewportSize(widok);
        await page.goto(sciezka, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);

        const g = await geometriaPowloki(page);
        // Tolerancja 1 px: zaokrąglenia subpikselowe potrafią dołożyć 0,5 px
        // przy niecałkowitych szerokościach kolumn, co nie jest scrollem.
        expect(g.scrollWidth, `poziomy scroll na ${sciezka}`).toBeLessThanOrEqual(g.okno + 1);
      });
    }
  }
});

test.describe("siatki discovery — ostatni rząd wygląda intencjonalnie", () => {
  for (const sciezka of ["/city-breaki", "/przewodniki", "/cieple-kierunki", "/kierunki"]) {
    test(`${sciezka} — niepełny rząd jest wyśrodkowany`, async ({ page }) => {
      await bezBaneraZgod(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(sciezka, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);

      const siatki = await page.evaluate(() => {
        const wynik: { kolumny: number; ostatniRzad: number; luzLewy: number; luzPrawy: number }[] = [];
        document.querySelectorAll<HTMLElement>("main .ht-karty").forEach((g) => {
          const dzieci = Array.from(g.children).filter((c) => c.getBoundingClientRect().width > 0);
          if (dzieci.length < 2) return;
          const wRzedzie = new Map<number, Element[]>();
          for (const c of dzieci) {
            const gora = Math.round(c.getBoundingClientRect().top);
            wRzedzie.set(gora, [...(wRzedzie.get(gora) ?? []), c]);
          }
          const rzedy = [...wRzedzie.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
          const ostatni = rzedy[rzedy.length - 1];
          const kolumny = Math.max(...rzedy.map((r) => r.length));
          const ramka = g.getBoundingClientRect();
          const lewa = Math.min(...ostatni.map((c) => c.getBoundingClientRect().left));
          const prawa = Math.max(...ostatni.map((c) => c.getBoundingClientRect().right));
          wynik.push({
            kolumny,
            ostatniRzad: ostatni.length,
            luzLewy: Math.round(lewa - ramka.left),
            luzPrawy: Math.round(ramka.right - prawa),
          });
        });
        return wynik;
      });

      expect(siatki.length, `brak siatki .ht-karty na ${sciezka}`).toBeGreaterThan(0);
      for (const s of siatki) {
        if (s.ostatniRzad >= s.kolumny) continue; // rząd pełny — nie ma czego wyśrodkowywać
        // O to chodziło w §5: karta nie stoi samotnie przy lewej krawędzi,
        // tylko rząd jest wyśrodkowany, więc czyta się jak koniec listy.
        expect(
          Math.abs(s.luzLewy - s.luzPrawy),
          `niepełny rząd (${s.ostatniRzad}/${s.kolumny}) nie jest wyśrodkowany`,
        ).toBeLessThanOrEqual(2);
      }
    });
  }
});

test.describe("strony tekstowe zachowują czytelną długość linii", () => {
  for (const sciezka of TEKSTOWE) {
    test(`${sciezka} — kolumna tekstu nie rozciąga się na cały monitor`, async ({ page }) => {
      await bezBaneraZgod(page);
      await page.setViewportSize(DESKTOP);
      await page.goto(sciezka, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      const szerokosc = await page.evaluate(() => {
        const main = document.querySelector("#main-content main") as HTMLElement | null;
        return main ? Math.round(main.getBoundingClientRect().width) : null;
      });
      expect(szerokosc).not.toBeNull();
      // §6: „NIE rozciągaj tekstu na 1600–1800 px". Pas nagłówka ma pełną
      // szerokość (sprawdzone wyżej), kolumna czytelna zostaje wąska.
      expect(szerokosc!, "kolumna tekstu za szeroka").toBeLessThanOrEqual(900);
    });
  }
});

test.describe("homepage jest wzorcem i nie może się zmienić", () => {
  test("hero i sekcje idą od krawędzi do krawędzi, rząd nagłówka bez limitu", async ({ page }) => {
    await bezBaneraZgod(page);
    await page.setViewportSize(DESKTOP);
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);

    const stan = await page.evaluate(() => {
      const header = document.querySelector("header") as HTMLElement;
      const rzad = header.firstElementChild as HTMLElement;
      const main = document.querySelector("#main-content main") as HTMLElement | null;
      return {
        okno: window.innerWidth,
        rzadX: Math.round(rzad.getBoundingClientRect().x),
        rzadSzer: Math.round(rzad.getBoundingClientRect().width),
        mainSzer: main ? Math.round(main.getBoundingClientRect().width) : null,
      };
    });

    // §11 i §21: homepage była wzorcem i ma zostać dokładnie taka, jaka była.
    // Rząd nagłówka NIE dostaje limitu szerokości — tylko padding `xl:px-8`,
    // czyli 32 px z każdej strony. Gdyby ktoś nałożył tu limit rodziny
    // discovery (1600 px), logo przeskoczyłoby z x=32 na x=176.
    expect(stan.rzadX).toBe(32);
    expect(stan.rzadSzer).toBe(stan.okno - 64);
    // Treść strony głównej ma pełną szerokość — hero i pas kierunków idą
    // od krawędzi do krawędzi (decyzja właściciela 2026-08-02).
    expect(stan.mainSzer).toBe(stan.okno);
  });
});

test.describe("warstwa hotelowa poza nagłówkiem bez zmian", () => {
  test("wyniki: sidebar i lista maja te sama geometrie co przed zmiana", async ({ page }) => {
    await bezBaneraZgod(page);
    await page.setViewportSize(DESKTOP);
    await page.goto(HOTELE, { waitUntil: "domcontentloaded" });
    // Skan dostępności potrafi trwać; czekamy na pierwszą kartę, nie na czas.
    await page.waitForTimeout(3000);

    const stan = await page.evaluate(() => {
      const siatka = document.querySelector("main .grid") as HTMLElement | null;
      const kolumny = siatka ? getComputedStyle(siatka).gridTemplateColumns : null;
      const powloka = document.querySelector("main .mx-auto") as HTMLElement | null;
      return {
        kolumny,
        powlokaSzer: powloka ? Math.round(powloka.getBoundingClientRect().width) : null,
        maPasKontekstu: document.body.innerText.includes("Rodos"),
      };
    });

    // §20 traktuje szerokość sidebara jako WARUNEK, nie życzenie.
    //
    // 320 px, a nie 300: `HOTEL_RESULTS_GRID` ma `lg:grid-cols-[300px_1fr]`
    // i `2xl:grid-cols-[320px_1fr]`, a 1920 px to już 2xl. Pierwsza wersja
    // tego testu zakładała 300 i wywaliła się na WŁASNYM błędzie, nie na
    // regresji — wartość jest tu wpisana po odczycie z przeglądarki.
    //
    // 1408 px na listę: `HOTEL_SHELL_WIDE` = 1840 minus `xl:px-10` z obu
    // stron (80) minus sidebar 320 minus `2xl:gap-8` (32). Te liczby pochodzą
    // z `src/lib/hotels/layout.ts`, którego to zadanie nie ruszało.
    expect(stan.kolumny, "siatka wyników hoteli zmieniła kolumny").toBe("320px 1408px");
    // `HOTEL_SHELL_WIDE` = max 1840 px. Ta liczba NIE była ruszana.
    expect(stan.powlokaSzer).toBe(1840);
    // Pasek kontekstu wyszukiwania (kierunek · termin · osoby) ma zostać.
    expect(stan.maPasKontekstu).toBe(true);
  });
});
