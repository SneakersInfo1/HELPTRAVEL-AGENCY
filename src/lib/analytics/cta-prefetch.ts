// Kiedy link CTA ze strony treści może być wstępnie pobierany przez `next/link`.
//
// Domyślny prefetch odpala się, gdy link wejdzie w pole widzenia. Odkąd CTA jest
// w pierwszym ekranie, oznaczało to 2–4 żądania RSC do `/hotele/szukaj?…` przy
// KAŻDEJ odsłonie porównania (zmierzone na buildzie produkcyjnym 14.11.2026),
// także od botów renderujących JS. Dla trasy dynamicznej prefetch pobiera tylko
// drzewo i metadane, więc niczego nie przyspiesza — a trasy produktu mają ruszać
// dopiero po kliknięciu człowieka.

/** Trasy produktu, których sama odsłona strony treści nie powinna dotykać. */
const TRANSACTIONAL_ROUTE = /^\/(?:en\/)?(?:hotele\/(?:szukaj|rezerwacja)|loty)(?:[/?#]|$)/;

function pathOf(href: string): string {
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      return `${url.pathname}${url.search}`;
    } catch {
      return href;
    }
  }
  return href;
}

/**
 * Wartość `prefetch` dla linku CTA: jawne ustawienie zawsze wygrywa, trasy
 * transakcyjne dostają `false`, reszta zostaje przy domyślnym zachowaniu Next.
 */
export function defaultCtaPrefetch(href: string, explicit?: boolean): boolean | undefined {
  if (explicit !== undefined) return explicit;
  return TRANSACTIONAL_ROUTE.test(pathOf(href)) ? false : undefined;
}
