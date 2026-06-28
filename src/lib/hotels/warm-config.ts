// Konfiguracja pre-warmingu cen (cron /api/cron/warm-rates).
//
// Cel: realny użytkownik szukający popularnego kierunku na typowy termin trafia
// w CIEPŁY Redis (<300 ms) zamiast płacić zimną podłogę LiteAPI ~3,3 s.
// Grzejemy WYŁĄCZNIE najczęstszy wariant: 2 dorosłych, 1 pokój, PLN — bo cache
// jest kluczowany po (daty × occupancy × hotel), więc inne occupancy i tak są
// zimne. To świadomy kompromis: prewarm nie pokryje KAŻDEJ kombinacji dat, ale
// pokrywa lejek „kafelek na homepage → popularny kierunek → najbliższy weekend".

// Ile top kierunków grzejemy (sortowane wg popularności w seedzie).
export const WARM_DESTINATION_COUNT = 10;
// Ile hoteli na kierunek (1. strona wyników = to co user widzi od razu).
// ≤50, bo resolveSlimRates robi jeden call LiteAPI na ≤50 hotelId.
export const WARM_HOTELS_PER_DEST = 50;
// Równoległość zapytań do LiteAPI (każde ~3,8 s zimno).
export const WARM_CONCURRENCY = 4;
// Twardy budżet czasu — zatrzymujemy się przed limitem funkcji (maxDuration 300 s).
export const WARM_TIME_BUDGET_MS = 250_000;

export interface WarmWindow {
  checkin: string; // yyyy-MM-dd
  checkout: string;
  label: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
// Najbliższy dzień tygodnia `dow` (0=niedz … 6=sob) co najmniej `minAhead` dni od `from`.
function nextDow(from: Date, dow: number, minAhead: number): Date {
  let d = addDays(from, minAhead);
  while (d.getUTCDay() !== dow) d = addDays(d, 1);
  return d;
}

// Trzy typowe okna dla polskiego turysty (czyste, deterministyczne — testowalne):
//   1) najbliższy weekend (pt→niedz, 2 noce),
//   2) kolejny weekend (+7 dni),
//   3) tydzień wakacji startujący najbliższą sobotę (7 nocy).
// minAhead=2 → nie grzejemy „dziś/jutro" (leisure rzadko szuka 0-1 dnia naprzód).
export function computeWarmDateWindows(now: Date = new Date()): WarmWindow[] {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const fri1 = nextDow(base, 5, 2);
  const fri2 = addDays(fri1, 7);
  const sat1 = nextDow(base, 6, 2);
  return [
    { checkin: iso(fri1), checkout: iso(addDays(fri1, 2)), label: "weekend-1" },
    { checkin: iso(fri2), checkout: iso(addDays(fri2, 2)), label: "weekend-2" },
    { checkin: iso(sat1), checkout: iso(addDays(sat1, 7)), label: "tydzien-1" },
  ];
}
