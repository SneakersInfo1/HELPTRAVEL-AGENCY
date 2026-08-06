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
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
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
