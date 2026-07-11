// packagePricing — kalkulacja ceny/os., delty, zaokrąglenia, marże (§2, §3.2).
// STUB Fazy 0: sygnatury zamrożone; implementacja + testy jednostkowe (zaokrąglenia,
// delty, dzielenie per osoba przy nieparzystych kwotach) w Fazie 1 (Checkpoint 1.0).
//
// Zasady: cena „za osobę" na listingu = ceil(total / adults); w koszyku zawsze też
// cena całkowita. Zamiana lotu/pokoju prezentowana jako DELTA (+0 zł / +532 zł),
// nigdy jako cena absolutna. „Płatne teraz" vs „podatki/opłaty w hotelu" rozdzielone.

import type { PackageMoney, PackagePricing } from "../types";

/** ceil(total / adults) — cena za osobę (zaokrąglenie w górę, nigdy nie zaniżamy ceny). */
export function pricePerPerson(_total: PackageMoney, _adults: number): PackageMoney {
  throw new Error("packagePricing.pricePerPerson: not implemented (Faza 1, Checkpoint 1.0)");
}

/** Delta cenowa między ofertą bazową a alternatywną (do prezentacji „+X zł"). */
export function priceDelta(_base: PackagePricing, _candidate: PackagePricing): PackageMoney {
  throw new Error("packagePricing.priceDelta: not implemented (Faza 1, Checkpoint 1.0)");
}
