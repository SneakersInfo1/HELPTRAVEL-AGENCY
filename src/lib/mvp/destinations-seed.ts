// Sesja C2 — runtime loader for the curated destinations seed.
//
// `data/destinations.json` and `data/destinations.index.json` are produced
// by `scripts/build-destinations-seed.ts`. We import the lightweight
// `.index.json` for autocomplete (~10 KB at pilot scale, ~150 KB at full
// scale) and the full `.json` only when explicitly needed (planner page
// resolves it server-side).
//
// Both files are committed to the repo so cold starts never hit network.
// Next's module cache pins this in memory after the first import.

import "server-only";

import indexJson from "../../../data/destinations.index.json";
import fullJson from "../../../data/destinations.json";

export interface DestinationIndexEntry {
  id: string;
  cityPl: string;
  cityEn: string;
  countryPl: string;
  countryCode: string | null;
  popularity: number;
  iata: string | null;
}

export interface DestinationRecord {
  id: string;
  city: { en: string; pl: string };
  country: { code: string | null; en: string; pl: string };
  region: { en: string; pl: string };
  lat: number | null;
  lng: number | null;
  airports: string[];
  nearestPLHubs: Array<{ iata: string; km: number; minutes: number }>;
  popularity: number;
  vibeTagsEn: string[];
  vibeTagsPl: string[];
  climate: Record<string, "hot" | "mild" | "cold">;
  budgetTier: "low" | "mid" | "high";
  hotelCount: number;
  heroImage: string | null;
}

interface FullSeed {
  version: string;
  generatedAt: string;
  mode?: string;
  destinations: DestinationRecord[];
}

const seed = fullJson as FullSeed;
const indexArr = indexJson as DestinationIndexEntry[];

export function getDestinationsIndex(): readonly DestinationIndexEntry[] {
  return indexArr;
}

export function getDestinationsCount(): number {
  return seed.destinations.length;
}

export function getDestinationById(id: string): DestinationRecord | undefined {
  return seed.destinations.find((d) => d.id === id);
}

export function getDestinationByCityCountry(
  city: string,
  country?: string,
): DestinationRecord | undefined {
  const targetCity = city.trim().toLowerCase();
  const targetCountry = country?.trim().toLowerCase();
  return seed.destinations.find((d) => {
    const matchCity =
      d.city.en.toLowerCase() === targetCity ||
      d.city.pl.toLowerCase() === targetCity;
    if (!matchCity) return false;
    if (!targetCountry) return true;
    return (
      d.country.en.toLowerCase() === targetCountry ||
      d.country.pl.toLowerCase() === targetCountry ||
      d.country.code?.toLowerCase() === targetCountry
    );
  });
}

export function getTopDestinations(limit: number): DestinationRecord[] {
  return seed.destinations.slice(0, limit);
}

export function listAllDestinations(): readonly DestinationRecord[] {
  return seed.destinations;
}

// Sesja C2 — planner-resolution helper. Given the raw URL params from
// /hotele/szukaj (destination string + optional country string), try to
// find the matching seed record. We accept Polish exonyms AND English
// canonical forms on both fields so old links and new autocomplete picks
// both land on the same record.
//
// Returns null when no match — caller falls back to its existing
// `buildFallbackDestinationProfile` path so the planner page never
// hard-fails.
export function resolveDestinationFromQuery(input: {
  destination: string;
  country?: string;
}): DestinationRecord | null {
  const dest = input.destination.trim().toLowerCase();
  const country = input.country?.trim().toLowerCase();
  if (!dest) return null;
  // Strip "City, Country" pattern if caller didn't split it.
  const [destCity, ...restCountry] = dest.split(",").map((s) => s.trim());
  const inferredCountry = country || restCountry.join(", ") || undefined;

  for (const d of seed.destinations) {
    const cityMatches =
      d.city.en.toLowerCase() === destCity ||
      d.city.pl.toLowerCase() === destCity ||
      d.id === destCity;
    if (!cityMatches) continue;
    if (!inferredCountry) return d;
    if (
      d.country.en.toLowerCase() === inferredCountry ||
      d.country.pl.toLowerCase() === inferredCountry ||
      d.country.code?.toLowerCase() === inferredCountry
    ) {
      return d;
    }
  }
  // City matched without a country narrow → first hit wins (popularity-sorted).
  for (const d of seed.destinations) {
    if (
      d.city.en.toLowerCase() === destCity ||
      d.city.pl.toLowerCase() === destCity
    ) {
      return d;
    }
  }
  return null;
}
