// Historyczne adresy z DOKŁADNYM odpowiednikiem. Tylko 1:1 — przekierowanie na
// stronę o innej treści (np. na główną) Google traktuje jak soft 404.
//
// • /porownanie/malaga-vs-valencia — adres wymieniony w SEO_MASTER_PLAN jako
//   strona z kliknięciami (GSC, V 2026). W kodzie ten slug nigdy nie istniał:
//   makePair() od początku składa slug z pełnych slugów kierunków. 301 jest
//   zabezpieczeniem dla linków i zakładek w tym krótszym zapisie.
// • /tanie-podróże — slug kategorii z polskimi znakami trafiał do sitemapy
//   i linków wewnętrznych, a strona kategorii żyje pod /tanie-podroze.

export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  "/porownanie/malaga-vs-valencia": "/porownanie/malaga-spain-vs-valencia-spain",
  "/tanie-podróże": "/tanie-podroze",
};

/**
 * Cel przekierowania 301 albo null. Ścieżka może przyjść zakodowana
 * (`%C3%B3`) albo nie, w NFC albo NFD — decyzja nie może zależeć od tego,
 * kto po drodze ją dekodował.
 */
export function legacyRedirectTarget(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  return LEGACY_REDIRECTS[decoded.normalize("NFC")] ?? null;
}
