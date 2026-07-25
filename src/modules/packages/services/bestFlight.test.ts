import assert from "node:assert/strict";
import { test } from "node:test";

import type { DisplayLeg, DisplayOffer } from "@/lib/flights/display";

import { isDirectOffer, selectBaseFlight } from "./bestFlight";

// ── fixtures ──────────────────────────────────────────────────────────────────

function leg(opts: { stops?: number; depart?: string; durationMinutes?: number }): DisplayLeg {
  const depart = opts.depart ?? "2026-08-01T09:00:00";
  return {
    direction: "OUTBOUND",
    originCode: "WAW",
    destinationCode: "BCN",
    departureTime: depart,
    arrivalTime: "2026-08-01T12:00:00",
    durationMinutes: opts.durationMinutes ?? 180,
    stops: opts.stops ?? 0,
    carriers: ["LOT"],
    carrierCode: "LO",
    segments: [],
  };
}

function offer(opts: {
  id: string;
  total: number | null;
  legs?: DisplayLeg[];
  maxDurationMinutes?: number;
}): DisplayOffer {
  const legs = opts.legs ?? [leg({})];
  return {
    offerId: opts.id,
    total: opts.total,
    currency: "PLN",
    legs,
    maxDurationMinutes: opts.maxDurationMinutes ?? Math.max(...legs.map((l) => l.durationMinutes)),
    hasCheckedBag: false,
    hasCarryOnBag: true,
    fares: [],
  };
}

// ── isDirectOffer ─────────────────────────────────────────────────────────────

test("isDirectOffer: true gdy wszystkie odcinki bez przesiadek", () => {
  assert.equal(isDirectOffer(offer({ id: "a", total: 1, legs: [leg({ stops: 0 }), leg({ stops: 0 })] })), true);
});

test("isDirectOffer: false gdy którykolwiek odcinek ma przesiadkę", () => {
  assert.equal(isDirectOffer(offer({ id: "a", total: 1, legs: [leg({ stops: 0 }), leg({ stops: 1 })] })), false);
});

// ── selectBaseFlight: priorytet ───────────────────────────────────────────────

test("bezpośredni bije tańszy z przesiadką", () => {
  const direct = offer({ id: "direct", total: 2000, legs: [leg({ stops: 0 })] });
  const cheaperWithStop = offer({ id: "stop", total: 1500, legs: [leg({ stops: 1 })] });
  assert.equal(selectBaseFlight([cheaperWithStop, direct])?.offerId, "direct");
});

test("wśród bezpośrednich wygrywa tańszy", () => {
  const a = offer({ id: "a", total: 2000 });
  const b = offer({ id: "b", total: 1800 });
  assert.equal(selectBaseFlight([a, b])?.offerId, "b");
});

test("przy równej cenie wygrywa krótszy", () => {
  const a = offer({ id: "a", total: 2000, legs: [leg({ durationMinutes: 300 })] });
  const b = offer({ id: "b", total: 2000, legs: [leg({ durationMinutes: 240 })] });
  assert.equal(selectBaseFlight([a, b])?.offerId, "b");
});

test("przy równej cenie i czasie wygrywa cywilizowana godzina wylotu (7–21)", () => {
  const early = offer({ id: "early", total: 2000, legs: [leg({ depart: "2026-08-01T05:00:00" })] });
  const civil = offer({ id: "civil", total: 2000, legs: [leg({ depart: "2026-08-01T09:00:00" })] });
  assert.equal(selectBaseFlight([early, civil])?.offerId, "civil");
});

test("wylot o 22:00 liczony jako niecywilizowany, 21:00 jeszcze OK", () => {
  const late = offer({ id: "late", total: 2000, legs: [leg({ depart: "2026-08-01T22:00:00" })] });
  const edge = offer({ id: "edge", total: 2000, legs: [leg({ depart: "2026-08-01T21:00:00" })] });
  assert.equal(selectBaseFlight([late, edge])?.offerId, "edge");
});

// ── selectBaseFlight: przypadki brzegowe ──────────────────────────────────────

test("pusta lista → null", () => {
  assert.equal(selectBaseFlight([]), null);
});

test("total null traktowany jako najgorsza cena, ale oferta wciąż wybieralna", () => {
  const onlyNull = offer({ id: "n", total: null });
  assert.equal(selectBaseFlight([onlyNull])?.offerId, "n");
  const priced = offer({ id: "p", total: 1500 });
  assert.equal(selectBaseFlight([onlyNull, priced])?.offerId, "p");
});
