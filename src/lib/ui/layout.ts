// Szerokości powłoki serwisu — JEDNO źródło prawdy dla stron, które nie mają
// własnego modułu układu.
//
// Rodzeństwo: `src/lib/hotels/layout.ts` i `src/lib/flights/layout.ts`. Tamte
// dwie sekcje mają własne wartości, bo mają własne potrzeby (mapa, oś czasu
// rejsu). Ten moduł obsługuje CAŁĄ RESZTĘ: katalogi, landingi, artykuły
// i dokumenty.
//
// ── POMIAR, KTÓRY TO WYWOŁAŁ ────────────────────────────────────────────────
// Playwright, `e2e/layout-shots.ts before`, viewport 1920×1080:
//
//   /kierunki          treść 1152 px · 40,0 % ekranu puste
//   /inspiracje        treść 1088 px · 43,3 %
//   /city-breaki       treść 1152 px · 40,0 %
//   /o-nas             treść 1088 px · 43,3 %
//   /faq               treść 1104 px · 42,5 %
//
// Przyczyną nie było `max-w-*` na tych stronach. Była nią RAMA w
// `site-shell.tsx`: nakładała `max-w-7xl px-4 sm:px-6 lg:px-8` na wszystko
// poza homepage, hotelami i lotami, a każda strona dokładała do tego WŁASNE
// `max-w-7xl px-4 sm:px-6 lg:px-8`. Dwa limity i dwa paddingi jeden w drugim:
// 1920 → 1280 (rama) → 1216 (padding ramy) → 1152 (padding strony).
//
// Rama przestała ograniczać szerokość (nagłówek musiał być pasem na całą
// szerokość, brief §2), więc limit należy teraz WYŁĄCZNIE do strony — dokładnie
// tak, jak od dawna działa to w hotelach i lotach.

/**
 * MARKETPLACE / DISCOVERY — katalogi kierunków, landingi kategorii, huby
 * treści. Siatki kart, które realnie korzystają z szerokości.
 *
 * 1600 px, a nie „ile się da": przy czterech kolumnach karta ma ~380 px i to
 * jest szerokość, przy której zdjęcie 16:10 i dwie linie nazwy miasta wyglądają
 * na zaprojektowane. Powyżej ~1700 px piąta kolumna jeszcze się nie mieści,
 * a cztery zaczynają wyglądać na rozciągnięte.
 *
 * 1920 → 1536 treści (gutter 192)   1440 → 1376   1280 → 1216   390 → 358
 */
export const SHELL_DISCOVERY = "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8";

/**
 * STRONY TREŚCIOWE Z UKŁADEM — o serwisie, FAQ, cennik, mapa serwisu,
 * porównania. Mają sekcje i karty, ale ich rdzeniem jest tekst, więc nie idą
 * tak szeroko jak katalogi.
 *
 * 1360 px: przy dwóch kolumnach wiersz ma ~640 px, czyli nadal poniżej progu,
 * przy którym oko gubi początek następnej linii.
 */
export const SHELL_CONTENT = "mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8";

/**
 * DŁUGI TEKST — regulamin, polityka prywatności, standard redakcyjny.
 *
 * Świadomie WĄSKO i świadomie NIEZMIENIONE względem stanu sprzed przebudowy
 * (`max-w-3xl` = 768 px, treść 720 px). Brief §6 mówi to wprost: „NIE rozciągaj
 * tekstu na 1600–1800 px". Powłoka strony jest pełnej szerokości, kolumna
 * czytelna zostaje wąska — i to jest układ pożądany, nie niedokończony.
 */
export const SHELL_TEXT = "mx-auto w-full max-w-3xl px-4 sm:px-6";

/**
 * Wewnętrzny rząd nagłówka i stopki na trasach obsługiwanych przez ten moduł.
 *
 * Ta sama liczba co `SHELL_DISCOVERY`, ale BEZ `px-*` — padding poziomy
 * nakłada nagłówek/stopka u siebie, bo należy do pasa, a nie do rzędu.
 * Dzięki temu logo w nagłówku stoi w jednej linii pionowej z pierwszą kartą
 * pod spodem; rozjazd między nimi widać na szerokim ekranie od razu.
 */
export const SHELL_BAR_INNER = "mx-auto w-full max-w-[1600px]";

/**
 * Padding poziomy pasa nagłówka i stopki — zgrany z `SHELL_DISCOVERY`
 * i `SHELL_CONTENT`, żeby przejście między stronami nie robiło „schodka"
 * w lewym marginesie.
 */
export const SHELL_BAR_PAD = "px-4 sm:px-6 lg:px-8";
