import "server-only";

import Fuse from "fuse.js";

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
    region: entry.region,
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

type FuseEntry = {
  city: string;
  country: string;
  aliases: string[];
  suggestion: DestinationSuggestion;
};

function buildFuseIndex(entries: FuseEntry[]) {
  return new Fuse(entries, {
    keys: ["city", "country", "aliases"],
    threshold: 0.4,
    minMatchCharLength: 2,
    includeScore: true,
    shouldSort: true,
  });
}

export async function getDestinationSuggestions(query: string): Promise<DestinationSuggestion[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    const defaults = [
      ...curatedDestinations.map(curatedSuggestion),
      ...destinationCatalog.map(catalogSuggestion),
    ];
    return [
      ...new Map(defaults.map((item) => [normalizeLookup(`${item.city} ${item.country}`), item])).values(),
    ].slice(0, 8);
  }

  const fuseEntries: FuseEntry[] = [
    ...curatedDestinations.map((d) => ({
      city: d.city,
      country: d.country,
      aliases: d.aliases ?? [],
      suggestion: curatedSuggestion(d),
    })),
    ...destinationCatalog.map((e) => ({
      city: e.city,
      country: e.country,
      aliases: e.aliases ?? [],
      suggestion: catalogSuggestion(e),
    })),
  ];

  const fuse = buildFuseIndex(fuseEntries);
  const fuzzyResults = fuse.search(trimmed, { limit: 5 });

  const live = await fetchGeoapifySuggestions(trimmed);
  const merged = new Map<string, DestinationSuggestion>();

  for (const result of fuzzyResults) {
    const key = normalizeLookup(`${result.item.city} ${result.item.country}`);
    if (!merged.has(key)) merged.set(key, result.item.suggestion);
  }
  for (const item of live) {
    const key = normalizeLookup(`${item.city} ${item.country}`);
    if (!merged.has(key)) merged.set(key, item);
  }

  return [...merged.values()].slice(0, 8);
}
