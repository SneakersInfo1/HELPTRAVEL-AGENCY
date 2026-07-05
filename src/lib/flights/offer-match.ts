// Dopasowanie „tego samego lotu" między wygasłą ofertą a ŚWIEŻYMI wynikami —
// do płynnego odzyskiwania po `52099`/OFFER_UNAVAILABLE (oferta wygasła, gdy
// user dotarł do verify). Oferty lotów żyją krótko; po wygaśnięciu robimy fresh
// re-search i musimy znaleźć DOKŁADNIE ten sam lot, żeby kontynuować bez cichej
// podmiany na inny/droższy rejs (lejek płatności — uczciwość ponad wygodę).
//
// CZYSTE (zero I/O) → w pełni testowalne. Dopasowanie po PODPISIE segmentów
// (numer rejsu + przewoźnik + trasa + godziny). Ten sam podpis = te same rejsy
// o tych samych godzinach = ten sam lot. Cokolwiek innego → brak dopasowania
// (null), a UI spada do ręcznego „wróć do wyników". NIGDY nie zgadujemy.

import type { DisplayOffer, FareOption } from "./display";

/** Kanoniczny, deterministyczny podpis lotu z segmentów wszystkich odcinków. */
export function offerSignature(offer: DisplayOffer): string {
  return [...offer.legs]
    .sort((a, b) => a.direction.localeCompare(b.direction))
    .map((leg) =>
      leg.segments
        .map(
          (s) =>
            `${s.carrierCode}#${s.flightNumber ?? ""}#${s.originCode}#${s.destinationCode}#${s.departureTime}#${s.arrivalTime}`,
        )
        .join(">"),
    )
    .join("||");
}

/**
 * Znajdź w świeżych wynikach TEN SAM lot co `target` (ścisłe dopasowanie po
 * podpisie segmentów). `null`, gdy lotu już nie ma albo target nie ma segmentów.
 */
export function findMatchingOffer(
  fresh: readonly DisplayOffer[],
  target: DisplayOffer,
): DisplayOffer | null {
  const sig = offerSignature(target);
  if (!sig) return null; // brak segmentów → nie ryzykujemy dopasowania
  return fresh.find((o) => offerSignature(o) === sig) ?? null;
}

/**
 * W dopasowanym locie znajdź TĘ SAMĄ taryfę: najpierw po nazwie (branded fare),
 * w razie braku po profilu bagażu (podręczny/rejestrowany). `null`, gdy taryfy
 * o tym profilu nie ma — wtedy UI też spada do ręcznego odzyskiwania.
 */
export function findMatchingFare(
  offer: DisplayOffer,
  target: { name?: string | null; hasCarryOnBag: boolean; hasCheckedBag: boolean },
): FareOption | null {
  if (target.name) {
    const byName = offer.fares.find((f) => f.fareName === target.name);
    if (byName) return byName;
  }
  return (
    offer.fares.find(
      (f) => f.hasCarryOnBag === target.hasCarryOnBag && f.hasCheckedBag === target.hasCheckedBag,
    ) ?? null
  );
}
