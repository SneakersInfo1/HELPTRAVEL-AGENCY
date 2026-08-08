// Ceny, podatki i opłaty — jedno źródło prawdy dla listy, strony hotelu
// i checkoutu.
//
// Powód powstania: `result-card.tsx` i `rooms-section.tsx` pisały
// bezwarunkowo „wł. podatków". Pomiar na 400 taryfach: **209 pozycji ma
// `taxesAndFees[].included === false`** (najczęściej VAT), czyli podatku NIE
// ma w pokazanej cenie. Użytkownik dostawał pisemne zapewnienie nieprawdziwe
// dla około połowy ofert.
//
// Zasada: etykieta podatkowa WYNIKA z danych. Brak danych → nie mówimy nic.

import { toMinor } from "@/lib/money";
import type { LiteApiRate } from "@/lib/liteapi";

import type { PriceBreakdown, TaxNotice, TaxOrFee } from "./types";

/**
 * Mapuje `retailRate.taxesAndFees[]` na model domenowy.
 *
 * `amount` bywa nieobecne, bo dostawca potrafi wpisać całą informację w opis
 * („$163.02 USD per room per stay"). Takiej pozycji NIE wolno sumować —
 * zostaje z `amountMinor: null` i liczy się wyłącznie jako sygnał, że coś
 * dopłacimy.
 */
export function mapTaxes(rate: LiteApiRate): TaxOrFee[] {
  const raw = rate.retailRate?.taxesAndFees;
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => ({
    description: t.description ?? null,
    amountMinor: typeof t.amount === "number" ? toMinor(t.amount) : null,
    currency: t.currency ?? null,
    // Brak flagi traktujemy jak „w cenie". Uzasadnienie: dostawca oznacza
    // JAWNIE to, co dopłacisz (`included: false`), a pominięcie pola zdarza
    // się przy opłatach wliczonych. Odwrotne założenie straszyłoby gościa
    // dopłatą, której nie ma.
    includedInTotal: t.included !== false,
  }));
}

/**
 * Co wolno napisać o podatkach przy tej cenie.
 *
 * Trzy stany, celowo rozłączne:
 *   • `all-included`      → „w tym podatki i opłaty"
 *   • `extra-at-property` → „+ X zł płatnych na miejscu" (X może być null,
 *                            gdy dostawca podał tylko opis tekstowy)
 *   • `unknown`           → NIC nie piszemy o podatkach
 */
export function taxNoticeFrom(taxes: TaxOrFee[]): TaxNotice {
  if (taxes.length === 0) return { kind: "unknown" };

  const extra = taxes.filter((t) => !t.includedInTotal);
  if (extra.length === 0) return { kind: "all-included" };

  // Sumujemy tylko pozycje policzalne. Jeśli ŻADNA nie ma kwoty, zwracamy
  // `null` — wiemy, że coś dopłacimy, ale nie zmyślamy ile.
  const withAmount = extra.filter((t) => t.amountMinor !== null);
  const amountMinor = withAmount.length
    ? withAmount.reduce((sum, t) => sum + t.amountMinor!, BigInt(0))
    : null;

  // Waluta dopłaty bywa INNA niż waluta ceny (opłaty lokalne). Podajemy ją
  // tylko wtedy, gdy wszystkie policzalne pozycje są w tej samej walucie —
  // inaczej sumowanie byłoby bezsensowne.
  const currencies = new Set(withAmount.map((t) => t.currency).filter(Boolean));
  const currency = currencies.size === 1 ? [...currencies][0]! : null;

  return { kind: "extra-at-property", amountMinor: currency ? amountMinor : null, currency };
}

/** Cena odniesienia od dostawcy — patrz komentarz przy `PriceBreakdown`. */
function competitorReferenceFrom(rate: LiteApiRate): PriceBreakdown["competitorReference"] {
  const ref = rate.retailRate?.suggestedSellingPrice?.[0];
  if (!ref || typeof ref.amount !== "number" || !ref.currency) return null;
  return { amountMinor: toMinor(ref.amount), currency: ref.currency, source: ref.source ?? null };
}

/**
 * Buduje pełne rozbicie ceny taryfy.
 *
 * Zwraca `null`, gdy nie ma ceny — brak ceny to legalny stan (wyprzedane),
 * a nie błąd. UI ma wtedy pokazać „sprawdź dostępność", nie zero.
 */
export function buildPriceBreakdown(rate: LiteApiRate, nights: number): PriceBreakdown | null {
  const total = rate.retailRate?.total?.[0];
  if (!total || typeof total.amount !== "number" || !total.currency) return null;

  const totalMinor = toMinor(total.amount);
  const taxes = mapTaxes(rate);

  return {
    totalMinor,
    currency: total.currency,
    // Cena za noc jest POCHODNA i tylko informacyjna. Nigdy nie idziemy
    // w drugą stronę (noc × liczba nocy), bo dostawca podaje sumę
    // uwzględniającą różne stawki dobowe i opłaty.
    perNightMinor: nights > 0 ? totalMinor / BigInt(nights) : null,
    nights,
    taxes,
    taxNotice: taxNoticeFrom(taxes),
    competitorReference: competitorReferenceFrom(rate),
    discount: honestDiscountFrom(rate),
  };
}

/**
 * Najniższy procent, który wolno pokazać.
 *
 * Poniżej trzech procent przekreślenie przestaje nieść informację, a zaczyna
 * być ozdobą — a ozdoba w miejscu ceny to dokładnie ten sygnał, którego
 * brief §15A zakazuje. Zmierzony rozkład (852 przeceny) i tak zaczyna się
 * na 2,6%, więc próg odcina wyłącznie przypadki zaokrąglane do „-3%"
 * z wartości bliskich zera.
 */
const MIN_DISCOUNT_PERCENT = 3;

/**
 * Uczciwa przecena taryfy albo `null`.
 *
 * ŹRÓDŁO: wyłącznie `retailRate.initialPrice` — cena TEJ SAMEJ taryfy, tego
 * samego dostawcy, w tej samej walucie, dla tego samego pobytu, pokoju,
 * obłożenia, wyżywienia i zasad anulacji. Wszystkie warunki z briefu §15A są
 * spełnione z definicji, bo porównujemy dwa pola JEDNEGO obiektu taryfy.
 *
 * NIE UŻYWAMY `suggestedSellingPrice`. To cena konkurenta (`source` =
 * "booking.com" w 5926/6210 przypadków) i jest wyższa od naszej w **100%**
 * taryf. Przekreślenie jej znaczyłoby wieczną, nigdy nieznikającą „promocję"
 * na każdej ofercie w serwisie — czyli fałszywy sygnał, nie informację.
 *
 * KOREKTA POPRZEDNIEGO AUDYTU (2026-08-07). Sesja z 2026-08-06 zbadała 400
 * taryf, trafiła same zera i zapisała w `09-final-report.md`, że przecen
 * „nie ma i nie może być". To była pomyłka wynikająca z rozmiaru próby.
 * Pomiar na **33 421 taryfach w 5 miastach** (Malaga, Hurghada, Rzym, Paryż,
 * Warszawa): `initialPrice > total` w **852 taryfach, 70 hoteli, wszystkie
 * 5 miast**. Rozkład: 3%×175, 4%×457, 5%×112, 6%×76, 24%×24, 26%×8.
 * Szczegóły i metoda: `docs/hotel-redesign/discount-investigation.md`.
 */
export function honestDiscountFrom(
  rate: LiteApiRate,
): { originalMinor: bigint; percent: number } | null {
  const total = rate.retailRate?.total?.[0]?.amount;
  const initial = rate.retailRate?.initialPrice?.[0]?.amount;
  if (typeof total !== "number" || typeof initial !== "number") return null;
  if (!(initial > total) || initial <= 0) return null;

  const percent = Math.round(((initial - total) / initial) * 100);
  if (percent < MIN_DISCOUNT_PERCENT) return null;

  return { originalMinor: toMinor(initial), percent };
}

/**
 * Ta sama reguła, ale na dwóch gołych liczbach — dla warstwy cache, która
 * wozi `SlimRate`, a nie surową taryfę. Jedno miejsce z progiem i wzorem.
 */
export function discountPercent(originalAmount: number, finalAmount: number): number | null {
  if (!(originalAmount > finalAmount) || originalAmount <= 0) return null;
  const percent = Math.round(((originalAmount - finalAmount) / originalAmount) * 100);
  return percent >= MIN_DISCOUNT_PERCENT ? percent : null;
}

/** Zachowane dla czytelności warunków w testach i komponentach. */
export function hasHonestDiscount(rate: LiteApiRate): boolean {
  return honestDiscountFrom(rate) !== null;
}
