// Month-page indexation policy ("operacja odchudzanie").
//
// WHY: ~2 800 `/kierunki/[slug]/[miesiac]` pages are generated from one
// template + a temperature array + a budget formula. Under Google's March
// 2026 core update, "scaled content abuse" is the #1 enforcement target and
// the Helpful Content signal is SITE-WIDE — a large mass of thin, near-
// duplicate pages drags down the WHOLE domain (incl. our good money pages).
// GSC already flagged 228 of these as "scanned, not indexed".
//
// WHAT: keep the genuinely intentful subset indexable (~balanced top third)
// and `noindex` the long tail (minor inland cities outside their season),
// which (a) almost never ranks and (b) is the part dragging the domain.
// `noindex` pages stay live (internal links don't 404, ISR still works) and
// keep `follow` so equity flows; they're just removed from the index + sitemap.
//
// Guaranteed to STAY indexable (owner's instruction "zawsze zostają"):
//   • curated destinations (hand-written DestinationStory)
//   • commercial cities (/hotele/w/[miasto])
//   • beach destinations in their warm season
// On top of that we keep strong city-breaks in comfortable months + the
// festive (December) city-break window.

import { commercialCities } from "./commercial-cities";
import { getStoryBySlug } from "./destination-content";
import { getAllDestinationProfiles } from "./destinations";
import { getMonthIndex, isPolishMonthSlug } from "./months";
import type { DestinationProfile } from "./types";

const commercialDestIds = new Set(commercialCities.map((c) => c.destinationId));

function isCurated(slug: string): boolean {
  return Boolean(getStoryBySlug(slug));
}

/**
 * Should `/kierunki/{dest.slug}/{month}` be indexable? `monthIndex` is 0-11.
 * Pure function of data we already have — no I/O, safe in metadata + sitemap.
 */
export function isMonthIndexable(dest: DestinationProfile, monthIndex: number): boolean {
  const temp = dest.avgTempByMonth[monthIndex];
  if (typeof temp !== "number") return false;

  const curated = isCurated(dest.slug);
  const commercial = commercialDestIds.has(dest.slug);
  const beach = dest.beachScore >= 0.6;
  const strongCity = dest.cityScore >= 0.78;
  const isDecember = monthIndex === 11;

  // ── Guaranteed spine (always keep) ──
  // Curated / commercial destinations have brand + can support unique content;
  // keep all but their genuinely cold months (a freezing off-season month for
  // e.g. a Mediterranean city has no realistic search intent).
  if ((curated || commercial) && temp >= 10) return true;
  // Beach destinations in their warm season — "morze w {miesiącu}" intent.
  if (beach && temp >= 22) return true;

  // ── Intentful long-tail ──
  // Strong city-breaks in a comfortable window (sightseeing weather).
  if (strongCity && temp >= 16 && temp <= 32) return true;
  // Festive December window — only strong city-breaks (Christmas-market / NYE).
  if (isDecember && strongCity) return true;

  // Everything else (minor inland cities outside season, cold shoulder
  // months for weak-intent destinations) → noindex.
  return false;
}

/** Slug-based convenience for callers that only have strings (e.g. sitemap dedup). */
export function isMonthPageIndexableBySlug(destinationSlug: string, monthSlug: string): boolean {
  if (!isPolishMonthSlug(monthSlug)) return false;
  const dest = getAllDestinationProfiles().find((d) => d.slug === destinationSlug);
  if (!dest) return false;
  return isMonthIndexable(dest, getMonthIndex(monthSlug));
}

/**
 * Diagnostics for tests/verification: how many month pages stay indexable.
 * Lets us confirm the "balanced ~top third" target without guessing.
 */
export function monthIndexStats(monthCount = 12): {
  total: number;
  indexable: number;
  noindexed: number;
  fraction: number;
} {
  const profiles = getAllDestinationProfiles();
  let indexable = 0;
  for (const dest of profiles) {
    for (let m = 0; m < monthCount; m += 1) {
      if (isMonthIndexable(dest, m)) indexable += 1;
    }
  }
  const total = profiles.length * monthCount;
  return {
    total,
    indexable,
    noindexed: total - indexable,
    fraction: total === 0 ? 0 : Math.round((indexable / total) * 1000) / 1000,
  };
}
