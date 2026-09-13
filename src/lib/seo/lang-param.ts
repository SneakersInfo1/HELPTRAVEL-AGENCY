// Serwis ma jedną wersję językową — polską. Parametr `lang` nie zmienia treści,
// a każda jego wartość tworzy duplikat adresu: w wynikach Google wisiał
// `/?lang=en` (audyt SEO Growth V1, pkt 4). Middleware przekierowuje 301 na ten
// sam adres bez parametru, zachowując pozostałe (np. UTM).

/** Adres bez parametru `lang` albo null, gdy parametru nie ma. */
export function stripLangParam(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has("lang")) return null;
  url.searchParams.delete("lang");
  return url.toString();
}
