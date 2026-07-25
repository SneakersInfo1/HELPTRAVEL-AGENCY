import assert from "node:assert/strict";
import { test } from "node:test";

import type { LiteApiRoomType } from "../liteapi";
import { pickCheapestRefundableRate } from "./normalize";

let seq = 0;
function offer(opts: { price: number | null; refundable?: boolean; deadline?: string }): LiteApiRoomType {
  seq += 1;
  return {
    offerId: `OFFER_${seq}`,
    supplier: "nuitee",
    rates: [
      {
        rateId: `RATE_${seq}`,
        name: "Room",
        maxOccupancy: 2,
        boardName: "Room Only",
        retailRate: opts.price === null ? undefined : { total: [{ amount: opts.price, currency: "PLN" }] },
        cancellationPolicies: opts.refundable
          ? { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: opts.deadline ?? "2026-07-30 04:00:00", amount: 0 }] }
          : { refundableTag: "NRFN" },
      },
    ],
  } as LiteApiRoomType;
}

test("pomija tańszy bezzwrotny, wybiera najtańszy ZWROTNY", () => {
  const pick = pickCheapestRefundableRate([
    offer({ price: 1200 }), // najtańszy, ale bezzwrotny
    offer({ price: 1600, refundable: true }), // najtańszy zwrotny
    offer({ price: 2000, refundable: true }),
  ]);
  assert.equal(pick?.rate.retailRate?.total?.[0]?.amount, 1600);
});

test("brak jakiejkolwiek zwrotnej taryfy → null (hotel wypada z pakietów)", () => {
  const pick = pickCheapestRefundableRate([offer({ price: 1200 }), offer({ price: 1500 })]);
  assert.equal(pick, null);
});

test("wśród zwrotnych wybiera najtańszą", () => {
  const pick = pickCheapestRefundableRate([
    offer({ price: 2500, refundable: true }),
    offer({ price: 1800, refundable: true }),
  ]);
  assert.equal(pick?.rate.retailRate?.total?.[0]?.amount, 1800);
});

test("pusta lista → null", () => {
  assert.equal(pickCheapestRefundableRate([]), null);
});

test("zwrotny rate bez ceny (retailRate brak) pomijany", () => {
  const pick = pickCheapestRefundableRate([offer({ price: null, refundable: true }), offer({ price: 1900, refundable: true })]);
  assert.equal(pick?.rate.retailRate?.total?.[0]?.amount, 1900);
});
