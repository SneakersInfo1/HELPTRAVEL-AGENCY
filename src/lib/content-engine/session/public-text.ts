// Repozytorium jest PUBLICZNE. Tekst, który sesja zapisuje w gicie albo w PR (kolejka,
// dziennik, opis PR), nie może zawierać surowych danych z Google Search Console: liczb
// kliknięć, wyświetleń, CTR i pozycji per adres ani fragmentów eksportu CSV.
//
// Wykrywamy oba szyki („341 wyświetleń”, „clicks: 13”), skróty z planu sesji („wyśw.”,
// „poz.”) i nagłówki plików eksportu. Opis jakościowy („pozycja w pierwszej piątce”,
// „CTR poniżej oczekiwanego”) przechodzi, bo nie zawiera liczby przy metryce.

const METRIC_AFTER_NUMBER = String.raw`(?:klikni\p{L}*|kliknię\p{L}*|wyświetl\p{L}*|wyswietl\p{L}*|wyśw\.|wysw\.|impressions?|clicks?|ctr)`;
const METRIC_BEFORE_NUMBER = String.raw`(?:klikni\p{L}*|kliknię\p{L}*|wyświetl\p{L}*|wyswietl\p{L}*|wyśw\.|wysw\.|impressions?|clicks?|ctr|pozycj\p{L}*|poz\.|position|średnia pozycja)`;

const GSC_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "liczba przy metryce GSC", pattern: new RegExp(String.raw`(?<![\p{L}\d])\d[\d\s.,]*%?\s*${METRIC_AFTER_NUMBER}(?!\p{L})`, "iu") },
  { label: "metryka GSC z liczbą", pattern: new RegExp(String.raw`(?<!\p{L})${METRIC_BEFORE_NUMBER}\s*[:=]?\s*\d`, "iu") },
  { label: "nagłówek eksportu GSC", pattern: /(najpopularniejsze (zapytania|strony)|top (queries|pages))\s*[,;\t]/iu },
  { label: "kolumny eksportu GSC", pattern: /(kliknięcia|klikniecia|clicks)\s*[,;\t]\s*(wyświetlenia|wyswietlenia|impressions)/iu },
];

/** Fragmenty tekstu wyglądające na surowe dane GSC (pusta lista = tekst publiczny). */
export function gscDataHits(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const found = GSC_PATTERNS.find(({ pattern }) => pattern.test(line));
    if (found) hits.push(`${found.label}: ${line.trim().slice(0, 100)}`);
  }
  return hits;
}

export function isPublicSafe(text: string): boolean {
  return gscDataHits(text).length === 0;
}

export const PUBLIC_TEXT_MESSAGE = "Bez surowych danych GSC (kliknięcia, wyświetlenia, CTR, pozycja z liczbą, fragmenty eksportu) w danych publicznych";

/** Opis do publicznego PR: limit długości i zero surowych danych GSC. */
export function assertPublicPrText(text: string, label: string, maxChars = 10_000): void {
  if (text.length > maxChars) throw new Error(`${label}: ${text.length} znaków, limit ${maxChars}.`);
  const hits = gscDataHits(text);
  if (hits.length > 0) throw new Error(`${label} zawiera surowe dane GSC — repozytorium jest publiczne: ${hits.slice(0, 5).join("; ")}`);
}
