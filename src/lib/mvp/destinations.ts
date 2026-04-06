import type { DestinationProfile } from "./types";
import { buildAffiliateLinks } from "./affiliate-links";
import { destinationCatalog, getDestinationCatalogEntryBySlug } from "./destination-catalog";
import { normalizeLookup } from "./location";

const links = buildAffiliateLinks;

export const curatedDestinations: DestinationProfile[] = [
  {
    id: "dest_lisbon",
    slug: "lisbon-portugal",
    city: "Lisbon",
    country: "Portugal",
    visaForPL: true,
    avgTempByMonth: [15, 16, 18, 19, 22, 25, 28, 28, 26, 22, 18, 16],
    costIndex: 1.2,
    beachScore: 0.75,
    cityScore: 0.9,
    sightseeingScore: 0.9,
    nightlifeScore: 0.8,
    natureScore: 0.6,
    safetyScore: 0.8,
    accessScore: 0.8,
    typicalFlightHoursFromPL: 4.0,
    affiliateLinks: links("Lisbon", "Portugal"),
  },
  {
    id: "dest_barcelona",
    slug: "barcelona-spain",
    city: "Barcelona",
    country: "Spain",
    visaForPL: true,
    avgTempByMonth: [13, 14, 16, 18, 21, 25, 28, 29, 26, 22, 17, 14],
    costIndex: 1.35,
    beachScore: 0.9,
    cityScore: 0.95,
    sightseeingScore: 0.95,
    nightlifeScore: 0.9,
    natureScore: 0.55,
    safetyScore: 0.78,
    accessScore: 0.82,
    typicalFlightHoursFromPL: 3.0,
    affiliateLinks: links("Barcelona", "Spain"),
  },
  {
    id: "dest_valencia",
    slug: "valencia-spain",
    city: "Valencia",
    country: "Spain",
    visaForPL: true,
    avgTempByMonth: [14, 15, 17, 19, 22, 26, 29, 30, 27, 23, 18, 15],
    costIndex: 1.1,
    beachScore: 0.88,
    cityScore: 0.8,
    sightseeingScore: 0.82,
    nightlifeScore: 0.7,
    natureScore: 0.65,
    safetyScore: 0.8,
    accessScore: 0.76,
    typicalFlightHoursFromPL: 3.2,
    affiliateLinks: links("Valencia", "Spain"),
  },
  {
    id: "dest_malaga",
    slug: "malaga-spain",
    city: "Malaga",
    country: "Spain",
    visaForPL: true,
    avgTempByMonth: [15, 16, 18, 20, 23, 27, 30, 30, 27, 23, 18, 16],
    costIndex: 1.08,
    beachScore: 0.92,
    cityScore: 0.84,
    sightseeingScore: 0.87,
    nightlifeScore: 0.7,
    natureScore: 0.66,
    safetyScore: 0.82,
    accessScore: 0.8,
    typicalFlightHoursFromPL: 3.4,
    affiliateLinks: links("Malaga", "Spain"),
  },
  {
    id: "dest_rome",
    slug: "rome-italy",
    city: "Rome",
    country: "Italy",
    visaForPL: true,
    avgTempByMonth: [12, 13, 15, 18, 22, 27, 30, 30, 26, 22, 17, 13],
    costIndex: 1.35,
    beachScore: 0.45,
    cityScore: 0.98,
    sightseeingScore: 1.0,
    nightlifeScore: 0.75,
    natureScore: 0.5,
    safetyScore: 0.77,
    accessScore: 0.86,
    typicalFlightHoursFromPL: 2.2,
    affiliateLinks: links("Rome", "Italy"),
  },
  {
    id: "dest_naples",
    slug: "naples-italy",
    city: "Naples",
    country: "Italy",
    visaForPL: true,
    avgTempByMonth: [11, 12, 14, 17, 21, 25, 29, 29, 25, 21, 16, 12],
    costIndex: 1.05,
    beachScore: 0.7,
    cityScore: 0.8,
    sightseeingScore: 0.86,
    nightlifeScore: 0.68,
    natureScore: 0.7,
    safetyScore: 0.7,
    accessScore: 0.74,
    typicalFlightHoursFromPL: 2.3,
    affiliateLinks: links("Naples", "Italy"),
  },
  {
    id: "dest_athens",
    slug: "athens-greece",
    city: "Athens",
    country: "Greece",
    visaForPL: true,
    avgTempByMonth: [12, 13, 15, 19, 24, 29, 32, 32, 28, 23, 18, 14],
    costIndex: 1.0,
    beachScore: 0.84,
    cityScore: 0.8,
    sightseeingScore: 0.9,
    nightlifeScore: 0.72,
    natureScore: 0.6,
    safetyScore: 0.76,
    accessScore: 0.72,
    typicalFlightHoursFromPL: 2.6,
    affiliateLinks: links("Athens", "Greece"),
  },
  {
    id: "dest_larnaca",
    slug: "larnaca-cyprus",
    city: "Larnaca",
    country: "Cyprus",
    visaForPL: true,
    avgTempByMonth: [17, 17, 19, 22, 26, 30, 33, 33, 31, 28, 23, 19],
    costIndex: 1.1,
    beachScore: 0.95,
    cityScore: 0.64,
    sightseeingScore: 0.7,
    nightlifeScore: 0.66,
    natureScore: 0.6,
    safetyScore: 0.82,
    accessScore: 0.68,
    typicalFlightHoursFromPL: 3.2,
    affiliateLinks: links("Larnaca", "Cyprus"),
  },
  {
    id: "dest_valletta",
    slug: "valletta-malta",
    city: "Valletta",
    country: "Malta",
    visaForPL: true,
    avgTempByMonth: [15, 15, 17, 19, 23, 28, 31, 31, 28, 25, 21, 17],
    costIndex: 1.18,
    beachScore: 0.82,
    cityScore: 0.78,
    sightseeingScore: 0.82,
    nightlifeScore: 0.68,
    natureScore: 0.55,
    safetyScore: 0.85,
    accessScore: 0.68,
    typicalFlightHoursFromPL: 3.1,
    affiliateLinks: links("Valletta", "Malta"),
  },
  {
    id: "dest_tirana",
    slug: "tirana-albania",
    city: "Tirana",
    country: "Albania",
    visaForPL: true,
    avgTempByMonth: [7, 9, 12, 16, 21, 26, 30, 30, 25, 19, 13, 9],
    costIndex: 0.78,
    beachScore: 0.7,
    cityScore: 0.7,
    sightseeingScore: 0.68,
    nightlifeScore: 0.64,
    natureScore: 0.8,
    safetyScore: 0.75,
    accessScore: 0.62,
    typicalFlightHoursFromPL: 2.1,
    affiliateLinks: links("Tirana", "Albania"),
  },
  {
    id: "dest_istanbul",
    slug: "istanbul-turkey",
    city: "Istanbul",
    country: "Turkey",
    visaForPL: true,
    avgTempByMonth: [8, 9, 11, 15, 20, 25, 28, 28, 24, 19, 14, 10],
    costIndex: 0.85,
    beachScore: 0.62,
    cityScore: 0.95,
    sightseeingScore: 0.95,
    nightlifeScore: 0.8,
    natureScore: 0.55,
    safetyScore: 0.68,
    accessScore: 0.8,
    typicalFlightHoursFromPL: 2.2,
    affiliateLinks: links("Istanbul", "Turkey"),
  },
  {
    id: "dest_antalya",
    slug: "antalya-turkey",
    city: "Antalya",
    country: "Turkey",
    visaForPL: true,
    avgTempByMonth: [11, 12, 15, 19, 24, 30, 34, 34, 30, 24, 17, 13],
    costIndex: 0.9,
    beachScore: 0.98,
    cityScore: 0.65,
    sightseeingScore: 0.7,
    nightlifeScore: 0.68,
    natureScore: 0.62,
    safetyScore: 0.7,
    accessScore: 0.74,
    typicalFlightHoursFromPL: 3.0,
    affiliateLinks: links("Antalya", "Turkey"),
  },
  {
    id: "dest_marrakesh",
    slug: "marrakesh-morocco",
    city: "Marrakesh",
    country: "Morocco",
    visaForPL: true,
    avgTempByMonth: [18, 20, 23, 26, 30, 35, 38, 38, 33, 28, 23, 19],
    costIndex: 0.82,
    beachScore: 0.25,
    cityScore: 0.85,
    sightseeingScore: 0.86,
    nightlifeScore: 0.55,
    natureScore: 0.62,
    safetyScore: 0.65,
    accessScore: 0.6,
    typicalFlightHoursFromPL: 4.5,
    affiliateLinks: links("Marrakesh", "Morocco"),
  },
  {
    id: "dest_agadir",
    slug: "agadir-morocco",
    city: "Agadir",
    country: "Morocco",
    visaForPL: true,
    avgTempByMonth: [20, 21, 23, 24, 25, 27, 30, 30, 28, 26, 24, 21],
    costIndex: 0.8,
    beachScore: 0.92,
    cityScore: 0.55,
    sightseeingScore: 0.62,
    nightlifeScore: 0.5,
    natureScore: 0.72,
    safetyScore: 0.68,
    accessScore: 0.62,
    typicalFlightHoursFromPL: 4.6,
    affiliateLinks: links("Agadir", "Morocco"),
  },
  {
    id: "dest_budapest",
    slug: "budapest-hungary",
    city: "Budapest",
    country: "Hungary",
    visaForPL: true,
    avgTempByMonth: [1, 4, 9, 14, 19, 23, 26, 26, 21, 15, 8, 3],
    costIndex: 0.85,
    beachScore: 0.15,
    cityScore: 0.9,
    sightseeingScore: 0.88,
    nightlifeScore: 0.82,
    natureScore: 0.48,
    safetyScore: 0.82,
    accessScore: 0.9,
    typicalFlightHoursFromPL: 1.2,
    affiliateLinks: links("Budapest", "Hungary"),
  },
  {
    id: "dest_prague",
    slug: "prague-czechia",
    city: "Prague",
    country: "Czechia",
    visaForPL: true,
    avgTempByMonth: [0, 2, 7, 12, 17, 20, 23, 23, 18, 12, 6, 2],
    costIndex: 0.9,
    beachScore: 0.08,
    cityScore: 0.95,
    sightseeingScore: 0.92,
    nightlifeScore: 0.84,
    natureScore: 0.4,
    safetyScore: 0.86,
    accessScore: 0.92,
    typicalFlightHoursFromPL: 1.0,
    affiliateLinks: links("Prague", "Czechia"),
  },
  {
    id: "dest_berlin",
    slug: "berlin-germany",
    city: "Berlin",
    country: "Germany",
    visaForPL: true,
    avgTempByMonth: [2, 3, 8, 13, 18, 21, 24, 24, 19, 13, 7, 3],
    costIndex: 1.25,
    beachScore: 0.08,
    cityScore: 0.9,
    sightseeingScore: 0.84,
    nightlifeScore: 0.92,
    natureScore: 0.45,
    safetyScore: 0.82,
    accessScore: 0.92,
    typicalFlightHoursFromPL: 1.4,
    affiliateLinks: links("Berlin", "Germany"),
  },
  {
    id: "dest_amsterdam",
    slug: "amsterdam-netherlands",
    city: "Amsterdam",
    country: "Netherlands",
    visaForPL: true,
    avgTempByMonth: [4, 5, 8, 11, 15, 18, 21, 21, 18, 14, 9, 5],
    costIndex: 1.65,
    beachScore: 0.22,
    cityScore: 0.94,
    sightseeingScore: 0.86,
    nightlifeScore: 0.88,
    natureScore: 0.42,
    safetyScore: 0.85,
    accessScore: 0.9,
    typicalFlightHoursFromPL: 1.9,
    affiliateLinks: links("Amsterdam", "Netherlands"),
  },
  {
    id: "dest_dublin",
    slug: "dublin-ireland",
    city: "Dublin",
    country: "Ireland",
    visaForPL: true,
    avgTempByMonth: [6, 6, 8, 10, 13, 16, 19, 19, 16, 13, 9, 7],
    costIndex: 1.4,
    beachScore: 0.2,
    cityScore: 0.8,
    sightseeingScore: 0.74,
    nightlifeScore: 0.84,
    natureScore: 0.68,
    safetyScore: 0.88,
    accessScore: 0.82,
    typicalFlightHoursFromPL: 2.8,
    affiliateLinks: links("Dublin", "Ireland"),
  },
  {
    id: "dest_london",
    slug: "london-uk",
    city: "London",
    country: "United Kingdom",
    visaForPL: false,
    avgTempByMonth: [7, 8, 10, 13, 17, 20, 23, 23, 20, 15, 11, 8],
    costIndex: 1.8,
    beachScore: 0.04,
    cityScore: 1.0,
    sightseeingScore: 0.95,
    nightlifeScore: 0.9,
    natureScore: 0.4,
    safetyScore: 0.82,
    accessScore: 0.95,
    typicalFlightHoursFromPL: 2.5,
    affiliateLinks: links("London", "United Kingdom"),
  },
  {
    id: "dest_las_palmas",
    slug: "las-palmas-spain",
    city: "Las Palmas",
    country: "Spain",
    visaForPL: true,
    avgTempByMonth: [21, 21, 22, 23, 24, 25, 27, 28, 27, 26, 24, 22],
    costIndex: 1.2,
    beachScore: 0.95,
    cityScore: 0.64,
    sightseeingScore: 0.68,
    nightlifeScore: 0.62,
    natureScore: 0.84,
    safetyScore: 0.84,
    accessScore: 0.52,
    typicalFlightHoursFromPL: 5.7,
    affiliateLinks: links("Las Palmas", "Spain"),
  },
  {
    id: "dest_funchal",
    slug: "funchal-portugal",
    city: "Funchal",
    country: "Portugal",
    visaForPL: true,
    avgTempByMonth: [19, 19, 20, 20, 22, 24, 26, 27, 26, 24, 22, 20],
    costIndex: 1.22,
    beachScore: 0.58,
    cityScore: 0.62,
    sightseeingScore: 0.72,
    nightlifeScore: 0.5,
    natureScore: 0.94,
    safetyScore: 0.86,
    accessScore: 0.55,
    typicalFlightHoursFromPL: 5.4,
    affiliateLinks: links("Funchal", "Portugal"),
  },
];

const regionalTemperatureProfiles: Record<string, number[]> = {
  "Southern Europe": [11, 12, 15, 18, 22, 27, 30, 30, 26, 21, 16, 12],
  Balkans: [8, 10, 13, 17, 22, 27, 31, 31, 25, 19, 13, 9],
  "Central Europe": [2, 4, 8, 13, 18, 22, 25, 25, 19, 13, 7, 3],
  "Western Europe": [5, 6, 9, 12, 16, 20, 23, 23, 19, 14, 9, 6],
  Nordics: [-1, 0, 3, 8, 13, 18, 21, 20, 15, 9, 4, 1],
  "Alpine Europe": [0, 2, 6, 11, 16, 20, 23, 22, 17, 11, 5, 1],
  Baltics: [-1, 0, 4, 9, 15, 19, 22, 21, 16, 10, 4, 1],
  "Eastern Europe": [1, 3, 8, 14, 19, 23, 26, 25, 19, 12, 6, 2],
  "Eastern Mediterranean": [9, 10, 13, 18, 23, 28, 31, 31, 27, 21, 15, 10],
  "North Africa": [14, 16, 19, 23, 27, 31, 35, 35, 30, 25, 19, 15],
  "Middle East": [18, 20, 24, 29, 34, 38, 41, 41, 37, 32, 25, 20],
  "Southeast Asia": [29, 30, 31, 32, 31, 30, 29, 29, 29, 29, 29, 28],
  "East Asia": [4, 6, 11, 17, 22, 25, 29, 30, 25, 19, 12, 6],
  "South Asia": [21, 24, 29, 33, 35, 33, 30, 29, 29, 28, 25, 22],
  "Indian Ocean": [26, 27, 28, 28, 27, 26, 25, 25, 25, 26, 27, 27],
  "North America": [2, 4, 8, 14, 19, 24, 27, 27, 22, 16, 10, 4],
  Caribbean: [27, 27, 28, 29, 30, 31, 31, 31, 31, 30, 29, 28],
  "South America": [21, 21, 20, 18, 16, 14, 14, 15, 16, 18, 19, 21],
  "Southern Africa": [26, 26, 24, 21, 18, 16, 16, 17, 18, 20, 22, 24],
  "East Africa": [28, 28, 27, 26, 25, 24, 24, 25, 26, 27, 27, 28],
  Oceania: [24, 24, 23, 20, 17, 14, 13, 14, 16, 18, 20, 22],
  Global: [12, 13, 16, 19, 22, 25, 27, 27, 24, 20, 16, 13],
};

const beachForwardCities = new Set(
  [
    "Malaga",
    "Barcelona",
    "Valencia",
    "Alicante",
    "Palma",
    "Las Palmas",
    "Ibiza Town",
    "Santa Cruz de Tenerife",
    "Arrecife",
    "Lisbon",
    "Funchal",
    "Faro",
    "Venice",
    "Palermo",
    "Catania",
    "Cagliari",
    "Olbia",
    "Nice",
    "Marseille",
    "Cannes",
    "Athens",
    "Heraklion",
    "Chania",
    "Corfu",
    "Rhodes",
    "Fira",
    "Mykonos Town",
    "Zakynthos",
    "Kos",
    "Larnaca",
    "Paphos",
    "Limassol",
    "Valletta",
    "Sliema",
    "St Julian's",
    "Antalya",
    "Izmir",
    "Bodrum",
    "Dalaman",
    "Agadir",
    "Tangier",
    "Hurghada",
    "Sharm El Sheikh",
    "Hammamet",
    "Sousse",
    "Djerba",
    "Sarande",
    "Vlore",
    "Split",
    "Dubrovnik",
    "Zadar",
    "Piran",
    "Dubai",
    "Abu Dhabi",
    "Doha",
    "Muscat",
    "Tel Aviv",
    "Bangkok",
    "Phuket",
    "Krabi",
    "Koh Samui",
    "Penang",
    "Denpasar",
    "Da Nang",
    "Hong Kong",
    "Colombo",
    "Male",
    "Goa",
    "Cancun",
    "Playa del Carmen",
    "Punta Cana",
    "San Juan",
    "Rio de Janeiro",
    "Cape Town",
    "Stone Town",
    "Port Louis",
    "Sydney",
    "Auckland",
  ].map(normalizeLookup),
);

const cityBreakLeaders = new Set(
  [
    "Barcelona",
    "Madrid",
    "Lisbon",
    "Rome",
    "Milan",
    "Venice",
    "Florence",
    "Paris",
    "Lyon",
    "Athens",
    "Valletta",
    "Istanbul",
    "Marrakesh",
    "Cairo",
    "Vienna",
    "Berlin",
    "Munich",
    "Amsterdam",
    "Brussels",
    "Dublin",
    "London",
    "Budapest",
    "Prague",
    "Warsaw",
    "Krakow",
    "Copenhagen",
    "Stockholm",
    "Oslo",
    "Helsinki",
    "Reykjavik",
    "Zurich",
    "Geneva",
    "Dubai",
    "Tel Aviv",
    "Bangkok",
    "Singapore",
    "Kuala Lumpur",
    "Tokyo",
    "Osaka",
    "Seoul",
    "Hong Kong",
    "Taipei",
    "New York",
    "Los Angeles",
    "San Francisco",
    "Miami",
    "Chicago",
    "Boston",
    "Washington",
    "Toronto",
    "Vancouver",
    "Montreal",
    "Mexico City",
    "Buenos Aires",
    "Lima",
    "Sydney",
    "Melbourne",
  ].map(normalizeLookup),
);

const natureForwardCities = new Set(
  [
    "Funchal",
    "Ponta Delgada",
    "Granada",
    "San Sebastian",
    "Heraklion",
    "Corfu",
    "Zakynthos",
    "Tirana",
    "Bled",
    "Salzburg",
    "Innsbruck",
    "Lucerne",
    "Reykjavik",
    "Bergen",
    "Queenstown",
    "Cape Town",
    "Stone Town",
    "Phuket",
    "Krabi",
    "Koh Samui",
    "Denpasar",
    "Chiang Mai",
    "Kyoto",
  ].map(normalizeLookup),
);

const nightlifeForwardCities = new Set(
  [
    "Barcelona",
    "Ibiza Town",
    "Rome",
    "Athens",
    "St Julian's",
    "Istanbul",
    "Marrakesh",
    "Berlin",
    "Amsterdam",
    "Dublin",
    "London",
    "Budapest",
    "Prague",
    "Dubai",
    "Bangkok",
    "Singapore",
    "Seoul",
    "Tokyo",
    "New York",
    "Miami",
    "Las Vegas",
    "Rio de Janeiro",
    "Sydney",
  ].map(normalizeLookup),
);

const highCostCountries = new Set(
  [
    "United Kingdom",
    "Switzerland",
    "Iceland",
    "United Arab Emirates",
    "Qatar",
    "Singapore",
    "Japan",
    "Australia",
    "New Zealand",
    "United States of America",
    "Canada",
  ].map(normalizeLookup),
);

const valueCountries = new Set(
  [
    "Albania",
    "Turkey",
    "Morocco",
    "Egypt",
    "Tunisia",
    "Hungary",
    "Czechia",
    "Poland",
    "Romania",
    "Bulgaria",
    "Thailand",
    "Vietnam",
    "Malaysia",
    "India",
    "Colombia",
    "Peru",
  ].map(normalizeLookup),
);

const countryAccessHours: Record<string, number> = {
  "Southern Europe": 3.1,
  Balkans: 2.2,
  "Central Europe": 1.7,
  "Western Europe": 2.2,
  Nordics: 2.7,
  "Alpine Europe": 2.0,
  Baltics: 1.5,
  "Eastern Europe": 1.9,
  "Eastern Mediterranean": 3.1,
  "North Africa": 4.3,
  "Middle East": 5.0,
  "Southeast Asia": 11.0,
  "East Asia": 11.5,
  "South Asia": 8.8,
  "Indian Ocean": 10.2,
  "North America": 10.0,
  Caribbean: 11.0,
  "South America": 14.0,
  "Southern Africa": 12.0,
  "East Africa": 9.0,
  Oceania: 20.0,
  Global: 4.0,
};

const visaRequiredCountries = new Set(["Saudi Arabia", "China", "India"].map(normalizeLookup));

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalized(value: string) {
  return normalizeLookup(value);
}

function deriveCostIndex(country: string, region: string): number {
  const normalizedCountry = normalized(country);
  if (highCostCountries.has(normalizedCountry)) return 1.55;
  if (valueCountries.has(normalizedCountry)) return 0.88;
  if (region === "Southern Europe" || region === "Balkans") return 1.05;
  if (region === "Western Europe" || region === "Alpine Europe") return 1.35;
  if (region === "North America") return 1.48;
  if (region === "Southeast Asia") return 0.92;
  return 1.12;
}

function deriveAccessScore(region: string, city: string): number {
  const cityKey = normalized(city);
  if (cityBreakLeaders.has(cityKey) && countryAccessHours[region] <= 3.2) return 0.88;
  if (region === "Central Europe" || region === "Baltics") return 0.9;
  if (region === "Southern Europe" || region === "Western Europe" || region === "Balkans") return 0.8;
  if (region === "Eastern Mediterranean" || region === "North Africa") return 0.7;
  if (region === "Southeast Asia" || region === "East Asia" || region === "North America") return 0.56;
  return 0.62;
}

function deriveScores(entry: { city: string; country: string; region: string }) {
  const cityKey = normalized(entry.city);
  const coastal = beachForwardCities.has(cityKey);
  const cityLeader = cityBreakLeaders.has(cityKey);
  const natureLeader = natureForwardCities.has(cityKey);
  const nightlifeLeader = nightlifeForwardCities.has(cityKey);
  const warmRegion = ["Southern Europe", "Eastern Mediterranean", "North Africa", "Middle East", "Southeast Asia", "Indian Ocean", "Caribbean"].includes(entry.region);

  return {
    beachScore: round(clamp(coastal ? 0.88 : warmRegion ? 0.42 : 0.16)),
    cityScore: round(clamp(cityLeader ? 0.92 : coastal ? 0.66 : 0.74)),
    sightseeingScore: round(clamp(cityLeader ? 0.88 : natureLeader ? 0.7 : 0.76)),
    nightlifeScore: round(clamp(nightlifeLeader ? 0.84 : cityLeader ? 0.68 : 0.5)),
    natureScore: round(clamp(natureLeader ? 0.86 : coastal ? 0.58 : 0.44)),
  };
}

function deriveSafetyScore(country: string, region: string) {
  const normalizedCountry = normalized(country);
  if (["Iceland", "Switzerland", "Japan", "Singapore", "Denmark", "Norway", "Finland"].map(normalized).includes(normalizedCountry)) {
    return 0.9;
  }
  if (["Turkey", "Morocco", "Egypt", "Tunisia", "Colombia", "South Africa"].map(normalized).includes(normalizedCountry)) {
    return 0.68;
  }
  if (region === "Western Europe" || region === "Central Europe" || region === "Alpine Europe" || region === "Nordics") {
    return 0.84;
  }
  return 0.76;
}

const curatedBySlug = new Map(curatedDestinations.map((destination) => [destination.slug, destination]));
const curatedByCityCountry = new Map(
  curatedDestinations.map((destination) => [`${normalized(destination.city)}|${normalized(destination.country)}`, destination]),
);

function buildGeneratedDestinationProfile(entry: (typeof destinationCatalog)[number]): DestinationProfile {
  const scores = deriveScores(entry);
  const temps = regionalTemperatureProfiles[entry.region] ?? regionalTemperatureProfiles.Global;
  const flightHours = countryAccessHours[entry.region] ?? countryAccessHours.Global;

  return {
    id: `dest_${entry.slug.replace(/-/g, "_")}`,
    slug: entry.slug,
    city: entry.city,
    country: entry.country,
    region: entry.region,
    aliases: entry.aliases,
    airportCode: entry.airportCode,
    visaForPL: !visaRequiredCountries.has(normalized(entry.country)),
    avgTempByMonth: temps,
    costIndex: deriveCostIndex(entry.country, entry.region),
    beachScore: scores.beachScore,
    cityScore: scores.cityScore,
    sightseeingScore: scores.sightseeingScore,
    nightlifeScore: scores.nightlifeScore,
    natureScore: scores.natureScore,
    safetyScore: deriveSafetyScore(entry.country, entry.region),
    accessScore: deriveAccessScore(entry.region, entry.city),
    typicalFlightHoursFromPL: flightHours,
    affiliateLinks: links(entry.city, entry.country),
  };
}

export const allDestinationProfiles: DestinationProfile[] = destinationCatalog.map((entry) => {
  const curated = curatedBySlug.get(entry.slug) ?? curatedByCityCountry.get(`${normalized(entry.city)}|${normalized(entry.country)}`);
  return curated
    ? {
        ...curated,
        region: entry.region,
        aliases: entry.aliases,
        airportCode: curated.airportCode ?? entry.airportCode,
      }
    : buildGeneratedDestinationProfile(entry);
});

const allDestinationProfilesBySlug = new Map(allDestinationProfiles.map((destination) => [destination.slug, destination]));

export function getAllDestinationProfiles(): DestinationProfile[] {
  return allDestinationProfiles;
}

export function getDestinationProfileBySlug(slug: string): DestinationProfile | undefined {
  const direct = allDestinationProfilesBySlug.get(slug);
  if (direct) {
    return direct;
  }

  const catalogEntry = getDestinationCatalogEntryBySlug(slug);
  if (!catalogEntry) {
    return undefined;
  }

  return curatedByCityCountry.get(`${normalized(catalogEntry.city)}|${normalized(catalogEntry.country)}`);
}

export function findDestinationProfile(input: { city: string; country?: string; slug?: string }): DestinationProfile | undefined {
  if (input.slug) {
    const direct = getDestinationProfileBySlug(input.slug);
    if (direct) {
      return direct;
    }
  }

  const normalizedCity = normalized(input.city);
  const normalizedCountry = normalized(input.country ?? "");

  return allDestinationProfiles.find((destination) => {
    const cityMatches =
      normalized(destination.city) === normalizedCity ||
      normalizedCity.includes(normalized(destination.city)) ||
      destination.aliases?.some((alias) => normalized(alias) === normalizedCity || normalized(alias).includes(normalizedCity));

    if (!cityMatches) {
      return false;
    }

    if (!normalizedCountry) {
      return true;
    }

    return normalized(destination.country) === normalizedCountry;
  });
}
