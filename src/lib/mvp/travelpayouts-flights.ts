// Klient Travelpayouts Flight Data API (Aviasales).
// UWAGA: zwraca CACHE'OWANE ceny (nie live booking). Klik prowadzi do Aviasales,
// gdzie user widzi aktualne ceny i kupuje. Pasuje do modelu meta-search.

import { getAffiliateConfig } from "./affiliate-config";
import { resolveAirportCode } from "./location";
import type {
  CabinClass,
  FlightSearchResponse,
  FlightSortMode,
  NormalizedFlightOffer,
} from "./types";

interface TpFlightSearchInput {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  cabinClass: CabinClass;
  sortBy: FlightSortMode;
}

interface TpFlightEntry {
  origin: string;
  destination: string;
  origin_airport?: string;
  destination_airport?: string;
  price: number;
  airline: string;
  flight_number: string | number;
  departure_at: string;
  return_at?: string;
  transfers: number;
  duration?: number;
  duration_to?: number;
  link: string;
}

interface TpFlightResponse {
  success?: boolean;
  data?: TpFlightEntry[];
  error?: string;
}

const TP_FLIGHTS_API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

function minutesToHuman(minutes: number | undefined): { text: string; minutes: number } {
  if (!minutes || minutes <= 0) return { text: "—", minutes: 0 };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { text: `${h}h ${m.toString().padStart(2, "0")}m`, minutes };
}

function buildBookingUrl(link: string, marker: string | null): string {
  const base = `https://www.aviasales.com${link.startsWith("/") ? link : `/${link}`}`;
  if (!marker) return base;
  const url = new URL(base);
  url.searchParams.set("marker", marker);
  return url.toString();
}

function emptyResponse(input: TpFlightSearchInput, error: string): FlightSearchResponse {
  return {
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    passengers: input.passengers,
    cabinClass: input.cabinClass,
    sortBy: input.sortBy,
    offers: [],
    fetchedAt: new Date().toISOString(),
    source: "travelpayouts",
    error,
  };
}

function sortOffers(offers: NormalizedFlightOffer[], sortBy: FlightSortMode): NormalizedFlightOffer[] {
  const sorted = [...offers];
  if (sortBy === "cheap") {
    sorted.sort((a, b) => a.total_amount - b.total_amount);
  } else if (sortBy === "direct") {
    sorted.sort(
      (a, b) =>
        a.number_of_stops - b.number_of_stops || a.total_amount - b.total_amount,
    );
  } else {
    // balance: kompromis cena vs przesiadki
    sorted.sort(
      (a, b) =>
        a.total_amount + a.number_of_stops * 200 -
        (b.total_amount + b.number_of_stops * 200),
    );
  }
  return sorted;
}

export async function searchTravelpayoutsFlights(
  input: TpFlightSearchInput,
): Promise<FlightSearchResponse> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN?.trim();
  if (!token) {
    return emptyResponse(input, "Brak TRAVELPAYOUTS_API_TOKEN.");
  }

  const originIata = resolveAirportCode(input.origin);
  const destinationIata = resolveAirportCode(input.destination);
  if (!originIata || !destinationIata) {
    return emptyResponse(input, "Nie udalo sie ustalic kodu lotniska (IATA).");
  }

  const { travelpayoutsMarker } = getAffiliateConfig();

  const url = new URL(TP_FLIGHTS_API);
  url.searchParams.set("origin", originIata);
  url.searchParams.set("destination", destinationIata);
  url.searchParams.set("departure_at", input.departureDate);
  url.searchParams.set("unique", "false");
  url.searchParams.set("sorting", input.sortBy === "cheap" ? "price" : "route");
  url.searchParams.set("direct", "false");
  url.searchParams.set("currency", "pln");
  url.searchParams.set("limit", "20");
  url.searchParams.set("token", token);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 1800 }, // 30 min — to i tak cache po stronie TP
    });
  } catch (error) {
    return emptyResponse(
      input,
      error instanceof Error ? error.message : "Travelpayouts fetch failed.",
    );
  }

  if (!response.ok) {
    return emptyResponse(input, `Travelpayouts ${response.status}`);
  }

  let body: TpFlightResponse;
  try {
    body = (await response.json()) as TpFlightResponse;
  } catch {
    return emptyResponse(input, "Travelpayouts: nieprawidlowa odpowiedz JSON.");
  }

  if (!body.success || !Array.isArray(body.data) || body.data.length === 0) {
    return emptyResponse(
      input,
      body.error || "Brak ofert lotow dla podanej trasy i daty.",
    );
  }

  const offers: NormalizedFlightOffer[] = body.data.map((entry) => {
    const durationMinutes = entry.duration ?? entry.duration_to ?? 0;
    const human = minutesToHuman(durationMinutes);
    return {
      offerId: `tp-${entry.airline}-${entry.flight_number}-${entry.departure_at}`,
      airline: entry.airline,
      total_amount: Math.round(entry.price * Math.max(1, input.passengers)),
      currency: "PLN",
      number_of_stops: entry.transfers ?? 0,
      departure_time: entry.departure_at,
      arrival_time: entry.return_at ?? entry.departure_at,
      total_duration: human.text,
      total_duration_minutes: human.minutes,
      origin: entry.origin_airport ?? entry.origin,
      destination: entry.destination_airport ?? entry.destination,
      cabinClass: input.cabinClass,
      bookingUrl: buildBookingUrl(entry.link, travelpayoutsMarker),
    } satisfies NormalizedFlightOffer;
  });

  return {
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    passengers: input.passengers,
    cabinClass: input.cabinClass,
    sortBy: input.sortBy,
    offers: sortOffers(offers, input.sortBy),
    fetchedAt: new Date().toISOString(),
    source: "travelpayouts",
  };
}
