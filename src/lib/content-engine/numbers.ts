// Liczby w tekście jako wartości, a nie podciągi.
//
// Porównanie „czy liczba z tekstu jest w twierdzeniu" robione na napisach
// przepuszczało „9 h" przy twierdzeniu z rokiem „1987" (bo „9" jest w „1987").
// Tu każda liczba jest wyciągana jako wartość z granicami cyfr i porównywana
// po wartości, z obsługą zapisów: „3 718", „3718", „3,718" (tysiące po
// angielsku), „3,5" (ułamek po polsku), „3.5" (ułamek po angielsku).

export type NumberLocale = "pl" | "en";

const DIGIT_GROUP_SPACE = /(\d)[    ](?=\d{3}(?!\d))/g;

/** Wartości liczbowe w tekście, w kolejności wystąpienia. */
export function extractNumbers(text: string, locale: NumberLocale): number[] {
  let normalized = text.replace(DIGIT_GROUP_SPACE, "$1");
  if (locale === "en") {
    // „3,718" i „1,250,000" — przecinek jako separator tysięcy.
    normalized = normalized.replace(/\d{1,3}(?:,\d{3})+(?![\d])/g, (match) => match.replace(/,/g, ""));
  } else {
    // „3,5 h" — przecinek dziesiętny.
    normalized = normalized.replace(/(\d),(\d)/g, "$1.$2");
  }
  const values: number[] = [];
  for (const match of normalized.matchAll(/(?<![\p{L}\d.])\d+(?:\.\d+)?(?![\d])/gu)) {
    const value = Number(match[0]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

/** Liczby tekstu w obu odczytach (twierdzenia bywają przepisane z angielskich źródeł). */
export function extractNumbersAnyLocale(text: string): Set<number> {
  return new Set([...extractNumbers(text, "pl"), ...extractNumbers(text, "en")]);
}

/** Czy każda liczba z `subject` występuje w `evidence` (po wartości). */
export function numbersCoveredBy(subject: string, evidence: string): { ok: boolean; missing: number[] } {
  const available = extractNumbersAnyLocale(evidence);
  const missing = extractNumbers(subject, "pl").filter((value) => !available.has(value));
  return { ok: missing.length === 0, missing: [...new Set(missing)] };
}
