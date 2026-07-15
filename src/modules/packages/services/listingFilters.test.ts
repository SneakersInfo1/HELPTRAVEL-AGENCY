// Testy logiki filtrów listingu: grupowanie wyżywienia, dopasowanie, facety.

import test from "node:test";
import assert from "node:assert/strict";

import type { PackageOffer } from "../types";
import {
  applyFilters,
  computeFacets,
  countActiveFilters,
  EMPTY_FILTERS,
  groupBoard,
  sortOffersForListing,
  type ListingFilters,
} from "./listingFilters";

const pln = (amount: number) => ({ amount, currency: "PLN" as const });

function offer(over: {
  id: string;
  price: number;
  rating?: number;
  stars?: number;
  board?: string;
  centerKm?: number;
  beachKm?: number;
  direct?: boolean;
}): PackageOffer {
  return {
    hotel: {
      hotelId: over.id,
      name: over.id,
      ...(over.stars !== undefined ? { stars: over.stars } : {}),
      ...(over.rating !== undefined ? { rating: over.rating } : {}),
      ...(over.board !== undefined ? { boardName: over.board } : {}),
      ...(over.centerKm !== undefined ? { distanceCenterKm: over.centerKm } : {}),
      ...(over.beachKm !== undefined ? { distanceBeachKm: over.beachKm } : {}),
      freeCancellationUntil: "2026-08-01",
      hotelOfferId: `off-${over.id}`,
      nights: 4,
    },
    flight: { offerId: "f-1", direct: over.direct ?? true },
    pricing: { pricePerPerson: pln(over.price), total: pln(over.price * 2), breakdown: { hotel: pln(1), flight: pln(1) } },
  };
}

test("groupBoard: polskie i angielskie nazwy trafiają do właściwych grup", () => {
  assert.equal(groupBoard("Śniadanie w cenie"), "breakfast");
  assert.equal(groupBoard("Breakfast included"), "breakfast");
  assert.equal(groupBoard("Śniadanie i obiadokolacja"), "half_board");
  assert.equal(groupBoard("Half board"), "half_board");
  assert.equal(groupBoard("Pełne wyżywienie"), "half_board"); // FB → HB, nie gubimy
  assert.equal(groupBoard("All inclusive"), "all_inclusive");
  assert.equal(groupBoard("All-Inclusive Premium"), "all_inclusive");
  assert.equal(groupBoard("Bez wyżywienia"), "room_only");
  assert.equal(groupBoard(undefined), "room_only");
  assert.equal(groupBoard("Room only"), "room_only");
});

const OFFERS = [
  offer({ id: "a", price: 2000, rating: 9.1, stars: 5, board: "Śniadanie w cenie", centerKm: 0.4, beachKm: 0.8 }),
  offer({ id: "b", price: 2600, rating: 8.2, stars: 4, board: "All inclusive", centerKm: 2.5 }),
  offer({ id: "c", price: 1500, rating: 7.4, stars: 3, board: "Bez wyżywienia", centerKm: 4.9, beachKm: 3 }),
  offer({ id: "d", price: 3200, rating: 6.9, stars: 4, centerKm: 8, direct: false }),
];

function f(over: Partial<ListingFilters>): ListingFilters {
  return { ...EMPTY_FILTERS, ...over };
}

test("zakres ceny zawęża listę (granice włącznie)", () => {
  const out = applyFilters(OFFERS, f({ priceMin: 1500, priceMax: 2600 }));
  assert.deepEqual(out.map((o) => o.hotel.hotelId), ["a", "b", "c"]);
});

test("minRating, gwiazdki multi i wyżywienie działają łącznie", () => {
  const out = applyFilters(OFFERS, f({ minRating: 8, stars: new Set([4, 5]), boards: new Set(["breakfast", "all_inclusive"]) }));
  assert.deepEqual(out.map((o) => o.hotel.hotelId), ["a", "b"]);
});

test("dystans od centrum: brak danych o dystansie = hotel wypada z filtra (uczciwie)", () => {
  const noData = offer({ id: "x", price: 1000 });
  const out = applyFilters([...OFFERS, noData], f({ maxCenterKm: 3 }));
  assert.deepEqual(out.map((o) => o.hotel.hotelId), ["a", "b"]);
});

test("nearBeach ≤1 km; directOnly odfiltrowuje przesiadki", () => {
  assert.deepEqual(applyFilters(OFFERS, f({ nearBeach: true })).map((o) => o.hotel.hotelId), ["a"]);
  assert.equal(applyFilters(OFFERS, f({ directOnly: true })).length, 3);
});

test("countActiveFilters liczy sekcje, nie pojedyncze opcje", () => {
  assert.equal(countActiveFilters(EMPTY_FILTERS), 0);
  assert.equal(countActiveFilters(f({ priceMin: 100, priceMax: 200, stars: new Set([4, 5]), nearBeach: true })), 3);
});

test("computeFacets: zakres cen, liczniki ocen/gwiazdek/wyżywienia/dystansów", () => {
  const facets = computeFacets(OFFERS);
  assert.deepEqual(facets.price, { min: 1500, max: 3200 });
  assert.deepEqual(facets.rating, { 7: 3, 8: 2, 9: 1 });
  assert.deepEqual(facets.stars, [
    { value: 5, count: 1 },
    { value: 4, count: 2 },
    { value: 3, count: 1 },
  ]);
  assert.deepEqual(facets.boards, [
    { group: "breakfast", count: 1 },
    { group: "all_inclusive", count: 1 },
    { group: "room_only", count: 2 }, // „d" bez boardName → room_only
  ]);
  assert.deepEqual(facets.center, { 1: 1, 3: 2, 5: 3 });
  assert.equal(facets.nearBeach, 1);
  assert.equal(facets.direct, 3);
  assert.equal(facets.hasAnyCenterData, true);
  assert.equal(facets.hasAnyBeachData, true);
});

test("computeFacets: pusty zbiór → price null, sekcje dystansu ukrywalne", () => {
  const facets = computeFacets([]);
  assert.equal(facets.price, null);
  assert.equal(facets.hasAnyCenterData, false);
  assert.equal(facets.hasAnyBeachData, false);
});

test("sort: cena rosnąco, ocena malejąco, centrum rosnąco (brak danych na koniec)", () => {
  assert.deepEqual(sortOffersForListing(OFFERS, "price").map((o) => o.hotel.hotelId), ["c", "a", "b", "d"]);
  assert.deepEqual(sortOffersForListing(OFFERS, "rating").map((o) => o.hotel.hotelId), ["a", "b", "c", "d"]);
  const noData = offer({ id: "x", price: 1000 });
  assert.deepEqual(
    sortOffersForListing([noData, ...OFFERS], "center").map((o) => o.hotel.hotelId),
    ["a", "b", "c", "d", "x"],
  );
  assert.deepEqual(sortOffersForListing(OFFERS, "recommended").map((o) => o.hotel.hotelId), ["a", "b", "c", "d"]);
});
