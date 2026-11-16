import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APPROXIMATE_MIN_DIFF_C,
  compareDaytimeMax,
  periodRelation,
} from "./climate-periods";

const period = (periodFrom: number | null, periodTo: number | null, january = 0) => ({
  periodFrom,
  periodTo,
  maxTempC: [january, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const,
});

describe("porównywalność okresów norm WMO", () => {
  it("rozpoznaje identyczne i sąsiednie standardowe normy", () => {
    assert.equal(periodRelation(period(1981, 2010), period(1981, 2010)), "same");
    assert.equal(periodRelation(period(1971, 2000), period(1981, 2010)), "adjacent");
    assert.equal(periodRelation(period(1981, 2010), period(1991, 2020)), "adjacent");
  });

  it("odrzuca odległe i krótkie okresy", () => {
    assert.equal(periodRelation(period(1961, 1990), period(1991, 2020)), "different");
    assert.equal(periodRelation(period(2002, 2011), period(1981, 2010)), "different");
  });

  it("brak choćby jednego końca okresu oznacza relację nieznaną", () => {
    assert.equal(periodRelation(period(null, 2010), period(1981, 2010)), "unknown");
    assert.equal(periodRelation(period(1981, null), period(null, null)), "unknown");
    assert.equal(periodRelation(period(null, null), period(null, null)), "unknown");
  });
});

describe("porównanie średnich maksimów w dzień", () => {
  it("dla tego samego okresu zachowuje jedno miejsce po przecinku", () => {
    assert.deepEqual(compareDaytimeMax(period(1981, 2010, 13.64), period(1981, 2010, 10), 0), {
      kind: "exact",
      diffC: 3.6,
    });
    assert.deepEqual(compareDaytimeMax(period(1981, 2010, 8.75), period(1981, 2010, 10), 0), {
      kind: "exact",
      diffC: -1.3,
    });
  });

  it("dla sąsiednich okresów zaokrągla symetrycznie do pełnego stopnia", () => {
    assert.deepEqual(compareDaytimeMax(period(1971, 2000, 11.5), period(1981, 2010, 10), 0), {
      kind: "approximate",
      diffC: 2,
    });
    assert.deepEqual(compareDaytimeMax(period(1991, 2020, 8.5), period(1981, 2010, 10), 0), {
      kind: "approximate",
      diffC: -2,
    });
  });

  it("zwraca powód braku porównania dla okresu różnego i nieznanego", () => {
    assert.deepEqual(compareDaytimeMax(period(1961, 1990, 20), period(1991, 2020, 10), 0), {
      kind: "incomparable",
      reason: "different",
    });
    assert.deepEqual(compareDaytimeMax(period(null, null, 20), period(1981, 2010, 10), 0), {
      kind: "incomparable",
      reason: "unknown",
    });
  });

  it("próg twierdzenia orientacyjnego wynosi 1,5°C", () => {
    assert.equal(APPROXIMATE_MIN_DIFF_C, 1.5);
    assert.equal(Math.abs(1.49) >= APPROXIMATE_MIN_DIFF_C, false);
    assert.equal(Math.abs(1.5) >= APPROXIMATE_MIN_DIFF_C, true);
  });
});
