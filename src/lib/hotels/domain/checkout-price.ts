// Cena checkoutu — JEDNA normalizacja odpowiedzi PREBOOKA.
//
// DLACZEGO TO ISTNIEJE.
// Checkout pokazywał gościowi bezwarunkowe „wł. podatków i opłat", podczas gdy
// dostawca jawnie oznaczał część opłat jako NIEwliczone. Pomiar na żywym
// LiteAPI (17 776 taryf, 4 miasta, 2026-08-08): **14 315 taryf (80,5%)** miało
// co najmniej jedną pozycję `included: false`, średnio **352,38 PLN**
// nieujawnionej dopłaty. Strona pokoju mówiła prawdę, checkout nie.
// Dowody: `docs/hotel-redesign/price-integrity-audit.md`.
//
// Przyczyną nie był zły tekst, tylko brak danych: `BookingSummaryCard`
// dostawał gołe `price: number`, a schemat prebooka wyrzucał `taxesAndFees`.
// Ten moduł zamyka lukę — bierze odpowiedź prebooka i zwraca model, w którym
// „teraz" i „na miejscu" są ROZŁĄCZNE i nazwane.
//
// ŹRÓDŁO PRAWDY: wyłącznie PREBOOK. Nigdy query string — patrz `fail closed`
// w `buildCheckoutPrice`.

import { toMinor } from "@/lib/money";
import type { LiteApiRate } from "@/lib/liteapi";

import { mapTaxes } from "./price";
import type { TaxOrFee } from "./types";

/**
 * Czy wolno pokazać „łączny koszt pobytu".
 *
 * NIE. I to jest decyzja, nie przeoczenie.
 *
 * Policzyć `price + suma(pozycji excluded)` umiemy. Czego NIE mamy, to
 * potwierdzenia od dostawcy, że ta suma jest KOMPLETNYM kosztem pobytu —
 * że w obiekcie nie dojdzie nic, czego `taxesAndFees` nie wymienia (kaucja,
 * opłata klimatyczna, parking, resort fee spoza rozbicia). Pokazanie kwoty
 * „łącznie", która okaże się niepełna przy meldowaniu, jest DOKŁADNIE tym
 * samym gatunkiem kłamstwa, który ten moduł naprawia — tylko z inną liczbą.
 *
 * Żeby to odblokować, trzeba pisemnego potwierdzenia od LiteAPI, że
 * `retailRate.taxesAndFees` wyczerpuje opłaty pobierane w obiekcie. Wtedy
 * ta stała idzie na `true` i UI dostaje trzecią linię — zmiana jednoliniowa
 * i w pełni przeglądalna.
 */
const GRAND_TOTAL_POTWIERDZONY_PRZEZ_DOSTAWCE = false;

/** Co dokładnie mówimy gościowi o podatkach TEJ taryfy. */
export type CheckoutTaxSummary =
  /** Każda pozycja jest w cenie — wolno napisać „podatki i opłaty wliczone". */
  | "all-included"
  /** Co najmniej jedna pozycja płatna na miejscu — trzeba pokazać OBIE grupy. */
  | "some-at-property"
  /** Dostawca nie podał rozbicia — NIE piszemy nic o podatkach. */
  | "unknown";

export interface CheckoutPrice {
  /** Waluta kwoty płatnej teraz. */
  currency: string;
  /** Kwota, którą gość zapłaci TERAZ, kartą. Autorytatywnie z prebooka. */
  payableNowMinor: bigint;

  /** Pozycje zawarte w `payableNowMinor`. */
  includedItems: TaxOrFee[];
  /** Pozycje, które gość zapłaci w obiekcie. */
  atPropertyItems: TaxOrFee[];

  /**
   * Suma pozycji płatnych na miejscu. `null`, gdy żadnej nie da się policzyć
   * (dostawca podał sam opis, np. „$163.02 USD per room per stay") albo gdy
   * pozycje są w różnych walutach — sumowanie byłoby wtedy zmyślaniem.
   */
  payableAtPropertyMinor: bigint | null;
  /** Waluta dopłaty. Bywa INNA niż waluta ceny (opłaty lokalne). */
  atPropertyCurrency: string | null;
  /** Są pozycje płatne na miejscu, których kwoty dostawca nie podał liczbowo. */
  atPropertyHasUncountable: boolean;

  /** Suma całkowita — patrz `GRAND_TOTAL_POTWIERDZONY_PRZEZ_DOSTAWCE`. */
  grandTotalMinor: bigint | null;
  grandTotalKnown: boolean;

  taxSummary: CheckoutTaxSummary;

  /** >0 = podrożało, <0 = staniało. `null` = dostawca nie podał. */
  priceChangePercent: number | null;
  /** Dostawca zmienił zasady anulacji między wyszukiwaniem a prebookiem. */
  cancellationChanged: boolean;
  /** Dostawca zmienił wyżywienie między wyszukiwaniem a prebookiem. */
  boardChanged: boolean;
}

/** Kształt wejścia — dokładnie to, co niesie `LiteApiPrebookResponse["data"]`. */
export interface CheckoutPriceInput {
  price?: number | null;
  currency?: string | null;
  roomTypes?: { rates?: LiteApiRate[] }[] | null;
  priceDifferencePercent?: number | null;
  cancellationChanged?: boolean | null;
  boardChanged?: boolean | null;
}

/**
 * Buduje model ceny checkoutu z odpowiedzi prebooka.
 *
 * Zwraca `null`, gdy prebook NIE dał ceny albo waluty. To jest **fail closed**
 * i jest celowe: brak ceny z prebooka to błąd procesu, nie sytuacja do
 * podstawienia liczby z URL-a. Wywołujący ma wtedy NIE inicjalizować płatności.
 */
export function buildCheckoutPrice(input: CheckoutPriceInput): CheckoutPrice | null {
  const { price, currency } = input;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  if (!currency) return null;

  // Rozbicie podatkowe zbieramy ze WSZYSTKICH taryf, które prebook odesłał.
  // W praktyce jest jedna (prebook dotyczy konkretnej oferty), ale kształt
  // odpowiedzi jest tablicowy i nie ma powodu zakładać liczności.
  const wszystkie: TaxOrFee[] = [];
  for (const rt of input.roomTypes ?? []) {
    for (const rate of rt.rates ?? []) {
      wszystkie.push(...mapTaxes(rate));
    }
  }

  const includedItems = wszystkie.filter((t) => t.includedInTotal);
  const atPropertyItems = wszystkie.filter((t) => !t.includedInTotal);

  // Sumujemy WYŁĄCZNIE pozycje policzalne i tylko wtedy, gdy wszystkie są
  // w jednej walucie. Mieszanie walut w jednej sumie dałoby liczbę, która
  // nie znaczy nic.
  const zKwota = atPropertyItems.filter((t) => t.amountMinor !== null);
  const waluty = new Set(zKwota.map((t) => t.currency).filter(Boolean));
  const spojnaWaluta = waluty.size === 1 ? ([...waluty][0] as string) : null;
  const payableAtPropertyMinor =
    zKwota.length > 0 && spojnaWaluta
      ? zKwota.reduce((s, t) => s + t.amountMinor!, BigInt(0))
      : null;

  const atPropertyHasUncountable = atPropertyItems.some((t) => t.amountMinor === null);

  const taxSummary: CheckoutTaxSummary =
    wszystkie.length === 0 ? "unknown" : atPropertyItems.length === 0 ? "all-included" : "some-at-property";

  const payableNowMinor = toMinor(price);

  // Suma całkowita ma sens arytmetyczny tylko przy zgodnej walucie i pełnym
  // komplecie policzalnych pozycji — a i wtedy pokazujemy ją dopiero po
  // potwierdzeniu semantyki przez dostawcę.
  const sumowalna =
    payableAtPropertyMinor !== null && !atPropertyHasUncountable && spojnaWaluta === currency;
  const grandTotalMinor = sumowalna ? payableNowMinor + payableAtPropertyMinor! : null;

  return {
    currency,
    payableNowMinor,
    includedItems,
    atPropertyItems,
    payableAtPropertyMinor,
    atPropertyCurrency: spojnaWaluta,
    atPropertyHasUncountable,
    grandTotalMinor,
    grandTotalKnown: GRAND_TOTAL_POTWIERDZONY_PRZEZ_DOSTAWCE && grandTotalMinor !== null,
    taxSummary,
    priceChangePercent:
      typeof input.priceDifferencePercent === "number" && Number.isFinite(input.priceDifferencePercent)
        ? input.priceDifferencePercent
        : null,
    cancellationChanged: input.cancellationChanged === true,
    boardChanged: input.boardChanged === true,
  };
}

/**
 * Czy warunki oferty zmieniły się na tyle, że gość MUSI to zobaczyć przed
 * płatnością. Zmiana ceny w dół też się liczy — nie blokuje zakupu, ale
 * kwota na ekranie ma się zgadzać z tym, co obciąży dostawcę.
 */
export function wymagaUwagiPrzedPlatnoscia(p: CheckoutPrice): boolean {
  return (p.priceChangePercent ?? 0) !== 0 || p.cancellationChanged || p.boardChanged;
}

/** Pozycja podatkowa w postaci nadającej się na drut (JSON nie zna `bigint`). */
export interface CheckoutTaxItemWire {
  description: string | null;
  amount: number | null;
  currency: string | null;
}

/** `CheckoutPrice` w postaci przesyłanej z API do klienta. Kwoty w jednostkach głównych. */
export interface CheckoutPriceWire {
  currency: string;
  payableNow: number;
  includedItems: CheckoutTaxItemWire[];
  atPropertyItems: CheckoutTaxItemWire[];
  payableAtProperty: number | null;
  atPropertyCurrency: string | null;
  atPropertyHasUncountable: boolean;
  grandTotal: number | null;
  grandTotalKnown: boolean;
  taxSummary: CheckoutTaxSummary;
  priceChangePercent: number | null;
  cancellationChanged: boolean;
  boardChanged: boolean;
}

const naGlowne = (v: bigint | null): number | null => (v === null ? null : Number(v) / 100);

const pozycjaNaDrut = (t: TaxOrFee): CheckoutTaxItemWire => ({
  description: t.description,
  amount: naGlowne(t.amountMinor),
  currency: t.currency,
});

/** Serializacja do JSON-a. `bigint` nie przechodzi przez `JSON.stringify`. */
export function checkoutPriceNaDrut(p: CheckoutPrice): CheckoutPriceWire {
  return {
    currency: p.currency,
    payableNow: Number(p.payableNowMinor) / 100,
    includedItems: p.includedItems.map(pozycjaNaDrut),
    atPropertyItems: p.atPropertyItems.map(pozycjaNaDrut),
    payableAtProperty: naGlowne(p.payableAtPropertyMinor),
    atPropertyCurrency: p.atPropertyCurrency,
    atPropertyHasUncountable: p.atPropertyHasUncountable,
    grandTotal: naGlowne(p.grandTotalMinor),
    grandTotalKnown: p.grandTotalKnown,
    taxSummary: p.taxSummary,
    priceChangePercent: p.priceChangePercent,
    cancellationChanged: p.cancellationChanged,
    boardChanged: p.boardChanged,
  };
}
