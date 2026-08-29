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
  /**
   * Najlepszy kompromis cena/czas — TA SAMA formuła, którą liczy sort
   * „Najlepsze" (`sortOffers(…, "best")`, waga 0,7 cena / 0,3 czas).
   *
   * Odznaka MUSI wynikać z tej samej liczby co domyślne sortowanie, inaczej
   * pierwsza karta na liście nie byłaby tą oznaczoną jako najlepsza — a to
   * jedyna rzecz, którą użytkownik weryfikuje na tej odznace w pół sekundy.
   * Formuła jest zduplikowana świadomie (`filters.ts` nie może zaimportować
   * `badges.ts`, bo `badges.ts` importuje typy z tej samej warstwy i powstałby
   * cykl); pilnuje tego test `badges.test.ts`.
   */
  bestId: string | null;
}

/** Wyznacza offerId najtańszej (po total), najszybszej (po maxDurationMinutes) i najlepszej. */
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

  // „Najlepszy": znormalizowana cena (0,7) + znormalizowany czas (0,3).
  let bestId: string | null = null;
  if (offers.length > 0) {
    const prices = offers.map((o) => o.total ?? 0).filter((v) => v > 0);
    const durs = offers.map((o) => o.maxDurationMinutes);
    const pMin = Math.min(...prices, 0);
    const pMax = Math.max(...prices, 1);
    const dMin = Math.min(...durs, 0);
    const dMax = Math.max(...durs, 1);
    let bestScore = Infinity;
    for (const o of offers) {
      const p = pMax > pMin ? ((o.total ?? pMax) - pMin) / (pMax - pMin) : 0;
      const d = dMax > dMin ? (o.maxDurationMinutes - dMin) / (dMax - dMin) : 0;
      const score = 0.7 * p + 0.3 * d;
      if (score < bestScore) {
        bestScore = score;
        bestId = o.offerId;
      }
    }
  }

  return { cheapestId, fastestId, bestId };
}
