import assert from "node:assert/strict";
import { test } from "node:test";

import { computeOfferBadges, isDirectOffer } from "./badges";
import type { DisplayOffer } from "./display";
import { sortOffers } from "./filters";

function offer(id: string, total: number | null, maxDur: number, stops: number[]): DisplayOffer {
  return {
    offerId: id,
    total,
    currency: "PLN",
    legs: stops.map((s, i) => ({
      direction: i === 0 ? "OUTBOUND" : "INBOUND",
      originCode: "AAA", destinationCode: "BBB", departureTime: "", arrivalTime: "",
      durationMinutes: maxDur, stops: s, carriers: [], carrierCode: "", segments: [],
    })) as DisplayOffer["legs"],
    maxDurationMinutes: maxDur,
    hasCheckedBag: false,
    hasCarryOnBag: true,
    fares: [],
  };
}

test("isDirectOffer: wszystkie legi 0 przesiadek = bezpośredni", () => {
  assert.equal(isDirectOffer(offer("a", 500, 120, [0, 0])), true);
  assert.equal(isDirectOffer(offer("b", 500, 120, [0, 1])), false);
  assert.equal(isDirectOffer(offer("c", 500, 120, [1])), false);
});

test("isDirectOffer: brak legów = nie bezpośredni", () => {
  assert.equal(isDirectOffer(offer("x", 500, 120, [])), false);
});

test("computeOfferBadges: najtańszy (po total) + najszybszy (po czasie)", () => {
  const offers = [offer("a", 800, 100, [0]), offer("b", 500, 200, [0]), offer("c", 600, 90, [1])];
  const b = computeOfferBadges(offers);
  assert.equal(b.cheapestId, "b");
  assert.equal(b.fastestId, "c");
});

test("computeOfferBadges: total=null pomijany przy najtańszym", () => {
  const offers = [offer("a", null, 100, [0]), offer("b", 700, 200, [0])];
  assert.equal(computeOfferBadges(offers).cheapestId, "b");
});

test("computeOfferBadges: pusta lista → same null (żadnej odznaki znikąd)", () => {
  assert.deepEqual(computeOfferBadges([]), { cheapestId: null, fastestId: null, bestId: null });
});

// Odznaka „Najlepszy" i domyślny sort MUSZĄ wskazywać tę samą ofertę — inaczej
// pierwsza karta na liście nie byłaby tą oznaczoną, co użytkownik zauważa
// natychmiast. Formuła jest w dwóch plikach (cykl importów), więc pilnuje jej
// test, a nie komentarz.
test("computeOfferBadges: bestId == pierwsza oferta sortu „Najlepsze”", () => {
  const offers = [
    offer("drogi-szybki", 2000, 100, [0]),
    offer("tani-wolny", 900, 900, [1]),
    offer("kompromis", 1000, 150, [0]),
  ];
  assert.equal(computeOfferBadges(offers).bestId, sortOffers(offers, "best")[0].offerId);
});

test("computeOfferBadges: jedna oferta jest jednocześnie najtańsza, najszybsza i najlepsza", () => {
  const b = computeOfferBadges([offer("jedyna", 500, 120, [0])]);
  assert.deepEqual(b, { cheapestId: "jedyna", fastestId: "jedyna", bestId: "jedyna" });
});

test("computeOfferBadges: identyczne oferty → odznaka trafia w pierwszą, nie w losową", () => {
  const offers = [offer("a", 500, 120, [0]), offer("b", 500, 120, [0])];
  const b = computeOfferBadges(offers);
  assert.equal(b.cheapestId, "a");
  assert.equal(b.fastestId, "a");
  assert.equal(b.bestId, "a");
});
