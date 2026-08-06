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
  };
}

/**
 * Czy istnieje UCZCIWA podstawa do pokazania przeceny.
 *
 * Zawsze `false` przy obecnym dostawcy i to jest udokumentowany fakt, nie
 * pesymizm: `initialPrice === total` na 400/400 zmierzonych taryf, a jedyna
 * wyższa kwota (`suggestedSellingPrice`) to cena konkurenta.
 *
 * Funkcja istnieje po to, żeby warunek był NAZWANY i przetestowany —
 * gdyby dostawca kiedyś zaczął podawać własną cenę bazową, wystarczy zmienić
 * to jedno miejsce zamiast szukać przekreśleń po komponentach.
 */
export function hasHonestDiscount(rate: LiteApiRate): boolean {
  const total = rate.retailRate?.total?.[0]?.amount;
  const initial = rate.retailRate?.initialPrice?.[0]?.amount;
  if (typeof total !== "number" || typeof initial !== "number") return false;
  // Cena bazowa musi być REALNIE wyższa i pochodzić od nas (initialPrice),
  // nie od konkurencji (suggestedSellingPrice).
  return initial > total;
}
