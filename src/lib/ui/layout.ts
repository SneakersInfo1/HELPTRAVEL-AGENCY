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
 * ── GLOBALNY GUTTER NAGŁÓWKA I STOPKI ───────────────────────────────────────
 *
 * JEDNA wartość dla całego serwisu. Wyrównanie nagłówka jest CELOWO oderwane
 * od szerokości treści strony — to dwie niezależne rzeczy.
 *
 * ZGŁOSZENIE, KTÓRE TO WYWOŁAŁO (właściciel, 2026-09-02). Pierwsza wersja tej
 * przebudowy dawała rzędowi nagłówka limit szerokości rodziny tras, żeby logo
 * stało w jednej linii z treścią pod spodem. Zmierzone skutki na 1920 px:
 *
 *   homepage        logo x =  32
 *   hotele          logo x =  40
 *   loty            logo x = 100
 *   podstrony       logo x = 160     ← na /regulamin logo wyrównywało się
 *                                      do kolumny TEKSTU szerokiej na 720 px
 *
 * Logo skakało więc o 128 px między stroną główną a katalogiem kierunków.
 * Wyrównywanie nagłówka do treści jest błędem zawsze, gdy treść bywa wąska:
 * nagłówek należy do OKNA, nie do artykułu.
 *
 * Wartości wzięte ze strony głównej, bo to ona jest wzorcem — dzięki temu
 * homepage nie drgnęła ani o piksel, a reszta serwisu dosunęła się do niej.
 *
 *   telefon 16 px · tablet 24 px · desktop 32 px
 */
export const SITE_HEADER_GUTTER = "px-4 sm:px-6 xl:px-8";

/**
 * MARKETPLACE / DISCOVERY — katalogi kierunków, landingi kategorii, huby
 * treści. Siatki kart, które realnie korzystają z szerokości.
 *
 * ZMIANA 2026-09-02: było `max-w-[1600px]`, czyli na monitorze 1920 pudełko
 * 1600 px z 160-pikselowymi marginesami. Właściciel: „nadal wygląda zbyt mocno
 * jak centralny box (…) chcę wykorzystanie niemal całej szerokości viewportu,
 * mały stały gutter". Warstwa hotelowa robiła to od dawna i była punktem
 * odniesienia w zgłoszeniu.
 *
 * Teraz to praktycznie `width: 100%` z tym samym gutterem co nagłówek, więc
 * logo i pierwsza karta stoją w JEDNEJ linii pionowej (x = 32 na 1920).
 *
 *   1920 → 1856 treści (gutter 32)   1440 → 1376   1280 → 1216   390 → 358
 *
 * Limit 2000 px NIE jest tym samym co poprzednie 1600: przy 1920 i 2560 nie
 * daje o sobie znać w sposób, o który było zgłoszenie, a chroni przed
 * układem na 3840 px, gdzie cztery kolumny kart miałyby po ~940 px i karta
 * przestałaby wyglądać na zaprojektowaną.
 */
export const SHELL_DISCOVERY = "mx-auto w-full max-w-[2000px] px-4 sm:px-6 xl:px-8";

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

// `SHELL_BAR_INNER` i `SHELL_BAR_PAD` USUNIĘTE 2026-09-02.
//
// Były to limity szerokości rzędu nagłówka, osobne dla każdej rodziny tras.
// To one powodowały skakanie logo (32 / 40 / 100 / 160 px) — patrz komentarz
// przy `SITE_HEADER_GUTTER`. Nagłówek nie ma już żadnego limitu wewnętrznego:
// jest pasem na całą szerokość okna z jednym wspólnym gutterem.
