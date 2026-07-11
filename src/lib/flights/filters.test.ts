import assert from "node:assert/strict";
import { test } from "node:test";

import { sortOffers } from "./filters";
import type { DisplayOffer } from "./display";

function offer(id: string, total: number, durationMin: number): DisplayOffer {
  return {
    offerId: id,
    total,
    currency: "PLN",
    legs: [],
    maxDurationMinutes: durationMin,
    hasCheckedBag: false,
    hasCarryOnBag: true,
    fares: [],
  };
}

test("sort 'price' — czysto po cenie rosnąco", () => {
  const offers = [offer("a", 900, 120), offer("b", 400, 600), offer("c", 700, 90)];
  const ids = sortOffers(offers, "price").map((o) => o.offerId);
  assert.deepEqual(ids, ["b", "c", "a"]);
});

test("sort 'best' (waga 0,7 cena / 0,3 czas) — tańsza oferta prowadzi przy podobnym czasie", () => {
  // Tania i trochę wolniejsza vs droga i trochę szybsza → tania na górze.
  const cheapSlightlySlower = offer("cheap", 400, 200);
  const pricyFaster = offer("pricy", 900, 150);
  const ids = sortOffers([pricyFaster, cheapSlightlySlower], "best").map((o) => o.offerId);
  assert.equal(ids[0], "cheap", "tańszy lot powinien prowadzić w domyślnym sortowaniu");
});

test("sort 'best' — skrajny maraton czasowy NIE wygrywa mimo najniższej ceny", () => {
  // Najtańszy, ale 3× dłuższy (maraton z przesiadkami) — waga czasu go spycha.
  const cheapMarathon = offer("marathon", 400, 1800); // 30 h
  const reasonable = offer("ok", 520, 180); // 3 h, tylko trochę drożej
  const ids = sortOffers([cheapMarathon, reasonable], "best").map((o) => o.offerId);
  assert.equal(ids[0], "ok", "rozsądny lot bije najtańszy maraton");
});

test("sort 'best' — przy równym czasie decyduje cena", () => {
  const a = offer("a", 800, 180);
  const b = offer("b", 500, 180);
  const ids = sortOffers([a, b], "best").map((o) => o.offerId);
  assert.deepEqual(ids, ["b", "a"]);
});
