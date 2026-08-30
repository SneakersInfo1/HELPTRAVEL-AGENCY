// Bezpiecznik E2E lotów: żaden test nie tworzy prawdziwego prebooka ani rezerwacji.
//
// ── DLACZEGO ─────────────────────────────────────────────────────────────────
//
// Testy lotów przechwytują `**/api/flights/prebook` w KAŻDYM miejscu, gdzie
// dochodzą do płatności — dziś jest to zrobione poprawnie. Ale ta ochrona
// opiera się na tym, że autor testu pamiętał: przechwycenie żyje w ciele
// pojedynczego testu, a serwer, w który uderza Playwright, stoi na
// PRODUKCYJNYM kluczu LiteAPI (`.env.local` nie ma żadnego `sand_`). Jedno
// kliknięcie „Przejdź do płatności" w teście bez atrapy = prawdziwy lock
// taryfy i prawdziwy PaymentIntent.
//
// Ten moduł odwraca domyślną: zapisy są ZABLOKOWANE, a test, który ich
// potrzebuje, przechwytuje je sam.
//
// ── JAK TO DZIAŁA ────────────────────────────────────────────────────────────
//
// `page.route` w Playwrighcie działa jak stos — dopasowania sprawdzane są od
// NAJPÓŹNIEJ zarejestrowanego. Bezpiecznik rejestrujemy jako PIERWSZY (w
// `beforeEach`), więc każde późniejsze `page.route("**/api/flights/prebook", …)`
// w samym teście ma pierwszeństwo i działa jak dotąd. Bezpiecznik łapie
// wyłącznie to, czego nikt nie przechwycił — i wtedy wywala test.

import type { Page, Route } from "@playwright/test";

/** Trasy naszego API, za którymi stoją pieniądze albo zobowiązanie u dostawcy. */
const CHRONIONE = [
  "**/api/flights/prebook",
  "**/api/flights/book",
  // Strona powrotu finalizuje rezerwację po stronie serwera (`finalizeFlightBooking`).
  "**/loty/platnosc/return*",
];

export interface ZablokowaneZapisy {
  /** Adresy, które bezpiecznik zatrzymał. Pusta lista = test był czysty. */
  readonly trafienia: string[];
}

/**
 * Blokuje niezamockowane zapisy w lejku lotów.
 *
 * Zwraca obiekt z listą trafień — spec może po teście sprawdzić, że jest pusta.
 * Samo zablokowanie i tak wywali test, bo front dostanie 599 z ciałem, którego
 * nie obsługuje; lista służy do czytelnego komunikatu.
 */
export async function zablokujZapisyLotow(page: Page): Promise<ZablokowaneZapisy> {
  const trafienia: string[] = [];

  const blokuj = async (route: Route) => {
    const url = route.request().url();
    trafienia.push(url);
    console.error(
      `\n[BEZPIECZNIK E2E] Zablokowano NIEZAMOCKOWANY zapis: ${route.request().method()} ${url}\n` +
        `Ten test doszedłby do prawdziwego prebooka/rezerwacji na produkcyjnym kluczu LiteAPI.\n` +
        `Dodaj w teście page.route(...) z atrapą odpowiedzi albo nie klikaj kroku płatności.\n`,
    );
    await route.fulfill({
      status: 599,
      contentType: "application/json",
      body: JSON.stringify({
        error: "e2e_write_blocked",
        message: "Bezpiecznik E2E: zapis do dostawcy zablokowany. Zamockuj tę trasę w teście.",
      }),
    });
  };

  for (const wzorzec of CHRONIONE) {
    await page.route(wzorzec, blokuj);
  }

  return { trafienia };
}
