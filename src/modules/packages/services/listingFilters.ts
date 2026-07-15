// Logika filtrów listingu pakietów (krok 1) — CZYSTA, testowalna, bez UI.
//
// Zasada uczciwości: filtrujemy WYŁĄCZNIE po danych, które realnie mamy
// (cena/os., ocena gości, gwiazdki, wyżywienie z boardName, liczbowe dystanse
// z współrzędnych, lot bezpośredni). ZERO zmyślonych „udogodnień" — facilities
// nie ma w puli wyszukiwania; dojdą, gdy będą prawdziwe.
//
// Uwaga architektoniczna: listing ma JEDEN lot bazowy (hotel-first, §3.2) —
// bogate filtry lotu (pora, bagaż, przesiadki) należą do KROKU 2, nie tu.

import type { PackageOffer } from "../types";

/** Grupy wyżywienia — z tekstu boardName (już zlokalizowanego PL). */
export type BoardGroup = "all_inclusive" | "half_board" | "breakfast" | "room_only";

export const BOARD_LABELS: Record<BoardGroup, string> = {
  all_inclusive: "All inclusive",
  half_board: "Śniadanie i kolacja",
  breakfast: "Śniadanie",
  room_only: "Bez wyżywienia",
};

/** boardName → grupa. Brak/nierozpoznane traktujemy jak „bez wyżywienia". */
export function groupBoard(boardName: string | undefined): BoardGroup {
  if (!boardName) return "room_only";
  const b = boardName.toLowerCase();
  if (/all[\s-]?inclusive|wszystko w cenie/.test(b)) return "all_inclusive";
  if (/(obiadokolacja|kolacja|lunch|obiad|half)/.test(b) && /śniadan|half/.test(b)) return "half_board";
  if (/half[\s-]?board|2 posiłki/.test(b)) return "half_board";
  if (/śniadan|breakfast/.test(b)) return "breakfast";
  if (/pełne wyżywienie|full[\s-]?board|3 posiłki/.test(b)) return "half_board"; // FB rzadkie — do HB, nie gubimy
  return "room_only";
}

export interface ListingFilters {
  /** Zakres ceny za osobę (pełne zł); null = brzeg zakresu (bez ograniczenia). */
  priceMin: number | null;
  priceMax: number | null;
  /** Minimalna ocena gości: 0 = dowolna. */
  minRating: 0 | 7 | 8 | 9;
  /** Gwiazdki (multi); pusty zbiór = wszystkie. */
  stars: ReadonlySet<number>;
  /** Grupy wyżywienia (multi); pusty zbiór = wszystkie. */
  boards: ReadonlySet<BoardGroup>;
  /** Maks. km od centrum; null = bez ograniczenia. */
  maxCenterKm: number | null;
  /** Tylko blisko plaży (≤ 1 km). */
  nearBeach: boolean;
  /** Tylko lot bezpośredni. */
  directOnly: boolean;
}

export const EMPTY_FILTERS: ListingFilters = {
  priceMin: null,
  priceMax: null,
  minRating: 0,
  stars: new Set(),
  boards: new Set(),
  maxCenterKm: null,
  nearBeach: false,
  directOnly: false,
};

export const NEAR_BEACH_KM = 1;

export function countActiveFilters(f: ListingFilters): number {
  let n = 0;
  if (f.priceMin !== null || f.priceMax !== null) n++;
  if (f.minRating > 0) n++;
  if (f.stars.size > 0) n++;
  if (f.boards.size > 0) n++;
  if (f.maxCenterKm !== null) n++;
  if (f.nearBeach) n++;
  if (f.directOnly) n++;
  return n;
}

export function matchesFilters(o: PackageOffer, f: ListingFilters): boolean {
  const price = o.pricing.pricePerPerson.amount;
  if (f.priceMin !== null && price < f.priceMin) return false;
  if (f.priceMax !== null && price > f.priceMax) return false;
  if (f.minRating > 0 && (o.hotel.rating ?? 0) < f.minRating) return false;
  if (f.stars.size > 0 && !f.stars.has(Math.round(o.hotel.stars ?? 0))) return false;
  if (f.boards.size > 0 && !f.boards.has(groupBoard(o.hotel.boardName))) return false;
  if (f.maxCenterKm !== null) {
    const km = o.hotel.distanceCenterKm;
    if (km === undefined || km > f.maxCenterKm) return false;
  }
  if (f.nearBeach) {
    const km = o.hotel.distanceBeachKm;
    if (km === undefined || km > NEAR_BEACH_KM) return false;
  }
  if (f.directOnly && !o.flight.direct) return false;
  return true;
}

export function applyFilters(offers: PackageOffer[], f: ListingFilters): PackageOffer[] {
  return offers.filter((o) => matchesFilters(o, f));
}

/** Liczniki opcji (po PEŁNYM zbiorze — stabilne, jak na dużych OTA w MVP). */
export interface FilterFacets {
  price: { min: number; max: number } | null;
  rating: Record<7 | 8 | 9, number>;
  stars: { value: number; count: number }[]; // tylko wartości występujące, malejąco
  boards: { group: BoardGroup; count: number }[]; // w stałej kolejności, tylko >0
  center: Record<1 | 3 | 5, number>;
  nearBeach: number;
  direct: number;
  hasAnyCenterData: boolean;
  hasAnyBeachData: boolean;
}

const BOARD_ORDER: BoardGroup[] = ["breakfast", "half_board", "all_inclusive", "room_only"];

export function computeFacets(offers: PackageOffer[]): FilterFacets {
  let min = Infinity;
  let max = -Infinity;
  const rating: Record<7 | 8 | 9, number> = { 7: 0, 8: 0, 9: 0 };
  const stars = new Map<number, number>();
  const boards = new Map<BoardGroup, number>();
  const center: Record<1 | 3 | 5, number> = { 1: 0, 3: 0, 5: 0 };
  let nearBeach = 0;
  let direct = 0;
  let hasAnyCenterData = false;
  let hasAnyBeachData = false;

  for (const o of offers) {
    const p = o.pricing.pricePerPerson.amount;
    if (p < min) min = p;
    if (p > max) max = p;
    const r = o.hotel.rating ?? 0;
    if (r >= 7) rating[7]++;
    if (r >= 8) rating[8]++;
    if (r >= 9) rating[9]++;
    const s = Math.round(o.hotel.stars ?? 0);
    if (s > 0) stars.set(s, (stars.get(s) ?? 0) + 1);
    const g = groupBoard(o.hotel.boardName);
    boards.set(g, (boards.get(g) ?? 0) + 1);
    const ckm = o.hotel.distanceCenterKm;
    if (ckm !== undefined) {
      hasAnyCenterData = true;
      if (ckm <= 1) center[1]++;
      if (ckm <= 3) center[3]++;
      if (ckm <= 5) center[5]++;
    }
    const bkm = o.hotel.distanceBeachKm;
    if (bkm !== undefined) {
      hasAnyBeachData = true;
      if (bkm <= NEAR_BEACH_KM) nearBeach++;
    }
    if (o.flight.direct) direct++;
  }

  return {
    price: offers.length ? { min: Math.floor(min), max: Math.ceil(max) } : null,
    rating,
    stars: [...stars.entries()].sort((a, b) => b[0] - a[0]).map(([value, count]) => ({ value, count })),
    boards: BOARD_ORDER.filter((g) => (boards.get(g) ?? 0) > 0).map((g) => ({ group: g, count: boards.get(g)! })),
    center,
    nearBeach,
    direct,
    hasAnyCenterData,
    hasAnyBeachData,
  };
}

export type ListingSort = "recommended" | "price" | "rating" | "center";

export function sortOffersForListing(offers: PackageOffer[], sort: ListingSort): PackageOffer[] {
  const arr = [...offers];
  if (sort === "price") arr.sort((a, b) => a.pricing.pricePerPerson.amount - b.pricing.pricePerPerson.amount);
  else if (sort === "rating") arr.sort((a, b) => (b.hotel.rating ?? 0) - (a.hotel.rating ?? 0));
  else if (sort === "center")
    arr.sort((a, b) => (a.hotel.distanceCenterKm ?? Infinity) - (b.hotel.distanceCenterKm ?? Infinity));
  return arr;
}
