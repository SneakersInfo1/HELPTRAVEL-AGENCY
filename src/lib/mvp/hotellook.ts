// Klient Hotellook (Travelpayouts) — meta-search hoteli z realnymi cenami.
// Zwraca te same struktury co duffel-stays / hotelbeds-hotels, zeby route
// handler i UI nie musialy wiedziec, ktory dostawca odpowiedzial.

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

const HOTELLOOK_API = "https://engine.hotellook.com/api/v2/cache.json";
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

function sortOffers(offers: NormalizedStayOffer[], sortBy: StaySortMode): NormalizedStayOffer[] {
  const sorted = [...offers];
  if (sortBy === "cheap") {
    sorted.sort((a, b) => a.total_amount - b.total_amount);
  } else if (sortBy === "quality") {
    sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.total_amount - b.total_amount);
  } else {
    // value: cena/gwiazdki — preferuj wyzsze gwiazdki przy podobnej cenie
    sorted.sort((a, b) => {
      const ra = (a.rating ?? 1) || 1;
      const rb = (b.rating ?? 1) || 1;
      return a.total_amount / ra - b.total_amount / rb;
    });
  }
  return sorted;
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

export async function searchHotellookStays(input: HotellookSearchInput): Promise<StaySearchResponse> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN?.trim();
  if (!token) {
    return emptyResponse(input, "Brak TRAVELPAYOUTS_API_TOKEN.");
  }

  const checkOut = addDays(input.checkInDate, Math.max(1, input.nights));
  const { travelpayoutsMarker } = getAffiliateConfig();

  const url = new URL(HOTELLOOK_API);
  url.searchParams.set("location", `${input.city}, ${input.country}`);
  url.searchParams.set("currency", "pln");
  url.searchParams.set("checkIn", input.checkInDate);
  url.searchParams.set("checkOut", checkOut);
  url.searchParams.set("adults", String(Math.max(1, input.guests)));
  url.searchParams.set("limit", "20");
  url.searchParams.set("token", token);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      // krotki cache — meta-search ToS wymaga relatywnie swiezych cen
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
      const totalCandidate = entry.priceAvg ?? entry.priceFrom ?? 0;
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
