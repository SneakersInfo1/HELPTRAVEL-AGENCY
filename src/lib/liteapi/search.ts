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
      limit: input.limit ?? 20,
    },
  });
}

// Convenience wrapper that takes the higher-level NormalizedHotelSearchInput.
export async function searchHotels(input: NormalizedHotelSearchInput): Promise<LiteApiHotelsListResponse> {
  return fetchHotelsList({
    city: input.destination.city,
    country: input.destination.country,
    limit: 20,
  });
}
