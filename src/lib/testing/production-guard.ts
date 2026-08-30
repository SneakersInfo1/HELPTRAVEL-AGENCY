// Bezpiecznik: TEST NIE DOTYKA PRODUKCJI.
//
// ── PROBLEM (zmierzony 2026-08-30) ───────────────────────────────────────────
//
// `.env.local` w tym repo trzyma WYŁĄCZNIE produkcję: `UPSTASH_REDIS_REST_URL`
// wskazuje bazę, w której leżą prawdziwe rezerwacje, a `LITEAPI_PROD_PRIVATE_KEY`
// tworzy prawdziwe locki taryf i prawdziwe rezerwacje. Kluczy `sand_` nie ma.
//
// Testy bronią się przed tym WSTRZYKIWANIEM atrap: `__setFlightRedisForTests`,
// podmieniony `globalThis.fetch`. To działa dopóki ktoś pamięta. Test dopisany
// bez `setup()`, przestawiona kolejność, `__reset…` wywołany w środku pliku —
// i `getRedis()` po cichu buduje klienta z env. Wtedy o zapisie do produkcji
// decyduje wyłącznie to, czy proces testowy widzi te zmienne.
//
// Dziś ich NIE widzi: `pnpm test` to `node --import tsx --test …`, bez
// `--env-file`, a w repo nic nie ładuje dotenv. Czyli jesteśmy bezpieczni
// PRZYPADKIEM — wystarczy jedno `--env-file=.env.local` dorzucone do skryptu
// „żeby zadebugować", żeby przypadek się skończył.
//
// ── ROZWIĄZANIE ──────────────────────────────────────────────────────────────
//
// Zamiast liczyć na pustkę w env: pod testem połączenie z produkcyjnym
// magazynem i produkcyjny zapis do LiteAPI są ZABRONIONE STRUKTURALNIE.
// Zapomniana atrapa nie jest już cichym zapisem do produkcji — jest głośno
// wywalonym testem.
//
// Świadomie NIE używamy tu `FlightStoreUnavailableError` ani żadnego błędu,
// który warstwa wyżej łapie i zamienia na HTTP 503: taki błąd zostałby
// połknięty, a test przeszedłby „na zielono" opisując zachowanie, którego
// nie było.

/** Osobny typ — nigdy nie jest łapany przez obsługę „store niedostępny". */
export class ProductionAccessInTestError extends Error {
  constructor(what: string, hint: string) {
    super(
      `[BEZPIECZNIK] Test próbował dotknąć PRODUKCJI: ${what}. ` +
        `Testy nie mają prawa czytać ani zapisywać prawdziwych danych. ${hint}`,
    );
    this.name = "ProductionAccessInTestError";
  }
}

/**
 * Czy działamy pod runnerem testów?
 *
 * `NODE_TEST_CONTEXT` ustawia sam `node --test` w procesie potomnym każdego
 * pliku (zmierzone na Node 24: wartość `"child-v8"`). `NODE_ENV==="test"`
 * dokładamy dla runnerów, które ustawiają tylko je.
 */
export function isRunningUnderTest(): boolean {
  return Boolean(process.env.NODE_TEST_CONTEXT) || process.env.NODE_ENV === "test";
}

/**
 * Furtka dla testu, który ŚWIADOMIE chce prawdziwego zaplecza.
 * Dziś nie używa jej nic — istnieje po to, żeby nikt nie musiał wyłączać
 * bezpiecznika przez usunięcie go.
 */
function testsAllowedToTouchProduction(): boolean {
  return process.env.ALLOW_PROD_STORE_IN_TESTS === "yes-i-know-what-i-am-doing";
}

/**
 * Wołane TUŻ PRZED zbudowaniem prawdziwego klienta Upstash.
 * Pod testem bez wstrzykniętej atrapy — rzuca.
 */
export function assertNoProductionStoreInTests(store: string): void {
  if (!isRunningUnderTest() || testsAllowedToTouchProduction()) return;
  throw new ProductionAccessInTestError(
    `próba połączenia z prawdziwym Upstash (${store})`,
    `Wstrzyknij atrapę przed użyciem magazynu (np. __setFlightRedisForTests(fakeRedis()) / __setBookingRedisForTests(...)).`,
  );
}

// ── Sieć: zapisy do LiteAPI ──────────────────────────────────────────────────

/**
 * `fetch` z chwili załadowania modułu — czyli PRZED tym, jak jakikolwiek test
 * go podmieni. Porównanie z bieżącym `globalThis.fetch` odpowiada na pytanie
 * „czy sieć jest zamockowana", bez zaglądania w wewnętrzności testu.
 */
const PRISTINE_FETCH: typeof globalThis.fetch | undefined = globalThis.fetch;

/**
 * Ścieżki LiteAPI, które COŚ TWORZĄ po stronie dostawcy: lock taryfy, sesję
 * płatności, rezerwację, anulowanie. Odczyty (rates, hotele, places) celowo
 * pomijamy — powolny test to nie to samo co skutek uboczny na produkcji.
 */
const WRITE_PATHS = [/\/prebooks?\b/i, /\/bookings?\b/i, /\/cancel\b/i];

export function isProviderWritePath(url: string): boolean {
  return WRITE_PATHS.some((re) => re.test(url));
}

/**
 * Wołane tuż przed realnym `fetch` do LiteAPI.
 *
 * Rzuca tylko wtedy, gdy JEDNOCZEŚNIE: jesteśmy pod testem, ścieżka tworzy coś
 * u dostawcy i `fetch` NIE jest podmieniony. Testy, które mockują sieć (a robią
 * to wszystkie istniejące), przechodzą bez zmian.
 */
export function assertNoProviderWriteInTests(url: string): void {
  if (!isRunningUnderTest() || testsAllowedToTouchProduction()) return;
  if (!isProviderWritePath(url)) return;
  if (PRISTINE_FETCH && globalThis.fetch !== PRISTINE_FETCH) return; // sieć zamockowana
  throw new ProductionAccessInTestError(
    `niezamockowany zapis do dostawcy (${url.replace(/\?.*$/, "")})`,
    `Podmień globalThis.fetch na atrapę — inaczej test utworzyłby prawdziwy prebook/rezerwację.`,
  );
}
