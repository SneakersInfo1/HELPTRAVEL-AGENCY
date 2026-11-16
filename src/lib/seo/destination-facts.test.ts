import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { curatedDestinations, getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  climateNormalCount,
  formatClimateNumber,
  formatClimatePeriod,
  getClimateNormal,
} from "@/lib/mvp/climate-normals";

import {
  ENTRY_REQUIREMENTS_NOTE,
  canClaimFromCostIndex,
  exactFlightHours,
  flightHoursForTripLength,
  formatFlightFact,
  getDestinationSeoFacts,
  monthDaytimeMaxTemperature,
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
  it("temperatura: wyłącznie norma WMO, nigdy ręczna tablica profilu ani regionu", () => {
    let withNormal = 0;
    for (const profile of profiles) {
      const facts = getDestinationSeoFacts(profile);
      const normal = getClimateNormal(profile.slug);
      if (normal) {
        withNormal += 1;
        assert.deepEqual(facts.temperature?.byMonth, normal.maxTempC, profile.slug);
        assert.deepEqual(facts.temperature?.minByMonth, normal.minTempC, profile.slug);
        assert.deepEqual(facts.temperature?.rainDays, normal.rainDays, profile.slug);
        assert.deepEqual(facts.temperature?.rainfallMm, normal.rainfallMm, profile.slug);
        assert.equal(facts.temperature?.provenance, "verified", profile.slug);
        assert.equal(monthDaytimeMaxTemperature(facts, 6), normal.maxTempC[6], profile.slug);
        assert.equal(facts.temperature?.source.name, "WMO World Weather Information Service", profile.slug);
        assert.equal(facts.temperature?.source.provider, normal.provider, profile.slug);
        // Gdy WWIS nie podaje stacji, pokazujemy miasto WWIS z jawną etykietą, nigdy pusty dopisek.
        assert.equal(facts.temperature?.source.station, normal.stationName ?? normal.wwisCity, profile.slug);
        assert.equal(facts.temperature?.source.stationLabel, normal.stationName ? "stacja" : "punkt WWIS", profile.slug);
        assert.equal(
          facts.temperature?.source.periodLabel,
          formatClimatePeriod(normal.periodFrom, normal.periodTo),
          profile.slug,
        );
        assert.equal(facts.temperature?.source.url, normal.sourceUrl, profile.slug);
        assert.match(facts.temperature?.source.url ?? "", /^https:\/\/worldweather\.wmo\.int\//, profile.slug);
      } else {
        assert.equal(facts.temperature, null, profile.slug);
        for (let month = 0; month < 12; month += 1) {
          assert.equal(monthDaytimeMaxTemperature(facts, month), null, `${profile.slug} ${month}`);
        }
      }
    }
    assert.equal(withNormal, 187);
    assert.equal(climateNormalCount, 187);
  });

  it("format normy zachowuje jedno miejsce po przecinku i opisuje okres", () => {
    assert.equal(formatClimateNumber(13.6), "13,6");
    assert.equal(formatClimateNumber(4), "4,0");
    assert.equal(formatClimatePeriod(1981, 2010), "norma 1981–2010");
    assert.equal(formatClimatePeriod(null, null), "okres normy niepodany przez źródło");
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

  it("względne twierdzenia z costIndex tylko dla danych kuratorowanych", () => {
    for (const profile of profiles) {
      assert.equal(canClaimFromCostIndex(getDestinationSeoFacts(profile)), curatedSlugs.has(profile.slug), profile.slug);
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

  it("profil bez pola pochodzenia nadal bierze pogodę z WMO, ale nie przepuszcza dokładnego lotu ani costIndex", () => {
    const malaga = bySlug.get("malaga-spain");
    assert.ok(malaga);
    const withoutProvenance = { ...malaga, provenance: undefined };
    const facts = getDestinationSeoFacts(withoutProvenance);
    assert.deepEqual(facts.temperature?.byMonth, getClimateNormal(malaga.slug)?.maxTempC);
    assert.equal(exactFlightHours(facts), null);
    assert.equal(canClaimFromCostIndex(facts), false);
  });
});
