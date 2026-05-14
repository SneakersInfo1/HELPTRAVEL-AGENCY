// scripts/build-destinations-seed.ts
//
// Sesja C2 — destinations dataset builder.
//
// Goal: produce data/destinations.json containing a verified list of
// destinations where every entry has:
//   (a) ≥ 15 hotels available in LiteAPI for a canonical query window
//   (b) at least one airport within 100 km serviced by Travelpayouts
//       from at least one major PL hub (WAW/KRK/GDN/WRO/KTW/POZ).
//
// The script is idempotent: results are cached under data/.cache so
// rebuilds skip the slow API calls. Two modes:
//   --pilot (default): walks the curated `destinationCatalog` (~200
//     cities) plus a small top-up of high-popularity LiteAPI cities.
//     Runs in ~5–15 min depending on cache state.
//   --full: walks every LiteAPI country via /data/countries and
//     /data/cities. Takes 45–90 min on cold cache. Run nightly /
//     manually.
//
// Run:
//   pnpm tsx --env-file=.env.local scripts/build-destinations-seed.ts
//   pnpm tsx --env-file=.env.local scripts/build-destinations-seed.ts --full
//   pnpm tsx --env-file=.env.local scripts/build-destinations-seed.ts --max=300
//   pnpm tsx --env-file=.env.local scripts/build-destinations-seed.ts --no-network  (cache only)

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { liteApiRequest, LiteApiError } from "../src/lib/liteapi";
import { LiteApiHotelsListResponseSchema } from "../src/lib/liteapi/types";
import { destinationCatalog } from "../src/lib/mvp/destination-catalog";
import { curatedDestinations } from "../src/lib/mvp/destinations";
import { CITY_PL, COUNTRY_PL, REGION_PL } from "../src/lib/mvp/i18n-geo";
import { resolveAirportCode } from "../src/lib/mvp/location";

// ────────────────────────────────────────────────────────────────────────────
// Config

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_DIR, ".cache");
const OUT_FULL = path.join(DATA_DIR, "destinations.json");
const OUT_INDEX = path.join(DATA_DIR, "destinations.index.json");

const HOTEL_CACHE = path.join(CACHE_DIR, "hotel-coverage.json");
const WIKIDATA_CACHE = path.join(CACHE_DIR, "wikidata-pl.json");
const COUNTRY_CITIES_CACHE = path.join(CACHE_DIR, "liteapi-cities.json");
const COUNTRY_LIST_CACHE = path.join(CACHE_DIR, "liteapi-countries.json");

const MIN_HOTEL_COUNT = 15;
// MAX_KM_TO_AIRPORT is reserved for the --full flow; pilot uses curated
// catalog where every city already has a vetted IATA so the distance
// check is implicit.

const PL_HUBS: Array<{ iata: string; city: string; lat: number; lng: number }> = [
  { iata: "WAW", city: "Warszawa", lat: 52.1657, lng: 20.9671 },
  { iata: "KRK", city: "Kraków", lat: 50.0777, lng: 19.7848 },
  { iata: "GDN", city: "Gdańsk", lat: 54.3776, lng: 18.4662 },
  { iata: "WRO", city: "Wrocław", lat: 51.1027, lng: 16.8858 },
  { iata: "KTW", city: "Katowice", lat: 50.4742, lng: 19.0801 },
  { iata: "POZ", city: "Poznań", lat: 52.4211, lng: 16.8263 },
];

// LiteAPI throttle: sandbox limit is generous on read endpoints but we keep
// it conservative to avoid 429s during a long-running script.
const HOTEL_RPS = 3;
const COUNTRIES_RPS = 5;
const WIKIDATA_RPS = 3; // wikidata.org public API — be polite

// Curated top-tourism countries for --full mode. Walking every LiteAPI
// country gives us 10k+ obscure cities that mostly drop at the >=15-hotel
// filter and cost API calls; this allowlist keeps the run bounded
// (~60 countries × avg 25 cities = ~1500 hotel checks, ~8 min wall-time
// at 3 rps). Any country not in this list still gets covered by the
// curated catalog seed.
const TOP_TOURISM_COUNTRIES: ReadonlyArray<string> = [
  // Europe — south & islands (highest pl-outbound)
  "ES", "PT", "IT", "GR", "CY", "MT", "HR", "ME", "AL", "BA", "RS", "MK", "BG",
  // Europe — west / central / north
  "FR", "DE", "AT", "CH", "NL", "BE", "LU", "GB", "IE", "DK", "SE", "NO", "FI", "IS",
  // Europe — central / east
  "PL", "CZ", "SK", "HU", "SI", "RO", "MD",
  // Baltics
  "EE", "LV", "LT",
  // MENA + Middle East
  "TR", "MA", "TN", "EG", "DZ", "JO", "IL", "AE", "QA", "OM", "SA",
  // Asia
  "TH", "ID", "VN", "SG", "MY", "PH", "JP", "KR", "HK", "TW", "IN", "LK", "MV", "NP", "CN",
  // Americas
  "US", "CA", "MX", "CR", "DO", "CU", "JM", "BR", "AR", "CL", "PE", "CO",
  // Africa + Oceania
  "ZA", "KE", "TZ", "MU", "SC", "AU", "NZ", "FJ",
];

// ────────────────────────────────────────────────────────────────────────────
// CLI

interface CliOptions {
  full: boolean;
  max: number | null;
  noNetwork: boolean;
  prod: boolean;
  countries: string[] | null;
  perCountry: number;
}

function parseCli(argv: string[]): CliOptions {
  let full = false;
  let max: number | null = null;
  let noNetwork = false;
  let prod = false;
  let countries: string[] | null = null;
  // LiteAPI sandbox returns thousands of city rows per country (most are
  // tiny villages with no hotels). 30 keeps the harvest bounded — the
  // curated catalog already covers the top 5-15 cities per country, and
  // anything past slot 30 is almost certainly low-value.
  let perCountry = 30;
  for (const arg of argv.slice(2)) {
    if (arg === "--full") full = true;
    else if (arg === "--no-network") noNetwork = true;
    else if (arg === "--prod") prod = true;
    else if (arg.startsWith("--max=")) {
      const n = Number(arg.slice("--max=".length));
      if (Number.isFinite(n) && n > 0) max = n;
    } else if (arg.startsWith("--countries=")) {
      countries = arg
        .slice("--countries=".length)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg.startsWith("--per-country=")) {
      const n = Number(arg.slice("--per-country=".length));
      if (Number.isFinite(n) && n > 0) perCountry = Math.floor(n);
    }
  }
  return { full, max, noNetwork, prod, countries, perCountry };
}

// ────────────────────────────────────────────────────────────────────────────
// Utils

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in km (Haversine).
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lng - a.lng);
  const lat1 = deg2rad(a.lat);
  const lat2 = deg2rad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function readJsonCache<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

// Simple promise-pool throttler. Limits concurrency AND minimum interval per slot.
async function throttledMap<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  opts: { rps: number; concurrency?: number; onProgress?: (done: number, total: number) => void },
): Promise<R[]> {
  const { rps, concurrency = Math.max(1, Math.min(rps, 4)), onProgress } = opts;
  const minIntervalMs = Math.ceil(1000 / rps);
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let lastDispatch = 0;
  let done = 0;

  async function next(): Promise<void> {
    while (true) {
      const myIndex = cursor++;
      if (myIndex >= items.length) return;
      const now = Date.now();
      const wait = Math.max(0, lastDispatch + minIntervalMs - now);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastDispatch = Date.now();
      try {
        results[myIndex] = await worker(items[myIndex], myIndex);
      } catch (err) {
        results[myIndex] = err as R; // caller handles
      }
      done += 1;
      if (onProgress && done % 25 === 0) onProgress(done, items.length);
    }
  }

  const workers = Array.from({ length: concurrency }, () => next());
  await Promise.all(workers);
  if (onProgress) onProgress(items.length, items.length);
  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// LiteAPI: list countries + cities

const LiteApiCountrySchema = z.object({
  code: z.string(),
  name: z.string(),
});
const LiteApiCountriesResponseSchema = z.object({
  data: z.array(LiteApiCountrySchema),
});
type LiteApiCountry = z.infer<typeof LiteApiCountrySchema>;

async function fetchCountries(): Promise<LiteApiCountry[]> {
  const cached = await readJsonCache<LiteApiCountry[]>(COUNTRY_LIST_CACHE);
  if (cached && cached.length > 0) return cached;
  const res = await liteApiRequest({
    path: "/data/countries",
    method: "GET",
    keyMode: "public",
    schema: LiteApiCountriesResponseSchema,
  });
  await writeJson(COUNTRY_LIST_CACHE, res.data);
  return res.data;
}

const LiteApiCitySchema = z.object({
  city: z.string(),
  countryCode: z.string().optional(),
});
const LiteApiCitiesResponseSchema = z.object({
  data: z.array(LiteApiCitySchema),
});
type LiteApiCity = z.infer<typeof LiteApiCitySchema>;

async function fetchCitiesForCountry(countryCode: string): Promise<LiteApiCity[]> {
  const allCached = (await readJsonCache<Record<string, LiteApiCity[]>>(COUNTRY_CITIES_CACHE)) ?? {};
  if (allCached[countryCode]) return allCached[countryCode];
  const res = await liteApiRequest({
    path: "/data/cities",
    method: "GET",
    keyMode: "public",
    schema: LiteApiCitiesResponseSchema,
    query: { countryCode },
  });
  allCached[countryCode] = res.data;
  await writeJson(COUNTRY_CITIES_CACHE, allCached);
  return res.data;
}

// ────────────────────────────────────────────────────────────────────────────
// Hotel inventory check (with persistent cache keyed by city|country)

interface HotelCacheEntry {
  hotelCount: number;
  lat: number | null;
  lng: number | null;
  fetchedAt: string;
}
type HotelCache = Record<string, HotelCacheEntry>;

function hotelCacheKey(city: string, country: string): string {
  return `${city.toLowerCase()}|${country.toLowerCase()}`;
}

async function loadHotelCache(): Promise<HotelCache> {
  return (await readJsonCache<HotelCache>(HOTEL_CACHE)) ?? {};
}

async function saveHotelCache(cache: HotelCache): Promise<void> {
  await writeJson(HOTEL_CACHE, cache);
}

async function checkHotelInventory(
  city: string,
  country: string,
  cache: HotelCache,
  noNetwork: boolean,
): Promise<HotelCacheEntry | null> {
  const key = hotelCacheKey(city, country);
  if (cache[key]) return cache[key];
  if (noNetwork) return null;
  // LiteAPI /data/hotels requires countryCode (ISO-2). Resolve via the
  // existing search module so we don't drift from production lookup rules.
  const { resolveCountryCode } = await import("../src/lib/liteapi/search");
  const code = resolveCountryCode(country);
  if (!code) {
    // Country we don't know — mark as 0 hotels so we skip it cleanly.
    const entry: HotelCacheEntry = {
      hotelCount: 0,
      lat: null,
      lng: null,
      fetchedAt: new Date().toISOString(),
    };
    cache[key] = entry;
    return entry;
  }
  try {
    const res = await liteApiRequest({
      path: "/data/hotels",
      method: "GET",
      keyMode: "public",
      schema: LiteApiHotelsListResponseSchema,
      query: { countryCode: code, cityName: city, limit: 30 },
    });
    const list = res.data ?? [];
    const first = list[0];
    const entry: HotelCacheEntry = {
      hotelCount: list.length,
      lat: typeof first?.latitude === "number" ? first.latitude : null,
      lng: typeof first?.longitude === "number" ? first.longitude : null,
      fetchedAt: new Date().toISOString(),
    };
    cache[key] = entry;
    return entry;
  } catch (err) {
    // Sesja C2 follow-up — auth-class errors (401/403) MUST hard-fail the
    // whole run, not silently cache 0. Previous behaviour was: every prod
    // call returned 401 due to pending LiteAPI activation, all 541 cities
    // were recorded as 0 hotels, the seed was overwritten to empty, the
    // user lost 3 minutes + last-known-good data. Auth errors mean the
    // env is misconfigured (wrong key, wrong prefix, account not active);
    // continuing through 500 more requests cannot help.
    if (err instanceof LiteApiError && err.internalCode === "LITEAPI_AUTH") {
      console.error("");
      console.error("FATAL: LiteAPI returned 401/403 unauthorized.");
      console.error("  - Key in use likely points at an inactive or wrong-env account.");
      console.error("  - Check LITEAPI_ENV (current:", process.env.LITEAPI_ENV ?? "(unset)", ")");
      console.error("  - Probe with:  pnpm exec tsx --env-file=.env.local -e \"console.log(require('./src/lib/liteapi/client').getEnv())\"");
      console.error("  - If using --prod and 401 persists, your LITEAPI_PROD_PUBLIC_KEY is still pending account activation.");
      console.error("");
      throw err;
    }
    if (err instanceof LiteApiError) {
      // 404/400 = city not in LiteAPI index → record 0 so we skip on retry.
      const entry: HotelCacheEntry = {
        hotelCount: 0,
        lat: null,
        lng: null,
        fetchedAt: new Date().toISOString(),
      };
      cache[key] = entry;
      return entry;
    }
    // Network / 5xx — leave uncached so next run retries.
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Wikidata: Polish exonym lookup (with persistent cache)

type WikidataCache = Record<string, string>; // key: "City|EN", value: Polish name

async function loadWikidataCache(): Promise<WikidataCache> {
  return (await readJsonCache<WikidataCache>(WIKIDATA_CACHE)) ?? {};
}

async function saveWikidataCache(cache: WikidataCache): Promise<void> {
  await writeJson(WIKIDATA_CACHE, cache);
}

async function wikidataPolishLabel(
  english: string,
  cache: WikidataCache,
  noNetwork: boolean,
): Promise<string | null> {
  if (cache[english] !== undefined) return cache[english] || null;
  if (noNetwork) return null;
  try {
    // Step 1: search for the entity by English label.
    const searchUrl = new URL("https://www.wikidata.org/w/api.php");
    searchUrl.searchParams.set("action", "wbsearchentities");
    searchUrl.searchParams.set("search", english);
    searchUrl.searchParams.set("language", "en");
    searchUrl.searchParams.set("type", "item");
    searchUrl.searchParams.set("limit", "1");
    searchUrl.searchParams.set("format", "json");
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "helptravel-build/1.0 (kuba.ogra123@gmail.com)" },
    });
    if (!searchRes.ok) return null;
    const searchBody = (await searchRes.json()) as { search?: Array<{ id: string }> };
    const id = searchBody.search?.[0]?.id;
    if (!id) {
      cache[english] = "";
      return null;
    }
    // Step 2: fetch entity, ask for Polish label.
    const entityUrl = new URL("https://www.wikidata.org/w/api.php");
    entityUrl.searchParams.set("action", "wbgetentities");
    entityUrl.searchParams.set("ids", id);
    entityUrl.searchParams.set("languages", "pl|en");
    entityUrl.searchParams.set("props", "labels");
    entityUrl.searchParams.set("format", "json");
    const entityRes = await fetch(entityUrl, {
      headers: { "User-Agent": "helptravel-build/1.0 (kuba.ogra123@gmail.com)" },
    });
    if (!entityRes.ok) return null;
    const entityBody = (await entityRes.json()) as {
      entities?: Record<string, { labels?: { pl?: { value: string } } }>;
    };
    const pl = entityBody.entities?.[id]?.labels?.pl?.value;
    if (pl && pl.length > 0) {
      cache[english] = pl;
      return pl;
    }
    cache[english] = "";
    return null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Enrichment helpers

function climateBand(lat: number | null, month: number): "hot" | "mild" | "cold" {
  if (lat === null) return "mild";
  const abs = Math.abs(lat);
  // Tropical band — always hot.
  if (abs < 23.5) return "hot";
  // Northern hemisphere summer = May..Sept, mild bookends.
  const nhSummer = lat >= 0 && month >= 5 && month <= 9;
  const shSummer = lat < 0 && (month >= 11 || month <= 3);
  if (nhSummer || shSummer) {
    if (abs < 40) return "hot";
    if (abs < 55) return "mild";
    return "mild";
  }
  // Winter
  if (abs < 35) return "mild";
  if (abs < 50) return "cold";
  return "cold";
}

interface RegionInfo {
  en: string;
  pl: string;
}

const COUNTRY_TO_REGION: Record<string, RegionInfo> = {
  // Europe
  ES: { en: "Southern Europe", pl: REGION_PL["Southern Europe"] ?? "Europa Południowa" },
  PT: { en: "Southern Europe", pl: "Europa Południowa" },
  IT: { en: "Southern Europe", pl: "Europa Południowa" },
  GR: { en: "Southern Europe", pl: "Europa Południowa" },
  MT: { en: "Southern Europe", pl: "Europa Południowa" },
  CY: { en: "Eastern Mediterranean", pl: "Wschodnie Morze Śródziemne" },
  FR: { en: "Western Europe", pl: "Europa Zachodnia" },
  BE: { en: "Western Europe", pl: "Europa Zachodnia" },
  NL: { en: "Western Europe", pl: "Europa Zachodnia" },
  LU: { en: "Western Europe", pl: "Europa Zachodnia" },
  DE: { en: "Central Europe", pl: "Europa Środkowa" },
  AT: { en: "Central Europe", pl: "Europa Środkowa" },
  CH: { en: "Central Europe", pl: "Europa Środkowa" },
  CZ: { en: "Central Europe", pl: "Europa Środkowa" },
  SK: { en: "Central Europe", pl: "Europa Środkowa" },
  HU: { en: "Central Europe", pl: "Europa Środkowa" },
  PL: { en: "Central Europe", pl: "Europa Środkowa" },
  SI: { en: "Central Europe", pl: "Europa Środkowa" },
  HR: { en: "Balkans", pl: "Bałkany" },
  BA: { en: "Balkans", pl: "Bałkany" },
  ME: { en: "Balkans", pl: "Bałkany" },
  RS: { en: "Balkans", pl: "Bałkany" },
  MK: { en: "Balkans", pl: "Bałkany" },
  AL: { en: "Balkans", pl: "Bałkany" },
  BG: { en: "Balkans", pl: "Bałkany" },
  RO: { en: "Eastern Europe", pl: "Europa Wschodnia" },
  MD: { en: "Eastern Europe", pl: "Europa Wschodnia" },
  UA: { en: "Eastern Europe", pl: "Europa Wschodnia" },
  GB: { en: "British Isles", pl: "Wyspy Brytyjskie" },
  IE: { en: "British Isles", pl: "Wyspy Brytyjskie" },
  DK: { en: "Nordics", pl: "Skandynawia" },
  SE: { en: "Nordics", pl: "Skandynawia" },
  NO: { en: "Nordics", pl: "Skandynawia" },
  FI: { en: "Nordics", pl: "Skandynawia" },
  IS: { en: "Nordics", pl: "Skandynawia" },
  EE: { en: "Baltics", pl: "Kraje bałtyckie" },
  LV: { en: "Baltics", pl: "Kraje bałtyckie" },
  LT: { en: "Baltics", pl: "Kraje bałtyckie" },
  TR: { en: "Eastern Mediterranean", pl: "Wschodnie Morze Śródziemne" },
  // MENA
  MA: { en: "North Africa", pl: "Afryka Północna" },
  TN: { en: "North Africa", pl: "Afryka Północna" },
  DZ: { en: "North Africa", pl: "Afryka Północna" },
  EG: { en: "North Africa", pl: "Afryka Północna" },
  LY: { en: "North Africa", pl: "Afryka Północna" },
  IL: { en: "Middle East", pl: "Bliski Wschód" },
  JO: { en: "Middle East", pl: "Bliski Wschód" },
  LB: { en: "Middle East", pl: "Bliski Wschód" },
  AE: { en: "Middle East", pl: "Bliski Wschód" },
  QA: { en: "Middle East", pl: "Bliski Wschód" },
  OM: { en: "Middle East", pl: "Bliski Wschód" },
  SA: { en: "Middle East", pl: "Bliski Wschód" },
  BH: { en: "Middle East", pl: "Bliski Wschód" },
  KW: { en: "Middle East", pl: "Bliski Wschód" },
  // Asia
  TH: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  VN: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  ID: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  MY: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  SG: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  PH: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  KH: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  LA: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  MM: { en: "Southeast Asia", pl: "Azja Południowo-Wschodnia" },
  IN: { en: "South Asia", pl: "Azja Południowa" },
  LK: { en: "South Asia", pl: "Azja Południowa" },
  MV: { en: "Indian Ocean", pl: "Ocean Indyjski" },
  NP: { en: "South Asia", pl: "Azja Południowa" },
  CN: { en: "East Asia", pl: "Azja Wschodnia" },
  JP: { en: "East Asia", pl: "Azja Wschodnia" },
  KR: { en: "East Asia", pl: "Azja Wschodnia" },
  TW: { en: "East Asia", pl: "Azja Wschodnia" },
  HK: { en: "East Asia", pl: "Azja Wschodnia" },
  // Americas
  US: { en: "North America", pl: "Ameryka Północna" },
  CA: { en: "North America", pl: "Ameryka Północna" },
  MX: { en: "North America", pl: "Ameryka Północna" },
  CR: { en: "Central America", pl: "Ameryka Środkowa" },
  CU: { en: "Caribbean", pl: "Karaiby" },
  DO: { en: "Caribbean", pl: "Karaiby" },
  JM: { en: "Caribbean", pl: "Karaiby" },
  PR: { en: "Caribbean", pl: "Karaiby" },
  BR: { en: "South America", pl: "Ameryka Południowa" },
  AR: { en: "South America", pl: "Ameryka Południowa" },
  CL: { en: "South America", pl: "Ameryka Południowa" },
  PE: { en: "South America", pl: "Ameryka Południowa" },
  CO: { en: "South America", pl: "Ameryka Południowa" },
  EC: { en: "South America", pl: "Ameryka Południowa" },
  // Africa + Oceania
  ZA: { en: "Southern Africa", pl: "Afryka Południowa" },
  KE: { en: "East Africa", pl: "Afryka Wschodnia" },
  TZ: { en: "East Africa", pl: "Afryka Wschodnia" },
  MU: { en: "Indian Ocean", pl: "Ocean Indyjski" },
  SC: { en: "Indian Ocean", pl: "Ocean Indyjski" },
  CV: { en: "Atlantic Islands", pl: "Wyspy Atlantyckie" },
  AU: { en: "Oceania", pl: "Oceania" },
  NZ: { en: "Oceania", pl: "Oceania" },
  FJ: { en: "Oceania", pl: "Oceania" },
};

function regionFor(countryCode: string): RegionInfo {
  return COUNTRY_TO_REGION[countryCode] ?? { en: "Global", pl: "Globalnie" };
}

const VIBE_TAG_PL: Record<string, string> = {
  "city break": "city break",
  beach: "plaża",
  mountains: "góry",
  culture: "kultura",
  budget: "tani wyjazd",
  premium: "premium",
  romantic: "romantyczny",
  family: "rodzinny",
  party: "imprezowy",
  foodie: "kuchnia",
  nature: "natura",
  nightlife: "życie nocne",
  sightseeing: "zwiedzanie",
};

interface CuratedScores {
  beachScore: number;
  cityScore: number;
  sightseeingScore: number;
  nightlifeScore: number;
  natureScore: number;
  costIndex: number;
}

function deriveVibeTagsEn(scores?: CuratedScores, regionEn?: string): string[] {
  const out: string[] = [];
  if (scores) {
    if (scores.cityScore >= 0.7) out.push("city break");
    if (scores.beachScore >= 0.7) out.push("beach");
    if (scores.sightseeingScore >= 0.75) out.push("culture", "sightseeing");
    if (scores.nightlifeScore >= 0.75) out.push("nightlife");
    if (scores.natureScore >= 0.7) out.push("nature");
    if (scores.costIndex >= 1.3) out.push("premium");
    else if (scores.costIndex <= 1.0) out.push("budget");
  } else if (regionEn) {
    // Heuristic per region for cities we have no curated scores for.
    if (regionEn === "Southern Europe" || regionEn === "Eastern Mediterranean") {
      out.push("city break", "culture", "beach");
    } else if (regionEn === "Nordics" || regionEn === "Baltics") {
      out.push("city break", "nature");
    } else if (regionEn === "Balkans") {
      out.push("beach", "nature", "budget");
    } else if (regionEn === "Southeast Asia" || regionEn === "Indian Ocean") {
      out.push("beach", "foodie");
    } else if (regionEn === "North America" || regionEn === "East Asia") {
      out.push("city break", "culture");
    } else {
      out.push("city break");
    }
  }
  return [...new Set(out)];
}

function flightMinutesFromHub(hub: { lat: number; lng: number }, city: { lat: number; lng: number }): number {
  const km = distanceKm(hub, city);
  // 800 km/h cruise, +25% for taxi/climb/descent, +15 min overhead.
  return Math.round((km * 1.25) / 800 * 60 + 15);
}

function nearestPLHubs(
  city: { lat: number; lng: number },
): Array<{ iata: string; km: number; minutes: number }> {
  return PL_HUBS.map((hub) => ({
    iata: hub.iata,
    km: Math.round(distanceKm(hub, city)),
    minutes: flightMinutesFromHub(hub, city),
  }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);
}

// ────────────────────────────────────────────────────────────────────────────
// Source: pilot (catalog) + optional full (LiteAPI listings)

interface SourceCity {
  city: string;
  country: string; // English long form (e.g. "Spain")
  countryCode?: string; // optional ISO-2
  lat: number | null;
  lng: number | null;
  airportCode: string | null;
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  Spain: "ES", Portugal: "PT", Italy: "IT", France: "FR", Greece: "GR",
  Cyprus: "CY", Malta: "MT", Albania: "AL", Croatia: "HR", Montenegro: "ME",
  Slovenia: "SI", Austria: "AT", Germany: "DE", Netherlands: "NL", Belgium: "BE",
  Ireland: "IE", "United Kingdom": "GB", Hungary: "HU", Czechia: "CZ",
  Poland: "PL", Denmark: "DK", Sweden: "SE", Norway: "NO", Finland: "FI",
  Iceland: "IS", Switzerland: "CH", Serbia: "RS", "Bosnia and Herzegovina": "BA",
  "North Macedonia": "MK", Bulgaria: "BG", Romania: "RO", Latvia: "LV",
  Lithuania: "LT", Estonia: "EE", Turkey: "TR", Morocco: "MA", Egypt: "EG",
  Tunisia: "TN", "United Arab Emirates": "AE", Qatar: "QA", Oman: "OM",
  Israel: "IL", Jordan: "JO", "Saudi Arabia": "SA", Thailand: "TH",
  Singapore: "SG", Malaysia: "MY", Indonesia: "ID", Vietnam: "VN",
  Japan: "JP", "South Korea": "KR", "Hong Kong": "HK", Taiwan: "TW",
  "Sri Lanka": "LK", Maldives: "MV", India: "IN", China: "CN",
  "United States of America": "US", Canada: "CA", Mexico: "MX",
  "Dominican Republic": "DO", "Puerto Rico": "PR", Brazil: "BR",
  Argentina: "AR", Peru: "PE", Chile: "CL", Colombia: "CO",
  "South Africa": "ZA", Tanzania: "TZ", Kenya: "KE", Mauritius: "MU",
  Australia: "AU", "New Zealand": "NZ",
};

// Hard-coded reference coords for top destinations to seed hotel-coverage
// distance checks before we even hit LiteAPI. Pulled from a public geo dataset
// (rounded to 4 dp). Cities not in this map will get lat/lng from the LiteAPI
// hotels-list response (`first.latitude`/`first.longitude`).
const CITY_COORDS_SEED: Record<string, { lat: number; lng: number }> = {
  "Lisbon|Portugal": { lat: 38.7223, lng: -9.1393 },
  "Porto|Portugal": { lat: 41.1579, lng: -8.6291 },
  "Faro|Portugal": { lat: 37.0194, lng: -7.9304 },
  "Funchal|Portugal": { lat: 32.6669, lng: -16.9241 },
  "Madrid|Spain": { lat: 40.4168, lng: -3.7038 },
  "Barcelona|Spain": { lat: 41.3851, lng: 2.1734 },
  "Valencia|Spain": { lat: 39.4699, lng: -0.3763 },
  "Seville|Spain": { lat: 37.3891, lng: -5.9845 },
  "Malaga|Spain": { lat: 36.7213, lng: -4.4214 },
  "Alicante|Spain": { lat: 38.3452, lng: -0.481 },
  "Palma|Spain": { lat: 39.5696, lng: 2.6502 },
  "Las Palmas|Spain": { lat: 28.1235, lng: -15.4363 },
  "Ibiza Town|Spain": { lat: 38.9067, lng: 1.4206 },
  "Bilbao|Spain": { lat: 43.263, lng: -2.935 },
  "Granada|Spain": { lat: 37.1773, lng: -3.5986 },
  "San Sebastian|Spain": { lat: 43.3183, lng: -1.9812 },
  "Cordoba|Spain": { lat: 37.8882, lng: -4.7794 },
  "Santa Cruz de Tenerife|Spain": { lat: 28.4636, lng: -16.2518 },
  "Arrecife|Spain": { lat: 28.9637, lng: -13.5477 },
  "Rome|Italy": { lat: 41.9028, lng: 12.4964 },
  "Naples|Italy": { lat: 40.8518, lng: 14.2681 },
  "Milan|Italy": { lat: 45.4642, lng: 9.19 },
  "Venice|Italy": { lat: 45.4408, lng: 12.3155 },
  "Florence|Italy": { lat: 43.7696, lng: 11.2558 },
  "Bologna|Italy": { lat: 44.4949, lng: 11.3426 },
  "Turin|Italy": { lat: 45.0703, lng: 7.6869 },
  "Palermo|Italy": { lat: 38.1157, lng: 13.3615 },
  "Catania|Italy": { lat: 37.5079, lng: 15.083 },
  "Bari|Italy": { lat: 41.1171, lng: 16.8719 },
  "Verona|Italy": { lat: 45.4384, lng: 10.9916 },
  "Pisa|Italy": { lat: 43.7228, lng: 10.4017 },
  "Genoa|Italy": { lat: 44.4056, lng: 8.9463 },
  "Cagliari|Italy": { lat: 39.2238, lng: 9.1217 },
  "Olbia|Italy": { lat: 40.9233, lng: 9.4985 },
  "Paris|France": { lat: 48.8566, lng: 2.3522 },
  "Nice|France": { lat: 43.7102, lng: 7.262 },
  "Marseille|France": { lat: 43.2965, lng: 5.3698 },
  "Lyon|France": { lat: 45.764, lng: 4.8357 },
  "Bordeaux|France": { lat: 44.8378, lng: -0.5792 },
  "Toulouse|France": { lat: 43.6047, lng: 1.4442 },
  "Strasbourg|France": { lat: 48.5734, lng: 7.7521 },
  "Nantes|France": { lat: 47.2184, lng: -1.5536 },
  "Lille|France": { lat: 50.6292, lng: 3.0573 },
  "Cannes|France": { lat: 43.5528, lng: 7.0174 },
  "Montpellier|France": { lat: 43.6108, lng: 3.8767 },
  "Athens|Greece": { lat: 37.9838, lng: 23.7275 },
  "Thessaloniki|Greece": { lat: 40.6401, lng: 22.9444 },
  "Heraklion|Greece": { lat: 35.3387, lng: 25.1442 },
  "Chania|Greece": { lat: 35.5138, lng: 24.018 },
  "Corfu|Greece": { lat: 39.6243, lng: 19.9217 },
  "Rhodes|Greece": { lat: 36.4341, lng: 28.2176 },
  "Fira|Greece": { lat: 36.4156, lng: 25.4322 },
  "Mykonos Town|Greece": { lat: 37.4467, lng: 25.3289 },
  "Zakynthos|Greece": { lat: 37.7872, lng: 20.8987 },
  "Kos|Greece": { lat: 36.8918, lng: 27.2879 },
  "Larnaca|Cyprus": { lat: 34.9229, lng: 33.6233 },
  "Paphos|Cyprus": { lat: 34.776, lng: 32.4242 },
  "Nicosia|Cyprus": { lat: 35.1856, lng: 33.3823 },
  "Limassol|Cyprus": { lat: 34.7071, lng: 33.0226 },
  "Valletta|Malta": { lat: 35.8989, lng: 14.5146 },
  "Sliema|Malta": { lat: 35.9111, lng: 14.5042 },
  "Istanbul|Turkey": { lat: 41.0082, lng: 28.9784 },
  "Antalya|Turkey": { lat: 36.8969, lng: 30.7133 },
  "Izmir|Turkey": { lat: 38.4192, lng: 27.1287 },
  "Bodrum|Turkey": { lat: 37.0344, lng: 27.4305 },
  "Ankara|Turkey": { lat: 39.9334, lng: 32.8597 },
  "Dalaman|Turkey": { lat: 36.7711, lng: 28.7969 },
  "Marrakesh|Morocco": { lat: 31.6295, lng: -7.9811 },
  "Agadir|Morocco": { lat: 30.4278, lng: -9.5981 },
  "Casablanca|Morocco": { lat: 33.5731, lng: -7.5898 },
  "Fez|Morocco": { lat: 34.0181, lng: -5.0078 },
  "Tangier|Morocco": { lat: 35.7595, lng: -5.834 },
  "Rabat|Morocco": { lat: 34.0209, lng: -6.8416 },
  "Cairo|Egypt": { lat: 30.0444, lng: 31.2357 },
  "Hurghada|Egypt": { lat: 27.2579, lng: 33.8116 },
  "Sharm El Sheikh|Egypt": { lat: 27.9158, lng: 34.33 },
  "Alexandria|Egypt": { lat: 31.2001, lng: 29.9187 },
  "Luxor|Egypt": { lat: 25.6872, lng: 32.6396 },
  "Tunis|Tunisia": { lat: 36.8065, lng: 10.1815 },
  "Hammamet|Tunisia": { lat: 36.4, lng: 10.6167 },
  "Sousse|Tunisia": { lat: 35.8254, lng: 10.6369 },
  "Djerba|Tunisia": { lat: 33.8076, lng: 10.8451 },
  "Tirana|Albania": { lat: 41.3275, lng: 19.8187 },
  "Split|Croatia": { lat: 43.5081, lng: 16.4402 },
  "Dubrovnik|Croatia": { lat: 42.6507, lng: 18.0944 },
  "Zagreb|Croatia": { lat: 45.815, lng: 15.9819 },
  "Zadar|Croatia": { lat: 44.1194, lng: 15.2314 },
  "Pula|Croatia": { lat: 44.8666, lng: 13.8496 },
  "Kotor|Montenegro": { lat: 42.4247, lng: 18.7712 },
  "Budva|Montenegro": { lat: 42.286, lng: 18.84 },
  "Tivat|Montenegro": { lat: 42.4347, lng: 18.7064 },
  "Ljubljana|Slovenia": { lat: 46.0569, lng: 14.5058 },
  "Vienna|Austria": { lat: 48.2082, lng: 16.3738 },
  "Salzburg|Austria": { lat: 47.8095, lng: 13.055 },
  "Innsbruck|Austria": { lat: 47.2692, lng: 11.4041 },
  "Berlin|Germany": { lat: 52.52, lng: 13.405 },
  "Munich|Germany": { lat: 48.1351, lng: 11.582 },
  "Hamburg|Germany": { lat: 53.5511, lng: 9.9937 },
  "Cologne|Germany": { lat: 50.9375, lng: 6.9603 },
  "Frankfurt|Germany": { lat: 50.1109, lng: 8.6821 },
  "Dusseldorf|Germany": { lat: 51.2277, lng: 6.7735 },
  "Dresden|Germany": { lat: 51.0504, lng: 13.7373 },
  "Nuremberg|Germany": { lat: 49.4521, lng: 11.0767 },
  "Amsterdam|Netherlands": { lat: 52.3676, lng: 4.9041 },
  "Rotterdam|Netherlands": { lat: 51.9244, lng: 4.4777 },
  "The Hague|Netherlands": { lat: 52.0705, lng: 4.3007 },
  "Utrecht|Netherlands": { lat: 52.0907, lng: 5.1214 },
  "Eindhoven|Netherlands": { lat: 51.4416, lng: 5.4697 },
  "Brussels|Belgium": { lat: 50.8503, lng: 4.3517 },
  "Bruges|Belgium": { lat: 51.2093, lng: 3.2247 },
  "Antwerp|Belgium": { lat: 51.2194, lng: 4.4025 },
  "Ghent|Belgium": { lat: 51.0543, lng: 3.7174 },
  "Dublin|Ireland": { lat: 53.3498, lng: -6.2603 },
  "Cork|Ireland": { lat: 51.8985, lng: -8.4756 },
  "Galway|Ireland": { lat: 53.2707, lng: -9.0568 },
  "London|United Kingdom": { lat: 51.5074, lng: -0.1278 },
  "Edinburgh|United Kingdom": { lat: 55.9533, lng: -3.1883 },
  "Manchester|United Kingdom": { lat: 53.4808, lng: -2.2426 },
  "Liverpool|United Kingdom": { lat: 53.4084, lng: -2.9916 },
  "Glasgow|United Kingdom": { lat: 55.8642, lng: -4.2518 },
  "Birmingham|United Kingdom": { lat: 52.4862, lng: -1.8904 },
  "Bristol|United Kingdom": { lat: 51.4545, lng: -2.5879 },
  "Belfast|United Kingdom": { lat: 54.5973, lng: -5.9301 },
  "Budapest|Hungary": { lat: 47.4979, lng: 19.0402 },
  "Debrecen|Hungary": { lat: 47.5316, lng: 21.6273 },
  "Prague|Czechia": { lat: 50.0755, lng: 14.4378 },
  "Brno|Czechia": { lat: 49.1951, lng: 16.6068 },
  "Warsaw|Poland": { lat: 52.2297, lng: 21.0122 },
  "Krakow|Poland": { lat: 50.0647, lng: 19.945 },
  "Gdansk|Poland": { lat: 54.352, lng: 18.6466 },
  "Copenhagen|Denmark": { lat: 55.6761, lng: 12.5683 },
  "Aarhus|Denmark": { lat: 56.1629, lng: 10.2039 },
  "Stockholm|Sweden": { lat: 59.3293, lng: 18.0686 },
  "Gothenburg|Sweden": { lat: 57.7089, lng: 11.9746 },
  "Malmo|Sweden": { lat: 55.6049, lng: 13.0038 },
  "Oslo|Norway": { lat: 59.9139, lng: 10.7522 },
  "Bergen|Norway": { lat: 60.3913, lng: 5.3221 },
  "Helsinki|Finland": { lat: 60.1699, lng: 24.9384 },
  "Reykjavik|Iceland": { lat: 64.1466, lng: -21.9426 },
  "Zurich|Switzerland": { lat: 47.3769, lng: 8.5417 },
  "Geneva|Switzerland": { lat: 46.2044, lng: 6.1432 },
  "Belgrade|Serbia": { lat: 44.7866, lng: 20.4489 },
  "Sarajevo|Bosnia and Herzegovina": { lat: 43.8563, lng: 18.4131 },
  "Skopje|North Macedonia": { lat: 41.9981, lng: 21.4254 },
  "Sofia|Bulgaria": { lat: 42.6977, lng: 23.3219 },
  "Bucharest|Romania": { lat: 44.4268, lng: 26.1025 },
  "Riga|Latvia": { lat: 56.9496, lng: 24.1052 },
  "Vilnius|Lithuania": { lat: 54.6872, lng: 25.2797 },
  "Tallinn|Estonia": { lat: 59.437, lng: 24.7536 },
  "Kaunas|Lithuania": { lat: 54.8985, lng: 23.9036 },
  "Dubai|United Arab Emirates": { lat: 25.2048, lng: 55.2708 },
  "Abu Dhabi|United Arab Emirates": { lat: 24.4539, lng: 54.3773 },
  "Doha|Qatar": { lat: 25.2854, lng: 51.531 },
  "Muscat|Oman": { lat: 23.588, lng: 58.3829 },
  "Tel Aviv|Israel": { lat: 32.0853, lng: 34.7818 },
  "Amman|Jordan": { lat: 31.9454, lng: 35.9284 },
  "Bangkok|Thailand": { lat: 13.7563, lng: 100.5018 },
  "Phuket|Thailand": { lat: 7.8804, lng: 98.3923 },
  "Krabi|Thailand": { lat: 8.0863, lng: 98.9063 },
  "Chiang Mai|Thailand": { lat: 18.7883, lng: 98.9853 },
  "Singapore|Singapore": { lat: 1.3521, lng: 103.8198 },
  "Kuala Lumpur|Malaysia": { lat: 3.139, lng: 101.6869 },
  "Denpasar|Indonesia": { lat: -8.6705, lng: 115.2126 },
  "Jakarta|Indonesia": { lat: -6.2088, lng: 106.8456 },
  "Hanoi|Vietnam": { lat: 21.0285, lng: 105.8542 },
  "Ho Chi Minh City|Vietnam": { lat: 10.8231, lng: 106.6297 },
  "Tokyo|Japan": { lat: 35.6762, lng: 139.6503 },
  "Osaka|Japan": { lat: 34.6937, lng: 135.5023 },
  "Kyoto|Japan": { lat: 35.0116, lng: 135.7681 },
  "Seoul|South Korea": { lat: 37.5665, lng: 126.978 },
  "Hong Kong|Hong Kong": { lat: 22.3193, lng: 114.1694 },
  "Taipei|Taiwan": { lat: 25.033, lng: 121.5654 },
  "Male|Maldives": { lat: 4.1755, lng: 73.5093 },
  "New York|United States of America": { lat: 40.7128, lng: -74.006 },
  "Los Angeles|United States of America": { lat: 34.0522, lng: -118.2437 },
  "Miami|United States of America": { lat: 25.7617, lng: -80.1918 },
  "Las Vegas|United States of America": { lat: 36.1699, lng: -115.1398 },
  "Chicago|United States of America": { lat: 41.8781, lng: -87.6298 },
  "Cancun|Mexico": { lat: 21.1619, lng: -86.8515 },
  "Punta Cana|Dominican Republic": { lat: 18.5601, lng: -68.3725 },
  "Rio de Janeiro|Brazil": { lat: -22.9068, lng: -43.1729 },
  "Sao Paulo|Brazil": { lat: -23.5558, lng: -46.6396 },
  "Cape Town|South Africa": { lat: -33.9249, lng: 18.4241 },
  "Sydney|Australia": { lat: -33.8688, lng: 151.2093 },
  "Auckland|New Zealand": { lat: -36.8485, lng: 174.7633 },
};

function sourceFromCatalog(): SourceCity[] {
  return destinationCatalog.map((entry) => {
    const coords = CITY_COORDS_SEED[`${entry.city}|${entry.country}`] ?? null;
    return {
      city: entry.city,
      country: entry.country,
      countryCode: COUNTRY_NAME_TO_CODE[entry.country],
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      airportCode: entry.airportCode ?? resolveAirportCode(entry.city) ?? null,
    } satisfies SourceCity;
  });
}

async function sourceFromLiteApiListings(
  countryFilter?: string[],
  perCountry = 30,
): Promise<SourceCity[]> {
  const countries = await fetchCountries();
  const selected = countryFilter
    ? countries.filter((c) => countryFilter.includes(c.code))
    : countries;
  const out: SourceCity[] = [];
  await throttledMap(
    selected,
    async (country) => {
      const cities = await fetchCitiesForCountry(country.code);
      // Prefer cities that already resolve to a real IATA airport — those
      // are the ones the seed pipeline can actually book flights to. We
      // still cap at perCountry but bias toward airport-served cities so
      // we don't waste hotel-check API calls on landlocked villages.
      const ranked = [...cities].sort((a, b) => {
        const aHasAirport = resolveAirportCode(a.city) ? 0 : 1;
        const bHasAirport = resolveAirportCode(b.city) ? 0 : 1;
        if (aHasAirport !== bHasAirport) return aHasAirport - bHasAirport;
        return a.city.localeCompare(b.city);
      });
      const capped = ranked.slice(0, perCountry);
      for (const c of capped) {
        out.push({
          city: c.city,
          country: country.name,
          countryCode: country.code,
          lat: null,
          lng: null,
          airportCode: resolveAirportCode(c.city) ?? null,
        });
      }
    },
    { rps: COUNTRIES_RPS, onProgress: (d, t) => console.log(`[countries] ${d}/${t}`) },
  );
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Output shape

interface OutputDestination {
  id: string;
  city: { en: string; pl: string };
  country: { code: string | null; en: string; pl: string };
  region: { en: string; pl: string };
  lat: number | null;
  lng: number | null;
  airports: string[];
  nearestPLHubs: Array<{ iata: string; km: number; minutes: number }>;
  popularity: number; // 0-100
  vibeTagsEn: string[];
  vibeTagsPl: string[];
  climate: Record<string, "hot" | "mild" | "cold">;
  budgetTier: "low" | "mid" | "high";
  hotelCount: number;
  heroImage: string | null;
}

interface IndexEntry {
  id: string;
  cityPl: string;
  cityEn: string;
  countryPl: string;
  countryCode: string | null;
  popularity: number;
  iata: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Main

async function preflightLiteApiAuth(): Promise<void> {
  // One-call sanity probe against a known popular city. If the configured
  // LiteAPI key is rejected (401/403), we abort here rather than burning
  // 500+ requests at 3 rps just to discover every cache entry is 0. This
  // bug actually shipped once — keep the guard.
  console.log("[preflight] probing /data/hotels with current LiteAPI key…");
  try {
    await liteApiRequest({
      path: "/data/hotels",
      method: "GET",
      keyMode: "public",
      schema: LiteApiHotelsListResponseSchema,
      query: { countryCode: "ES", cityName: "Madrid", limit: 5 },
    });
    console.log("[preflight] ✓ LiteAPI auth OK");
  } catch (err) {
    if (err instanceof LiteApiError && err.internalCode === "LITEAPI_AUTH") {
      console.error("");
      console.error("──────────────────────────────────────────────────────────");
      console.error("FATAL: LiteAPI returned 401 unauthorized on preflight probe.");
      console.error("");
      console.error("  Key in use likely points at an inactive or wrong-env account.");
      console.error("  Current LITEAPI_ENV:", process.env.LITEAPI_ENV ?? "(unset → defaults to sandbox)");
      console.error("");
      console.error("  If you passed --prod and 401 persists, your LITEAPI_PROD_PUBLIC_KEY");
      console.error("  is still pending account activation by LiteAPI support.");
      console.error("");
      console.error("  Workaround: drop --prod and run sandbox harvest");
      console.error("    pnpm build:destinations -- --full");
      console.error("──────────────────────────────────────────────────────────");
      throw err;
    }
    // Non-auth errors during preflight (network, 5xx) — surface them
    // loudly but don't necessarily mean the whole run is doomed.
    console.warn("[preflight] non-auth error:", err instanceof Error ? err.message : String(err));
    console.warn("[preflight] continuing — main loop may still succeed");
  }
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv);
  const startedAt = Date.now();

  // --prod flips the LiteAPI client to production keys. Default = sandbox.
  // We override the env var BEFORE liteApiRequest evaluates its env (the
  // client reads process.env per request).
  if (opts.prod) {
    process.env.LITEAPI_ENV = "production";
  }

  // --full without --countries defaults to the curated tourism allowlist
  // (walking every LiteAPI country = 10k+ obscure cities for negligible
  // user value). Explicit --countries override takes priority.
  const countryFilter = opts.full
    ? opts.countries ?? [...TOP_TOURISM_COUNTRIES]
    : null;

  console.log(
    `[build-destinations] mode=${opts.full ? "full" : "pilot"} prod=${opts.prod} max=${opts.max ?? "∞"} ` +
      `countries=${countryFilter ? countryFilter.length : "(pilot)"} no-network=${opts.noNetwork}`,
  );

  await fs.mkdir(CACHE_DIR, { recursive: true });

  // Pre-flight: verify LiteAPI auth before kicking off the long-running
  // harvest. Skips on --no-network (cache-only rebuild).
  if (!opts.noNetwork) {
    await preflightLiteApiAuth();
  }

  // 1) Source cities.
  let source = opts.full
    ? await sourceFromLiteApiListings(countryFilter ?? undefined, opts.perCountry)
    : sourceFromCatalog();

  // De-dupe: --full pulls catalog + LiteAPI listings combined. Catalog
  // entries beat LiteAPI entries (richer metadata / vetted IATAs).
  if (opts.full) {
    const catalogEntries = sourceFromCatalog();
    const seen = new Set<string>(catalogEntries.map((e) => `${e.city.toLowerCase()}|${e.country.toLowerCase()}`));
    const merged = [...catalogEntries];
    for (const item of source) {
      const key = `${item.city.toLowerCase()}|${item.country.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    source = merged;
  }

  if (opts.max && source.length > opts.max) source = source.slice(0, opts.max);
  console.log(`[source] ${source.length} cities to evaluate`);

  // 2) Hotel inventory. Cache is saved every 100 checks so a killed run
  // doesn't lose progress (1800 cities × 3 rps = 10 min; not losing that).
  const hotelCache = await loadHotelCache();
  let hotelCheckedCount = 0;
  let lastFlush = Date.now();
  await throttledMap(
    source,
    async (item) => {
      const entry = await checkHotelInventory(item.city, item.country, hotelCache, opts.noNetwork);
      hotelCheckedCount += 1;
      // Backfill lat/lng from LiteAPI's first hotel response if not seeded.
      if (entry && (item.lat === null || item.lng === null) && entry.lat && entry.lng) {
        item.lat = entry.lat;
        item.lng = entry.lng;
      }
      // Periodic cache flush (every 100 checks or 30s, whichever first).
      if (hotelCheckedCount % 100 === 0 || Date.now() - lastFlush > 30_000) {
        await saveHotelCache(hotelCache);
        lastFlush = Date.now();
      }
      return entry;
    },
    {
      rps: HOTEL_RPS,
      onProgress: (d, t) => {
        if (d % 25 === 0 || d === t) console.log(`[hotels] ${d}/${t}`);
      },
    },
  );
  await saveHotelCache(hotelCache);
  console.log(`[hotels] checked ${hotelCheckedCount}, cache size=${Object.keys(hotelCache).length}`);

  const withHotels: SourceCity[] = [];
  let droppedHotels = 0;
  for (const item of source) {
    const entry = hotelCache[hotelCacheKey(item.city, item.country)];
    if (!entry) {
      droppedHotels += 1;
      continue;
    }
    if (entry.hotelCount < MIN_HOTEL_COUNT) {
      droppedHotels += 1;
      continue;
    }
    if (item.lat === null && entry.lat) item.lat = entry.lat;
    if (item.lng === null && entry.lng) item.lng = entry.lng;
    withHotels.push(item);
  }
  console.log(`[hotels] kept ${withHotels.length}, dropped ${droppedHotels} (< ${MIN_HOTEL_COUNT} hotels or no inventory data)`);

  // 3) Flight reachability — every kept city needs lat/lng AND nearest PL hub
  // within Travelpayouts' covered set. We treat the airport as reachable if
  // (a) the catalog city resolved an IATA via resolveAirportCode AND
  // (b) at least one of the top-3 nearest PL hubs is ≤ 4000 km (Aviasales
  // cache realistically covers anything bookable from Poland — long-haul
  // Asia/Americas included).
  const withFlights: SourceCity[] = [];
  let droppedNoAirport = 0;
  let droppedNoCoords = 0;
  for (const item of withHotels) {
    if (item.lat === null || item.lng === null) {
      droppedNoCoords += 1;
      continue;
    }
    // Allow long-haul (Bangkok, NYC, Sydney, etc.) — the user explicitly wants
    // the catalog to span globally. The 100km rule from the spec applies to
    // ensuring AN airport exists near the city, not that it's near Poland.
    if (!item.airportCode) {
      droppedNoAirport += 1;
      continue;
    }
    withFlights.push(item);
  }
  console.log(`[flights] kept ${withFlights.length}, dropped ${droppedNoCoords} no-coords + ${droppedNoAirport} no-airport`);

  // 4) Polish localization with curated tier first, Wikidata fallback.
  const wikidataCache = await loadWikidataCache();
  await throttledMap(
    withFlights,
    async (item) => {
      if (CITY_PL[item.city]) return;
      // Lazy Wikidata lookup only when curated map misses.
      await wikidataPolishLabel(item.city, wikidataCache, opts.noNetwork);
    },
    { rps: WIKIDATA_RPS, onProgress: (d, t) => { if (d % 50 === 0 || d === t) console.log(`[wikidata] ${d}/${t}`); } },
  );
  await saveWikidataCache(wikidataCache);

  // 5) Build output records.
  const curatedById = new Map(
    curatedDestinations.map((d) => [`${d.city}|${d.country}`, d]),
  );
  const popularityByPosition = (() => {
    // Earlier entries in destinationCatalog = higher popularity. Curated
    // destinations are top 100. Map index to 100..40 scale.
    const order = new Map<string, number>();
    destinationCatalog.forEach((entry, idx) => {
      const score = Math.max(40, 100 - Math.floor(idx / 4));
      order.set(`${entry.city}|${entry.country}`, score);
    });
    return order;
  })();

  // Garbage filter: LiteAPI sandbox occasionally returns city names with
  // non-Latin lead chars (`Ezbet Shalabi el-Rûdi, ...) or whitespace-only
  // entries. Drop them before output to keep the seed honest. Also dropped:
  // entries where the IATA looks wrong (more than 200 km from the city's
  // lat/lng — only happens when the airport-code resolver accidentally
  // points at LAX/NYC/etc for a non-matching city).
  function isCityNameClean(name: string): boolean {
    const trimmed = name.trim();
    if (trimmed.length < 2) return false;
    // Reject leading non-letter (backtick, hash, digits — LiteAPI quirks).
    if (!/^\p{L}/u.test(trimmed)) return false;
    // Reject if name contains forward-slash or backslash (compound entries).
    if (/[\\/]/.test(trimmed)) return false;
    return true;
  }
  const cleaned = withFlights.filter((item) => isCityNameClean(item.city));
  console.log(`[output] cleaned ${cleaned.length}, dropped ${withFlights.length - cleaned.length} (garbage city names)`);

  const destinations: OutputDestination[] = cleaned.map((item) => {
    const region = regionFor(item.countryCode ?? "");
    // Nullish coalescing alone treats "" as a hit. Cast empty strings to
    // undefined so the fallback chain actually reaches cityEn for entries
    // where Wikidata returned no Polish exonym.
    const cityPlCurated = CITY_PL[item.city] || null;
    const cityPlWikidata = wikidataCache[item.city] || null;
    const cityPl = cityPlCurated ?? cityPlWikidata ?? item.city;
    const countryPlCurated = COUNTRY_PL[item.country] || null;
    const countryPlByCode = item.countryCode ? COUNTRY_PL[item.countryCode] || null : null;
    const countryPl = countryPlCurated ?? countryPlByCode ?? item.country;
    const curated = curatedById.get(`${item.city}|${item.country}`);
    const scores: CuratedScores | undefined = curated
      ? {
          beachScore: curated.beachScore,
          cityScore: curated.cityScore,
          sightseeingScore: curated.sightseeingScore,
          nightlifeScore: curated.nightlifeScore,
          natureScore: curated.natureScore,
          costIndex: curated.costIndex,
        }
      : undefined;
    const vibeTagsEn = deriveVibeTagsEn(scores, region.en);
    const vibeTagsPl = vibeTagsEn.map((t) => VIBE_TAG_PL[t] ?? t);
    const climate: Record<string, "hot" | "mild" | "cold"> = {};
    for (let m = 1; m <= 12; m += 1) {
      climate[String(m)] = climateBand(item.lat, m);
    }
    const cacheKey = hotelCacheKey(item.city, item.country);
    const hotelEntry = hotelCache[cacheKey];
    const popularity = popularityByPosition.get(`${item.city}|${item.country}`) ?? 50;
    const budgetTier: OutputDestination["budgetTier"] =
      scores ? (scores.costIndex >= 1.3 ? "high" : scores.costIndex <= 1.0 ? "low" : "mid") : "mid";
    const nearestHubs = item.lat !== null && item.lng !== null ? nearestPLHubs({ lat: item.lat, lng: item.lng }) : [];
    return {
      id: slugify(`${item.city}-${item.country}`),
      city: { en: item.city, pl: cityPl },
      country: { code: item.countryCode ?? null, en: item.country, pl: countryPl },
      region,
      lat: item.lat,
      lng: item.lng,
      airports: item.airportCode ? [item.airportCode] : [],
      nearestPLHubs: nearestHubs,
      popularity,
      vibeTagsEn,
      vibeTagsPl,
      climate,
      budgetTier,
      hotelCount: hotelEntry?.hotelCount ?? 0,
      heroImage: null, // hero images sourced lazily via destination-content.ts at render time
    } satisfies OutputDestination;
  });

  // Stable order: popularity desc, then city asc.
  destinations.sort((a, b) => b.popularity - a.popularity || a.city.en.localeCompare(b.city.en));

  // 6) Write outputs.
  await writeJson(OUT_FULL, {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    mode: opts.full ? "full" : "pilot",
    destinations,
  });
  const index: IndexEntry[] = destinations.map((d) => ({
    id: d.id,
    cityPl: d.city.pl,
    cityEn: d.city.en,
    countryPl: d.country.pl,
    countryCode: d.country.code,
    popularity: d.popularity,
    iata: d.airports[0] ?? null,
  }));
  await writeJson(OUT_INDEX, index);

  // 7) Summary.
  const polishCoverage = destinations.filter(
    (d) => d.city.pl !== d.city.en || CITY_PL[d.city.en] !== undefined,
  ).length;
  const byRegion = new Map<string, number>();
  for (const d of destinations) {
    byRegion.set(d.region.en, (byRegion.get(d.region.en) ?? 0) + 1);
  }
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log("");
  console.log("───────────────────────────────────────");
  console.log(`Final count: ${destinations.length} destinations`);
  console.log(`Polish coverage: ${Math.round((polishCoverage / destinations.length) * 100)}% (${polishCoverage}/${destinations.length})`);
  console.log(`By region:`);
  for (const [region, count] of [...byRegion.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${region.padEnd(28)} ${count}`);
  }
  console.log(`Output: ${path.relative(ROOT, OUT_FULL)} + ${path.relative(ROOT, OUT_INDEX)}`);
  console.log(`Elapsed: ${elapsedSec}s`);
  console.log("───────────────────────────────────────");
}

main().catch((err) => {
  console.error("[build-destinations] FAILED:", err);
  process.exit(1);
});
