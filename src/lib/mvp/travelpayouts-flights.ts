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

async function fetchTpFlights(
  origin: string,
  destination: string,
  departureAt: string, // YYYY-MM-DD lub YYYY-MM
  token: string,
  sortBy: FlightSortMode,
): Promise<TpFlightEntry[]> {
  const url = new URL(TP_FLIGHTS_API);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("departure_at", departureAt);
  url.searchParams.set("unique", "false");
  url.searchParams.set("sorting", sortBy === "cheap" ? "price" : "route");
  url.searchParams.set("direct", "false");
  url.searchParams.set("currency", "pln");
  url.searchParams.set("limit", "30");
  url.searchParams.set("token", token);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 1800 },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as TpFlightResponse;
    return body.success && Array.isArray(body.data) ? body.data : [];
  } catch {
    return [];
  }
}

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

  // 1) Pierwszy strzal: konkretny dzien
  const entries = await fetchTpFlights(originIata, destinationIata, input.departureDate, token, input.sortBy);

  // 2) Jesli mniej niz 5 wynikow, doladuj z calego miesiaca
  if (entries.length < 5) {
    const month = input.departureDate.slice(0, 7); // YYYY-MM
    const monthEntries = await fetchTpFlights(originIata, destinationIata, month, token, input.sortBy);
    const seen = new Set(entries.map((e) => `${e.airline}-${e.flight_number}-${e.departure_at}`));
    for (const entry of monthEntries) {
      const key = `${entry.airline}-${entry.flight_number}-${entry.departure_at}`;
      if (!seen.has(key)) {
        entries.push(entry);
        seen.add(key);
      }
    }
  }

  if (entries.length === 0) {
    return emptyResponse(input, "Brak ofert lotow dla tej trasy.");
  }

  const offers: NormalizedFlightOffer[] = entries.map((entry) => {
    // Sesja C pkt 7: use `duration_to` (outbound flight time) NOT `duration`.
    // Travelpayouts v3 `prices_for_dates` returns three fields:
    //   • duration_to — outbound flight time, minutes (what we want)
    //   • duration_back — return flight time, minutes (0 for one-way queries)
    //   • duration — aggregated "trip duration" that empirically includes
    //     overnight layover wait-time and is ~6× larger than the actual
    //     fly-time (e.g. 1515 min for a WAW-BER 2-stop where duration_to=245).
    // Preferring `duration` was inflating the displayed flight time, which
    // the user reported as "loty 5x większe" — the price was correct,
    // duration was the bug.
    const durationMinutes = entry.duration_to ?? entry.duration ?? 0;
    const human = minutesToHuman(durationMinutes);
    return {
      offerId: `tp-${entry.airline}-${entry.flight_number}-${entry.departure_at}`,
      airline: entry.airline,
      total_amount: Math.round(entry.price),
      currency: "PLN",
      number_of_stops: entry.transfers ?? 0,
      departure_time: entry.departure_at,
      arrival_time: durationMinutes > 0
        ? new Date(new Date(entry.departure_at).getTime() + durationMinutes * 60_000).toISOString()
        : entry.departure_at,
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
