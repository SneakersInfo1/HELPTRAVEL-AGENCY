// Sesja C2 phase 2 — Travelpayouts city/airport directory as the
// authoritative IATA resolver.
//
// The Sesja C2 harvest revealed that our hand-maintained
// `airportCodesByKey` map (~280 cities) was the limiting factor for
// destination scale: 415 LiteAPI cities with ≥15 hotels got dropped
// because their IATA wasn't in our map. Travelpayouts publishes
// comprehensive open datasets at:
//
//   https://api.travelpayouts.com/data/en/cities.json    (~9641 cities)
//   https://api.travelpayouts.com/data/en/airports.json  (~10354 airports)
//
// Each city row carries: code (IATA city code), country_code, coordinates,
// name, name_translations, has_flightable_airport. Each airport row carries:
// code (IATA airport code), city_code (parent IATA city), country_code,
// coordinates, flightable. Aviasales/Travelpayouts accepts the CITY code
// in /prices_for_dates and fans out across all airports in the group, so
// we always prefer city.code over airport.code.
//
// Both files are downloaded once via `scripts/download-tp-airports.ts` and
// cached under `data/.cache/`. The harvest reads them at boot. Runtime
// code can use these helpers too — they're synchronous after first read.

import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeLookup } from "./location";

interface TpCity {
  code: string;
  country_code: string;
  coordinates: { lat: number; lon: number } | null;
  name: string;
  name_translations?: Record<string, string>;
  has_flightable_airport: boolean;
}

interface TpAirport {
  code: string;
  city_code: string;
  country_code: string;
  coordinates: { lat: number; lon: number } | null;
  flightable: boolean;
}

const CACHE_ROOT = path.resolve(__dirname, "..", "..", "..", "data", ".cache");
const CITIES_PATH = path.join(CACHE_ROOT, "tp-cities.json");
const AIRPORTS_PATH = path.join(CACHE_ROOT, "tp-airports.json");

let cachedCities: TpCity[] | null = null;
let cachedAirports: TpAirport[] | null = null;
let cityIndex: Map<string, TpCity> | null = null;
let cityIndexByNameOnly: Map<string, TpCity[]> | null = null;

async function loadCities(): Promise<TpCity[]> {
  if (cachedCities) return cachedCities;
  try {
    const raw = await fs.readFile(CITIES_PATH, "utf8");
    cachedCities = JSON.parse(raw) as TpCity[];
    return cachedCities;
  } catch {
    cachedCities = [];
    return cachedCities;
  }
}

async function loadAirports(): Promise<TpAirport[]> {
  if (cachedAirports) return cachedAirports;
  try {
    const raw = await fs.readFile(AIRPORTS_PATH, "utf8");
    cachedAirports = JSON.parse(raw) as TpAirport[];
    return cachedAirports;
  } catch {
    cachedAirports = [];
    return cachedAirports;
  }
}

async function buildCityIndex(): Promise<{
  byNameCountry: Map<string, TpCity>;
  byNameOnly: Map<string, TpCity[]>;
}> {
  if (cityIndex && cityIndexByNameOnly) {
    return { byNameCountry: cityIndex, byNameOnly: cityIndexByNameOnly };
  }
  const byNameCountry = new Map<string, TpCity>();
  const byNameOnly = new Map<string, TpCity[]>();
  for (const city of await loadCities()) {
    if (!city.has_flightable_airport) continue;
    const namesToIndex = new Set<string>();
    namesToIndex.add(city.name);
    if (city.name_translations) {
      for (const translated of Object.values(city.name_translations)) {
        if (translated) namesToIndex.add(translated);
      }
    }
    for (const name of namesToIndex) {
      const normalized = normalizeLookup(name);
      if (!normalized) continue;
      const k = `${normalized}|${city.country_code}`;
      if (!byNameCountry.has(k)) byNameCountry.set(k, city);
      const arr = byNameOnly.get(normalized) ?? [];
      if (!arr.includes(city)) arr.push(city);
      byNameOnly.set(normalized, arr);
    }
  }
  cityIndex = byNameCountry;
  cityIndexByNameOnly = byNameOnly;
  return { byNameCountry, byNameOnly };
}

export interface AirportResolution {
  iata: string;
  lat: number;
  lng: number;
  source: "tp-city-exact" | "tp-city-name-only" | "tp-geo-nearest";
  distanceKm?: number; // for geo-fallback
}

/**
 * Resolve a city name + country code to an IATA city code (preferred —
 * covers metro/multi-airport clusters) via Travelpayouts directory.
 * Returns null if no match.
 */
export async function resolveAirportFromTPDirectory(
  cityName: string,
  countryCode: string,
): Promise<AirportResolution | null> {
  const { byNameCountry, byNameOnly } = await buildCityIndex();
  const normalized = normalizeLookup(cityName);
  if (!normalized) return null;

  // Exact match: name + country.
  const exact = byNameCountry.get(`${normalized}|${countryCode}`);
  if (exact && exact.coordinates) {
    return {
      iata: exact.code,
      lat: exact.coordinates.lat,
      lng: exact.coordinates.lon,
      source: "tp-city-exact",
    };
  }

  // Name-only fallback — ONLY safe when the candidate's country matches
  // the input country. We previously had a "single global match" escape
  // hatch that produced cross-country false-positives: Halifax UK got
  // assigned YHZ (Halifax, Canada) because TP only knows the Canadian
  // Halifax; Bergen NL/Germany got assigned BGO (Bergen, Norway). Drop
  // that escape hatch — better to return null than wrong-country IATA.
  const candidates = byNameOnly.get(normalized);
  if (candidates && candidates.length > 0) {
    const inCountry = candidates.find((c) => c.country_code === countryCode);
    if (inCountry?.coordinates) {
      return {
        iata: inCountry.code,
        lat: inCountry.coordinates.lat,
        lng: inCountry.coordinates.lon,
        source: "tp-city-name-only",
      };
    }
  }

  return null;
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(x)));
}

/**
 * Geo-distance fallback: find the nearest flightable airport within
 * `maxKm` of (lat, lng), constrained to the same country. Returns the
 * airport's city_code (metro/cluster code) so flight searches cover all
 * airports in the group.
 */
export async function nearestFlightableAirport(
  lat: number,
  lng: number,
  countryCode: string,
  maxKm = 100,
): Promise<AirportResolution | null> {
  const airports = await loadAirports();
  let best: { airport: TpAirport; distanceKm: number } | null = null;
  for (const airport of airports) {
    if (!airport.flightable) continue;
    if (airport.country_code !== countryCode) continue;
    if (!airport.coordinates) continue;
    const dist = haversineKm(
      { lat, lng },
      { lat: airport.coordinates.lat, lng: airport.coordinates.lon },
    );
    if (dist > maxKm) continue;
    if (!best || dist < best.distanceKm) {
      best = { airport, distanceKm: dist };
    }
  }
  if (!best || !best.airport.coordinates) return null;
  return {
    iata: best.airport.city_code, // city/metro IATA → covers all airports in cluster
    lat: best.airport.coordinates.lat,
    lng: best.airport.coordinates.lon,
    source: "tp-geo-nearest",
    distanceKm: Math.round(best.distanceKm),
  };
}
