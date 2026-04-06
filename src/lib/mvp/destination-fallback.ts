import { buildAffiliateLinks } from "./affiliate-links";
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
  const matched = findCuratedDestination(input);
  if (matched) {
    return matched;
  }

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
