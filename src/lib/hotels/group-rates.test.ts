// Zadanie 5 — unit tests for groupRates(). Fixtures mirror the REAL LiteAPI
// shape measured in faza 0 (tmp/rates-sample-1.json): every price variant is
// its own roomType/offer with exactly one rate; duplicates differ only in
// price. Covers the brief's required cases: duplicates → cheapest survives,
// same name + different capacity → separate groups, missing name → "Pokój"
// fallback, hotel-cheapest never lost, sorting, collapsed counters.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { LiteApiRoomType } from "../liteapi";
import { groupRates } from "./group-rates";

let seq = 0;
function offer(opts: {
  name?: string;
  price: number | null;
  board?: string;
  refundable?: boolean;
  deadline?: string;
  maxOcc?: number;
}): LiteApiRoomType {
  seq += 1;
  return {
    offerId: `OFFER_${seq}`,
    supplier: "nuitee",
    rates: [
      {
        rateId: `RATE_${seq}`,
        name: opts.name,
        maxOccupancy: opts.maxOcc ?? 2,
        boardName: opts.board ?? "Room Only",
        retailRate:
          opts.price === null
            ? undefined
            : { total: [{ amount: opts.price, currency: "PLN" }] },
        cancellationPolicies: opts.refundable
          ? {
              refundableTag: "RFN",
              cancelPolicyInfos: [
                { cancelTime: opts.deadline ?? "2026-07-13 04:00:00", amount: 0 },
              ],
            }
          : { refundableTag: "NRFN" },
      },
    ],
  };
}

test("groupRates: condition-identical duplicates collapse to the cheapest, counter kept", () => {
  const { groups, stats } = groupRates([
    offer({ name: "Superior Double Room", price: 2300 }),
    offer({ name: "superior  double ROOM", price: 2074.99 }), // messy spacing/case
    offer({ name: "Superior Double Room", price: 2500 }),
    offer({ name: "Superior Double Room", price: 2400, refundable: true }),
  ]);
  assert.equal(groups.length, 1);
  const g = groups[0];
  // 3 identical NRF variants → 1 row (cheapest), refundable variant stays.
  assert.equal(g.options.length, 2);
  assert.equal(g.options[0].totalMinor, BigInt(207499)); // cheapest first
  assert.equal(g.options[0].collapsedCount, 2);
  assert.equal(g.collapsedTotal, 2);
  assert.equal(stats.offersIn, 4);
  assert.equal(stats.optionsOut, 2);
  assert.equal(stats.collapsed, 2);
  // The surviving row carries ITS OWN source offerId (presentation-only rule).
  assert.equal(g.options[0].offerId, "OFFER_2");
});

test("groupRates: same name but different capacity = separate groups", () => {
  const { groups } = groupRates([
    offer({ name: "Double Room", price: 1000, maxOcc: 2 }),
    offer({ name: "Double Room", price: 1200, maxOcc: 3 }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.maxOccupancy),
    [2, 3],
  );
});

test("groupRates: nameless rates fall back to the 'Pokój' group, nothing dropped", () => {
  const { groups, stats } = groupRates([
    offer({ name: undefined, price: 900 }),
    offer({ name: "   ", price: 950, refundable: true }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "Pokój");
  assert.equal(groups[0].options.length, 2);
  assert.equal(stats.collapsed, 0);
});

test("groupRates: hotel's cheapest offer always survives dedupe and gets the single badge", () => {
  const { groups } = groupRates([
    offer({ name: "Deluxe", price: 3000 }),
    offer({ name: "Standard", price: 1525.89 }), // global cheapest
    offer({ name: "Standard", price: 1600 }), // identical terms → collapsed
    offer({ name: "Deluxe", price: 2900, refundable: true }),
  ]);
  const all = groups.flatMap((g) => g.options);
  const flagged = all.filter((o) => o.cheapestOfHotel);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].totalMinor, BigInt(152589));
  // Groups sorted by their cheapest option: Standard (1525.89) before Deluxe.
  assert.equal(groups[0].name, "Standard");
  assert.equal(groups[0].cheapestMinor, BigInt(152589));
});

test("groupRates: options inside a group sort ascending, unpriced last", () => {
  const { groups } = groupRates([
    offer({ name: "Twin", price: 2000, board: "Breakfast Included" }),
    offer({ name: "Twin", price: null, board: "Half Board" }),
    offer({ name: "Twin", price: 1800 }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].options.map((o) => o.totalMinor),
    [BigInt(180000), BigInt(200000), null],
  );
});

test("groupRates: free-cancellation deadlines differing only by HOUR dedupe together (day precision)", () => {
  const { groups } = groupRates([
    offer({ name: "Suite", price: 5000, refundable: true, deadline: "2026-07-13 04:00:00" }),
    offer({ name: "Suite", price: 5200, refundable: true, deadline: "2026-07-13 08:00:00" }),
    offer({ name: "Suite", price: 5100, refundable: true, deadline: "2026-07-15 04:00:00" }),
  ]);
  assert.equal(groups[0].options.length, 2); // 13th (×2 → 1) + 15th
  assert.equal(groups[0].options[0].totalMinor, BigInt(500000));
  assert.equal(groups[0].options[0].collapsedCount, 1);
});
