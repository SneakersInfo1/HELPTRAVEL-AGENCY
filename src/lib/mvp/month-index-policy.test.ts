import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sitemap from "@/app/sitemap";
import { buildMonthPageModel } from "@/lib/seo/month-page-model";

import { getClimateNormal } from "./climate-normals";
import { getAllDestinationProfiles } from "./destinations";
import {
  ACTIVE_MONTH_INDEX_POLICY,
  isMonthIndexable,
  isMonthIndexableUnder,
  MONTH_INDEX_POLICY_VARIANTS,
  monthIndexPathsUnder,
  monthIndexStats,
} from "./month-index-policy";
import { polishMonthSlugs, type PolishMonthSlug } from "./months";

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

// Wariant „baza bez stron bez danych klimatycznych” (17.11.2026): przygotowany
// i przetestowany, ale NIEAKTYWNY. Włączenie wymaga zgody właściciela
// (docs/seo/OWNER_ACTIONS.md, punkt 16) — to przeniesienie 158 adresów z indeksu
// do noindex i z sitemapy jednym deployem.
describe("warianty polityki indeksu stron miesięcy", () => {
  const profiles = getAllDestinationProfiles();
  const bySlug = new Map(profiles.map((profile) => [profile.slug, profile]));
  const baseline = monthIndexPathsUnder("baseline-1039");
  const withoutGap = monthIndexPathsUnder("baseline-without-climate-gap");
  const withoutGapSet = new Set(withoutGap);
  const removed = baseline.filter((path) => !withoutGapSet.has(path));
  const slugOf = (path: string) => path.split("/")[2];
  const monthOf = (path: string) => path.split("/")[3] as PolishMonthSlug;

  it("aktywny jest wariant bazowy — inny wymaga zgody właściciela", () => {
    assert.equal(
      ACTIVE_MONTH_INDEX_POLICY,
      "baseline-1039",
      "Zmiana aktywnego wariantu przenosi setki stron do noindex. Tylko po zgodzie właściciela (OWNER_ACTIONS, punkt 16).",
    );
    assert.deepEqual([...MONTH_INDEX_POLICY_VARIANTS], ["baseline-1039", "baseline-without-climate-gap"]);
  });

  it("aktywny predykat i sitemapa dają dziś dokładnie bazę 1039 stron", () => {
    const active = profiles
      .flatMap((dest) =>
        polishMonthSlugs.flatMap((month, monthIndex) =>
          isMonthIndexable(dest, monthIndex) ? [`/kierunki/${dest.slug}/${month}`] : [],
        ),
      )
      .sort();
    assert.deepEqual(active, baseline);
    assert.equal(baseline.length, 1039);

    const monthPath = new RegExp(`^/kierunki/[a-z0-9-]+/(${polishMonthSlugs.join("|")})$`);
    const inSitemap = sitemap()
      .map((entry) => new URL(entry.url).pathname)
      .filter((path) => monthPath.test(path))
      .sort();
    assert.deepEqual(inSitemap, baseline);
  });

  it("wariant bez luki klimatycznej: 881 stron, wyłącznie podzbiór bazy", () => {
    const baselineSet = new Set(baseline);
    assert.equal(withoutGap.length, 881);
    assert.ok(
      withoutGap.every((path) => baselineSet.has(path)),
      "wariant nie może dodać strony spoza bazy",
    );
    assert.equal(removed.length, 158);
  });

  it("odejmuje dokładnie strony 25 kierunków, dla których WMO nie ma normy", () => {
    const removedSlugs = new Set(removed.map(slugOf));
    assert.equal(removedSlugs.size, 25);
    for (const slug of removedSlugs) assert.equal(getClimateNormal(slug), null, slug);
    // Kierunek z normą nie traci w wariancie żadnej strony, kierunek bez normy — wszystkie z bazy.
    for (const path of baseline) {
      assert.equal(withoutGapSet.has(path), getClimateNormal(slugOf(path)) !== null, path);
    }
  });

  it("odjęte są dokładnie te strony bazy, które nie pokazują żadnych danych o miesiącu", () => {
    const author = { "@type": "Person", name: "Autor testowy", url: "https://helptravel.pl/redakcja" };
    for (const path of baseline) {
      const profile = bySlug.get(slugOf(path));
      assert.ok(profile, path);
      const model = buildMonthPageModel({
        profile,
        overview: "Przegląd testowy.",
        month: monthOf(path),
        baseUrl: "https://helptravel.pl",
        author,
      });
      assert.equal(model.weather === null, !withoutGapSet.has(path), path);
    }
  });

  it("predykat wariantu zależy tylko od bazy i normy WMO", () => {
    const sample = removed[0];
    const profile = bySlug.get(slugOf(sample));
    assert.ok(profile);
    const monthIndex = polishMonthSlugs.indexOf(monthOf(sample));
    assert.equal(isMonthIndexableUnder("baseline-1039", profile, monthIndex), true);
    assert.equal(isMonthIndexableUnder("baseline-without-climate-gap", profile, monthIndex), false);
    assert.equal(isMonthIndexableUnder("baseline-without-climate-gap", profile, 12), false);
    assert.equal(isMonthIndexableUnder("baseline-1039", { slug: "nie-ma-takiego" }, 0), false);
  });
});
