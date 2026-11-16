import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { seasonMonthIndexes, seasonSlugs } from "@/lib/mvp/months";

import { seasonPageHeading } from "./page-titles";
import {
  SEASON_DAYTIME_MAX_MAX_C,
  SEASON_DAYTIME_MAX_MIN_C,
  averageSeasonalDaytimeMax,
  buildSeasonList,
  seasonListDescription,
} from "./season-page-model";

describe("sezonowa lista kierunków", () => {
  it("jest alfabetyczna, a każdy wpis mieści się w przedziale 22–28°C", () => {
    for (const season of seasonSlugs) {
      const entries = buildSeasonList(season);
      assert.ok(entries.length > 0, season);
      const names = entries.map((entry) => entry.facts.name);
      assert.deepEqual(
        names,
        [...names].sort((a, b) => a.localeCompare(b, "pl")),
        season,
      );

      for (const entry of entries) {
        assert.ok(entry.averageDaytimeMaxC >= SEASON_DAYTIME_MAX_MIN_C, entry.destination.slug);
        assert.ok(entry.averageDaytimeMaxC <= SEASON_DAYTIME_MAX_MAX_C, entry.destination.slug);
        assert.equal(
          entry.averageDaytimeMaxC,
          averageSeasonalDaytimeMax(entry.facts.temperature.byMonth, seasonMonthIndexes[season]),
          entry.destination.slug,
        );
      }
    }
  });

  it("tytuły i opisy mówią o liście, nie o rankingu", () => {
    for (const season of seasonSlugs) {
      const heading = seasonPageHeading(season);
      const description = seasonListDescription(season);
      assert.ok(heading.length <= 60, `${season}: ${heading}`);
      assert.doesNotMatch(`${heading} ${description}`, /ranking|najlepsze/i, season);
      assert.match(`${heading} ${description}`, /22–28°C/);
      assert.match(description, /różnych okresów/);
    }
  });
});
