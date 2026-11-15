import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteRoutes } from "@/lib/content-engine/site-inventory";
import { getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

import { getDestinationSeoFacts } from "./destination-facts";
import { hubComparisons, hubFactRows, monthRangesLabel } from "./mood-hub-model";

const routes = new Set(siteRoutes());

describe("monthRangesLabel", () => {
  it("skleja kolejne miesiące w zakresy, także przez przełom roku", () => {
    assert.equal(monthRangesLabel([3, 4, 5, 8, 9]), "kwiecień–czerwiec, wrzesień–październik");
    assert.equal(monthRangesLabel([10, 11, 0, 1]), "listopad–luty");
    assert.equal(monthRangesLabel([6]), "lipiec");
    assert.equal(monthRangesLabel([...Array(12).keys()]), "cały rok");
    assert.equal(monthRangesLabel([]), null);
  });
});

describe("tabela faktów huba", () => {
  it("liczby wyłącznie z bramki faktów: bez normy WMO nie ma miesięcy", () => {
    for (const mood of TRAVEL_MOODS) {
      for (const [index, row] of hubFactRows(mood).entries()) {
        const pick = mood.picks[index];
        const guide = pick.slug ? getDestinationGuideBySlug(pick.slug) : undefined;
        if (!guide) {
          assert.deepEqual([row.guideHref, row.flight, row.daytimeMaxMonths, row.climateSource], [null, null, null, null], `${mood.slug}/${pick.name}`);
          continue;
        }
        const facts = getDestinationSeoFacts(guide.destination);
        assert.equal(row.daytimeMaxMonths === null, facts.temperature === null, `${mood.slug}/${pick.name}`);
        assert.equal(row.climateSource === null, facts.temperature === null, `${mood.slug}/${pick.name}`);
        if (row.climateSource) {
          assert.equal(row.climateSource.name, "WMO World Weather Information Service", `${mood.slug}/${pick.name}`);
          assert.match(row.climateSource.url, /^https:\/\/worldweather\.wmo\.int\//, `${mood.slug}/${pick.name}`);
        }
        assert.equal(row.flight === null, facts.flight === null, `${mood.slug}/${pick.name}`);
        if (facts.flight?.kind === "estimate") assert.match(row.flight ?? "", /szacunkowo/, `${mood.slug}/${pick.name}`);
        assert.ok(routes.has(row.guideHref!), row.guideHref!);
      }
    }
  });
});

describe("porównania huba", () => {
  it("każdy hub z co najmniej dwoma przewodnikami prowadzi do istniejących porównań, bez duplikatów", () => {
    for (const mood of TRAVEL_MOODS) {
      const links = hubComparisons(mood);
      if (mood.picks.filter((pick) => pick.slug).length < 2) continue;
      assert.ok(links.length >= 3, `${mood.slug}: ${links.length}`);
      assert.equal(new Set(links.map((link) => link.href)).size, links.length, mood.slug);
      for (const link of links) assert.ok(routes.has(link.href), `${mood.slug} → ${link.href}`);
    }
  });

  it("pary z dwoma kierunkami z huba stoją przed parami z jednym", () => {
    const cityBreak = TRAVEL_MOODS.find((mood) => mood.slug === "city-break")!;
    const links = hubComparisons(cityBreak).map((link) => link.href);
    // W hubie city break są Praga, Budapeszt, Barcelona i Lizbona — obie pary
    // z kompletem kierunków z huba muszą wyprzedzić resztę.
    assert.deepEqual(links.slice(0, 2).sort(), ["/porownanie/barcelona-spain-vs-lisbon-portugal", "/porownanie/budapest-hungary-vs-prague-czechia"]);
  });
});

describe("tytuły hubów", () => {
  it("mieszczą się w 60 znakach bez sufiksu marki i są unikalne", () => {
    for (const mood of TRAVEL_MOODS) assert.ok(mood.metaTitle.length <= 60, `${mood.slug}: ${mood.metaTitle.length}`);
    assert.equal(new Set(TRAVEL_MOODS.map((mood) => mood.metaTitle)).size, TRAVEL_MOODS.length);
  });
});
