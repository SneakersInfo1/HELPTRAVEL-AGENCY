import "server-only";

import { createHash } from "node:crypto";

import { resolveAirportCode } from "./location";
import type { NormalizedStayOffer, StaySortMode } from "./types";

export interface HotelbedsHotelSearchInput {
  city: string;
  country: string;
  checkInDate: string;
  nights: number;
  guests: number;
  rooms?: number;
  sortBy?: StaySortMode;
}

interface HotelbedsHotelContentItem {
  code?: string;
  name?: string;
  categoryCode?: string;
  destinationCode?: string;
  zoneCode?: string;
  minRate?: string;
  maxRate?: string;
  images?: Array<{ path?: string }>;
  coordinates?: { latitude?: number; longitude?: number };
  description?: string;
  address?: string;
}

interface HotelbedsHotelRate {
  rateKey?: string;
  rateType?: string;
  boardName?: string;
  roomName?: string;
  net?: string;
  sellingRate?: string;
  images?: Array<{ path?: string }>;
  price?: {
    total?: string;
    currency?: string;
  };
  hotel?: {
    code?: string;
    name?: string;
    categoryCode?: string;
    address?: string;
    coordinates?: {
      latitude?: number;
      longitude?: number;
    };
    images?: Array<{ path?: string }>;
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function addNights(value: string, nights: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + Math.max(1, nights));
  return date.toISOString().slice(0, 10);
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getAuthHeaders(apiKey: string, secret: string): HeadersInit {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sha256(`${apiKey}${secret}${timestamp}`);
  return {
    "Api-key": apiKey,
    "X-Signature": signature,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function pickDestinationCode(city: string): string | undefined {
  return resolveAirportCode(city);
}

function pickImageUrl(item: HotelbedsHotelContentItem | HotelbedsHotelRate): string | undefined {
  const imagePath = "hotel" in item ? item.hotel?.images?.[0]?.path : item.images?.[0]?.path;
  return imagePath ? `https://photos.hotelbeds.com/giata/original/${imagePath}` : undefined;
}

function normalizeRate(rate: HotelbedsHotelRate, city: string, country: string): NormalizedStayOffer | null {
  const hotel = rate.hotel;
  const amount = toNumber(rate.price?.total ?? rate.net ?? rate.sellingRate);
  if (!hotel || !amount) return null;

  return {
    searchResultId: rate.rateKey ?? `${hotel.code ?? city}-${amount}`,
    accommodationId: hotel.code ?? `${city}-${amount}`,
    name: hotel.name?.trim() ?? "Hotel",
    rating: hotel.categoryCode ? Number(hotel.categoryCode) : null,
    reviewScore: null,
    total_amount: amount,
    currency: rate.price?.currency ?? "EUR",
    public_amount: amount,
    public_currency: rate.price?.currency ?? "EUR",
    address: hotel.address?.trim() ?? "",
    city,
    country,
    latitude: hotel.coordinates?.latitude ?? null,
    longitude: hotel.coordinates?.longitude ?? null,
    imageUrl: pickImageUrl(rate),
    description: [rate.roomName?.trim(), rate.boardName?.trim()].filter(Boolean).join(" · "),
    rooms: 1,
    bookingUrl: undefined,
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

export async function searchHotelbedsHotelOffers(input: HotelbedsHotelSearchInput): Promise<{
  city: string;
  country: string;
  source: "hotelbeds";
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  rooms: number;
  sortBy: StaySortMode;
  offers: NormalizedStayOffer[];
  fetchedAt: string;
}> {
  const apiKey = process.env.HOTELBEDS_HOTEL_API_KEY?.trim();
  const apiSecret = process.env.HOTELBEDS_HOTEL_API_SECRET?.trim();
  const apiUrl = process.env.HOTELBEDS_HOTEL_API_URL?.trim() || "https://api.hotelbeds.com";

  if (!apiKey || !apiSecret) {
    throw new Error("Brak HOTELBEDS_HOTEL_API_KEY lub HOTELBEDS_HOTEL_API_SECRET w zmiennych srodowiskowych.");
  }

  const destinationCode = pickDestinationCode(input.city);
  if (!destinationCode) {
    throw new Error("Nie udalo sie ustalic kodu Hotelbeds dla tego miasta.");
  }

  const checkInDate = input.checkInDate;
  const checkOutDate = addNights(checkInDate, input.nights);
  const guests = Math.max(1, Math.min(8, Math.round(input.guests || 1)));
  const rooms = Math.max(1, Math.min(8, Math.round(input.rooms || 1)));

  const contentUrl = new URL(`${apiUrl.replace(/\/$/, "")}/hotel-content-api/1.0/hotels`);
  contentUrl.searchParams.set("destinationCode", destinationCode);
  contentUrl.searchParams.set("language", "ENG");
  contentUrl.searchParams.set("from", "1");
  contentUrl.searchParams.set("to", "50");
  contentUrl.searchParams.set("useSecondaryLanguage", "false");

  const contentResponse = await fetch(contentUrl, {
    headers: getAuthHeaders(apiKey, apiSecret),
  });
  if (!contentResponse.ok) {
    const text = await contentResponse.text().catch(() => "");
    throw new Error(`Hotelbeds content error (${contentResponse.status}). ${text.slice(0, 220)}`);
  }

  const contentPayload = (await contentResponse.json()) as {
    hotels?: HotelbedsHotelContentItem[];
    data?: { hotels?: HotelbedsHotelContentItem[] };
  };

  const hotels = contentPayload.hotels ?? contentPayload.data?.hotels ?? [];
  const hotelCodes = hotels.map((hotel) => hotel.code).filter((code): code is string => Boolean(code)).slice(0, 20);

  if (hotelCodes.length === 0) {
    return {
      city: input.city,
      country: input.country,
      source: "hotelbeds",
      checkInDate,
      checkOutDate,
      guests,
      rooms,
      sortBy: input.sortBy ?? "cheap",
      offers: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  const availabilityUrl = new URL(`${apiUrl.replace(/\/$/, "")}/hotel-api/1.0/hotels`);
  availabilityUrl.searchParams.set("destinationCode", destinationCode);
  availabilityUrl.searchParams.set("language", "ENG");
  availabilityUrl.searchParams.set("from", "1");
  availabilityUrl.searchParams.set("to", "20");
  availabilityUrl.searchParams.set("useSecondaryLanguage", "false");
  availabilityUrl.searchParams.set("checkIn", checkInDate);
  availabilityUrl.searchParams.set("checkOut", checkOutDate);
  availabilityUrl.searchParams.set("adults", String(guests));
  availabilityUrl.searchParams.set("rooms", String(rooms));
  availabilityUrl.searchParams.set("hotels", hotelCodes.join(","));

  const availabilityResponse = await fetch(availabilityUrl, {
    headers: getAuthHeaders(apiKey, apiSecret),
  });
  if (!availabilityResponse.ok) {
    const text = await availabilityResponse.text().catch(() => "");
    throw new Error(`Hotelbeds availability error (${availabilityResponse.status}). ${text.slice(0, 220)}`);
  }

  const availabilityPayload = (await availabilityResponse.json()) as {
    hotels?: Array<{
      hotel?: HotelbedsHotelRate["hotel"];
      rates?: HotelbedsHotelRate[];
    }>;
    data?: Array<{
      hotel?: HotelbedsHotelRate["hotel"];
      rates?: HotelbedsHotelRate[];
    }>;
  };

  const rows = availabilityPayload.hotels ?? availabilityPayload.data ?? [];
  const offers = rankResults(
    rows
      .flatMap((item) => (item.rates ?? []).map((rate) => normalizeRate({ ...rate, hotel: rate.hotel ?? item.hotel }, input.city, input.country)))
      .filter((item): item is NormalizedStayOffer => Boolean(item)),
    input.sortBy ?? "cheap",
  ).slice(0, 50);

  return {
    city: input.city,
    country: input.country,
    source: "hotelbeds",
    checkInDate,
    checkOutDate,
    guests,
    rooms,
    sortBy: input.sortBy ?? "cheap",
    offers,
    fetchedAt: new Date().toISOString(),
  };
}
