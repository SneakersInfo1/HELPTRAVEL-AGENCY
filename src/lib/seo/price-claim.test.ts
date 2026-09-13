import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyTitlePrice } from "./price-claim";

const HOUR = 3_600_000;
// 13.09.2026, 12:00 czasu warszawskiego.
const NOW = Date.UTC(2026, 8, 13, 10, 0, 0);

describe("verifyTitlePrice — kiedy kwota może trafić do tytułu (test D)", () => {
  it("świeża, realna cena na przyszły termin przechodzi", () => {
    assert.deepEqual(
      verifyTitlePrice({ amountPln: 312.4, pricedAt: NOW - 2 * HOUR, startIso: "2026-10-09" }, NOW),
      { amountPln: 312, startIso: "2026-10-09" },
    );
  });

  it("cena starsza niż 12 godzin nie przechodzi, choć nadaje się jeszcze do discovery", () => {
    assert.equal(verifyTitlePrice({ amountPln: 312, pricedAt: NOW - 13 * HOUR, startIso: "2026-10-09" }, NOW), null);
  });

  it("wygasła cena nie przechodzi", () => {
    assert.equal(verifyTitlePrice({ amountPln: 312, pricedAt: NOW - 49 * HOUR, startIso: "2026-10-09" }, NOW), null);
  });

  it("termin dzisiejszy, miniony albo niepoprawny nie przechodzi", () => {
    for (const startIso of ["2026-09-13", "2026-09-01", "2026-02-30", "wrzesień"]) {
      assert.equal(verifyTitlePrice({ amountPln: 312, pricedAt: NOW - HOUR, startIso }, NOW), null, startIso);
    }
  });

  it("brak realnej kwoty nie przechodzi", () => {
    for (const amountPln of [null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(verifyTitlePrice({ amountPln, pricedAt: NOW - HOUR, startIso: "2026-10-09" }, NOW), null);
    }
    assert.equal(verifyTitlePrice(null, NOW), null);
    assert.equal(verifyTitlePrice(undefined, NOW), null);
  });
});
