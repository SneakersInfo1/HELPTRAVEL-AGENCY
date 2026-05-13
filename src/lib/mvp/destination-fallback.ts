import { buildAffiliateLinks } from "./affiliate-links";
import { resolveDestinationFromQuery } from "./destinations-seed";
import { findDestinationProfile } from "./destinations";
import { normalizeLookup, resolveAirportCode } from "./location";
import type { DestinationProfile } from "./types";

function slugify(value: string): string {
  return normalizeLookup(value).replace(/\s+/g, "-");
}

export function parseDestinationHint(destinationHint: string): {
  city: string;
  country?: string;
} {
  const cleaned = destinationHint.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { city: "" };
  }

  const parts = cleaned
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { city: cleaned };
  }

  return {
    city: parts[0] ?? cleaned,
    country: parts.slice(1).join(", ") || undefined,
  };
}

export function findCuratedDestination(input: {
  city: string;
  country?: string;
}): DestinationProfile | undefined {
  const normalizedCity = normalizeLookup(input.city);
  const normalizedCountry = normalizeLookup(input.country ?? "");

  return findDestinationProfile({
    city: normalizedCity || input.city,
    country: normalizedCountry || input.country,
  });
}

export function buildFallbackDestinationProfile(input: {
  city: string;
  country?: string;
}): DestinationProfile {
  // 1) Curated (hand-tuned 200 destinations, highest quality scores).
  const matched = findCuratedDestination(input);
  if (matched) {
    return matched;
  }

  // 2) Sesja C2 seed (verified hotels + airports). Provides real lat/lng,
  //    Polish exonym alignment, and the canonical English city/country for
  //    LiteAPI lookups. Falls through to (3) if not found.
  const seedHit = resolveDestinationFromQuery({
    destination: input.city,
    country: input.country,
  });
  if (seedHit) {
    const cityEn = seedHit.city.en;
    const countryEn = seedHit.country.en;
    const nearestPL = seedHit.nearestPLHubs[0];
    const hours = nearestPL ? Math.max(1.0, nearestPL.minutes / 60) : 3.4;
    return {
      id: `seed-${seedHit.id}`,
      slug: seedHit.id,
      city: cityEn,
      country: countryEn,
      airportCode: seedHit.airports[0] ?? resolveAirportCode(cityEn),
      visaForPL: true,
      avgTempByMonth: [18, 18, 19, 20, 22, 25, 28, 28, 25, 22, 19, 18],
      costIndex: seedHit.budgetTier === "high" ? 1.35 : seedHit.budgetTier === "low" ? 0.95 : 1.12,
      beachScore: seedHit.vibeTagsEn.includes("beach") ? 0.8 : 0.5,
      cityScore: seedHit.vibeTagsEn.includes("city break") ? 0.85 : 0.6,
      sightseeingScore: seedHit.vibeTagsEn.includes("culture") ? 0.85 : 0.7,
      nightlifeScore: seedHit.vibeTagsEn.includes("nightlife") ? 0.85 : 0.55,
      natureScore: seedHit.vibeTagsEn.includes("nature") ? 0.85 : 0.55,
      safetyScore: 0.78,
      accessScore: 0.7,
      typicalFlightHoursFromPL: hours,
      affiliateLinks: buildAffiliateLinks(cityEn, countryEn),
    };
  }

  // 3) Virtual fallback for genuinely unknown destinations (safety net so
  //    the planner page never throws).
  const city = input.city.trim();
  const country = input.country?.trim() || "Wybrany kierunek";
  const slugBase = [city, country].filter(Boolean).join(" ");

  return {
    id: `virtual-${slugify(slugBase)}`,
    slug: slugify(slugBase),
    city,
    country,
    airportCode: resolveAirportCode(city),
    visaForPL: true,
    avgTempByMonth: [18, 18, 19, 20, 22, 25, 28, 28, 25, 22, 19, 18],
    costIndex: 1.12,
    beachScore: 0.6,
    cityScore: 0.78,
    sightseeingScore: 0.76,
    nightlifeScore: 0.62,
    natureScore: 0.58,
    safetyScore: 0.72,
    accessScore: 0.65,
    typicalFlightHoursFromPL: 3.4,
    affiliateLinks: buildAffiliateLinks(city, country),
  };
}
