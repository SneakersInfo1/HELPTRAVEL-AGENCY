import "server-only";

import { destinationCatalog } from "./destination-catalog";
import { curatedDestinations } from "./destinations";
import { normalizeLookup, resolveAirportCode } from "./location";
import type { DestinationSuggestion } from "./types";

type GeoapifyFeature = {
  properties?: {
    place_id?: string | number;
    city?: string;
    country?: string;
    state?: string;
    county?: string;
    formatted?: string;
    name?: string;
  };
};

function rankCuratedDestination(query: string, city: string, country: string): number {
  if (!query) {
    return 100;
  }

  const normalizedQuery = normalizeLookup(query);
  const cityLookup = normalizeLookup(city);
  const countryLookup = normalizeLookup(country);
  const haystack = `${cityLookup} ${countryLookup}`;

  if (haystack === normalizedQuery) return 120;
  if (cityLookup === normalizedQuery) return 115;
  if (`${cityLookup} ${countryLookup}`.startsWith(normalizedQuery)) return 110;
  if (cityLookup.startsWith(normalizedQuery)) return 105;
  if (haystack.includes(normalizedQuery)) return 92;
  return 0;
}

function curatedSuggestion(destination: (typeof curatedDestinations)[number]): DestinationSuggestion {
  return {
    id: `curated-${destination.slug}`,
    city: destination.city,
    country: destination.country,
    label: `${destination.city}, ${destination.country}`,
    queryValue: `${destination.city}, ${destination.country}`,
    source: "curated",
    destinationSlug: destination.slug,
    airportCode: destination.airportCode ?? resolveAirportCode(destination.city),
  };
}

function catalogSuggestion(entry: (typeof destinationCatalog)[number]): DestinationSuggestion {
  const curatedMatch = curatedDestinations.find(
    (destination) =>
      normalizeLookup(destination.city) === normalizeLookup(entry.city) &&
      normalizeLookup(destination.country) === normalizeLookup(entry.country),
  );

  return {
    id: `catalog-${entry.slug}`,
    city: entry.city,
    country: entry.country,
    label: entry.label,
    queryValue: entry.label,
    source: curatedMatch ? "curated" : "catalog",
    destinationSlug: curatedMatch?.slug,
    airportCode: curatedMatch?.airportCode ?? entry.airportCode ?? resolveAirportCode(entry.city),
  };
}

function toGeoapifySuggestion(feature: GeoapifyFeature): DestinationSuggestion | null {
  const city = feature.properties?.city?.trim() || feature.properties?.name?.trim();
  const country = feature.properties?.country?.trim();
  if (!city || !country) {
    return null;
  }

  const region = feature.properties?.state?.trim() || feature.properties?.county?.trim();
  const curatedMatch = curatedDestinations.find(
    (destination) =>
      normalizeLookup(destination.city) === normalizeLookup(city) &&
      normalizeLookup(destination.country) === normalizeLookup(country),
  );

  return {
    id: String(feature.properties?.place_id ?? `${city}-${country}`),
    city,
    country,
    region,
    label: `${city}, ${country}`,
    queryValue: `${city}, ${country}`,
    source: curatedMatch ? "curated" : "geoapify",
    destinationSlug: curatedMatch?.slug,
    airportCode: curatedMatch?.airportCode ?? resolveAirportCode(city),
  };
}

async function fetchGeoapifySuggestions(query: string): Promise<DestinationSuggestion[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey || query.trim().length < 2) {
    return [];
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query.trim());
  url.searchParams.set("type", "city");
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "pl");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { features?: GeoapifyFeature[] };
  return (payload.features ?? [])
    .map(toGeoapifySuggestion)
    .filter((item): item is DestinationSuggestion => Boolean(item));
}

export async function getDestinationSuggestions(query: string): Promise<DestinationSuggestion[]> {
  const trimmed = query.trim();
  const curated = curatedDestinations
    .map((destination) => ({
      destination,
      score: rankCuratedDestination(trimmed, destination.city, destination.country),
    }))
    .filter((item) => item.score > 0 || !trimmed)
    .sort((left, right) => right.score - left.score || left.destination.city.localeCompare(right.destination.city))
    .map((item) => curatedSuggestion(item.destination));
  const catalog = destinationCatalog
    .map((entry) => ({
      entry,
      score: rankCuratedDestination(trimmed, entry.city, entry.country),
    }))
    .filter((item) => item.score > 0 || !trimmed)
    .sort((left, right) => right.score - left.score || left.entry.city.localeCompare(right.entry.city))
    .map((item) => catalogSuggestion(item.entry));

  if (!trimmed) {
    return [...new Map([...curated, ...catalog].map((item) => [normalizeLookup(`${item.city} ${item.country}`), item])).values()].slice(0, 8);
  }

  const live = await fetchGeoapifySuggestions(trimmed);
  const merged = new Map<string, DestinationSuggestion>();

  for (const item of [...curated, ...catalog, ...live]) {
    const key = normalizeLookup(`${item.city} ${item.country}`);
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  return [...merged.values()].slice(0, 8);
}
