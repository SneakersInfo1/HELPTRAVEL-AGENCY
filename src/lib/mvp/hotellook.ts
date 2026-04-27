// Klient Hotellook (Travelpayouts) — meta-search hoteli z realnymi cenami.
// Flow: 1) lookup.json -> wyciagamy locationId po nazwie miasta
//       2) cache.json?locationId=X -> ceny hoteli
// Zwraca te same struktury co route handler oczekuje (StaySearchResponse).

import { getAffiliateConfig } from "./affiliate-config";
import type { NormalizedStayOffer, StaySearchResponse, StaySortMode } from "./types";

interface HotellookSearchInput {
  city: string;
  country: string;
  checkInDate: string;
  nights: number;
  guests: number;
  rooms: number;
  sortBy: StaySortMode;
}

interface HotellookCacheEntry {
  hotelId: number;
  hotelName: string;
  location?: {
    name?: string;
    country?: string;
    geo?: { lat?: number; lon?: number };
  };
  priceFrom?: number;
  priceAvg?: number;
  pricePercentile?: Record<string, number>;
  stars?: number;
  hotelStars?: number;
}

interface HotellookLookupResponse {
  status?: string;
  results?: {
    locations?: Array<{
      id?: string | number;
      type?: string;
      cityName?: string;
      countryName?: string;
      iata?: string[];
    }>;
  };
}

const HOTELLOOK_LOOKUP_API = "https://engine.hotellook.com/api/v2/lookup.json";
const HOTELLOOK_CACHE_API = "https://engine.hotellook.com/api/v2/cache.json";
const HOTELLOOK_PHOTO_BASE = "https://photo.hotellook.com/image_v2/limit/h";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildBookingUrl(
  hotelId: number,
  checkIn: string,
  checkOut: string,
  guests: number,
  marker: string | null,
): string {
  const url = new URL("https://search.hotellook.com/hotels");
  url.searchParams.set("hotelId", String(hotelId));
  url.searchParams.set("checkIn", checkIn);
  url.searchParams.set("checkOut", checkOut);
  url.searchParams.set("adults", String(Math.max(1, guests)));
  if (marker) url.searchParams.set("marker", marker);
  return url.toString();
}

function emptyResponse(input: HotellookSearchInput, error?: string): StaySearchResponse {
  return {
    city: input.city,
    country: input.country,
    source: "hotellook",
    checkInDate: input.checkInDate,
    checkOutDate: addDays(input.checkInDate, Math.max(1, input.nights)),
    guests: input.guests,
    rooms: input.rooms,
    sortBy: input.sortBy,
    offers: [],
    fetchedAt: new Date().toISOString(),
    error,
  };
}

// Lookup miasta -> locationId. Cache 24h (miasta sie nie zmieniaja).
async function lookupLocationId(city: string, token: string): Promise<string | null> {
  const url = new URL(HOTELLOOK_LOOKUP_API);
  url.searchParams.set("query", city);
  url.searchParams.set("lang", "en");
  url.searchParams.set("lookFor", "city");
  url.searchParams.set("limit", "1");
  url.searchParams.set("token", token);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as HotellookLookupResponse;
    const first = body.results?.locations?.[0];
    return first?.id ? String(first.id) : null;
  } catch {
    return null;
  }
}

function sortOffers(offers: NormalizedStayOffer[], sortBy: StaySortMode): NormalizedStayOffer[] {
  const sorted = [...offers];
  if (sortBy === "quality") {
    sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.total_amount - b.total_amount);
  } else if (sortBy === "value") {
    sorted.sort((a, b) => {
      const ra = (a.rating ?? 1) || 1;
      const rb = (b.rating ?? 1) || 1;
      return a.total_amount / ra - b.total_amount / rb;
    });
  } else {
    // cheap (default) — najtansze najpierw
    sorted.sort((a, b) => a.total_amount - b.total_amount);
  }
  return sorted;
}

export async function searchHotellookStays(input: HotellookSearchInput): Promise<StaySearchResponse> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN?.trim();
  if (!token) {
    return emptyResponse(input, "Brak TRAVELPAYOUTS_API_TOKEN.");
  }

  const checkOut = addDays(input.checkInDate, Math.max(1, input.nights));
  const { travelpayoutsMarker } = getAffiliateConfig();

  const locationId = await lookupLocationId(input.city, token);
  if (!locationId) {
    return emptyResponse(input, `Nie znaleziono miasta "${input.city}" w bazie Hotellook.`);
  }

  const url = new URL(HOTELLOOK_CACHE_API);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("currency", "pln");
  url.searchParams.set("checkIn", input.checkInDate);
  url.searchParams.set("checkOut", checkOut);
  url.searchParams.set("adults", String(Math.max(1, input.guests)));
  url.searchParams.set("limit", "30");
  url.searchParams.set("token", token);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 600 },
    });
  } catch (error) {
    return emptyResponse(input, error instanceof Error ? error.message : "Hotellook fetch failed.");
  }

  if (!response.ok) {
    return emptyResponse(input, `Hotellook ${response.status}`);
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return emptyResponse(input, "Hotellook: nieprawidlowa odpowiedz JSON.");
  }

  if (!Array.isArray(raw)) {
    return emptyResponse(input, "Brak ofert dla tego kierunku.");
  }

  const entries = raw as HotellookCacheEntry[];

  const offers: NormalizedStayOffer[] = entries
    .filter((entry) => typeof entry.hotelId === "number" && (entry.priceAvg || entry.priceFrom))
    .map((entry) => {
      // Bierzemy priceFrom (najnizsza cena) jako bazowa, fallback na priceAvg
      const totalCandidate = entry.priceFrom ?? entry.priceAvg ?? 0;
      const total = Math.round(totalCandidate);
      return {
        searchResultId: `hotellook-${entry.hotelId}`,
        accommodationId: String(entry.hotelId),
        name: entry.hotelName ?? `Hotel ${entry.hotelId}`,
        rating: entry.stars ?? entry.hotelStars ?? null,
        reviewScore: null,
        total_amount: total,
        currency: "PLN",
        public_amount: null,
        public_currency: null,
        address: entry.location?.name ?? `${input.city}, ${input.country}`,
        city: input.city,
        country: input.country,
        latitude: entry.location?.geo?.lat ?? null,
        longitude: entry.location?.geo?.lon ?? null,
        imageUrl: `${HOTELLOOK_PHOTO_BASE}/${entry.hotelId}/800/520.auto`,
        description: undefined,
        rooms: input.rooms,
        bookingUrl: buildBookingUrl(
          entry.hotelId,
          input.checkInDate,
          checkOut,
          input.guests,
          travelpayoutsMarker,
        ),
      } satisfies NormalizedStayOffer;
    });

  return {
    city: input.city,
    country: input.country,
    source: "hotellook",
    checkInDate: input.checkInDate,
    checkOutDate: checkOut,
    guests: input.guests,
    rooms: input.rooms,
    sortBy: input.sortBy,
    offers: sortOffers(offers, input.sortBy),
    fetchedAt: new Date().toISOString(),
  };
}
