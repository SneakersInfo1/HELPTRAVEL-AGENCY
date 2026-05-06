// Adapter — wraps the new typed `/lib/liteapi/*` library and produces the
// existing `StaySearchResponse` shape consumed by `/api/stays/search` and
// `<StayOffersPanel>`. This file is the seam during the Phase 1 → Phase 2
// transition; it is targeted for removal once `/api/hotels/search` (Phase 2)
// replaces `/api/stays/search`.

import { fetchHotelsList, getRates } from "@/lib/liteapi";
import type {
  NormalizedStayOffer,
  StaySearchResponse,
  StaySortMode,
} from "./types";

export interface LiteApiSearchInput {
  city: string;
  country: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  guests: number;
  rooms: number;
  sortBy: StaySortMode;
}

function emptyResponse(input: LiteApiSearchInput, error?: string): StaySearchResponse {
  return {
    city: input.city,
    country: input.country,
    source: "liteapi",
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    guests: input.guests,
    rooms: input.rooms,
    sortBy: input.sortBy,
    offers: [],
    fetchedAt: new Date().toISOString(),
    error,
  };
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
    sorted.sort((a, b) => a.total_amount - b.total_amount);
  }
  return sorted;
}

// Internal hotel detail href. Phase 2+ provides /hotele/[hotelId] page.
function buildInternalHotelHref(hotelId: string, input: LiteApiSearchInput): string {
  // Param names match the Phase 3 /hotele/[hotelId] page contract:
  // checkin, checkout, adults, rooms. Do not rename to "travelers" — the
  // detail page won't read it and will fall back to defaults.
  const params = new URLSearchParams({
    checkin: input.checkInDate,
    checkout: input.checkOutDate,
    adults: String(Math.max(1, input.guests)),
    rooms: String(Math.max(1, input.rooms)),
  });
  return `/hotele/${encodeURIComponent(hotelId)}?${params.toString()}`;
}

export async function searchLiteApiStays(input: LiteApiSearchInput): Promise<StaySearchResponse> {
  let hotelsList;
  try {
    hotelsList = await fetchHotelsList({ city: input.city, country: input.country, limit: 20 });
  } catch (err) {
    return emptyResponse(input, err instanceof Error ? err.message : "LiteAPI hotels fetch failed.");
  }

  const hotels = hotelsList.data ?? [];
  if (hotels.length === 0) {
    return emptyResponse(input, `Brak hoteli dla "${input.city}".`);
  }

  const hotelIds = hotels.map((h) => h.id);
  const hotelMap = new Map(hotels.map((h) => [h.id, h]));

  let ratesData;
  try {
    ratesData = await getRates({
      hotelIds,
      checkin: input.checkInDate,
      checkout: input.checkOutDate,
      currency: "PLN",
      occupancies: [{ adults: Math.max(1, input.guests), children: [] }],
    });
  } catch (err) {
    return emptyResponse(input, err instanceof Error ? err.message : "LiteAPI rates fetch failed.");
  }

  const offers: NormalizedStayOffer[] = [];

  for (const hotelRates of ratesData.data ?? []) {
    const hotelInfo = hotelMap.get(hotelRates.hotelId);
    if (!hotelInfo) continue;

    let cheapestAmount: number | null = null;
    let cheapestBoardName = "";

    for (const room of hotelRates.roomTypes ?? []) {
      for (const rate of room.rates ?? []) {
        const amount = rate.retailRate?.total?.[0]?.amount ?? 0;
        if (amount > 0 && (cheapestAmount === null || amount < cheapestAmount)) {
          cheapestAmount = amount;
          cheapestBoardName = rate.boardName ?? "";
        }
      }
    }

    if (!cheapestAmount) continue;

    offers.push({
      searchResultId: `liteapi-${hotelRates.hotelId}`,
      accommodationId: hotelRates.hotelId,
      name: hotelInfo.name,
      rating: hotelInfo.stars ?? null,
      reviewScore: hotelInfo.rating ?? null,
      total_amount: Math.round(cheapestAmount),
      currency: "PLN",
      public_amount: null,
      public_currency: null,
      address: hotelInfo.address ?? `${input.city}, ${input.country}`,
      city: input.city,
      country: input.country,
      latitude: hotelInfo.latitude ?? null,
      longitude: hotelInfo.longitude ?? null,
      imageUrl: hotelInfo.main_photo ?? undefined,
      description: cheapestBoardName || undefined,
      rooms: input.rooms,
      bookingUrl: buildInternalHotelHref(hotelRates.hotelId, input),
    } satisfies NormalizedStayOffer);
  }

  if (offers.length === 0) {
    return emptyResponse(input, "Brak dostępnych ofert dla wybranych dat.");
  }

  return {
    city: input.city,
    country: input.country,
    source: "liteapi",
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    guests: input.guests,
    rooms: input.rooms,
    sortBy: input.sortBy,
    offers: sortOffers(offers, input.sortBy),
    fetchedAt: new Date().toISOString(),
  };
}
