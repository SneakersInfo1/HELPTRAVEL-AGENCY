import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPlannerLink } from "./planner-links";

describe("buildPlannerLink", () => {
  it("zwraca URL z minimalnymi parametrami (destination, origin)", () => {
    const url = buildPlannerLink({ destination: "Malaga", origin: "Warszawa" });
    assert.match(url, /^\/hotele\/szukaj\?/);
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("destination"), "Malaga");
    assert.equal(qs.get("origin"), "Warszawa");
    assert.equal(qs.get("adults"), "2");
    assert.equal(qs.get("rooms"), "1");
  });

  it("dodaje daty pobytu, jezeli podano startDate", () => {
    const url = buildPlannerLink({
      destination: "Barcelona",
      origin: "Warszawa",
      startDate: "2026-06-08",
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("checkin"), "2026-06-08");
    assert.equal(qs.get("checkout"), "2026-06-12");
  });

  it("pomija destination jezeli puste (discovery mode)", () => {
    const url = buildPlannerLink({ destination: "", origin: "Warszawa" });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.has("destination"), false);
    assert.equal(qs.get("origin"), "Warszawa");
  });

  it("przyjmuje country jako opcjonalne", () => {
    const url = buildPlannerLink({
      destination: "Rzym",
      country: "Italy",
      origin: "Warszawa",
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("country"), "Italy");
  });

  it("nadpisuje checkout i liczbe doroslych jezeli przekazane", () => {
    const url = buildPlannerLink({
      destination: "Lizbona",
      origin: "Warszawa",
      startDate: "2026-09-10",
      endDate: "2026-09-15",
      travelers: 4,
    });
    const qs = new URLSearchParams(url.split("?")[1]);
    assert.equal(qs.get("checkout"), "2026-09-15");
    assert.equal(qs.get("adults"), "4");
  });
});
