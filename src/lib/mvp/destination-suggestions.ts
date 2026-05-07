import "server-only";

import Fuse from "fuse.js";

import { destinationCatalog } from "./destination-catalog";
import { curatedDestinations } from "./destinations";
import { normalizeLookup, resolveAirportCode } from "./location";
import type { DestinationSuggestion } from "./types";


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

  // Sesja C follow-up: autocomplete is restricted to destinations we
  // actually have inventory for (curated + catalog). Geoapify was added
  // earlier to widen the input surface, but it returned cities we cannot
  // serve (LiteAPI may not have hotels there) and ones with Polish-only
  // country names that broke the country→ISO lookup. Honest UX: only
  // suggest what we can deliver.
  const fuse = buildFuseIndex(fuseEntries);
  const fuzzyResults = fuse.search(trimmed, { limit: 8 });

  const merged = new Map<string, DestinationSuggestion>();
  for (const result of fuzzyResults) {
    const key = normalizeLookup(`${result.item.city} ${result.item.country}`);
    if (!merged.has(key)) merged.set(key, result.item.suggestion);
  }
  return [...merged.values()].slice(0, 8);
}
