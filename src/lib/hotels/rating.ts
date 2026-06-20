// FAZA 5 — JEDNA wspólna etykieta jakościowa dla oceny gości LiteAPI (0–10).
//
// Wcześniej każdy widok miał własną skalę: strona szczegółów hotelu mówiła
// „Wyjątkowy/Świetny…", a karta wyników i podsumowanie checkoutu
// „Wspaniały/Bardzo dobry…" — dla tego samego 9.2 raz „Wyjątkowy", raz
// „Wspaniały". Ujednolicone wg konwencji Booking.com PL (rozpoznawalnej dla
// użytkownika). Mapuje WYŁĄCZNIE realny wynik — bez zawyżania; etykietę
// pokazujemy tylko gdy ocena faktycznie istnieje.
export function ratingLabel(score: number): string {
  if (score >= 9) return "Wspaniały";
  if (score >= 8) return "Bardzo dobry";
  if (score >= 7) return "Dobry";
  if (score >= 6) return "Przyjemny";
  return "Przyzwoity";
}
