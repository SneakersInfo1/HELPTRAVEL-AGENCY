import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFlightSearchInput, type BuildFlightInput } from "./flightSearchInput";

function base(overrides: Partial<BuildFlightInput> = {}): BuildFlightInput {
  return {
    originAirport: "WAW",
    destinationAirport: "BCN",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-04",
    occupancies: [{ adults: 2, children: [] }],
    cabinClass: "economy",
    ...overrides,
  };
}

test("round-trip: OUTBOUND tam (dateFrom), INBOUND z powrotem (dateTo)", () => {
  const out = buildFlightSearchInput(base());
  assert.equal(out.legs.length, 2);
  assert.deepEqual(out.legs[0], { origin: "WAW", destination: "BCN", date: "2026-08-01", direction: "OUTBOUND" });
  assert.deepEqual(out.legs[1], { origin: "BCN", destination: "WAW", date: "2026-08-04", direction: "INBOUND" });
});

test("adults = suma dorosłych ze wszystkich pokoi", () => {
  const out = buildFlightSearchInput(base({ occupancies: [{ adults: 2, children: [] }, { adults: 3, children: [] }] }));
  assert.equal(out.adults, 5);
});

test("infant = dziecko < 2 lat, child = ≥ 2 lat (wg wieku)", () => {
  const out = buildFlightSearchInput(base({ occupancies: [{ adults: 2, children: [1, 2, 5] }] }));
  assert.equal(out.infants, 1); // wiek 1
  assert.equal(out.children, 2); // wiek 2 i 5
});

test("wiek 0 (niemowlę) liczony jako infant", () => {
  const out = buildFlightSearchInput(base({ occupancies: [{ adults: 1, children: [0] }] }));
  assert.equal(out.infants, 1);
  assert.equal(out.children, 0);
});

test("dzieci z wielu pokoi sumowane łącznie", () => {
  const out = buildFlightSearchInput(
    base({ occupancies: [{ adults: 2, children: [1] }, { adults: 2, children: [4, 8] }] }),
  );
  assert.equal(out.adults, 4);
  assert.equal(out.infants, 1);
  assert.equal(out.children, 2);
});

test("cabinClass mapowany na wielkie litery LiteAPI", () => {
  assert.equal(buildFlightSearchInput(base({ cabinClass: "premium_economy" })).cabinClass, "PREMIUM_ECONOMY");
  assert.equal(buildFlightSearchInput(base({ cabinClass: "business" })).cabinClass, "BUSINESS");
  assert.equal(buildFlightSearchInput(base({ cabinClass: "first" })).cabinClass, "FIRST");
});

test("waluta PLN i kraj PL na sztywno", () => {
  const out = buildFlightSearchInput(base());
  assert.equal(out.currency, "PLN");
  assert.equal(out.country, "PL");
});
