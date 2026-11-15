// Liczby porównujemy jako wartości razem z wymiarem, nie jako podciągi.
// Cytat z tą samą liczbą, ale inną jednostką, nie potwierdza twierdzenia.

export type NumberLocale = "pl" | "en";
export type NumberDimension = "length" | "area" | "time" | "temperature" | "percent" | "date" | "currency" | "quantity";

export interface NumberMention {
  value: number;
  dimension: NumberDimension | null;
}

const NUMBER_TOKEN = /(?<![\p{L}\d])(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:[ \u00a0\u202f\u2009]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\d)/gu;
const IDENTIFIER = /(?<![\p{L}\p{N}])(?=[\p{L}\p{N}.]*\d)\p{L}[\p{L}\p{N}]*(?:\.[\p{L}\p{N}]+)*(?![\p{L}\p{N}])/gu;

function parseToken(raw: string, locale: NumberLocale): number | null {
  let value = raw.replace(/[ \u00a0\u202f\u2009]/g, "");
  if (locale === "en" && /^\d{1,3}(?:,\d{3})+$/.test(value)) {
    value = value.replace(/,/g, "");
  } else if (value.includes(",")) {
    // Przecinek z jedną albo dwiema cyframi nie może rozpaść się na dwie liczby.
    if (!/^\d+,\d+$/.test(value)) return null;
    value = value.replace(",", ".");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dimensionAt(text: string, start: number, end: number, value: number): NumberDimension | null {
  const before = text.slice(Math.max(0, start - 16), start).toLocaleLowerCase("pl-PL");
  const after = text.slice(end, end + 40).toLocaleLowerCase("pl-PL");

  if (/(?:€|\$|£|pln|eur|euro|usd|gbp|chf|czk|huf|try|mad)\s*$/.test(before)) return "currency";
  if (/^\s*(?:°\s*[cf]?|stopni(?:a|e|u|om|ami|ach)?\s*(?:celsjusza|fahrenheita)?|degrees?\s*[cf]?|celsius|fahrenheit)(?!\p{L})/u.test(after)) return "temperature";
  if (/^\s*(?:%|proc\.?|procent\p{L}*|percent(?:age)?)(?!\p{L})/u.test(after)) return "percent";
  if (/^\s*(?:zł|złot\p{L}*|pln|eur|euro|€|usd|\$|dolar\p{L}*|gbp|£|funt\p{L}*|chf|frank\p{L}*|czk|kč|koron\p{L}*|huf|forint\p{L}*|ft|try|lir\p{L}*|mad|dirham\p{L}*|currency|dollars?|pounds?)(?!\p{L})/u.test(after)) return "currency";
  if (/^\s*(?:m\s*n\.p\.m\.|kilometr\p{L}*|km|centymetr\p{L}*|cm|milimetr\p{L}*|mm|metr(?!o)\p{L}*|m(?!\p{L})|miles?|kilomet(?:er|re)s?|met(?:er|re)s?|centimet(?:er|re)s?|millimet(?:er|re)s?|feet|foot|ft)(?!\p{L})/u.test(after)) return "length";
  if (/^\s*(?:ha|hektar\p{L}*|acres?|square\s+(?:kilomet(?:er|re)s?|met(?:er|re)s?))(?!\p{L})/u.test(after)) return "area";
  if (/^\s*(?:godzin\p{L}*|godz\.?|h(?!\p{L})|min(?:ut\p{L}*)?|sekund\p{L}*|dni|dzień|dnia|hours?|hrs?|minutes?|mins?|seconds?|secs?|days?)(?!\p{L})/u.test(after)) return "time";
  if (/^\s*(?:mln|milion\p{L}*|tys\.?|tysięc\p{L}*|tysiąc\p{L}*|millions?|thousands?)(?!\p{L})/u.test(after)) return "quantity";
  if (/^\s*(?:r\.|roku|rok|year|years)(?!\p{L})/u.test(after)) return "date";

  const previous = text[start - 1] ?? "";
  const next = text[end] ?? "";
  if ((/[./-]/.test(previous) && /\d/.test(text[start - 2] ?? "")) || (/[./-]/.test(next) && /\d/.test(text[end + 1] ?? ""))) return "date";
  if (Number.isInteger(value) && value >= 1800 && value <= 2199) return "date";
  return null;
}

export function extractNumberMentions(text: string, locale: NumberLocale): NumberMention[] {
  const mentions: NumberMention[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const value = parseToken(match[0], locale);
    if (value === null) continue;
    const start = match.index ?? 0;
    mentions.push({ value, dimension: dimensionAt(text, start, start + match[0].length, value) });
  }
  return mentions;
}

/** Wartości liczbowe w tekście, w kolejności wystąpienia. */
export function extractNumbers(text: string, locale: NumberLocale): number[] {
  return extractNumberMentions(text, locale).map((mention) => mention.value);
}

/** Liczby tekstu w obu odczytach (cytaty bywają po angielsku). */
export function extractNumbersAnyLocale(text: string): Set<number> {
  return new Set([...extractNumbers(text, "pl"), ...extractNumbers(text, "en")]);
}

export function extractAlphanumericIdentifiers(text: string): string[] {
  return [...new Set(text.normalize("NFKC").match(IDENTIFIER) ?? [])];
}

export function hasNumberWithUnit(text: string): boolean {
  return extractNumberMentions(text, "pl").some((mention) => mention.dimension !== null);
}

export interface NumberCoverage {
  ok: boolean;
  missing: number[];
  missingIdentifiers: string[];
}

/**
 * Liczba bez jednostki w cytacie jest dopuszczalnym pokryciem. Odrzucamy ją
 * wymiarowo dopiero wtedy, gdy występuje wyłącznie z innym wymiarem.
 */
export function numbersCoveredBy(subject: string, evidence: string): NumberCoverage {
  const subjectMentions = extractNumberMentions(subject, "pl");
  const evidenceMentions = [...extractNumberMentions(evidence, "pl"), ...extractNumberMentions(evidence, "en")];
  const missing = subjectMentions
    .filter((subjectMention) => {
      const sameValue = evidenceMentions.filter((candidate) => candidate.value === subjectMention.value);
      if (sameValue.length === 0) return true;
      if (subjectMention.dimension === null) return false;
      return !sameValue.some((candidate) => candidate.dimension === null || candidate.dimension === subjectMention.dimension);
    })
    .map((mention) => mention.value);

  const evidenceIdentifiers = new Set(extractAlphanumericIdentifiers(evidence));
  const missingIdentifiers = extractAlphanumericIdentifiers(subject).filter((identifier) => !evidenceIdentifiers.has(identifier));
  return {
    ok: missing.length === 0 && missingIdentifiers.length === 0,
    missing: [...new Set(missing)],
    missingIdentifiers,
  };
}
