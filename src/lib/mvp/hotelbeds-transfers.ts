import "server-only";

import { resolveAirportCode } from "./location";
import { resolveCityCoordinates } from "./geoapify";
import { hotelbedsBaseUrl, hotelbedsHeaders } from "./hotelbeds-client";
import type { NormalizedTransferOffer } from "./types";

export interface HotelbedsTransferSearchInput {
  city: string;
  country: string;
  outboundDateTime: string;
  adults: number;
  children?: number;
  infants?: number;
}

type AnyRecord = Record<string, unknown>;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pickRecord(value: unknown): AnyRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : undefined;
}

function pickArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((item): item is AnyRecord => Boolean(item && typeof item === "object")) : [];
}

function pickPrice(service: AnyRecord): number {
  const price = pickRecord(service.price);
  const pricing = pickRecord(service.pricing);
  const candidates = [
    price?.totalAmount,
    price?.amount,
    price?.net,
    service.totalAmount,
    service.total_amount,
    service.amount,
    pricing?.totalAmount,
    pricing?.amount,
  ];
  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (value > 0) return value;
  }
  return 0;
}

function pickCurrency(service: AnyRecord): string {
  const price = pickRecord(service.price);
  const pricing = pickRecord(service.pricing);
  return pickString(price?.currency) ?? pickString(price?.currencyCode) ?? pickString(service.currency) ?? pickString(pricing?.currency) ?? "EUR";
}

function pickName(service: AnyRecord): string {
  const content = pickRecord(service.content);
  const vehicle = pickRecord(service.vehicle);
  return pickString(service.name) ?? pickString(service.serviceName) ?? pickString(content?.name) ?? pickString(vehicle?.name) ?? "Transfer";
}

function pickVehicle(service: AnyRecord): string {
  const content = pickRecord(service.content);
  const vehicle = pickRecord(service.vehicle);
  const category = pickRecord(service.category);
  return pickString(vehicle?.name) ?? pickString(content?.vehicle && typeof content.vehicle === "object" ? (content.vehicle as AnyRecord).name : undefined) ?? pickString(category?.name) ?? "Transfer";
}

function pickDuration(service: AnyRecord): string | undefined {
  return pickString(service.duration) ?? pickString(service.durationText) ?? pickString(service.travellingTime);
}

function pickBookingUrl(service: AnyRecord): string | undefined {
  const links = pickRecord(service.links);
  return pickString(service.url) ?? pickString(links?.book) ?? pickString(links?.web) ?? pickString(service.bookingUrl);
}

function pickImageUrl(service: AnyRecord): string | undefined {
  const content = pickRecord(service.content);
  const serviceImages = Array.isArray(service.images) ? service.images : [];
  const contentImages = content && Array.isArray(content.images) ? content.images : [];
  const firstImage = [...contentImages, ...serviceImages].find((item) => item && typeof item === "object") as AnyRecord | undefined;
  return pickString(firstImage?.url);
}

function rankTransfers(items: NormalizedTransferOffer[]): NormalizedTransferOffer[] {
  return [...items].sort((a, b) => a.price - b.price || (a.durationMinutes ?? 9999) - (b.durationMinutes ?? 9999));
}

export async function searchHotelbedsTransfers(input: HotelbedsTransferSearchInput): Promise<{
  city: string;
  country: string;
  source: "hotelbeds";
  airportCode?: string;
  center?: { lat: number; lon: number };
  outboundDateTime: string;
  adults: number;
  children: number;
  infants: number;
  offers: NormalizedTransferOffer[];
  fetchedAt: string;
}> {
  const apiKey = process.env.HOTELBEDS_TRANSFER_API_KEY?.trim();
  const apiSecret = process.env.HOTELBEDS_TRANSFER_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error("Brak HOTELBEDS_TRANSFER_API_KEY lub HOTELBEDS_TRANSFER_API_SECRET.");
  }

  const airportCode = resolveAirportCode(input.city);
  const center = await resolveCityCoordinates(input.city, input.country);
  if (!airportCode || !center) {
    throw new Error("Nie udalo sie ustalic lotniska lub lokalizacji dla transferów.");
  }

  const toCode = `${center.lat.toFixed(6)},${center.lon.toFixed(6)}`;
  const adults = Math.max(1, Math.min(8, Math.round(input.adults || 1)));
  const children = Math.max(0, Math.min(8, Math.round(input.children || 0)));
  const infants = Math.max(0, Math.min(8, Math.round(input.infants || 0)));

  const url = `${hotelbedsBaseUrl("transfer")}/transfer-api/1.0/availability/en/from/IATA/${airportCode}/to/GPS/${toCode}/${encodeURIComponent(input.outboundDateTime)}/${adults}/${children}/${infants}`;
  const response = await fetch(url, {
    headers: hotelbedsHeaders(apiKey, apiSecret),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Hotelbeds transfers error (${response.status}). ${text.slice(0, 220)}`);
  }

  const payload = (await response.json()) as {
    services?: unknown;
    data?: unknown;
  };

  const rows = pickArray(payload.services).concat(pickArray(payload.data));
  const offers = rankTransfers(
    rows
      .map((service): NormalizedTransferOffer | null => {
        const price = pickPrice(service);
        if (!price) return null;

        const content = pickRecord(service.content);
        return {
          transferId: pickString(service.serviceId) ?? pickString(service.id) ?? pickName(service),
          name: pickName(service),
          vehicle: pickVehicle(service),
          direction: pickString(service.direction) ?? "ARRIVAL",
          price,
          currency: pickCurrency(service),
          duration: pickDuration(service),
          imageUrl: pickImageUrl(service),
          description: pickString(service.description) ?? pickString(content?.description) ?? "",
          bookingUrl: pickBookingUrl(service),
        };
      })
      .filter((item): item is NormalizedTransferOffer => Boolean(item)),
  ).slice(0, 50);

  return {
    city: input.city,
    country: input.country,
    source: "hotelbeds",
    airportCode,
    center,
    outboundDateTime: input.outboundDateTime,
    adults,
    children,
    infants,
    offers,
    fetchedAt: new Date().toISOString(),
  };
}
