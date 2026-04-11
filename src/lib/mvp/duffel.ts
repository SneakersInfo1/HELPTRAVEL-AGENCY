import "server-only";

import { resolveAirportCode } from "./location";
import type { CabinClass, FlightSortMode, NormalizedFlightOffer } from "./types";

export interface DuffelFlightSearchInput {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  cabinClass: CabinClass;
  sortBy?: FlightSortMode;
}

interface DuffelOfferLike {
  id?: string;
  total_amount?: string | number;
  total_currency?: string;
  total_duration?: string;
  owner?: {
    name?: string;
    iata_code?: string;
  };
  slices?: Array<{
    origin?: {
      iata_code?: string;
      name?: string;
    };
    destination?: {
      iata_code?: string;
      name?: string;
    };
    segments?: Array<{
      departure_airport?: { iata_code?: string };
      arrival_airport?: { iata_code?: string };
      departing_at?: string;
      arriving_at?: string;
      departure_at?: string;
      arrival_at?: string;
      operating_carrier?: {
        name?: string;
        iata_code?: string;
      };
    }>;
  }>;
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
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDurationToMinutes(value: string | undefined): number {
  if (!value) return 0;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + minutes;
}

function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  if (hours > 0 && rest > 0) return `${hours} h ${rest} min`;
  if (hours > 0) return `${hours} h`;
  return `${rest} min`;
}

function pickSegments(offer: DuffelOfferLike): NonNullable<NonNullable<DuffelOfferLike["slices"]>[number]["segments"]> {
  return offer.slices?.[0]?.segments ?? [];
}

function pickSlice(offer: DuffelOfferLike) {
  return offer.slices?.[0];
}

function getBookingUrl(offer: DuffelOfferLike): string | undefined {
  return offer.actions?.book?.href ?? offer.links?.book?.href;
}

function normalizeOffer(offer: DuffelOfferLike, input: DuffelFlightSearchInput, resolvedOrigin: string, resolvedDestination: string): NormalizedFlightOffer {
  const segments = pickSegments(offer);
  const slice = pickSlice(offer);
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1] ?? firstSegment;
  const totalDurationMinutes = parseDurationToMinutes(offer.total_duration);

  return {
    offerId: offer.id ?? `${resolvedOrigin}-${resolvedDestination}-${offer.total_amount ?? "0"}`,
    airline: firstSegment?.operating_carrier?.name ?? offer.owner?.name ?? firstSegment?.operating_carrier?.iata_code ?? offer.owner?.iata_code ?? "Linia lotnicza",
    total_amount: toNumber(offer.total_amount),
    currency: offer.total_currency ?? "PLN",
    number_of_stops: Math.max(0, segments.length - 1),
    departure_time: firstSegment?.departing_at ?? firstSegment?.departure_at ?? "",
    arrival_time: lastSegment?.arriving_at ?? lastSegment?.arrival_at ?? "",
    total_duration: offer.total_duration ? formatDuration(totalDurationMinutes) : "",
    total_duration_minutes: totalDurationMinutes,
    origin: firstSegment?.departure_airport?.iata_code ?? slice?.origin?.iata_code ?? resolvedOrigin,
    destination: lastSegment?.arrival_airport?.iata_code ?? slice?.destination?.iata_code ?? resolvedDestination,
    cabinClass: input.cabinClass,
    bookingUrl: getBookingUrl(offer),
  };
}

function rankOffers(offers: NormalizedFlightOffer[], sortBy: FlightSortMode): NormalizedFlightOffer[] {
  if (sortBy === "direct") {
    return [...offers].sort((a, b) => a.number_of_stops - b.number_of_stops || a.total_amount - b.total_amount || a.total_duration_minutes - b.total_duration_minutes);
  }

  if (sortBy === "balance") {
    const priceValues = offers.map((offer) => offer.total_amount);
    const durationValues = offers.map((offer) => offer.total_duration_minutes || 9999);
    const maxPrice = Math.max(...priceValues, 1);
    const minPrice = Math.min(...priceValues, 1);
    const maxDuration = Math.max(...durationValues, 1);
    const minDuration = Math.min(...durationValues, 1);

    const score = (offer: NormalizedFlightOffer) => {
      const priceScore = maxPrice === minPrice ? 0 : (offer.total_amount - minPrice) / (maxPrice - minPrice);
      const durationScore = maxDuration === minDuration ? 0 : (offer.total_duration_minutes - minDuration) / (maxDuration - minDuration);
      const stopScore = Math.min(1, offer.number_of_stops / 2);
      return priceScore * 0.5 + durationScore * 0.35 + stopScore * 0.15;
    };

    return [...offers].sort((a, b) => score(a) - score(b));
  }

  return [...offers].sort((a, b) => a.total_amount - b.total_amount || a.number_of_stops - b.number_of_stops || a.total_duration_minutes - b.total_duration_minutes);
}

export async function searchDuffelFlights(input: DuffelFlightSearchInput): Promise<{
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  cabinClass: CabinClass;
  sortBy: FlightSortMode;
  offers: NormalizedFlightOffer[];
  fetchedAt: string;
}> {
  const accessToken = process.env.DUFFEL_ACCESS_TOKEN?.trim() || process.env.DUFFEL_API_KEY?.trim();
  const apiUrl = process.env.DUFFEL_API_URL?.trim() || "https://api.duffel.com";
  const version = process.env.DUFFEL_VERSION?.trim() || "v2";

  if (!accessToken) {
    throw new Error("Brak DUFFEL_ACCESS_TOKEN w zmiennych srodowiskowych.");
  }

  const resolvedOrigin = resolveAirportCode(input.origin);
  const resolvedDestination = resolveAirportCode(input.destination);

  if (!resolvedOrigin || !resolvedDestination) {
    throw new Error("Nie udalo sie zamienic miasta na kod lotniska.");
  }

  const passengers = Math.max(1, Math.min(8, Math.round(input.passengers || 1)));

  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/air/offer_requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Duffel-Version": version,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    // Duck to Duffel faster than the upstream timeout so we can still show fallback UI if needed.
    body: JSON.stringify({
      data: {
        slices: [
          {
            origin: resolvedOrigin,
            destination: resolvedDestination,
            departure_date: input.departureDate,
          },
        ],
        passengers: Array.from({ length: passengers }, () => ({ type: "adult" })),
        cabin_class: input.cabinClass,
        max_connections: 1,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Duffel zwrocil blad (${response.status}). ${text.slice(0, 220)}`);
  }

  const payload = (await response.json()) as {
    data?: DuffelOfferLike[] | {
      offers?: DuffelOfferLike[];
    };
  };

  const offers = Array.isArray(payload.data) ? payload.data : payload.data?.offers ?? [];
  const normalized = offers.map((offer) => normalizeOffer(offer, input, resolvedOrigin, resolvedDestination));
  const sorted = rankOffers(normalized, input.sortBy ?? "cheap").slice(0, 50);

  return {
    origin: resolvedOrigin,
    destination: resolvedDestination,
    departureDate: input.departureDate,
    passengers,
    cabinClass: input.cabinClass,
    sortBy: input.sortBy ?? "cheap",
    offers: sorted,
    fetchedAt: new Date().toISOString(),
  };
}


