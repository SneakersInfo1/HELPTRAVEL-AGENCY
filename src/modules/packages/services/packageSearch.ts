// packageSearch — orkiestracja hotele × loty → oferty pakietowe (§3.2).
// STUB Fazy 0: sygnatura zamrożona, implementacja w Fazie 1 (Checkpoint 1.0).
//
// Strategia (hotel-first, jak benchmark):
//  1) równolegle: (a) hotele z rate'ami przez istniejący hotel-search (reuse cache
//     Upstash), (b) JEDEN flight-search dla pary tras/dat → wybór bestFlight
//     (bezpośredni > cena > czas > godziny 7:00–21:00),
//  2) PackageOffer = hotelRate + bestFlight; pricePerPerson = ceil(total / adults),
//  3) filtr MVP: tylko hotele z darmową anulacją (bezpiecznik sagi),
//  4) cache lotu w Redis: klucz `flt:{origin}:{dest}:{dates}:{pax}:{cabin}`,
//     TTL = min(offer.expiration, 15 min). Zamiana lotu (krok 2) = pełny search
//     dopiero na żądanie, nie przy wejściu na listing.

import type { PackageSearchParams, PackageSearchResult } from "../types";

export async function searchPackages(_params: PackageSearchParams): Promise<PackageSearchResult> {
  throw new Error("packageSearch: not implemented (Faza 1, Checkpoint 1.0)");
}
