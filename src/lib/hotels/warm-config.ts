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
// Głębokość skanu DLA SNAPSHOTU CEN (tanie okna): lista hoteli jest sortowana
// popularnością, nie ceną — realnie najtańsze bywają za pierwszą 50-tką
// (sonda 2026-07-02: Rzym min/noc 513 zł w hotelach 0-50 vs 262 zł w 100-150).
// 150 = 3 paczki po 50 (cap resolveSlimRates na jeden call LiteAPI).
export const SNAPSHOT_HOTELS_PER_DEST = 150;
// Równoległość zapytań do LiteAPI (każde ~2,5-4 s). 6 (było 4): głęboki skan
// snapshotu podniósł liczbę zadań do ~250 — przy 4 zimny przebieg ocierał się
// o budżet czasu.
export const WARM_CONCURRENCY = 6;
// Twardy budżet czasu — zatrzymujemy się przed limitem funkcji (maxDuration 300 s).
export const WARM_TIME_BUDGET_MS = 250_000;

// Kafelki „Popularne kierunki" na homepage (8; podzbiór zestawu właściciela
// z 2026-06-11, dobór leisure-first). ID = id z data/destinations.json ==
// slug profilu kierunku. KAŻDY kafelek MUSI być grzany (poniżej), inaczej
// nigdy nie dostanie prawdziwej ceny „od zł/noc" ze snapshotu dstprice:v1.
export const HOME_TILE_DESTINATION_IDS = [
  "malaga-spain",
  "barcelona-spain",
  "lisbon-portugal",
  "rome-italy",
  "valencia-spain",
  "athens-greece",
  "istanbul-turkey",
  "heraklion-greece",
] as const;

// Kierunki grzane DODATKOWO poza top-N popularności. Seed jest sortowany
// popularnością i top-10 to niemal sama Hiszpania — bez tej listy kafelki
// (Rzym idx 23, Ateny 48, Stambuł 64…) nie miałyby cen. Union liczony w cronie.
export const WARM_EXTRA_DESTINATION_IDS: readonly string[] = HOME_TILE_DESTINATION_IDS;

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

// Tanie okna DLA SNAPSHOTU CEN (prośba właściciela 2026-07-02: „od X zł" na
// homepage za wysokie). Najbliższe weekendy = szczyt cenowy; realnie niższe
// minima są daleko w przód i w środku tygodnia:
//   1) tani-tydzien — sobota ≥60 dni w przód, 7 nocy (poza szczytem; cena/noc
//      przy 7 nocach jest najniższa),
//   2) srodtydzien — poniedziałek ≥40 dni w przód, 4 noce (stawki weekdayowe).
// Ceny z tych okien są PRAWDZIWE (realne wyszukania) — obniżamy „od" przez
// szersze szukanie, nigdy przez zmyślanie liczb. Okna te grzeją też cache
// wyników (bonus dla userów planujących z wyprzedzeniem).
export function computeSnapshotDateWindows(now: Date = new Date()): WarmWindow[] {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const satFar = nextDow(base, 6, 60);
  const monMid = nextDow(base, 1, 40);
  return [
    { checkin: iso(satFar), checkout: iso(addDays(satFar, 7)), label: "tani-tydzien" },
    { checkin: iso(monMid), checkout: iso(addDays(monMid, 4)), label: "srodtydzien" },
  ];
}
