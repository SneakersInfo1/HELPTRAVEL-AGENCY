import "server-only";

import { resolveCityCoordinates } from "./geoapify";
import type { NormalizedStayOffer, StaySortMode } from "./types";

const MAX_STAY_RESULTS = 500;

export interface DuffelStaySearchInput {
  city: string;
  country: string;
  checkInDate: string;
  nights: number;
  guests: number;
  rooms?: number;
  sortBy?: StaySortMode;
  freeCancellationOnly?: boolean;
}

interface DuffelStayResultLike {
  id?: string;
  search_result_id?: string;
  actions?: {
    book?: {
      href?: string;
    };
  };
  links?: {
    book?: {
      href?: string;
    };
  };
  cheapest_rate_total_amount?: string;
  cheapest_rate_currency?: string;
  cheapest_rate_public_amount?: string | null;
  cheapest_rate_public_currency?: string | null;
  check_in_date?: string;
  check_out_date?: string;
  rooms?: number;
  guests?: Array<{ type?: string; age?: number }>;
  accommodation?: {
    id?: string;
    name?: string;
    rating?: number | null;
    review_score?: number | null;
    images?: Array<{ url?: string }>;
    photos?: Array<{ url?: string }>;
    location?: {
      geographic_coordinates?: {
        latitude?: number;
        longitude?: number;
      };
      address?: {
        line_one?: string;
        city_name?: string;
        country_code?: string;
      };
    };
    address?: {
      line_one?: string;
      city_name?: string;
      country_code?: string;
    };
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addNights(value: string, nights: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + Math.max(1, nights));
  return date.toISOString().slice(0, 10);
}

function pickAddress(result: DuffelStayResultLike): string {
  return (
    result.accommodation?.location?.address?.line_one?.trim() ||
    result.accommodation?.address?.line_one?.trim() ||
    result.accommodation?.location?.address?.city_name?.trim() ||
    result.accommodation?.address?.city_name?.trim() ||
    ""
  );
}

function pickLocation(result: DuffelStayResultLike): { latitude?: number | null; longitude?: number | null } {
  return {
    latitude: result.accommodation?.location?.geographic_coordinates?.latitude ?? null,
    longitude: result.accommodation?.location?.geographic_coordinates?.longitude ?? null,
  };
}

function pickImageUrl(result: DuffelStayResultLike): string | undefined {
  return result.accommodation?.images?.[0]?.url ?? result.accommodation?.photos?.[0]?.url;
}

function pickBookingUrl(result: DuffelStayResultLike): string | undefined {
  return result.actions?.book?.href ?? result.links?.book?.href;
}

function normalizeStay(result: DuffelStayResultLike, city: string, country: string): NormalizedStayOffer {
  const location = pickLocation(result);
  const searchResultId = result.search_result_id ?? result.id ?? `${city}-${country}-${result.accommodation?.id ?? "stay"}`;
  const accommodationId = result.accommodation?.id ?? searchResultId;
  const totalAmount = toNumber(result.cheapest_rate_total_amount);
  const publicAmount = result.cheapest_rate_public_amount ? toNumber(result.cheapest_rate_public_amount) : null;

  return {
    searchResultId,
    accommodationId,
    name: result.accommodation?.name?.trim() ?? "Hotel",
    rating: result.accommodation?.rating ?? null,
    reviewScore: result.accommodation?.review_score ?? null,
    total_amount: totalAmount,
    currency: result.cheapest_rate_currency ?? result.cheapest_rate_public_currency ?? "EUR",
    public_amount: publicAmount,
    public_currency: result.cheapest_rate_public_currency ?? null,
    address: pickAddress(result),
    city: result.accommodation?.location?.address?.city_name?.trim() ?? city,
    country,
    latitude: location.latitude,
    longitude: location.longitude,
    imageUrl: pickImageUrl(result),
    description: [result.accommodation?.name?.trim(), result.accommodation?.location?.address?.line_one?.trim()].filter(Boolean).join(" · "),
    rooms: result.rooms,
    bookingUrl: pickBookingUrl(result),
  };
}

function rankResults(results: NormalizedStayOffer[], sortBy: StaySortMode): NormalizedStayOffer[] {
  if (sortBy === "quality") {
    return [...results].sort((a, b) => (b.reviewScore ?? b.rating ?? 0) - (a.reviewScore ?? a.rating ?? 0) || a.total_amount - b.total_amount);
  }

  if (sortBy === "value") {
    return [...results].sort((a, b) => {
      const aQuality = (a.reviewScore ?? a.rating ?? 0) * 10;
      const bQuality = (b.reviewScore ?? b.rating ?? 0) * 10;
      const aValue = aQuality / Math.max(1, a.total_amount);
      const bValue = bQuality / Math.max(1, b.total_amount);
      return bValue - aValue || a.total_amount - b.total_amount;
    });
  }

  return [...results].sort((a, b) => a.total_amount - b.total_amount || (b.reviewScore ?? b.rating ?? 0) - (a.reviewScore ?? a.rating ?? 0));
}

export async function searchDuffelStays(input: DuffelStaySearchInput): Promise<{
  city: string;
  country: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  rooms: number;
  sortBy: StaySortMode;
  offers: NormalizedStayOffer[];
  fetchedAt: string;
}> {
  const accessToken = process.env.DUFFEL_ACCESS_TOKEN?.trim() || process.env.DUFFEL_API_KEY?.trim();
  const apiUrl = process.env.DUFFEL_API_URL?.trim() || "https://api.duffel.com";
  const version = process.env.DUFFEL_VERSION?.trim() || "v2";

  if (!accessToken) {
    throw new Error("Brak DUFFEL_ACCESS_TOKEN w zmiennych srodowiskowych.");
  }

  const center = await resolveCityCoordinates(input.city, input.country);
  if (!center) {
    throw new Error("Nie udalo sie ustalic lokalizacji miasta dla noclegow.");
  }

  const checkInDate = input.checkInDate;
  const checkOutDate = addNights(checkInDate, input.nights);
  const guests = Math.max(1, Math.min(8, Math.round(input.guests || 1)));
  const rooms = Math.max(1, Math.min(8, Math.round(input.rooms || 1)));

  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/stays/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Duffel-Version": version,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        rooms,
        mobile: false,
        free_cancellation_only: Boolean(input.freeCancellationOnly),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        guests: Array.from({ length: guests }, () => ({ type: "adult" })),
        location: {
          radius: 15,
          geographic_coordinates: {
            longitude: center.lon,
            latitude: center.lat,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Duffel stays zwrócił błąd (${response.status}). ${text.slice(0, 220)}`);
  }

  const payload = (await response.json()) as {
    data?: {
      results?: DuffelStayResultLike[];
    };
  };

  const results = payload.data?.results ?? [];
  const offers = rankResults(results.map((result) => normalizeStay(result, input.city, input.country)), input.sortBy ?? "cheap").slice(0, MAX_STAY_RESULTS);

  return {
    city: input.city,
    country: input.country,
    checkInDate,
    checkOutDate,
    guests,
    rooms,
    sortBy: input.sortBy ?? "cheap",
    offers,
    fetchedAt: new Date().toISOString(),
  };
}
