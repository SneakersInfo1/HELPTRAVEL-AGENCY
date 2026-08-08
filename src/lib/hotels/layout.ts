// Szerokości sekcji hotelowej — JEDNO źródło prawdy.
//
// Dlaczego osobny moduł, a nie globalny `.container`: brief §25. Homepage,
// loty, planner i strony treściowe siedzą na `max-w-6xl`/`max-w-7xl` i mają
// własne proporcje (hero, siatki kafli). Poszerzenie ich globalnie zepsułoby
// tamte widoki, a to nie jest zakres tej przebudowy. Sekcja hotelowa dostaje
// więc własną powłokę i nic poza nią się nie zmienia.
//
// Pomiar, który to wywołał (Playwright, 2026-08-07, viewport 1920):
//   treść 1216 px · pustka 352 px z lewej · 352 px z prawej
// czyli **37% ekranu szło na marginesy**, a karta hotelu miała 880 px.
// To wygląda jak strona zaprojektowana pod 1366 px otwarta na monitorze 1920.
//
// Docelowo (brief §4): na 1920 gutter ~40 px, treść ~1840 px. Na ultra-wide
// (2560+) świadomie WRACAMY do ograniczenia — linia tekstu dłuższa niż
// ~1900 px robi się nieczytelna, a karta rozjeżdża się na pustkę.

/**
 * Wyniki wyszukiwania — najszersza powłoka.
 *
 * Lista + sidebar + mapa realnie korzystają z każdego piksela: w widoku mapy
 * dzielimy szerokość 55/45, więc każde 100 px to ~55 px więcej na kartę.
 *
 * 1920 → 1840 treści (gutter 40)   1440 → 1360   1280 → 1232   375 → 343
 */
export const HOTEL_SHELL_WIDE = "mx-auto w-full max-w-[1840px] px-4 sm:px-6 xl:px-10";

/**
 * Strona hotelu — nieco węższa.
 *
 * Tu dominuje TEKST (opis, udogodnienia, zasady, opinie), a nie siatka kart.
 * 1760 px to górna granica, przy której kolumna opisu obok panelu rezerwacji
 * nadal ma sensowną długość wiersza.
 *
 * 1920 → 1760 (gutter 80)   1440 → 1360   1280 → 1232
 */
export const HOTEL_SHELL = "mx-auto w-full max-w-[1760px] px-4 sm:px-6 xl:px-10";

/**
 * Wąskie pasy w obrębie sekcji hotelowej (breadcrumbs, pasek wyszukiwania),
 * które mają być wyrównane do powłoki wyników — inaczej „schodek" między
 * paskiem a listą rzuca się w oczy na szerokim ekranie.
 */
export const HOTEL_SHELL_BAR = HOTEL_SHELL_WIDE;

/**
 * Kolumna filtrów. 280 px było za wąskie na etykiety typu
 * „Bezpłatna anulacja" (łamały się na dwie linie); 300 px mieści je w jednej,
 * a od 2xl dajemy 320 px, bo przestrzeni jest wtedy nadmiar.
 */
export const HOTEL_RESULTS_GRID =
  "grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr] 2xl:grid-cols-[320px_1fr] 2xl:gap-8";
