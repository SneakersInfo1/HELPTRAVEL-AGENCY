import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FEATURED_DESTINATION_SLUGS, getFeaturedDestinations } from "./featured-destinations";

describe("featured-destinations", () => {
  it("eksportuje dokladnie 6 slugow", () => {
    assert.equal(FEATURED_DESTINATION_SLUGS.length, 6);
  });

  it("wszystkie slugi sa unikatowe", () => {
    const set = new Set(FEATURED_DESTINATION_SLUGS);
    assert.equal(set.size, FEATURED_DESTINATION_SLUGS.length);
  });

  it("getFeaturedDestinations zwraca destynacje w kolejnosci slugow", () => {
    const result = getFeaturedDestinations();
    assert.ok(result.length >= 1, "powinno zwrocic co najmniej 1 destynacje");
    assert.ok(result.length <= FEATURED_DESTINATION_SLUGS.length, "nie wiecej niz lista bazowa");
    const resultSlugs = result.map((d) => d.slug);
    const expectedOrder = FEATURED_DESTINATION_SLUGS.filter((s) => resultSlugs.includes(s));
    assert.deepEqual(resultSlugs, expectedOrder);
  });

  it("kazda zwrocona destynacja ma wymagane pola (city, country, slug, typicalFlightHoursFromPL)", () => {
    const result = getFeaturedDestinations();
    for (const dest of result) {
      assert.ok(dest.slug, `slug brak: ${JSON.stringify(dest)}`);
      assert.ok(dest.city, `city brak: ${dest.slug}`);
      assert.ok(dest.country, `country brak: ${dest.slug}`);
      assert.equal(typeof dest.typicalFlightHoursFromPL, "number");
    }
  });
});
