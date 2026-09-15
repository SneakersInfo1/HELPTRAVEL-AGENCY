import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import sitemap from "@/app/sitemap";

import { getAllDestinationProfiles } from "./destinations";
import { CURRENT_INDEX_BASELINE, MONTH_INDEX_BASELINE_META } from "./month-index-baseline";
import { isMonthIndexable } from "./month-index-policy";
import { polishMonthSlugs } from "./months";
import type { DestinationProfile } from "./types";

// Zamrożony indeks stron /kierunki/[slug]/[miesiac] (SEO Data Integrity, PR #1.5).
//
// Najważniejszy test regresji tego PR-a: zbiór indeksowalnych stron miesięcy
// po zmianie jest DOKŁADNIE tym zbiorem, który był na produkcji (cd2aaee) —
// nie tylko ta sama liczba, ale te same adresy. Zero INDEX→NOINDEX i zero
// NOINDEX→INDEX, także w sitemapie. Temperatura z szablonu regionu nie może
// już zmienić żadnej decyzji.

const MONTH_PATH = new RegExp(`^/kierunki/[a-z0-9-]+/(${polishMonthSlugs.join("|")})$`);

const baselinePaths = Object.entries(CURRENT_INDEX_BASELINE)
  .flatMap(([slug, months]) => months.map((month) => `/kierunki/${slug}/${month}`))
  .sort();

function indexablePaths(profiles: DestinationProfile[]): string[] {
  return profiles
    .flatMap((dest) =>
      polishMonthSlugs.flatMap((month, monthIndex) =>
        isMonthIndexable(dest, monthIndex) ? [`/kierunki/${dest.slug}/${month}`] : [],
      ),
    )
    .sort();
}

describe("zamrożony indeks stron miesięcy", () => {
  it("baza: 1039 stron, sha256 zgodny z META, znane slugi i miesiące w kolejności", () => {
    assert.equal(baselinePaths.length, 1039);
    assert.equal(MONTH_INDEX_BASELINE_META.count, 1039);
    assert.equal(new Set(baselinePaths).size, baselinePaths.length);
    assert.equal(
      createHash("sha256").update(baselinePaths.join("\n"), "utf8").digest("hex"),
      MONTH_INDEX_BASELINE_META.sha256,
    );

    const slugs = new Set(getAllDestinationProfiles().map((dest) => dest.slug));
    for (const [slug, months] of Object.entries(CURRENT_INDEX_BASELINE)) {
      assert.ok(slugs.has(slug), `nieznany kierunek w bazie: ${slug}`);
      const order = months.map((month) => polishMonthSlugs.indexOf(month));
      assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])), slug);
    }
  });

  it("bazę wygenerowano z predykatu produkcyjnego cd2aaee i sprawdzono z sitemapą produkcji", () => {
    assert.equal(MONTH_INDEX_BASELINE_META.predicateCommit, "cd2aaee80dd34371ebaad7ff4abafaf3fb52cf57");
    assert.equal(MONTH_INDEX_BASELINE_META.verifiedAgainst?.sitemap, "https://helptravel.pl/sitemap.xml");
    assert.equal(MONTH_INDEX_BASELINE_META.verifiedAgainst?.sitemapMonthUrls, 1039);
    assert.equal(MONTH_INDEX_BASELINE_META.verifiedAgainst?.missingInSitemap, 0);
    assert.equal(MONTH_INDEX_BASELINE_META.verifiedAgainst?.extraInSitemap, 0);
  });

  it("decyzja dla wszystkich 235 × 12 stron = dokładnie zbiór z bazy", () => {
    const profiles = getAllDestinationProfiles();
    assert.equal(profiles.length * polishMonthSlugs.length, 2820);
    assert.deepEqual(indexablePaths(profiles), baselinePaths);
  });

  it("sitemap zawiera dokładnie zbiór stron miesięcy z bazy", () => {
    const sitemapMonthPaths = sitemap()
      .map((entry) => new URL(entry.url).pathname)
      .filter((pathname) => MONTH_PATH.test(pathname))
      .sort();
    assert.equal(sitemapMonthPaths.length, 1039);
    assert.deepEqual(sitemapMonthPaths, baselinePaths);
  });

  it("temperatura, profil plażowy i city break nie zmieniają żadnej decyzji", () => {
    const profiles = getAllDestinationProfiles();
    const hot = profiles.map((dest) => ({ ...dest, avgTempByMonth: Array(12).fill(40), beachScore: 1, cityScore: 1 }));
    const cold = profiles.map((dest) => ({ ...dest, avgTempByMonth: Array(12).fill(-10), beachScore: 0, cityScore: 0 }));
    const empty = profiles.map((dest) => ({ ...dest, avgTempByMonth: [] }));
    assert.deepEqual(indexablePaths(hot), baselinePaths);
    assert.deepEqual(indexablePaths(cold), baselinePaths);
    assert.deepEqual(indexablePaths(empty), baselinePaths);
  });

  it("zimowi kandydaci PR #2 i Gdańsk zostają noindex, a strona z błędną temperaturą nie znika z indeksu po cichu", () => {
    const bySlug = new Map(getAllDestinationProfiles().map((dest) => [dest.slug, dest]));
    const decision = (slug: string, month: (typeof polishMonthSlugs)[number]) => {
      const dest = bySlug.get(slug);
      assert.ok(dest, slug);
      return isMonthIndexable(dest, polishMonthSlugs.indexOf(month));
    };

    for (const [slug, month] of [
      ["alicante-spain", "listopad"],
      ["alicante-spain", "grudzien"],
      ["limassol-cyprus", "grudzien"],
      ["limassol-cyprus", "styczen"],
      ["palermo-italy", "listopad"],
      ["bari-italy", "grudzien"],
      ["bari-italy", "styczen"],
      ["kos-greece", "listopad"],
      ["sofia-bulgaria", "listopad"],
      ["faro-portugal", "listopad"],
    ] as const) {
      assert.equal(decision(slug, month), false, `${slug}/${month}`);
    }
    for (const month of polishMonthSlugs) {
      assert.equal(decision("gdansk-poland", month), false, `gdansk-poland/${month}`);
    }
    // Miami XII ma na produkcji index mimo temperatury 4°C z szablonu. Zamrożenie
    // nie zdejmuje go z indeksu — liczba znika ze strony, decyzja zostaje u właściciela.
    assert.equal(decision("miami-united-states-of-america", "grudzien"), true);
  });
});
