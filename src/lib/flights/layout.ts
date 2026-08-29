// Szerokości lejka lotów — JEDNO źródło prawdy.
//
// Bliźniak `src/lib/hotels/layout.ts`; ta sama mechanika, inne wartości, bo
// loty nie mają mapy i nie potrzebują 1840 px.
//
// POMIAR, KTÓRY TO WYWOŁAŁ (Playwright, 2026-08-29, e2e/flights-shots.ts):
//
//   viewport 1920 · /loty/wyniki      treść 779 px · pustka 59,4 % ekranu
//   viewport 1920 · /loty/dodatki     treść 672 px · pustka 65,0 %
//   viewport 1440 · /loty/wyniki      treść 779 px · pustka 45,9 %
//   pojedyncza KARTA OFERTY na 1920:  463 px
//
// Czyli: na monitorze 1920 px karta lotu zajmowała 24 % szerokości, a dwie
// trzecie ekranu było białe. Przyczyna nie leżała w sekcji lotów — leżała
// w `site-shell.tsx`, który nakłada `max-w-7xl` na wszystko poza homepage
// i szerokimi trasami hotelowymi. Sekcja lotów mogła mieć u siebie dowolne
// `max-w-*` i nic by to nie dało.
//
// NIE JEST TO „zrób wszystko na 100vw". Każdy krok lejka ma inną funkcję,
// więc dostaje inną szerokość:
//   • wyniki   — porównywanie ofert, każdy piksel pracuje  → najszerzej
//   • taryfa   — dwie kolumny (lot | wybór taryfy)         → średnio
//   • dane     — formularz, długość wiersza ma znaczenie   → wąsko
//   • płatność — jedno zadanie, zero rozpraszania          → najwęziej
//
// Wartości `xl:px-10` są zgrane z `HOTEL_SHELL*`, żeby przejście
// /hotele/szukaj → /loty/wyniki nie robiło „schodka" w lewym marginesie.

/**
 * Wyniki wyszukiwania — najszersza powłoka lejka.
 *
 * 1920 → 1720 treści (gutter 10,4 %)   1440 → 1360   1280 → 1216   390 → 358
 *
 * Górna granica 1720 px, a nie „ile się da": przy filtrach 300 px karta oferty
 * dostaje ~1360 px i to jest szerokość, przy której oś czasu rejsu wygląda
 * na zaprojektowaną. Powyżej ~1500 px karta zaczyna wyglądać na pustą, bo
 * treści lotu (dwie godziny, czas, przesiadki) po prostu tyle nie potrzebują.
 */
export const FLIGHT_SHELL_WIDE = "mx-auto w-full max-w-[1720px] px-4 sm:px-6 xl:px-10";

/**
 * Pasek edycji wyszukiwania nad wynikami — wyrównany do powłoki wyników.
 * Osobna stała, bo pasek jest w innym elemencie DOM (sticky poza `main`),
 * a rozjazd marginesu między paskiem a listą widać na szerokim ekranie od razu.
 */
export const FLIGHT_SHELL_BAR = FLIGHT_SHELL_WIDE;

/**
 * Krok „Bagaż i taryfa" — dwie kolumny (podsumowanie lotu | lista taryf).
 * 1120 px to szerokość, przy której obie kolumny mają sens; więcej robi
 * z listy taryf pas rozciągniętych, pustych wierszy.
 */
export const FLIGHT_SHELL_FARE = "mx-auto w-full max-w-[1120px] px-4 sm:px-6";

/**
 * Dane pasażerów — formularz + sticky podsumowanie.
 * 1200 px: kolumna formularza ~820 px (dwa pola w rzędzie bez ściskania)
 * plus panel 340 px.
 */
export const FLIGHT_SHELL_FORM = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";

/**
 * Płatność i potwierdzenie — jedno zadanie na ekranie.
 * Świadomie NAJWĘŻSZE: tu poszerzanie działa przeciwko konwersji.
 */
export const FLIGHT_SHELL_NARROW = "mx-auto w-full max-w-[760px] px-4 sm:px-6";

/**
 * Siatka wyników: filtry + lista.
 *
 * 300 px na filtry (jak w hotelach) — etykieta „Najpóźniejszy wylot" i nazwy
 * linii mieszczą się w jednej linii. Od 2xl 320 px, bo miejsca jest nadmiar.
 */
export const FLIGHT_RESULTS_GRID =
  "grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)] 2xl:gap-8";

/**
 * Wysokość sticky headera, do `top-*` pasków przyklejonych PONIŻEJ niego
 * i do `scroll-margin-top` przy przewijaniu do błędu.
 *
 * Zmierzone na produkcyjnym headerze: 73 px (mobile ~66 px). Do 2026-08-29
 * ta liczba była wpisana z palca w `wyniki/page.tsx` jako
 * `top-[72px] sm:top-[84px]` — wartość dla starej, pływającej pastylki
 * z `mt-2`. Po zmianie headera na pas przyklejony do krawędzi `mt-2` znika,
 * więc stara wartość zostawiała 11-pikselową szczelinę, przez którą pod
 * paskiem przelatywała treść.
 */
export const FLIGHT_STICKY_TOP = "top-[64px] sm:top-[72px]";
