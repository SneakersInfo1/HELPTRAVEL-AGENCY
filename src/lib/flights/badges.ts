// Odznaki prowadzące decyzję na liście lotów (Faza C — konwersja). CZYSTE,
// client-safe. „Najtańszy"/„Najszybszy" liczone z PEŁNEJ puli ofert (stabilne,
// niezależne od filtra/sortu), „Bezpośredni" per-oferta. Pomagają oku wybrać —
// jak na Skyscanner/Booking.

import type { DisplayOffer } from "./display";

/** Bezpośredni = każdy odcinek (leg) bez przesiadek. Brak legów = nie. */
export function isDirectOffer(offer: DisplayOffer): boolean {
  return offer.legs.length > 0 && offer.legs.every((l) => l.stops === 0);
}

export interface OfferBadgeFlags {
  cheapestId: string | null;
  fastestId: string | null;
}

/** Wyznacza offerId najtańszej (po total) i najszybszej (po maxDurationMinutes). */
export function computeOfferBadges(offers: DisplayOffer[]): OfferBadgeFlags {
  let cheapestId: string | null = null;
  let cheapestVal = Infinity;
  let fastestId: string | null = null;
  let fastestVal = Infinity;
  for (const o of offers) {
    if (o.total !== null && o.total < cheapestVal) {
      cheapestVal = o.total;
      cheapestId = o.offerId;
    }
    if (o.maxDurationMinutes < fastestVal) {
      fastestVal = o.maxDurationMinutes;
      fastestId = o.offerId;
    }
  }
  return { cheapestId, fastestId };
}
