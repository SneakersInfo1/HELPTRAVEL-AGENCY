import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CURATED_PROFILE_PROVENANCE,
  GENERATED_PROFILE_PROVENANCE,
  PROVENANCED_FIELDS,
  derivedProvenance,
  isFactGrade,
  provenanceOf,
} from "./data-provenance";
import { curatedDestinations, getAllDestinationProfiles } from "./destinations";

// Pochodzenie danych profilu kierunku (SEO Data Integrity, PR #1.5).
//
// Audyt Faza 2.2: 212 z 235 profili bierze temperaturę i czas lotu z jednej
// tablicy regionu, a kod nie odróżniał ich od 23 profili wpisanych ręcznie.
// Pochodzenie nadaje ścieżka budowy profilu — nigdy wartość liczby.

const curatedSlugs = new Set(curatedDestinations.map((destination) => destination.slug));

describe("pochodzenie danych profilu kierunku", () => {
  it("23 profile kuratorowane i 212 generowanych", () => {
    const profiles = getAllDestinationProfiles();
    const curated = profiles.filter((profile) => curatedSlugs.has(profile.slug));
    const generated = profiles.filter((profile) => !curatedSlugs.has(profile.slug));
    assert.equal(profiles.length, 235);
    assert.equal(curated.length, 23);
    assert.equal(generated.length, 212);

    for (const profile of curated) {
      assert.deepEqual(profile.provenance, CURATED_PROFILE_PROVENANCE, profile.slug);
    }
    for (const profile of generated) {
      assert.deepEqual(profile.provenance, GENERATED_PROFILE_PROVENANCE, profile.slug);
    }
  });

  it("temperatura i czas lotu: kuratorowane są faktem, szablon regionu nie", () => {
    const bySlug = new Map(getAllDestinationProfiles().map((profile) => [profile.slug, profile]));
    for (const slug of ["malaga-spain", "london-uk", "santa-cruz-de-tenerife-spain"]) {
      const profile = bySlug.get(slug);
      assert.ok(profile, slug);
      assert.equal(provenanceOf(profile, "temperature"), "curated", slug);
      assert.equal(provenanceOf(profile, "flightDuration"), "curated", slug);
    }
    for (const slug of [
      "alicante-spain",
      "heraklion-greece",
      "palma-spain",
      "miami-united-states-of-america",
      "warsaw-poland",
    ]) {
      const profile = bySlug.get(slug);
      assert.ok(profile, slug);
      assert.equal(provenanceOf(profile, "temperature"), "regional_fallback", slug);
      assert.equal(provenanceOf(profile, "flightDuration"), "regional_fallback", slug);
      assert.equal(isFactGrade(provenanceOf(profile, "temperature")), false, slug);
    }
  });

  it("profil bez pola pochodzenia jest nieznany dla każdego pola", () => {
    for (const field of PROVENANCED_FIELDS) {
      assert.equal(provenanceOf({}, field), "unknown", field);
    }
  });

  it("wiza nie jest zweryfikowana w żadnym profilu", () => {
    for (const profile of getAllDestinationProfiles()) {
      assert.notEqual(provenanceOf(profile, "visa"), "verified", profile.slug);
    }
  });

  it("wartość wyliczona dziedziczy najsłabsze wejście", () => {
    assert.equal(derivedProvenance("curated"), "derived");
    assert.equal(derivedProvenance("verified", "curated"), "derived");
    assert.equal(derivedProvenance("curated", "regional_fallback"), "regional_fallback");
    assert.equal(derivedProvenance("regional_fallback", "unknown"), "unknown");
    assert.equal(derivedProvenance(), "unknown");
  });

  it("fakt do tytułu i danych strukturalnych: tylko verified i curated", () => {
    assert.equal(isFactGrade("verified"), true);
    assert.equal(isFactGrade("curated"), true);
    assert.equal(isFactGrade("derived"), false);
    assert.equal(isFactGrade("regional_fallback"), false);
    assert.equal(isFactGrade("unknown"), false);
  });
});
