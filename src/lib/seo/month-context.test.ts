import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { getClimateNormal } from "@/lib/mvp/climate-normals";
import { periodRelation } from "@/lib/mvp/climate-periods";
import { isMonthIndexable } from "@/lib/mvp/month-index-policy";
import { getMonthIndex, polishMonthSlugs } from "@/lib/mvp/months";

import { HOME_REFERENCE_SLUG, homeComparison, monthStanding, stationLatitude, warmerAlternatives, yearPosition } from "./month-context";
import { buildMonthPageModel } from "./month-page-model";

const profiles = getAllDestinationProfiles();
const bySlug = new Map(profiles.map((profile) => [profile.slug, profile]));
const model = (slug: string, month: (typeof polishMonthSlugs)[number]) =>
  buildMonthPageModel({ profile: bySlug.get(slug)!, overview: "", month, baseUrl: "https://helptravel.pl", author: {} });

describe("kontekst miesiąca z norm WMO", () => {
  it("identyczny okres z Warszawą daje dokładne porównanie", () => {
    const barcelona = getClimateNormal("barcelona-spain")!;
    const warsaw = getClimateNormal(HOME_REFERENCE_SLUG)!;
    const comparison = homeComparison("barcelona-spain", 0)!;
    assert.equal(comparison.homeMaxC, warsaw.maxTempC[0]);
    assert.equal(comparison.maxDiffC, Math.round((barcelona.maxTempC[0] - warsaw.maxTempC[0]) * 10) / 10);
    assert.equal(comparison.approximate, false);
    assert.equal(comparison.periodLabel, "1981–2010");
    assert.equal(comparison.homePeriodLabel, "1981–2010");
    assert.equal(homeComparison(HOME_REFERENCE_SLUG, 0), null);
    assert.equal(homeComparison("kierunek-bez-normy", 0), null);
  });

  it("sąsiedni okres z Warszawą daje przybliżenie i oba okresy w leadzie", () => {
    const comparison = homeComparison("rome-italy", 0);
    assert.ok(comparison);
    assert.equal(comparison.approximate, true);
    assert.equal(comparison.periodLabel, "1971–2000");
    assert.equal(comparison.homePeriodLabel, "1981–2010");
    assert.equal(Number.isInteger(comparison.maxDiffC), true);

    const page = model("rome-italy", "styczen");
    assert.match(page.text.lead, /normy z lat 1971–2000 i 1981–2010, porównanie orientacyjne/);
    assert.match(page.text.lead, /ok\. \d+°C więcej niż w Warszawie/);
  });

  it("różny lub nieznany okres wyłącza porównanie z Warszawą i zdanie w leadzie", () => {
    for (const slug of ["bangkok-thailand", "amman-jordan"]) {
      assert.equal(homeComparison(slug, 0), null, slug);
      const page = model(slug, "styczen");
      assert.ok(page.weather, slug);
      assert.equal(page.context?.home, null, slug);
      assert.doesNotMatch(page.text.lead, /Warszaw/, slug);
    }
  });

  it("pozycja miesięczna liczy tylko kohortę z identycznym okresem normy", () => {
    const normal = getClimateNormal("barcelona-spain")!;
    const position = yearPosition("barcelona-spain", 7)!;
    assert.equal(position.warmthRank, normal.maxTempC.filter((value) => value > normal.maxTempC[7]).length + 1);
    const standing = monthStanding("barcelona-spain", 0)!;
    const cohort = profiles
      .map((profile) => getClimateNormal(profile.slug))
      .filter((other): other is NonNullable<typeof other> => other !== null && periodRelation(normal, other) === "same");
    assert.equal(standing.total, cohort.length);
    assert.equal(standing.total, 56);
    assert.equal(standing.periodLabel, "1981–2010");
    assert.equal(
      standing.warmerCount,
      cohort.filter((other) => other.maxTempC[0] > normal.maxTempC[0]).length,
    );
    assert.ok(standing.warmerCount > 0 && standing.warmerCount < standing.total);
    assert.equal(monthStanding("kierunek-bez-normy", 0), null);
    assert.equal(monthStanding("amman-jordan", 0), null);
    assert.equal(monthStanding("abu-dhabi-united-arab-emirates", 0), null);
  });

  it("cieplejsze alternatywy są faktycznie cieplejsze o próg, posortowane od najbliższej i bez strony źródłowej", () => {
    const own = getClimateNormal("barcelona-spain")!.maxTempC[0];
    const items = warmerAlternatives("barcelona-spain", 0, { limit: 5, minDiffC: 3 });
    assert.equal(items.length, 5);
    for (const item of items) {
      assert.notEqual(item.slug, "barcelona-spain");
      assert.ok(item.maxTempC - own >= 3 - 1e-9, `${item.slug}: ${item.maxTempC}`);
      assert.equal(item.maxTempC, getClimateNormal(item.slug)!.maxTempC[0]);
      assert.ok(["same", "adjacent"].includes(periodRelation(getClimateNormal("barcelona-spain")!, getClimateNormal(item.slug)!)));
    }
    const rawDiffs = items.map((item) => item.maxTempC - own);
    assert.deepEqual(rawDiffs, [...rawDiffs].sort((a, b) => a - b));
  });

  it("każda stacja ma szerokość geograficzną w dopuszczalnym zakresie", () => {
    for (const profile of profiles) {
      if (!getClimateNormal(profile.slug)) continue;
      const latitude = stationLatitude(profile.slug);
      assert.ok(latitude !== null && Math.abs(latitude) <= 70, profile.slug);
    }
  });
});

describe("kontekst na stronie miesiąca", () => {
  it("strona z normą pokazuje długość dnia, porównanie z Warszawą i pozycję", () => {
    const page = model("barcelona-spain", "styczen");
    assert.ok(page.context);
    assert.match(page.context.dayLength ?? "", /^9 h( \d+ min)?$/);
    assert.ok(page.context.home && page.context.home.maxDiffC > 8);
    assert.match(page.text.lead, /więcej niż w Warszawie w styczniu/);
    assert.equal(page.text.h1, "Barcelona w styczniu: pogoda i temperatura");
  });

  it("linki „gdzie cieplej” prowadzą wyłącznie do indeksowalnych stron tego samego miesiąca", () => {
    let checked = 0;
    let approximate = 0;
    for (const profile of profiles) {
      for (const month of polishMonthSlugs) {
        const page = buildMonthPageModel({ profile, overview: "", month, baseUrl: "https://helptravel.pl", author: {} });
        for (const item of page.context?.warmer ?? []) {
          const target = bySlug.get(item.slug);
          assert.ok(target, item.slug);
          assert.ok(isMonthIndexable(target, getMonthIndex(month)), `${profile.slug}/${month} → ${item.slug}`);
          const sourceNormal = getClimateNormal(profile.slug);
          const targetNormal = getClimateNormal(item.slug);
          assert.ok(sourceNormal && targetNormal, `${profile.slug}/${month} → ${item.slug}`);
          const relation = periodRelation(sourceNormal, targetNormal);
          assert.ok(relation === "same" || relation === "adjacent", `${profile.slug}/${month} → ${item.slug}: ${relation}`);
          assert.equal(item.approximate, relation === "adjacent", `${profile.slug}/${month} → ${item.slug}`);
          assert.ok(targetNormal.maxTempC[getMonthIndex(month)] - sourceNormal.maxTempC[getMonthIndex(month)] >= 3);
          if (item.approximate) approximate += 1;
          checked += 1;
        }
      }
    }
    assert.ok(checked > 1000, `sprawdzono ${checked} linków`);
    assert.ok(approximate > 0, `sprawdzono ${approximate} przybliżeń`);
  });

  it("strona bez normy nie ma kontekstu ani zdania o Warszawie", () => {
    const without = profiles.find((profile) => !getClimateNormal(profile.slug))!;
    const page = buildMonthPageModel({ profile: without, overview: "", month: "styczen", baseUrl: "https://helptravel.pl", author: {} });
    assert.equal(page.weather, null);
    assert.equal(page.context, null);
    assert.equal(/Warszaw/.test(page.text.lead), false);
  });

  it("szablon pokazuje kontekst tylko z modelu", () => {
    const source = readFileSync("src/components/editorial/month-template.tsx", "utf8");
    assert.match(source, /context\?\.dayLength/);
    assert.match(source, /context\.home\.approximate/);
    assert.match(source, /context\?\.standing/);
    assert.match(source, /context\.warmer\.map/);
  });
});

describe("tytuły stron miesięcy", () => {
  it("każdy kierunek ma 12 różnych tytułów, każdy z nazwą miesiąca i w limicie 60 znaków", () => {
    for (const profile of profiles) {
      const titles = polishMonthSlugs.map((month) => buildMonthPageModel({ profile, overview: "", month, baseUrl: "https://helptravel.pl", author: {} }).text.title);
      assert.equal(new Set(titles).size, 12, profile.slug);
      for (const title of titles) assert.ok(title.replace(/ \| HelpTravel$/, "").length <= 60, `${profile.slug}: ${title}`);
    }
  });
});
