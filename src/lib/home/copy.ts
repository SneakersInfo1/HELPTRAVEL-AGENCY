// Treść nagłówków i CTA trzech sekcji ofertowych strony głównej — w JEDNYM
// miejscu, żeby dało się ją podmienić bez wchodzenia w komponenty.
//
// Po co: nagłówek i CTA to zmienne o największym wpływie na konwersję i
// jedyne, które można testować bez ruszania danych. Dopóki copy siedziało
// wpisane w JSX, każdy wariant oznaczał edycję komponentu, a więc ryzyko, że
// „test copy" po drodze zmieni też układ. Teraz wariant to podmiana obiektu.
//
// To NIE JEST silnik eksperymentów i nie udaje, że nim jest. To szew: jedno
// źródło treści + identyfikator wariantu, który jedzie w eventach GA4, więc
// wynik da się rozdzielić. Podpięcie realnego przydziału (flaga, losowanie,
// narzędzie zewnętrzne) to osobna decyzja — tutaj wystarczy zmienić
// `COPY_VARIANT` i wskazać inny obiekt.
//
// LIMITY DŁUGOŚCI SĄ CZĘŚCIĄ KONTRAKTU, nie sugestią. Wariant, który przepełnia
// przycisk albo łamie nagłówek na cztery linie na 375 px, przegra test z powodu
// układu, a nie treści — i wniosek z takiego testu będzie fałszywy. Limity
// wynikają z pomiarów w przeglądarce i pilnuje ich test.

/** Górne granice wyprowadzone z pomiaru układu na 375 px. */
export const COPY_LIMITS = {
  /** Nagłówek sekcji: 28 px, ~24 znaki na linię → 42 znaki to najwyżej dwie linie. */
  heading: 42,
  /** Zdanie pod nagłówkiem: 14 px, szerokość ograniczona do 62ch. */
  subheading: 160,
  /** Etykieta przycisku: 219 px szerokości, 14 px bold, minus ikona i odstęp. */
  cta: 20,
} as const;

export interface SectionCopy {
  heading: string;
  subheading?: string;
  cta?: string;
}

export interface HomeCopy {
  /** Sekcja A — pas „Popularne kierunki". */
  inspire: SectionCopy;
  /** Sekcja B — „Polecane hotele" (snapshot hotfeat:v1, rotacja co 6 h). */
  featuredHotels: SectionCopy;
  /** Sekcja C — „Nie wiesz, dokąd jechać?" (kafle klimatów). */
  picker: SectionCopy;
}

/**
 * Identyfikator wariantu treści. Jedzie w eventach GA4 sekcji, więc wynik
 * pomiaru da się rozdzielić po wariancie bez zgadywania z dat wdrożenia.
 *
 * Przy realnym teście ustaw go DODATKOWO jako właściwość użytkownika w GA4 —
 * parametr zdarzenia rozdziela zdarzenia, ale nie rozdziela sesji, w których
 * użytkownik nie kliknął nic.
 */
export const COPY_VARIANT = "default";

export const HOME_COPY: HomeCopy = {
  inspire: {
    heading: "Popularne kierunki",
  },
  // Poprzednik tej sekcji („Cały wyjazd w jednej cenie") został zdjęty ze
  // strony 2026-08-02: obiecywał lot z hotelem, a link prowadził na listę
  // samych hoteli. Następczyni pokazuje KONKRETNY hotel z ceną z realnego
  // wyszukania — i prowadzi dokładnie do niego, na te same daty.
  featuredHotels: {
    heading: "Polecane hotele",
    // Zdanie mówi cztery rzeczy, których użytkownik nie ma skąd wiedzieć:
    // JAK dobieramy obiekty, czym jest ta cena, dla kogo jest policzona
    // i jak często się zmienia.
    //
    // „Z tańszej części ofert" to opis TEGO, CO ROBI KOD (`pickValuePicks`:
    // odcięcie po medianie cen kierunku, dopiero potem ranking jakości), a nie
    // chwyt sprzedażowy. Gdyby dobór wrócił do samego rankingu jakości, to
    // zdanie trzeba usunąć razem z nim.
    subheading:
      "Dobrze oceniane obiekty z tańszej części ofert na te daty. Ceny za dobę dla dwóch osób, zestaw zmienia się co sześć godzin.",
    cta: "Zobacz hotel",
  },
  picker: {
    heading: "Nie wiesz, dokąd jechać?",
    // Zdanie opisuje KAFLE, bo panel z pytaniami został zdjęty ze strony
    // (decyzja właściciela 2026-07-27). Wcześniejsze „Powiedz, ile chcesz
    // wydać…" odnosiło się do widgetu, którego już nie ma.
    subheading: "Wybierz klimat, na jaki masz ochotę — pokażemy kierunki, które do niego pasują.",
  },
};
