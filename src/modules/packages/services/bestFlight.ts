// Wybór lotu BAZOWEGO dla listingu pakietów (§3.2 pkt 2). CZYSTE (zero I/O).
// Jeden lot bazowy na cały listing; zamiana lotu (krok 2) to osobny, pełny
// flight-search na żądanie. Priorytet: bezpośredni > najtańszy > najkrótszy >
// godziny cywilizowane (wylot 7:00–21:00). To NIE jest sortOffers("best")
// z src/lib/flights/filters (waga 0,7/0,3) — tam nie ma direct-first ani
// preferencji godzin, a dla lotu „domyślnego +0 zł" te dwie rzeczy są kluczowe.

import type { DisplayOffer } from "@/lib/flights/display";

/** Godzina wylotu z ISO (wall-clock lotniska, deterministycznie — bez stref/Date). */
function departureHour(iso: string): number {
  const m = /T(\d{2}):/.exec(iso);
  return m ? Number(m[1]) : 12; // brak godziny → traktuj neutralnie (cywilizowana)
}

/** Odcinek niecywilizowany = wylot przed 7:00 lub po 21:00 (21:00 jeszcze OK). */
function uncivilizedCount(offer: DisplayOffer): number {
  return offer.legs.filter((l) => {
    const h = departureHour(l.departureTime);
    return h < 7 || h > 21;
  }).length;
}

/** Lot bezpośredni = każdy odcinek bez przesiadek. */
export function isDirectOffer(offer: DisplayOffer): boolean {
  return offer.legs.every((l) => l.stops === 0);
}

/** Klucz sortujący: mniejszy = lepszy. Kolejność pól = kolejność priorytetów. */
function rankKey(offer: DisplayOffer): [number, number, number, number] {
  return [
    isDirectOffer(offer) ? 0 : 1,
    offer.total ?? Infinity,
    offer.maxDurationMinutes,
    uncivilizedCount(offer),
  ];
}

/** Wybiera lot bazowy wg priorytetu bezpośredni > cena > czas > godziny 7–21. */
export function selectBaseFlight(offers: DisplayOffer[]): DisplayOffer | null {
  if (offers.length === 0) return null;
  // Node sort jest stabilny → przy remisie zachowuje kolejność wejścia.
  return [...offers].sort((a, b) => {
    const ka = rankKey(a);
    const kb = rankKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  })[0];
}
