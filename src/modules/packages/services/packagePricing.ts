// packagePricing — kalkulacja ceny/os., delty, zaokrąglenia, marże (§2, §3.2).
// Czyste funkcje (bez I/O) — w pełni testowalne. Zasady:
//  • cena „za osobę" na listingu = ceil(total / adults) — ZAWSZE w górę (nigdy
//    nie zaniżamy ceny); w koszyku obok zawsze cena całkowita,
//  • zamiana lotu/pokoju = DELTA (+0 zł / +532 zł / -120 zł), nie cena absolutna,
//  • „płatne teraz" (hotel now + lot [+ ancillaries]) oddzielone od podatków/opłat
//    regulowanych w hotelu (taxesAtHotel).

import type { PackageMoney, PackagePricing } from "../types";

/** Konstruktor kwoty PLN z zabezpieczeniem przed dryfem float (2 miejsca po przecinku). */
export function pln(amount: number): PackageMoney {
  return { amount: Math.round(amount * 100) / 100, currency: "PLN" };
}

function assertPln(...values: PackageMoney[]): void {
  for (const v of values) {
    if (v.currency !== "PLN") throw new Error(`packagePricing: oczekiwano PLN, otrzymano ${v.currency}`);
  }
}

/** Suma kwot (PLN), odporna na dryf float. */
export function addMoney(a: PackageMoney, b: PackageMoney): PackageMoney {
  assertPln(a, b);
  return pln(a.amount + b.amount);
}

/** Różnica kwot (PLN) — może być ujemna (tab „Najtańsze" poniżej domyślnego lotu). */
export function subtractMoney(a: PackageMoney, b: PackageMoney): PackageMoney {
  assertPln(a, b);
  return pln(a.amount - b.amount);
}

/** ceil(total / adults) → cena za osobę w pełnych złotych (zaokrąglenie W GÓRĘ). */
export function pricePerPerson(total: PackageMoney, adults: number): PackageMoney {
  assertPln(total);
  if (!Number.isInteger(adults) || adults < 1) {
    throw new Error(`packagePricing: adults musi być liczbą całkowitą ≥ 1 (otrzymano ${adults})`);
  }
  return { amount: Math.ceil(total.amount / adults), currency: "PLN" };
}

/** Liczba dorosłych ze wszystkich pokoi (podstawa dzielenia ceny per osoba). */
export function countAdults(occupancies: { adults: number; children: number[] }[]): number {
  return occupancies.reduce((sum, o) => sum + o.adults, 0);
}

/** Buduje pełną wycenę pakietu z części składowych (§4). */
export function buildPackagePricing(input: {
  hotel: PackageMoney; // „płatne teraz" część hotelu
  flight: PackageMoney;
  adults: number;
  ancillaries?: PackageMoney;
  taxesAtHotel?: PackageMoney;
}): PackagePricing {
  const { hotel, flight, adults, ancillaries, taxesAtHotel } = input;
  assertPln(hotel, flight);
  if (ancillaries) assertPln(ancillaries);
  if (taxesAtHotel) assertPln(taxesAtHotel);
  let total = addMoney(hotel, flight);
  if (ancillaries) total = addMoney(total, ancillaries);
  return {
    pricePerPerson: pricePerPerson(total, adults),
    total,
    ...(taxesAtHotel ? { taxesAtHotel } : {}),
    breakdown: { hotel, flight, ...(ancillaries ? { ancillaries } : {}) },
  };
}

/** Delta cenowa (candidate − base) — do prezentacji „+X zł"/„−X zł"; +0 zł dla domyślnej oferty. */
export function priceDelta(base: PackageMoney, candidate: PackageMoney): PackageMoney {
  return subtractMoney(candidate, base);
}
