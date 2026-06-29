import assert from "node:assert/strict";
import { test } from "node:test";

import { computeOfferBadges, isDirectOffer } from "./badges";
import type { DisplayOffer } from "./display";

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

test("computeOfferBadges: pusta lista → null/null", () => {
  assert.deepEqual(computeOfferBadges([]), { cheapestId: null, fastestId: null });
});
