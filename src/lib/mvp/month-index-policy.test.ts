import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAllDestinationProfiles } from "./destinations";
import { isMonthIndexable, monthIndexStats } from "./month-index-policy";

describe("month index policy (operacja odchudzanie)", () => {
  it("keeps a balanced fraction of month pages indexable (target ~top third)", () => {
    const stats = monthIndexStats();
    // Visible in the test output so we can confirm the slimming target.
    console.log(
      `[month-index-policy] indexable ${stats.indexable}/${stats.total} = ${(stats.fraction * 100).toFixed(1)}%`,
    );
    assert.ok(stats.fraction > 0.2, `fraction ${stats.fraction} should be > 0.2`);
    assert.ok(stats.fraction < 0.5, `fraction ${stats.fraction} should be < 0.5`);
  });

  it("always keeps a hot beach destination in peak season indexable", () => {
    const antalya = getAllDestinationProfiles().find((d) => d.slug === "antalya-turkey");
    assert.ok(antalya, "antalya-turkey profile should exist");
    // July (index 6): Antalya ~34°C, beachScore 0.98 → must stay indexable.
    assert.equal(isMonthIndexable(antalya, 6), true);
  });

  it("noindexes a cold, low-intent inland city in deep winter", () => {
    const candidate = getAllDestinationProfiles().find(
      (d) => d.beachScore < 0.3 && d.cityScore < 0.78 && d.avgTempByMonth[0] < 5,
    );
    // Guard: only assert if the dataset actually contains such a profile.
    if (candidate) {
      assert.equal(isMonthIndexable(candidate, 0), false);
    }
  });
});
