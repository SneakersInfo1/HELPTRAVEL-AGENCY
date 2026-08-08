// Opinie — kategorie ocen i wyróżnienia z analizy sentymentu dostawcy.
//
// Źródło: `/data/hotel` → `sentiment_analysis` = { pros[], cons[], categories[] }.
// Pole było przez Zod wyrzucane do Etapu 1; teraz przechodzi.
//
// TRZY ZASADY UCZCIWOŚCI, które trzymają ten plik:
//
// 1. To są treści WYGENEROWANE PRZEZ AI DOSTAWCY, nie cytaty gości. LiteAPI
//    zwraca nawet `sentiment_updated_at`. UI MUSI to oznaczyć (brief §11.5).
// 2. Nazwy kategorii są ANGIELSKIE i ze skończonego zbioru → tłumaczymy
//    SŁOWNIKIEM. Opisów i treści opinii NIE tłumaczymy maszynowo, bo to
//    zmienia znaczenie wypowiedzi gościa (brief §13 tego zakazuje).
// 3. Skala ocen dostawcy to 0–10 (nie 0–5). Konwersja na procent paska musi
//    z tego wychodzić, inaczej każdy hotel wyglądałby na dwukrotnie lepszy.

import type { LiteApiHotelDetail } from "@/lib/liteapi";

import type { ReviewCategory } from "./types";

/**
 * Skończony zbiór nazw kategorii zwracanych przez LiteAPI (zmierzone: 8 sztuk
 * na hotel). Brak w słowniku → zostaje oryginał, nigdy pusty wpis.
 */
const CATEGORY_PL: Record<string, string> = {
  cleanliness: "Czystość",
  service: "Obsługa",
  location: "Lokalizacja",
  "room quality": "Jakość pokoju",
  amenities: "Udogodnienia",
  "value for money": "Stosunek jakości do ceny",
  "food and beverage": "Jedzenie i napoje",
  "food & beverage": "Jedzenie i napoje",
  "overall experience": "Ogólne wrażenia",
  comfort: "Komfort",
  facilities: "Wyposażenie",
  staff: "Personel",
  breakfast: "Śniadanie",
  wifi: "Wi-Fi",
};

export function localizeReviewCategory(name: string): string {
  return CATEGORY_PL[name.trim().toLowerCase()] ?? name.trim();
}

/**
 * Słownik krótkich etykiet z `sentiment_analysis.pros` (brief §20).
 *
 * Te frazy NIE są cytatami gości — generuje je AI dostawcy jako podsumowanie,
 * dokładnie tak jak nazwy kategorii ocen. Etykieta systemowa po angielsku
 * w polskim interfejsie („Great location" pod nagłówkiem „Co goście chwalą
 * najczęściej") wygląda na niedokończone tłumaczenie, a nie na cytat.
 *
 * Zawartość słownika jest ZMIERZONA, nie wymyślona: sonda po 90 hotelach
 * (Hurghada, Málaga, Rzym) dała 292 wystąpienia i 127 różnych fraz. Poniżej
 * są te, które faktycznie wystąpiły — pokrywają ~4/5 wolumenu.
 *
 * Fraza spoza słownika zostaje PO ANGIELSKU. To świadome: zmyślone
 * tłumaczenie maszynowe zmieniałoby wymowę opinii, czego zakazuje decyzja R11.
 * Pełne treści opinii gości nie przechodzą przez tę funkcję w ogóle.
 */
const HIGHLIGHT_PL: Record<string, string> = {
  // personel
  "friendly staff": "Życzliwa obsługa",
  "helpful staff": "Pomocna obsługa",
  "friendly and helpful staff": "Życzliwa i pomocna obsługa",
  "friendly and attentive staff": "Życzliwa i uważna obsługa",
  "excellent staff": "Świetna obsługa",
  staff: "Obsługa",
  "great service": "Świetna obsługa",
  "friendly service": "Życzliwa obsługa",
  "exceptional service": "Wyjątkowa obsługa",
  "excellent service": "Świetna obsługa",
  service: "Obsługa",
  // lokalizacja
  "great location": "Świetna lokalizacja",
  "excellent location": "Doskonała lokalizacja",
  "good location": "Dobra lokalizacja",
  "beautiful location": "Piękna lokalizacja",
  "convenient location": "Dogodna lokalizacja",
  "perfect location": "Idealna lokalizacja",
  location: "Lokalizacja",
  // pokoje
  "comfortable rooms": "Wygodne pokoje",
  "clean rooms": "Czyste pokoje",
  "spacious rooms": "Przestronne pokoje",
  "clean and spacious rooms": "Czyste i przestronne pokoje",
  "clean and comfortable rooms": "Czyste i wygodne pokoje",
  // czystość
  cleanliness: "Czystość",
  "impeccable cleanliness": "Nienaganna czystość",
  "clean facilities": "Czyste obiekty wspólne",
  // wyżywienie
  "good breakfast": "Dobre śniadanie",
  "excellent breakfast": "Świetne śniadanie",
  "delicious breakfast": "Pyszne śniadanie",
  "good food": "Dobre jedzenie",
  "great food": "Świetne jedzenie",
  "great food quality": "Wysoka jakość jedzenia",
  "high-quality food": "Wysoka jakość jedzenia",
  "excellent food variety": "Duży wybór dań",
  "wide food selection": "Szeroki wybór dań",
  // udogodnienia i rozrywka
  "excellent amenities": "Świetne udogodnienia",
  "great amenities": "Świetne udogodnienia",
  "nice amenities": "Dobre udogodnienia",
  "variety of amenities": "Bogate udogodnienia",
  amenities: "Udogodnienia",
  "great entertainment": "Świetne animacje",
  "great activities": "Świetne atrakcje",
  "fun activities": "Ciekawe atrakcje",
  "variety of activities": "Bogaty wybór atrakcji",
  "heated pools": "Podgrzewane baseny",
  // pozostałe
  "family-friendly": "Przyjazny rodzinom",
  "luxurious stay": "Luksusowy pobyt",
  "value for money": "Dobry stosunek ceny do jakości",
};

/**
 * Etykieta „za co chwalą" po polsku, gdy ją znamy — w oryginale, gdy nie.
 * Znormalizowane: wielkość liter i kropka na końcu (AI dostawcy bywa
 * niekonsekwentne: „Friendly staff" obok „Friendly Staff").
 */
export function localizeReviewHighlight(text: string): string {
  const key = text.trim().replace(/[.\s]+$/, "").toLowerCase();
  return HIGHLIGHT_PL[key] ?? text.trim();
}

/**
 * Kategorie ocen do pasków. Odrzucamy pozycje bez sensownej oceny — pasek bez
 * liczby nic nie znaczy, a pusty wiersz wygląda jak błąd.
 */
export function reviewCategories(detail: LiteApiHotelDetail | null | undefined): ReviewCategory[] {
  const raw = detail?.sentiment_analysis?.categories;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => typeof c.rating === "number" && c.rating > 0 && typeof c.name === "string" && c.name.trim())
    .map((c) => ({
      label: localizeReviewCategory(c.name as string),
      score: c.rating as number,
      // Opis to zdanie po angielsku od AI dostawcy. Zachowujemy je surowe —
      // tłumaczenie maszynowe zmieniałoby wymowę opinii gości.
      summary: c.description?.trim() || null,
    }));
}

/**
 * Najczęściej chwalone rzeczy (`sentiment_analysis.pros`).
 *
 * Zwracamy je BEZ tłumaczenia i UI ma je oznaczyć jako podsumowanie AI —
 * to nie są cytaty, tylko streszczenie zrobione przez model dostawcy.
 */
export function reviewHighlights(detail: LiteApiHotelDetail | null | undefined, max = 6): string[] {
  const raw = detail?.sentiment_analysis?.pros;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const s = typeof item === "string" ? item.trim() : "";
    if (!s) continue;
    const pl = localizeReviewHighlight(s);
    // Deduplikacja po WYNIKU tłumaczenia: dostawca zwraca „Great service"
    // i „Excellent service" jako osobne pozycje, a po polsku obie brzmią
    // „Świetna obsługa" — dwa identyczne chipy obok siebie wyglądają na błąd.
    const key = pl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pl);
    if (out.length >= max) break;
  }
  return out;
}

/** Data ostatniej aktualizacji analizy — wymagana przy oznaczaniu treści AI. */
export function sentimentUpdatedAt(detail: LiteApiHotelDetail | null | undefined): string | null {
  const raw = detail?.sentiment_updated_at;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(d);
}

/**
 * Procent wypełnienia paska. Skala dostawcy to 0–10.
 *
 * Zwraca `null` dla wartości poza skalą zamiast obcinać — wartość spoza
 * zakresu znaczy, że założenie o skali jest błędne, a wtedy pasek kłamie.
 */
export function scoreToPercent(score: number): number | null {
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  return Math.round((score / 10) * 100);
}

/**
 * Czytelna nazwa źródła opinii. Brief §13 wymaga rzetelnej atrybucji —
 * „u partnera rezerwacyjnego" jest prawdziwe, ale mniej użyteczne niż
 * konkretna nazwa, którą dostawca podaje wprost (`review.source`).
 */
export function reviewSourceLabel(sources: (string | null | undefined)[]): string | null {
  const names = new Set(
    sources
      .map((s) => (s ?? "").trim().toLowerCase())
      .filter(Boolean)
      .map((s) => (s === "tripadvisor" ? "Tripadvisor" : s === "booking.com" ? "Booking.com" : s)),
  );
  if (names.size === 0) return null;
  return [...names].join(", ");
}
