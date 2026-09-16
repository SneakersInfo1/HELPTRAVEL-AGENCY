import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { curatedDestinations, getAllDestinationProfiles } from "@/lib/mvp/destinations";

import {
  ENTRY_REQUIREMENTS_NOTE,
  canShowBudgetEstimate,
  exactFlightHours,
  flightHoursForTripLength,
  formatFlightFact,
  getDestinationSeoFacts,
  monthTemperature,
} from "./destination-facts";

// Bramka faktów SEO (PR #1.5). Renderery title, H1, FAQ, JSON-LD, OG i treści
// biorą liczby o kierunku wyłącznie stąd. Test A–D i G z briefu na poziomie
// bramki; testy modeli stron sprawdzają, że nic nie omija jej bokiem.

const profiles = getAllDestinationProfiles();
const bySlug = new Map(profiles.map((profile) => [profile.slug, profile]));
const curatedSlugs = new Set(curatedDestinations.map((destination) => destination.slug));

function factsOf(slug: string) {
  const profile = bySlug.get(slug);
  assert.ok(profile, slug);
  return getDestinationSeoFacts(profile);
}

describe("bramka faktów SEO", () => {
  it("temperatura: tylko kuratorowana, nigdy tablica regionu", () => {
    for (const profile of profiles) {
      const facts = getDestinationSeoFacts(profile);
      if (curatedSlugs.has(profile.slug)) {
        assert.deepEqual(facts.temperature?.byMonth, profile.avgTempByMonth, profile.slug);
        assert.equal(facts.temperature?.provenance, "curated", profile.slug);
        assert.equal(monthTemperature(facts, 6), profile.avgTempByMonth[6], profile.slug);
      } else {
        assert.equal(facts.temperature, null, profile.slug);
        for (let month = 0; month < 12; month += 1) {
          assert.equal(monthTemperature(facts, month), null, `${profile.slug} ${month}`);
        }
      }
    }
  });

  it("czas lotu: kuratorowany jest faktem, szablon regionu nigdy", () => {
    for (const profile of profiles) {
      const facts = getDestinationSeoFacts(profile);
      if (curatedSlugs.has(profile.slug)) {
        assert.equal(facts.flight?.kind, "exact", profile.slug);
        assert.equal(exactFlightHours(facts), profile.typicalFlightHoursFromPL, profile.slug);
        assert.equal(flightHoursForTripLength(facts), profile.typicalFlightHoursFromPL, profile.slug);
      } else {
        assert.equal(exactFlightHours(facts), null, profile.slug);
        assert.notEqual(facts.flight?.kind, "exact", profile.slug);
      }
    }
    assert.equal(exactFlightHours(factsOf("malaga-spain")), 3.4);
  });

  it("szacunek z seeda ma etykietę szacunku i hub w Polsce", () => {
    for (const slug of ["alicante-spain", "arrecife-spain", "paris-france", "heraklion-greece", "rhodes-greece", "palma-spain"]) {
      const facts = factsOf(slug);
      assert.equal(facts.flight?.kind, "estimate", slug);
      if (facts.flight?.kind !== "estimate") continue;
      assert.equal(facts.flight.provenance, "derived", slug);
      assert.match(facts.flight.hubIata, /^(WAW|KRK|GDN|WRO|KTW|POZ)$/, slug);
      assert.match(facts.flight.fromHub, /^z /, slug);
      assert.ok(facts.flight.distanceKm > 0, slug);
      const text = formatFlightFact(facts.flight);
      assert.match(text, /szacunkowo/, slug);
      assert.match(text, /liczone z odległości/, slug);
      assert.equal(flightHoursForTripLength(facts), facts.flight.hours, slug);
    }
    // Arrecife: szablon „Southern Europe" mówił 3.1 h, odległość od Polski daje ok. 5.8 h.
    const arrecife = factsOf("arrecife-spain").flight;
    assert.ok(arrecife && arrecife.hours > 5 && arrecife.hours < 7, JSON.stringify(arrecife));
  });

  it("szacunek ma 135 kierunków generowanych: rekord seeda, poza Polską, bez sprzecznych duplikatów", () => {
    // 132 jednoznaczne rekordy seeda − Warszawa + 4 zdublowane id ze zgodnym hubem
    // i czasem (San Sebastián, Kordoba, Düsseldorf, Zurych). Kraków i Gdańsk to Polska.
    const estimates = profiles.filter((profile) => getDestinationSeoFacts(profile).flight?.kind === "estimate");
    assert.equal(estimates.length, 135);
    assert.ok(estimates.every((profile) => !curatedSlugs.has(profile.slug)));
  });

  it("bez rekordu w seedzie nie ma żadnego czasu lotu", () => {
    for (const slug of ["miami-united-states-of-america", "tel-aviv-israel", "kotor-montenegro", "hong-kong-hong-kong"]) {
      const facts = factsOf(slug);
      assert.equal(facts.flight, null, slug);
      assert.equal(flightHoursForTripLength(facts), null, slug);
    }
  });

  it("kierunek w Polsce nie dostaje lotu z Polski", () => {
    for (const slug of ["warsaw-poland", "krakow-poland", "gdansk-poland"]) {
      const facts = factsOf(slug);
      assert.equal(facts.isDomestic, true, slug);
      assert.equal(facts.flight, null, slug);
    }
    assert.equal(factsOf("malaga-spain").isDomestic, false);
  });

  it("nazwy polskie z istniejących źródeł", () => {
    assert.equal(factsOf("heraklion-greece").name, "Kreta");
    assert.equal(factsOf("rome-italy").name, "Rzym");
    assert.equal(factsOf("lisbon-portugal").name, "Lizbona");
    assert.equal(factsOf("london-uk").name, "Londyn");
    assert.equal(factsOf("warsaw-poland").name, "Warszawa");
    assert.equal(factsOf("palma-spain").name, "Palma de Mallorca");
    assert.equal(factsOf("malaga-spain").countryName, "Hiszpania");
  });

  it("budżet ze wzoru tylko z danych kuratorowanych", () => {
    for (const profile of profiles) {
      assert.equal(canShowBudgetEstimate(getDestinationSeoFacts(profile)), curatedSlugs.has(profile.slug), profile.slug);
    }
  });

  it("wiza: zawsze neutralna notka, bez kategorycznego claimu (test G)", () => {
    assert.equal(ENTRY_REQUIREMENTS_NOTE, "Sprawdź aktualne wymagania wjazdowe");
    for (const profile of profiles) {
      const facts = getDestinationSeoFacts(profile);
      assert.equal(facts.entryRequirementsNote, ENTRY_REQUIREMENTS_NOTE, profile.slug);
      assert.doesNotMatch(JSON.stringify(facts), /bez wizy|visa-free/i, profile.slug);
    }
  });

  it("profil bez pola pochodzenia nie przepuszcza temperatury ani dokładnego lotu", () => {
    const malaga = bySlug.get("malaga-spain");
    assert.ok(malaga);
    const withoutProvenance = { ...malaga, provenance: undefined };
    const facts = getDestinationSeoFacts(withoutProvenance);
    assert.equal(facts.temperature, null);
    assert.equal(exactFlightHours(facts), null);
    assert.equal(canShowBudgetEstimate(facts), false);
  });
});
