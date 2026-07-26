// Jeden model oferty dla trzech sekcji strony głównej (inspiracja / produkt /
// przechwycenie intencji). Wcześniej każda sekcja miała własny kształt danych
// i własną kartę, więc ta sama informacja („od X zł") była formatowana na trzy
// sposoby i mierzona trzema różnymi eventami.
//
// CO JEST, A CZEGO NIE MA
// Pola opcjonalne poniżej NIE są „do uzupełnienia później" — one nie mają
// pokrycia w danych, którymi dysponuje serwis. Snapshot `dstprice:v1` zapisany
// przez cron zawiera dokładnie: cenę hotelu za noc, okno dat, cenę lotu RT
// i cenę pakietu na osobę. Nie zawiera nazwy hotelu, gwiazdek, oceny gości,
// czasu przelotu ani informacji o przesiadkach.
//
// Dlatego karta MUSI umieć wyglądać dobrze bez nich. Wypełnienie ich
// przykładowymi wartościami byłoby zmyślaniem danych — a to jest w tym
// projekcie zakazane wprost (PRODUCT.md → anti-references; historycznie
// fikcyjne „od X zł" liczone z hasha zostały stąd usunięte).

export interface DealCard {
  /** Slug kierunku z data/destinations.json — zarazem `item_id` w GA4. */
  id: string;
  /** Nazwa angielska — klucz do URL wyszukiwarki i do LiteAPI. */
  city: string;
  /** Nazwa polska — to widzi użytkownik. */
  cityLabel: string;
  country: string;
  countryLabel: string;
  imageUrl: string;
  imageAlt: string;

  /** Cena pakietu na osobę przy 2 osobach (PLN, pełne złote). */
  pricePerPersonPln: number;
  /** Cena łączna przy 2 osobach — wyliczana, nie zgadywana (patrz totalFor). */
  priceTotalPln: number;
  nights: number;
  /** Okno dat, z którego POCHODZI cena. To nie jest oferta na sztywny termin. */
  dateFrom: string;
  dateTo: string;
  /** Lotnisko wylotu — dziś zawsze WAW (cron liczy tylko z Warszawy). */
  departureAirport: string;
  /** Link do wyników z ustawionym kierunkiem; daty użytkownik wybiera sam. */
  searchUrl: string;

  /** Typowy czas lotu z Polski (godziny) — z profilu kierunku, nie z LiteAPI. */
  flightHoursFromPl?: number;

  // ── Pola BEZ pokrycia w danych. Zostawione w modelu, żeby karta była na nie
  // gotowa, gdy cron zacznie je zapisywać. Do tego czasu zawsze `undefined`.
  hotelName?: string;
  hotelStars?: number;
  hotelReviewScore?: number;
  isDirect?: boolean;
  /** Cena u konkurencji. Kotwicę cenową pokazujemy WYŁĄCZNIE, gdy to istnieje. */
  competitorPricePln?: number;
}

/**
 * Cena łączna dla `travelers` osób.
 *
 * Cena w snapshocie jest liczona przy 2 osobach (lot RT × 1 os. + noce × hotel/2),
 * więc mnożenie przez liczbę osób jest poprawne tylko dla tej bazy. Funkcja
 * istnieje po to, żeby to założenie było w JEDNYM miejscu, a nie rozsiane po
 * komponentach jako `× 2` bez komentarza.
 */
export function totalFor(pricePerPersonPln: number, travelers = 2): number {
  return pricePerPersonPln * travelers;
}

/**
 * Cena w polskim zapisie: `1 623 zł`, separator to spacja NIEŁAMLIWA (U+00A0).
 *
 * Nie używamy `formatPLN` z lib/money, bo `Intl` dla `pl-PL` domyślnie stosuje
 * `useGrouping: "min2"` — czterocyfrowe kwoty zostają wtedy bez separatora
 * (`1623 zł`). Dla cen wyjazdów, które prawie zawsze są czterocyfrowe, oznacza
 * to, że separator nie pojawiłby się praktycznie nigdy. `always` wymusza
 * grupowanie od tysiąca w górę.
 */
export function formatPricePln(amount: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(amount);
}

/**
 * Typowy czas lotu z Polski: `~3,5 h`, `~3 h` dla pełnych godzin.
 *
 * Tylda jest istotna — to wartość z profilu kierunku (typowy czas przelotu),
 * a nie czas KONKRETNEGO rejsu z oferty. Bez niej liczba czytałaby się jak
 * obietnica rozkładu, której nie mamy z czego dotrzymać.
 */
export function formatFlightHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  return Number.isInteger(hours)
    ? `~${hours} h`
    : `~${hours.toFixed(1).replace(".", ",")} h`;
}

/** Polska odmiana: 1 noc, 2–4 noce, 5+ nocy (z wyjątkiem 12–14). */
export function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  const d = n % 10;
  const h = n % 100;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${n} noce`;
  return `${n} nocy`;
}

/** Liczba nocy między datami ISO. Zwraca 0 przy niepoprawnym wejściu. */
export function nightsBetween(checkin: string, checkout: string): number {
  const a = Date.parse(`${checkin}T00:00:00Z`);
  const b = Date.parse(`${checkout}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** „7–11.09" gdy ten sam miesiąc, inaczej „26.09–3.10". */
export function formatDateRange(checkin: string, checkout: string): string {
  const a = new Date(`${checkin}T00:00:00Z`);
  const b = new Date(`${checkout}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  const dd = (d: Date) => d.getUTCDate();
  const mm = (d: Date) => String(d.getUTCMonth() + 1).padStart(2, "0");
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${dd(a)}–${dd(b)}.${mm(b)}`
    : `${dd(a)}.${mm(a)}–${dd(b)}.${mm(b)}`;
}

/**
 * Kotwica cenowa — pokazujemy ją TYLKO wtedy, gdy cena konkurencji istnieje
 * i jest realnie wyższa. `null` oznacza „nie renderuj niczego".
 *
 * To nie jest ostrożność stylistyczna: cena przekreślona bez pokrycia to
 * pozorny rabat, czyli ryzyko z dyrektywy Omnibus i ze strony UOKiK.
 */
export function priceAnchor(deal: DealCard): { competitor: number; savingPercent: number } | null {
  const competitor = deal.competitorPricePln;
  if (typeof competitor !== "number" || !Number.isFinite(competitor)) return null;
  if (competitor <= deal.pricePerPersonPln) return null;
  const savingPercent = Math.round(((competitor - deal.pricePerPersonPln) / competitor) * 100);
  if (savingPercent < 1) return null;
  return { competitor, savingPercent };
}

/** Zakresy budżetu w dobieraczu z sekcji C. `maxPln: null` = bez górnej granicy. */
export const BUDGET_BANDS = [
  { id: "do-1000", minPln: 0, maxPln: 1000 },
  { id: "1000-1500", minPln: 1000, maxPln: 1500 },
  { id: "1500-2500", minPln: 1500, maxPln: 2500 },
  { id: "2500-plus", minPln: 2500, maxPln: null },
] as const;

export type BudgetBandId = (typeof BUDGET_BANDS)[number]["id"];

/**
 * Etykieta chipa budżetu — WYLICZANA z granic, nie wpisywana ręcznie.
 *
 * Wpisane z ręki („1000–1500 zł") omijały `formatPricePln`, więc chipy
 * pokazywały kwoty bez separatora tysięcy tuż obok kart z „1 480 zł". Ten sam
 * rodzaj liczby w dwóch zapisach na jednym ekranie wygląda jak niedokończony
 * interfejs, a przy cenach kosztuje więcej niż wygląd.
 */
export function budgetBandLabel(band: (typeof BUDGET_BANDS)[number]): string {
  if (band.maxPln === null) return `powyżej ${formatPricePln(band.minPln)}`;
  if (band.minPln === 0) return `do ${formatPricePln(band.maxPln)}`;
  // Półpauza bez spacji — polski zapis zakresu liczbowego. Jednostka pada raz,
  // na końcu. Odcięcie przez `\s`, a NIE przez `" zł"`: `Intl` stawia przed
  // symbolem waluty spację NIEŁAMLIWĄ, więc dosłowna spacja by nie trafiła
  // i etykieta zostałaby jako „1 000 zł–1 500 zł".
  return `${formatPricePln(band.minPln).replace(/\s*zł$/u, "")}–${formatPricePln(band.maxPln)}`;
}

/** Filtr dobieracza. `null` w polu = „bez ograniczenia". */
export interface DealFilter {
  budget: BudgetBandId | null;
  /** Slug moodu z travel-moods (plaza, city-break, …). */
  theme: string | null;
}

/**
 * Filtruje pulę ofert. Czysta funkcja — dzięki temu licznik „Mamy N wyjazdów
 * od X zł" jest liczony z TEJ SAMEJ puli, którą użytkownik zobaczy po
 * kliknięciu. Licznik rozjechany z wynikiem jest gorszy niż brak licznika.
 */
export function filterDeals(
  deals: readonly DealCard[],
  filter: DealFilter,
  themeMembership: Readonly<Record<string, readonly string[]>>,
): DealCard[] {
  const band = filter.budget ? BUDGET_BANDS.find((b) => b.id === filter.budget) : null;
  const allowedIds = filter.theme ? new Set(themeMembership[filter.theme] ?? []) : null;
  return deals.filter((d) => {
    if (band) {
      if (d.pricePerPersonPln < band.minPln) return false;
      if (band.maxPln !== null && d.pricePerPersonPln > band.maxPln) return false;
    }
    if (allowedIds && !allowedIds.has(d.id)) return false;
    return true;
  });
}

/** Najniższa cena w zbiorze albo null dla pustego. */
export function cheapestPrice(deals: readonly DealCard[]): number | null {
  if (deals.length === 0) return null;
  return deals.reduce((min, d) => (d.pricePerPersonPln < min ? d.pricePerPersonPln : min), deals[0].pricePerPersonPln);
}

/** Polska odmiana: 1 wyjazd, 2–4 wyjazdy, 5+ wyjazdów. */
export function dealsLabel(n: number): string {
  if (n === 1) return "1 wyjazd";
  const d = n % 10;
  const h = n % 100;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${n} wyjazdy`;
  return `${n} wyjazdów`;
}
