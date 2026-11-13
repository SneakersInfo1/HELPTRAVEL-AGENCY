// Historyczne adresy z DOKŁADNYM odpowiednikiem. Tylko 1:1 — przekierowanie na
// stronę o innej treści (np. na główną) Google traktuje jak soft 404.
//
// • /porownanie/malaga-vs-valencia — adres wymieniony w SEO_MASTER_PLAN jako
//   strona z kliknięciami (GSC, V 2026). W kodzie ten slug nigdy nie istniał:
//   makePair() od początku składa slug z pełnych slugów kierunków. 301 jest
//   zabezpieczeniem dla linków i zakładek w tym krótszym zapisie.
// • /tanie-podróże — slug kategorii z polskimi znakami trafiał do sitemapy
//   i linków wewnętrznych, a strona kategorii żyje pod /tanie-podroze.
// • /porównanie/… i /porunanie/… — zapis katalogu porównań z polskim znakiem
//   albo literówką. GSC (11.08–10.11.2026) pokazuje wyświetlenia trzech takich
//   adresów, a crawl produkcji 13.11.2026 potwierdził dla nich 404. Reguła jest
//   1:1: przekierowuje tylko na hub albo na ISTNIEJĄCĄ parę o tym samym slugu.

import { getComparisonPairBySlug } from "@/lib/mvp/comparisons";

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
  const normalized = decoded.normalize("NFC");
  return LEGACY_REDIRECTS[normalized] ?? misspelledComparisonTarget(normalized);
}

/** Zapisy katalogu, pod którymi porównania nigdy nie istniały, a mają ruch. */
const MISSPELLED_COMPARISON_DIRS: readonly string[] = ["porównanie", "porunanie"];

function misspelledComparisonTarget(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  if (!MISSPELLED_COMPARISON_DIRS.includes(parts[0])) return null;
  if (parts.length === 1) return "/porownanie";
  return getComparisonPairBySlug(parts[1]) ? `/porownanie/${parts[1]}` : null;
}
