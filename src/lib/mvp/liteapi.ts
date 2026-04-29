// LiteAPI hotel search client — meta-search model.
// Pokazuje ceny z LiteAPI, klik "Rezerwuj" prowadzi do Booking.com (afiliacja).
// Ceny orientacyjne — finalna cena potwierdzana u partnera.

import type { NormalizedStayOffer, StaySearchResponse, StaySortMode } from "./types";

interface LiteApiSearchInput {
  city: string;
  country: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  guests: number;
  rooms: number;
  sortBy: StaySortMode;
}

interface LiteApiHotel {
  id: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  address: string;
  stars: number;
  rating: number;
  reviewCount: number;
  main_photo: string;
}

interface LiteApiHotelsResponse {
  data: LiteApiHotel[];
  hotelIds: string[];
  total: number;
}

interface LiteApiRateAmount {
  amount: number;
  currency: string;
}

interface LiteApiRate {
  rateId: string;
  name: string;
  boardName: string;
  priceType: string;
  retailRate?: { total: LiteApiRateAmount[] };
}

interface LiteApiRoomType {
  offerId: string;
  supplier: string;
  rates: LiteApiRate[];
}

interface LiteApiHotelRates {
  hotelId: string;
  roomTypes: LiteApiRoomType[];
}

interface LiteApiRatesResponse {
  data: LiteApiHotelRates[];
}

// Mapa angielskich nazw krajów -> ISO alpha-2
const COUNTRY_TO_ISO: Record<string, string> = {
  Greece: "GR",
  Spain: "ES",
  Italy: "IT",
  France: "FR",
  Portugal: "PT",
  Germany: "DE",
  Netherlands: "NL",
  Belgium: "BE",
  Austria: "AT",
  Switzerland: "CH",
  Czech: "CZ",
  Hungary: "HU",
  Poland: "PL",
  Croatia: "HR",
  Turkey: "TR",
  Cyprus: "CY",
  Malta: "MT",
  Albania: "AL",
  Romania: "RO",
  Bulgaria: "BG",
  Serbia: "RS",
  Denmark: "DK",
  Sweden: "SE",
  Norway: "NO",
  Finland: "FI",
  Ireland: "IE",
  "United Kingdom": "GB",
  UK: "GB",
  Japan: "JP",
  Thailand: "TH",
  "United Arab Emirates": "AE",
  UAE: "AE",
  China: "CN",
  Iceland: "IS",
  Slovakia: "SK",
  Slovenia: "SI",
  Estonia: "EE",
  Latvia: "LV",
  Lithuania: "LT",
  Morocco: "MA",
  Egypt: "EG",
  Tunisia: "TN",
  Mexico: "MX",
  "United States": "US",
  USA: "US",
  Canada: "CA",
  Brazil: "BR",
  Argentina: "AR",
  Australia: "AU",
  Indonesia: "ID",
  Vietnam: "VN",
  India: "IN",
  Singapore: "SG",
};

function resolveCountryCode(country: string): string | null {
  for (const [name, code] of Object.entries(COUNTRY_TO_ISO)) {
    if (country.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(country.toLowerCase())) {
      return code;
    }
  }
  return null;
}

const LITEAPI_BASE = "https://api.liteapi.travel/v3.0";
const HOTELS_LIMIT = 20; // ile hoteli pobieramy na raz do rates

function buildBookingUrl(hotelName: string, checkIn: string, checkOut: string, guests: number, marker: string | null): string {
  const params = new URLSearchParams({
    ss: hotelName,
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(Math.max(1, guests)),
    no_rooms: "1",
    lang: "pl",
  });
  const base = `https://www.booking.com/searchresults.html?${params.toString()}`;
  if (!marker) return base;
  // Booking.com przez Travelpayouts marker (deeplink afiliacyjny)
  const url = new URL("https://www.travelpayouts.com/click");
  url.searchParams.set("shmarker", marker);
  url.searchParams.set("promo_id", "7654");
  url.searchParams.set("source_type", "customlink");
  url.searchParams.set("type", "click");
  url.searchParams.set("url", base);
  return url.toString();
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

export async function searchLiteApiStays(input: LiteApiSearchInput): Promise<StaySearchResponse> {
  const apiKey = process.env.LITEAPI_API_KEY?.trim();
  if (!apiKey) {
    return emptyResponse(input, "Brak LITEAPI_API_KEY.");
  }

  const countryCode = resolveCountryCode(input.country);
  if (!countryCode) {
    return emptyResponse(input, `Nieznany kraj: "${input.country}".`);
  }

  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER ?? null;

  // Krok 1: szukaj hoteli w mieście
  const hotelsUrl = new URL(`${LITEAPI_BASE}/data/hotels`);
  hotelsUrl.searchParams.set("countryCode", countryCode);
  hotelsUrl.searchParams.set("cityName", input.city);
  hotelsUrl.searchParams.set("limit", String(HOTELS_LIMIT));

  let hotelsRes: Response;
  try {
    hotelsRes = await fetch(hotelsUrl.toString(), {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      next: { revalidate: 86400 },
    });
  } catch (err) {
    return emptyResponse(input, err instanceof Error ? err.message : "LiteAPI hotels fetch failed.");
  }

  if (!hotelsRes.ok) {
    return emptyResponse(input, `LiteAPI hotels ${hotelsRes.status}`);
  }

  let hotelsData: LiteApiHotelsResponse;
  try {
    hotelsData = (await hotelsRes.json()) as LiteApiHotelsResponse;
  } catch {
    return emptyResponse(input, "LiteAPI: nieprawidłowa odpowiedź JSON (hotels).");
  }

  const hotels = hotelsData.data ?? [];
  if (hotels.length === 0) {
    return emptyResponse(input, `Brak hoteli dla "${input.city}" w LiteAPI.`);
  }

  const hotelIds = hotels.slice(0, HOTELS_LIMIT).map((h) => h.id);
  const hotelMap = new Map(hotels.map((h) => [h.id, h]));

  // Krok 2: pobierz ceny dla tych hoteli
  let ratesRes: Response;
  try {
    ratesRes = await fetch(`${LITEAPI_BASE}/hotels/rates`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        hotelIds,
        checkin: input.checkInDate,
        checkout: input.checkOutDate,
        currency: "PLN",
        guestNationality: "PL",
        occupancies: [{ adults: Math.max(1, input.guests), children: [] }],
      }),
      next: { revalidate: 600 },
    });
  } catch (err) {
    return emptyResponse(input, err instanceof Error ? err.message : "LiteAPI rates fetch failed.");
  }

  if (!ratesRes.ok) {
    return emptyResponse(input, `LiteAPI rates ${ratesRes.status}`);
  }

  let ratesData: LiteApiRatesResponse;
  try {
    ratesData = (await ratesRes.json()) as LiteApiRatesResponse;
  } catch {
    return emptyResponse(input, "LiteAPI: nieprawidłowa odpowiedź JSON (rates).");
  }

  const offers: NormalizedStayOffer[] = [];

  for (const hotelRates of ratesData.data ?? []) {
    const hotelInfo = hotelMap.get(hotelRates.hotelId);
    if (!hotelInfo) continue;

    // Bierz najtańszy pokój (najniższą cenę ze wszystkich roomTypes i rates)
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
      imageUrl: hotelInfo.main_photo ?? null,
      description: cheapestBoardName || undefined,
      rooms: input.rooms,
      bookingUrl: buildBookingUrl(hotelInfo.name, input.checkInDate, input.checkOutDate, input.guests, marker),
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
