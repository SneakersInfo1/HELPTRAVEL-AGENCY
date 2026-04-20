import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPlannerLink } from "./planner-links";

describe("buildPlannerLink", () => {
  it("zwraca URL z minimalnymi parametrami (destination, origin)", () => {
    const url = buildPlannerLink({ destination: "Malaga", origin: "Warszawa" });
    assert.match(url, /^\/planner\?/);
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("mode"), "standard");
    assert.equal(qs.get("destination"), "Malaga");
    assert.equal(qs.get("origin"), "Warszawa");
    assert.equal(qs.get("nights"), "4");
    assert.equal(qs.get("travelers"), "2");
  });

  it("dodaje startDate jezeli podany", () => {
    const url = buildPlannerLink({
      destination: "Barcelona",
      origin: "Warszawa",
      startDate: "2026-06-08",
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("startDate"), "2026-06-08");
  });

  it("pomija destination jezeli puste (discovery mode)", () => {
    const url = buildPlannerLink({ destination: "", origin: "Warszawa" });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.has("destination"), false);
    assert.equal(qs.get("origin"), "Warszawa");
  });

  it("przyjmuje budget i q jako opcjonalne", () => {
    const url = buildPlannerLink({
      destination: "Rzym",
      origin: "Warszawa",
      budget: 3500,
      q: "Rzym",
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("budget"), "3500");
    assert.equal(qs.get("q"), "Rzym");
  });

  it("nadpisuje nights i travelers jezeli przekazane", () => {
    const url = buildPlannerLink({
      destination: "Lizbona",
      origin: "Warszawa",
      nights: 7,
      travelers: 4,
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("nights"), "7");
    assert.equal(qs.get("travelers"), "4");
  });
});
