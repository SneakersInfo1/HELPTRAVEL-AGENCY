// Bramka „czy to na pewno TEN hotel".
//
// PO CO
// Wyszukiwanie obiektu po nazwie działa dwustopniowo: `/data/places` daje
// `placeId` z Google, a `/data/hotels?placeId=…` zwraca hotele w okolicy tego
// miejsca — z trafionym obiektem NA PIERWSZYM MIEJSCU, ale bez gwarancji.
// Sonda 2026-08-02 na czterech obiektach: Chopin Boutique, Hotel Bristol
// i Larios Málaga trafiły w punkt, a „Burj Al Arab" dopasowało się do PLAŻY
// o tej nazwie i pierwszym hotelem wyszło „Jumeirah Marsa Al Arab Dubai".
//
// Bez tej bramki użytkownik wpisujący „Burj Al Arab" wylądowałby na stronie
// innego hotelu — i to bez żadnego sygnału, że coś poszło nie tak. Gorzej niż
// brak wyniku: cicha podmiana produktu tuż przed płatnością.
//
// Odrzucenie NIE jest ślepą uliczką — formularz wraca wtedy do wyszukiwania
// w mieście obiektu, czyli do zachowania sprzed tej funkcji.

import { foldText } from "@/lib/flights/airports";

/**
 * Słowa, które w nazwach hoteli nie niosą tożsamości. Zostawione zawyżałyby
 * podobieństwo: „Hotel Bristol" i „Hotel Splendide" mają wspólny token, który
 * ma tyle samo wagi co nazwa własna.
 */
const GENERIC = new Set([
  "hotel",
  "hotele",
  "hostel",
  "motel",
  "resort",
  "spa",
  "apartments",
  "apartment",
  "apartamenty",
  "aparthotel",
  "residence",
  "residences",
  "suites",
  "suite",
  "rooms",
  "guesthouse",
  "guest",
  "house",
  "inn",
  "lodge",
  "villa",
  "villas",
  "camping",
  "by",
  "the",
  "and",
  "a",
  "an",
  "de",
  "la",
  "le",
  "el",
  "di",
  "du",
  "of",
  "at",
  "in",
  "on",
  "collection",
  "luxury",
  "boutique",
]);

/** Tokeny znaczące: bez diakrytyków, bez interpunkcji, bez słów ogólnych. */
export function nameTokens(value: string): Set<string> {
  const tokens = foldText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !GENERIC.has(t));
  return new Set(tokens);
}

/**
 * Udział wspólnych tokenów w KRÓTSZYM zbiorze (containment, nie Jaccard).
 *
 * Jaccard karałby poprawne trafienia z dłuższą nazwą u dostawcy („Chopin
 * Boutique" u Google vs „Chopin Boutique Hotel Warsaw" w LiteAPI), a to jest
 * najczęstszy realny kształt różnicy między tymi dwoma źródłami.
 */
export function nameOverlap(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let wspolne = 0;
  for (const t of ta) if (tb.has(t)) wspolne++;
  return wspolne / Math.min(ta.size, tb.size);
}

/**
 * Próg akceptacji. 0,7 wybrane pod zmierzone przypadki: poprawne trafienia
 * dawały 1,0, a podmiana „Burj Al Arab" → „Jumeirah Marsa Al Arab" 0,5.
 * Środek między nimi jest szeroki, więc próg nie jest przestrojony pod próbkę.
 */
export const NAME_MATCH_THRESHOLD = 0.7;

/** Czy hotel z LiteAPI to ten sam obiekt, o który pytał użytkownik. */
export function isSameHotel(queriedName: string, hotelName: string): boolean {
  return nameOverlap(queriedName, hotelName) >= NAME_MATCH_THRESHOLD;
}

/**
 * Najlepszy kandydat z listy albo null.
 *
 * Kolejność z LiteAPI jest brana pod uwagę tylko przy remisie — pierwszy
 * wynik bywa trafny, ale to nie jest kontrakt dostawcy, tylko obserwacja.
 */
export function pickMatchingHotel<T extends { id: string; name: string }>(
  queriedName: string,
  hotels: readonly T[],
): T | null {
  let best: { hotel: T; score: number } | null = null;
  for (const h of hotels) {
    const score = nameOverlap(queriedName, h.name);
    if (score < NAME_MATCH_THRESHOLD) continue;
    if (!best || score > best.score) best = { hotel: h, score };
  }
  return best?.hotel ?? null;
}
