import "server-only";

import { buildAffiliateLinks } from "./affiliate-links";
import { curatedDestinations } from "./destinations";
import { getDestinationStory } from "./destination-content";
import { normalizeLookup, resolveCountryCode } from "./location";
import type {
  DestinationAttractionsResponse,
  GeoapifyPlaceGroup,
  GeoapifyPlaceItem,
  DestinationProfile,
} from "./types";

type GeoapifyFeature = {
  properties?: {
    place_id?: string | number;
    name?: string;
    categories?: string[] | string;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    lat?: number;
    lon?: number;
    distance?: number;
    website?: string;
    datasource?: {
      url?: string;
    };
  };
  geometry?: {
    coordinates?: [number, number];
  };
};

type CityCenter = {
  lat: number;
  lon: number;
};

const groupDefinitions: Array<{
  key: GeoapifyPlaceGroup["key"];
  label: string;
  keywords: string[];
  iconLabel: string;
}> = [
  {
    key: "top",
    label: "Top atrakcje",
    keywords: ["attraction", "sight", "historic", "museum", "monument", "castle", "old town", "square"],
    iconLabel: "TOP",
  },
  {
    key: "museums",
    label: "Muzea i kultura",
    keywords: ["museum", "gallery", "culture", "art", "exhibition"],
    iconLabel: "M",
  },
  {
    key: "viewpoints",
    label: "Punkty widokowe",
    keywords: ["viewpoint", "panorama", "view", "hill", "lookout", "tower"],
    iconLabel: "V",
  },
  {
    key: "beaches",
    label: "Plaże i promenady",
    keywords: ["beach", "coast", "promenade", "seaside", "waterfront"],
    iconLabel: "B",
  },
  {
    key: "parks",
    label: "Parki i spaćer",
    keywords: ["park", "garden", "nature", "square", "green", "trail", "walk"],
    iconLabel: "P",
  },
  {
    key: "food",
    label: "Jedzenie i lokalne miejsca",
    keywords: ["restaurant", "cafe", "bar", "bistro", "food", "tapas", "bakery", "market"],
    iconLabel: "F",
  },
];

function pickName(feature: GeoapifyFeature): string {
  return feature.properties?.name?.trim() || feature.properties?.address_line1?.trim() || "Miejsce warte odwiedzenia";
}

function pickCategory(feature: GeoapifyFeature): string {
  const raw = feature.properties?.categories;
  if (Array.isArray(raw)) return raw.join(", ");
  return typeof raw === "string" ? raw : "place";
}

function pickAddress(feature: GeoapifyFeature): string {
  return (
    feature.properties?.formatted?.trim() ||
    feature.properties?.address_line1?.trim() ||
    feature.properties?.address_line2?.trim() ||
    ""
  );
}

function pickCoordinates(feature: GeoapifyFeature): CityCenter | null {
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  return { lat, lon };
}

function normalizePlaceId(feature: GeoapifyFeature): string {
  const id = feature.properties?.place_id;
  if (typeof id === "number" || typeof id === "string") return String(id);
  const coords = pickCoordinates(feature);
  return `${pickName(feature)}-${coords?.lat ?? "lat"}-${coords?.lon ?? "lon"}`;
}

function toPlaceItem(feature: GeoapifyFeature, iconLabel: string): GeoapifyPlaceItem | null {
  const coords = pickCoordinates(feature);
  if (!coords) return null;
  const name = pickName(feature);
  const address = pickAddress(feature);
  const category = pickCategory(feature);

  return {
    id: normalizePlaceId(feature),
    name,
    category,
    description: address || category,
    address: address || category,
    lat: coords.lat,
    lon: coords.lon,
    distanceMeters: typeof feature.properties?.distance === "number" ? Math.round(feature.properties.distance) : undefined,
    url: feature.properties?.website ?? feature.properties?.datasource?.url,
    iconLabel,
  };
}

export async function resolveCityCoordinates(city: string, country: string): Promise<CityCenter | null> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) return null;

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", [city, country].filter(Boolean).join(", "));
  url.searchParams.set("type", "city");
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "pl");
  url.searchParams.set("apiKey", apiKey);

  const countryCode = resolveCountryCode(country);
  if (countryCode) {
    url.searchParams.set("filter", `countrycode:${countryCode.toLowerCase()}`);
  }

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) return null;

  const payload = (await response.json()) as { features?: GeoapifyFeature[] };
  return pickCoordinates(payload.features?.[0] ?? {}) ?? null;
}

async function searchPlaces(_city: string, _country: string, center: CityCenter): Promise<GeoapifyFeature[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) return [];

  const url = new URL("https://api.geoapify.com/v2/places");
  url.searchParams.set(
    "categories",
    [
      "tourism.attraction",
      "tourism.sights",
      "entertainment.museum",
      "entertainment.culture",
      "leisure.park",
      "beach.beach_resort",
      "catering.restaurant",
      "tourism.attraction.viewpoint",
      "catering.cafe",
      "catering.bar",
      "commercial.shopping_mall",
    ].join(","),
  );
  url.searchParams.set("bias", `proximity:${center.lon},${center.lat}`);
  url.searchParams.set("filter", `circle:${center.lon},${center.lat},25000`);
  url.searchParams.set("limit", "80");
  url.searchParams.set("lang", "pl");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) return [];

  const payload = (await response.json()) as { features?: GeoapifyFeature[] };
  return payload.features ?? [];
}

function chooseGroup(feature: GeoapifyFeature): GeoapifyPlaceGroup["key"] {
  const normalized = normalizeLookup(`${pickName(feature)} ${pickCategory(feature)} ${pickAddress(feature)}`);
  if (groupDefinitions[1].keywords.some((word) => normalized.includes(normalizeLookup(word)))) return "museums";
  if (groupDefinitions[2].keywords.some((word) => normalized.includes(normalizeLookup(word)))) return "viewpoints";
  if (groupDefinitions[3].keywords.some((word) => normalized.includes(normalizeLookup(word)))) return "beaches";
  if (groupDefinitions[4].keywords.some((word) => normalized.includes(normalizeLookup(word)))) return "parks";
  if (groupDefinitions[5].keywords.some((word) => normalized.includes(normalizeLookup(word)))) return "food";
  return "top";
}

function sortPlaces(items: GeoapifyPlaceItem[]): GeoapifyPlaceItem[] {
  return [...items].sort((a, b) => (a.distanceMeters ?? 999999) - (b.distanceMeters ?? 999999));
}

function buildFallbackGroups(destination: DestinationProfile): GeoapifyPlaceGroup[] {
  const story = getDestinationStory(destination);

  return [
    {
      key: "top",
      label: "Top atrakcje",
      items: story.attractions.slice(0, 4).map((item, index) => ({
        id: `${destination.slug}-fallback-top-${index}`,
        name: item,
        category: "fallback",
        description: story.summary,
        address: story.name,
        lat: 0,
        lon: 0,
        iconLabel: "TOP",
      })),
    },
    {
      key: "museums",
      label: "Muzea i kultura",
      items: story.highlights.slice(0, 3).map((item, index) => ({
        id: `${destination.slug}-fallback-museum-${index}`,
        name: item,
        category: "fallback",
        description: story.vibe,
        address: story.name,
        lat: 0,
        lon: 0,
        iconLabel: "M",
      })),
    },
    {
      key: "viewpoints",
      label: "Punkty widokowe",
      items: story.bestFor.slice(0, 3).map((item, index) => ({
        id: `${destination.slug}-fallback-view-${index}`,
        name: item,
        category: "fallback",
        description: story.summary,
        address: story.name,
        lat: 0,
        lon: 0,
        iconLabel: "V",
      })),
    },
    {
      key: "beaches",
      label: "Plaże i promenady",
      items: story.attractions.slice(0, 2).map((item, index) => ({
        id: `${destination.slug}-fallback-beach-${index}`,
        name: item,
        category: "fallback",
        description: story.summary,
        address: story.name,
        lat: 0,
        lon: 0,
        iconLabel: "B",
      })),
    },
    {
      key: "parks",
      label: "Parki i spaćer",
      items: story.districts.slice(0, 3).map((item, index) => ({
        id: `${destination.slug}-fallback-park-${index}`,
        name: item,
        category: "fallback",
        description: story.vibe,
        address: story.name,
        lat: 0,
        lon: 0,
        iconLabel: "P",
      })),
    },
    {
      key: "food",
      label: "Jedzenie i lokalne miejsca",
      items: story.foodSpots.slice(0, 3).map((item, index) => ({
        id: `${destination.slug}-fallback-food-${index}`,
        name: item,
        category: "fallback",
        description: story.summary,
        address: story.name,
        lat: 0,
        lon: 0,
        iconLabel: "F",
      })),
    },
  ];
}

function fallbackDestination(city: string, country: string): DestinationProfile {
  const exact = curatedDestinations.find(
    (item) =>
      normalizeLookup(item.city) === normalizeLookup(city) ||
      normalizeLookup(`${item.city} ${item.country}`) === normalizeLookup(`${city} ${country}`),
  );

  if (exact) return exact;

  return {
    id: `${city}-${country}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    slug: `${city}-${country}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    city,
    country,
    visaForPL: true,
    avgTempByMonth: [],
    costIndex: 1,
    beachScore: 0.5,
    cityScore: 0.5,
    sightseeingScore: 0.5,
    nightlifeScore: 0.5,
    natureScore: 0.5,
    safetyScore: 0.5,
    accessScore: 0.5,
    typicalFlightHoursFromPL: 0,
    affiliateLinks: buildAffiliateLinks(city, country),
  };
}

export async function searchDestinationAttractions(input: {
  city: string;
  country: string;
}): Promise<DestinationAttractionsResponse> {
  const destination = fallbackDestination(input.city, input.country);
  const center = await resolveCityCoordinates(destination.city, destination.country);
  const fetchedAt = new Date().toISOString();

  if (!center) {
    return {
      city: destination.city,
      country: destination.country,
      source: "fallback",
      groups: buildFallbackGroups(destination),
      fetchedAt,
    };
  }

  const features = await searchPlaces(destination.city, destination.country, center);
  if (features.length === 0) {
    return {
      city: destination.city,
      country: destination.country,
      source: "fallback",
      center,
      groups: buildFallbackGroups(destination),
      fetchedAt,
    };
  }

  const seen = new Set<string>();
  const groupsMap = new Map<GeoapifyPlaceGroup["key"], GeoapifyPlaceItem[]>();

  for (const feature of features) {
    const key = normalizePlaceId(feature);
    if (seen.has(key)) continue;
    seen.add(key);

    const groupKey = chooseGroup(feature);
    const config = groupDefinitions.find((item) => item.key === groupKey) ?? groupDefinitions[0];
    const place = toPlaceItem(feature, config.iconLabel);
    if (!place) continue;

    const bucket = groupsMap.get(groupKey) ?? [];
    if (bucket.length >= 6) continue;
    bucket.push(place);
    groupsMap.set(groupKey, bucket);
  }

  const groups = groupDefinitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    items: sortPlaces(groupsMap.get(definition.key) ?? []).slice(0, definition.key === "top" ? 6 : 5),
  }));

  const fallbackGroups = buildFallbackGroups(destination);
  const mergedGroups = groups.map((group) => {
    if (group.items.length > 0) {
      return group;
    }

    const fallbackGroup = fallbackGroups.find((item) => item.key === group.key);
    return fallbackGroup ?? group;
  });

  const hasAny = mergedGroups.some((group) => group.items.length > 0);
  if (!hasAny) {
    return {
      city: destination.city,
      country: destination.country,
      source: "fallback",
      center,
      groups: fallbackGroups,
      fetchedAt,
    };
  }

  return {
    city: destination.city,
    country: destination.country,
    source: "geoapify",
    center,
    groups: mergedGroups,
    fetchedAt,
  };
}
