// LiteAPI search — produces a list of hotelIds for a destination/dates query.
// Two-step model: this returns the list; rates.ts gets pricing.

import { liteApiRequest } from "./client";
import {
  LiteApiHotelsListResponseSchema,
  type LiteApiHotelsListResponse,
  type NormalizedHotelSearchInput,
} from "./types";

// Includes Polish localizations — Geoapify autocomplete is queried with
// `lang=pl` (see destination-suggestions.ts), so the country field on user-
// facing suggestions arrives as "Niemcy"/"Hiszpania"/etc. Without these
// aliases the Results page used to throw "Unknown country: Niemcy" and the
// global error.tsx took over, dropping the user on the "Mamy chwilowy
// problem" screen for any city sourced from Geoapify rather than the
// curated catalog.
const COUNTRY_TO_ISO: Record<string, string> = {
  // English / canonical
  Greece: "GR", Spain: "ES", Italy: "IT", France: "FR", Portugal: "PT",
  Germany: "DE", Netherlands: "NL", Belgium: "BE", Austria: "AT", Switzerland: "CH",
  Czech: "CZ", Czechia: "CZ", Hungary: "HU", Poland: "PL", Croatia: "HR",
  Turkey: "TR", Cyprus: "CY", Malta: "MT", Albania: "AL", Romania: "RO",
  Bulgaria: "BG", Serbia: "RS", Denmark: "DK", Sweden: "SE", Norway: "NO",
  Finland: "FI", Ireland: "IE", "United Kingdom": "GB", UK: "GB", Iceland: "IS",
  Slovakia: "SK", Slovenia: "SI", Estonia: "EE", Latvia: "LV", Lithuania: "LT",
  Morocco: "MA", Egypt: "EG", Tunisia: "TN", "United Arab Emirates": "AE", UAE: "AE",
  // Polish
  Grecja: "GR", Hiszpania: "ES", Włochy: "IT", Francja: "FR", Portugalia: "PT",
  Niemcy: "DE", Holandia: "NL", Belgia: "BE", Szwajcaria: "CH",
  Czechy: "CZ", Węgry: "HU", Polska: "PL", Chorwacja: "HR",
  Turcja: "TR", Cypr: "CY", Albania_PL: "AL", Rumunia: "RO",
  Bułgaria: "BG", Dania: "DK", Szwecja: "SE", Norwegia: "NO",
  Finlandia: "FI", Irlandia: "IE", "Wielka Brytania": "GB", Islandia: "IS",
  Słowacja: "SK", Słowenia: "SI", Łotwa: "LV", Litwa: "LT",
  Maroko: "MA", Egipt: "EG", Tunezja: "TN", "Zjednoczone Emiraty Arabskie": "AE",
};

export function resolveCountryCode(country: string): string | null {
  const normalized = country.trim();
  // Map first (handles aliases like "UK" → "GB"), then fall through to
  // length-2 short-circuit, then fuzzy include match.
  for (const [name, code] of Object.entries(COUNTRY_TO_ISO)) {
    if (normalized.toLowerCase() === name.toLowerCase()) return code;
  }
  if (normalized.length === 2) return normalized.toUpperCase();
  for (const [name, code] of Object.entries(COUNTRY_TO_ISO)) {
    if (normalized.toLowerCase().includes(name.toLowerCase())) return code;
  }
  return null;
}

export interface HotelsListInput {
  city: string;
  country: string;
  limit?: number;
}

// Default page size bumped 20 → 50 in Sesja C2 follow-up: user explicitly
// asked for more hotels per destination after we expanded the dataset.
// LiteAPI /data/hotels caps at 1000 per call and returns just metadata
// (no rate lookups), so 50 is cheap. The downstream rates fetch in
// rates.ts is what actually costs us — and that still limits to top-N
// after sorting.
const DEFAULT_HOTELS_LIMIT = 50;

export async function fetchHotelsList(input: HotelsListInput): Promise<LiteApiHotelsListResponse> {
  const countryCode = resolveCountryCode(input.country);
  if (!countryCode) {
    throw new Error(`Unknown country: "${input.country}"`);
  }
  return liteApiRequest({
    path: "/data/hotels",
    method: "GET",
    keyMode: "public",
    schema: LiteApiHotelsListResponseSchema,
    query: {
      countryCode,
      cityName: input.city,
      limit: input.limit ?? DEFAULT_HOTELS_LIMIT,
    },
    // Sesja C2 — server-side Data Cache via Next's fetch patches.
    // Hotels list (IDs + metadata) keyed by countryCode+cityName+limit;
    // doesn't change hourly so 24h TTL is safe. Rates with date-specific
    // pricing are cached separately in rates.ts (15 min TTL).
    //
    //   First request:    ~800-1500ms (LiteAPI round-trip)
    //   Repeat within 24h: ~5-20ms    (Next Data Cache hit at the fetch layer)
    //
    // Outside Next runtime (test runner, build script) the `next` fetch
    // option is silently ignored — behaves identical to no-store.
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-hotels-list"] },
  });
}

// Zadanie 2 — wyspy/regiony. /data/hotels przyjmuje placeId z /data/places
// (zweryfikowane empirycznie 2026-06-12: Majorka → 1000 hoteli, Gozo → 170).
// Bez countryCode/cityName — placeId sam definiuje obszar. Wyniki bywają
// szersze niż wyspa (sąsiednie wyspy w promieniu), więc strona wyników
// przycina je przez isInRegion() z lib/hotels/regions.
export async function fetchHotelsByPlaceId(input: {
  placeId: string;
  limit?: number;
}): Promise<LiteApiHotelsListResponse> {
  return liteApiRequest({
    path: "/data/hotels",
    method: "GET",
    keyMode: "public",
    schema: LiteApiHotelsListResponseSchema,
    query: {
      placeId: input.placeId,
      limit: input.limit ?? DEFAULT_HOTELS_LIMIT,
    },
    // Ten sam Next Data Cache co lista miejska (klucz = pełny URL fetcha,
    // czyli placeId+limit) — metadane nie zmieniają się godzinowo.
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-hotels-list"] },
  });
}

// Convenience wrapper that takes the higher-level NormalizedHotelSearchInput.
export async function searchHotels(input: NormalizedHotelSearchInput): Promise<LiteApiHotelsListResponse> {
  return fetchHotelsList({
    city: input.destination.city,
    country: input.destination.country,
    limit: DEFAULT_HOTELS_LIMIT,
  });
}
