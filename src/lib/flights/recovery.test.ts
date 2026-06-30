import assert from "node:assert/strict";
import { test } from "node:test";

import { buildResultsUrl, type ResultsUrlContext } from "./recovery";

const base: ResultsUrlContext = {
  origin: "WAW", destination: "BCN", depart: "2026-08-10", ret: undefined, adults: 1, children: 0, infants: 0,
};

test("one-way: origin/destination/depart/adults, bez return/children/infants", () => {
  assert.equal(buildResultsUrl(base), "/loty/wyniki?origin=WAW&destination=BCN&depart=2026-08-10&adults=1");
});

test("round-trip: dodaje return", () => {
  assert.match(buildResultsUrl({ ...base, ret: "2026-08-17" }), /return=2026-08-17/);
});

test("children/infants tylko gdy > 0", () => {
  assert.ok(!buildResultsUrl(base).includes("children"));
  assert.ok(!buildResultsUrl(base).includes("infants"));
  const u = buildResultsUrl({ ...base, children: 2, infants: 1 });
  assert.match(u, /children=2/);
  assert.match(u, /infants=1/);
});

test("fresh=1 dodawane tylko przy recovery", () => {
  assert.match(buildResultsUrl(base, { fresh: true }), /(?:\?|&)fresh=1/);
  assert.ok(!buildResultsUrl(base).includes("fresh"));
});

test("zawsze ścieżka /loty/wyniki z parametrami", () => {
  assert.ok(buildResultsUrl(base).startsWith("/loty/wyniki?"));
});
