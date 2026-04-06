import type { DiscoveryPreferences, DiscoveryRequestInput } from "./types";
import { allDestinationProfiles } from "./destinations";

const CITY_HINTS: Array<{ hint: string; label: string }> = [
  { hint: "warszaw", label: "Warszawa" },
  { hint: "krakow", label: "Krakow" },
  { hint: "gdansk", label: "Gdansk" },
  { hint: "wroclaw", label: "Wroclaw" },
  { hint: "poznan", label: "Poznan" },
  { hint: "katowic", label: "Katowice" },
  { hint: "lodz", label: "Lodz" },
  { hint: "rzeszow", label: "Rzeszow" },
  { hint: "szczecin", label: "Szczecin" },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBudget(query: string, fallback?: number): number {
  const budgetPattern = /(?:do|max|maks(?:ymalnie)?)\s*(\d{3,5})\s*(?:zl|pln)?/;
  const withCurrencyPattern = /(\d{3,5})\s*(?:zl|pln)/;

  const budgetMatch = query.match(budgetPattern) ?? query.match(withCurrencyPattern);
  if (budgetMatch) {
    return Math.max(600, Number.parseInt(budgetMatch[1], 10));
  }

  if (typeof fallback === "number") {
    return Math.max(600, fallback);
  }

  return 2500;
}

function parseDuration(
  query: string,
  fallbackMin?: number,
  fallbackMax?: number,
): Pick<DiscoveryPreferences, "durationMinDays" | "durationMaxDays"> {
  const rangeMatch = query.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*dni/);
  if (rangeMatch) {
    return {
      durationMinDays: Math.max(2, Number.parseInt(rangeMatch[1], 10)),
      durationMaxDays: Math.min(14, Number.parseInt(rangeMatch[2], 10)),
    };
  }

  const singleMatch = query.match(/(\d{1,2})\s*dni/);
  if (singleMatch) {
    const value = Math.max(2, Number.parseInt(singleMatch[1], 10));
    return {
      durationMinDays: value,
      durationMaxDays: value,
    };
  }

  if (query.includes("weekend")) {
    return { durationMinDays: 2, durationMaxDays: 3 };
  }

  if (typeof fallbackMin === "number" && typeof fallbackMax === "number") {
    return {
      durationMinDays: Math.max(2, fallbackMin),
      durationMaxDays: Math.min(14, fallbackMax),
    };
  }

  return { durationMinDays: 4, durationMaxDays: 5 };
}

function parseOriginCity(query: string, fallback?: string): string | undefined {
  if (fallback) {
    return fallback;
  }

  for (const city of CITY_HINTS) {
    if (query.includes(city.hint)) {
      return city.label;
    }
  }

  return undefined;
}

function parseDestinationFocus(query: string): string | undefined {
  for (const destination of allDestinationProfiles) {
    const city = normalizeText(destination.city);
    const country = normalizeText(destination.country);
    const slug = normalizeText(destination.slug);
    const aliases = destination.aliases?.map((alias) => normalizeText(alias)) ?? [];

    if (
      query.includes(city) ||
      query.includes(country) ||
      query.includes(slug) ||
      aliases.some((alias) => query.includes(alias))
    ) {
      return destination.slug;
    }
  }

  if (query.includes("malaga")) {
    return "malaga-spain";
  }

  return undefined;
}

function parseTemperaturePreference(query: string): DiscoveryPreferences["temperaturePreference"] {
  if (query.includes("gorac") || query.includes("upal") || query.includes("bardzo ciepl") || query.includes("hot")) {
    return "hot";
  }

  if (query.includes("ciepl") || query.includes("slonce") || query.includes("plaza") || query.includes("warm")) {
    return "warm";
  }

  return "any";
}

function parseVisaPreference(query: string): DiscoveryPreferences["visaPreference"] {
  if (query.includes("bez wizy") || query.includes("bezwiz")) {
    return "visa_free";
  }
  return "any";
}

function parseLogisticsPreference(query: string): DiscoveryPreferences["logisticsPreference"] {
  if (
    query.includes("bez logistyki") ||
    query.includes("prosta logistyka") ||
    query.includes("prosty dojazd") ||
    query.includes("latwy dojazd") ||
    query.includes("easy logistics") ||
    query.includes("simple logistics")
  ) {
    return "easy";
  }

  return "any";
}

function parseTripMood(query: string): DiscoveryPreferences["tripMood"] {
  if (query.includes("romant")) return "romantic";
  if (query.includes("rodzin") || query.includes("family")) return "family";
  if (query.includes("solo")) return "solo";
  if (query.includes("food") || query.includes("jedzen") || query.includes("kuchn")) return "foodie";
  return "any";
}

function parseShortFlightPreference(query: string): boolean {
  return (
    query.includes("krotki lot") ||
    query.includes("krotkim lot") ||
    query.includes("krotki przelot") ||
    query.includes("blisko") ||
    query.includes("short flight") ||
    query.includes("easy flight") ||
    query.includes("easy route")
  );
}

function parseWeatherReliability(query: string): boolean {
  return (
    query.includes("dobra pogoda") ||
    query.includes("pewna pogoda") ||
    query.includes("stabilna pogoda") ||
    query.includes("good weather") ||
    query.includes("reliable weather")
  );
}

function parseMaxTransfers(query: string): number {
  if (query.includes("bez przesiadek")) {
    return 0;
  }
  if (query.includes("1 przesiadka") || query.includes("jedna przesiadka")) {
    return 1;
  }
  if (query.includes("2 przesiadki")) {
    return 2;
  }
  return 1;
}

function parseStyle(query: string): DiscoveryPreferences["styleWeights"] {
  const style = {
    beach: 0.5,
    city: 0.5,
    sightseeing: 0.5,
    nightlife: 0.35,
    nature: 0.35,
    food: 0.45,
  };

  const bumps: Array<{ condition: boolean; key: keyof typeof style; value: number }> = [
    { condition: query.includes("plaza") || query.includes("beach"), key: "beach", value: 0.95 },
    { condition: query.includes("miasto") || query.includes("city break"), key: "city", value: 0.9 },
    { condition: query.includes("zwiedz") || query.includes("sightseeing"), key: "sightseeing", value: 0.95 },
    { condition: query.includes("zabyt"), key: "sightseeing", value: 0.9 },
    { condition: query.includes("nocne") || query.includes("nightlife"), key: "nightlife", value: 0.9 },
    { condition: query.includes("imprez") || query.includes("party"), key: "nightlife", value: 0.95 },
    { condition: query.includes("natura") || query.includes("nature"), key: "nature", value: 0.9 },
    { condition: query.includes("gory") || query.includes("mountain"), key: "nature", value: 0.85 },
    { condition: query.includes("jedzen") || query.includes("food"), key: "food", value: 0.9 },
    { condition: query.includes("romant"), key: "city", value: 0.78 },
    { condition: query.includes("romant"), key: "food", value: 0.82 },
    { condition: query.includes("family"), key: "nature", value: 0.76 },
    { condition: query.includes("rodzin"), key: "nature", value: 0.76 },
    { condition: query.includes("solo"), key: "city", value: 0.76 },
    { condition: query.includes("relax"), key: "beach", value: 0.86 },
    { condition: query.includes("spokoj"), key: "nature", value: 0.8 },
  ];

  for (const bump of bumps) {
    if (bump.condition) {
      style[bump.key] = Math.max(style[bump.key], bump.value);
    }
  }

  return style;
}

function parseTags(query: string): Pick<DiscoveryPreferences, "mustTags" | "niceTags"> {
  const mustTags: string[] = [];
  const niceTags: string[] = [];

  if (query.includes("bez wizy")) {
    mustTags.push("visa_free");
  }
  if (query.includes("bez przesiadek")) {
    mustTags.push("direct_flight");
  }
  if (query.includes("plaza") || query.includes("beach")) {
    niceTags.push("beach");
  }
  if (query.includes("miasto") || query.includes("city break")) {
    niceTags.push("city");
  }
  if (query.includes("zwiedz") || query.includes("sightseeing")) {
    niceTags.push("sightseeing");
  }
  if (query.includes("ciepl") || query.includes("warm")) {
    niceTags.push("warm_weather");
  }
  if (query.includes("tanio") || query.includes("budzet") || query.includes("budget")) {
    niceTags.push("value");
  }
  if (query.includes("romant")) {
    niceTags.push("romantic");
  }
  if (query.includes("rodzin") || query.includes("family")) {
    niceTags.push("family");
  }
  if (query.includes("solo")) {
    niceTags.push("solo");
  }
  if (query.includes("jedzenie") || query.includes("food")) {
    niceTags.push("foodie");
  }
  if (
    (query.includes("zwiedz") && query.includes("plaza")) ||
    (query.includes("sightseeing") && query.includes("beach"))
  ) {
    niceTags.push("beach_and_sightseeing");
  }

  return { mustTags, niceTags };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseDiscoveryInput(input: DiscoveryRequestInput): DiscoveryPreferences {
  const normalizedQuery = normalizeText(input.query || "");
  const duration = parseDuration(normalizedQuery, input.durationMinDays, input.durationMaxDays);
  const tags = parseTags(normalizedQuery);

  let confidence = 0.55;
  if (normalizedQuery.length > 25) confidence += 0.1;
  if (normalizedQuery.match(/\d/)) confidence += 0.08;
  if (tags.mustTags.length + tags.niceTags.length >= 2) confidence += 0.1;
  if (normalizedQuery.includes("do ")) confidence += 0.08;
  if (parseDestinationFocus(normalizedQuery)) confidence += 0.12;
  if (normalizedQuery.includes("rodzin") || normalizedQuery.includes("romant") || normalizedQuery.includes("solo")) {
    confidence += 0.06;
  }

  return {
    budgetMaxPln: parseBudget(normalizedQuery, input.budgetMaxPln),
    durationMinDays: duration.durationMinDays,
    durationMaxDays: duration.durationMaxDays,
    travelers: clamp(input.travelers ?? 2, 1, 8),
    originCountry: "Poland",
    originCity: parseOriginCity(normalizedQuery, input.originCity),
    destinationFocus: parseDestinationFocus(normalizedQuery),
    departureMonth: input.departureMonth,
    temperaturePreference: parseTemperaturePreference(normalizedQuery),
    visaPreference: parseVisaPreference(normalizedQuery),
    logisticsPreference: parseLogisticsPreference(normalizedQuery),
    tripMood: parseTripMood(normalizedQuery),
    wantsShortFlight: parseShortFlightPreference(normalizedQuery),
    wantsWeatherReliability: parseWeatherReliability(normalizedQuery),
    wantsBeachSightseeingMix:
      (normalizedQuery.includes("plaza") && normalizedQuery.includes("zwiedz")) ||
      (normalizedQuery.includes("beach") && normalizedQuery.includes("sightseeing")),
    maxTransfers: parseMaxTransfers(normalizedQuery),
    mustTags: tags.mustTags,
    niceTags: tags.niceTags,
    styleWeights: parseStyle(normalizedQuery),
    confidence: clamp(confidence, 0.35, 0.95),
  };
}
