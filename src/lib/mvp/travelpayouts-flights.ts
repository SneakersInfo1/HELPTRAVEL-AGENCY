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
  // Sesja C1 FIX 2 — when set, the adapter prefers Travelpayouts'
  // `/v3/get_latest_prices` endpoint with `one_way=false` so each row
  // carries both outbound and return legs. Falls back to the one-way
  // `/v3/prices_for_dates` path when returnDate is omitted.
  returnDate?: string;
  passengers: number;
  cabinClass: CabinClass;
  sortBy: FlightSortMode;
}

interface TpRoundTripEntry {
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string;
  value: number; // round-trip total in requested currency
  number_of_changes: number; // total stops across both legs
  duration: number; // round-trip total minutes
  gate?: string; // booking partner (Gotogate, Kupi, Mytrip, ...)
}

const TP_LATEST_PRICES_API = "https://api.travelpayouts.com/aviasales/v3/get_latest_prices";

async function fetchTpRoundTrip(
  origin: string,
  destination: string,
  departureDate: string,
  returnDate: string,
  token: string,
): Promise<TpRoundTripEntry[]> {
  const url = new URL(TP_LATEST_PRICES_API);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("one_way", "false");
  url.searchParams.set("period_type", "year");
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", "30");
  url.searchParams.set("show_to_affiliates", "true");
  url.searchParams.set("sorting", "price");
  url.searchParams.set("trip_class", "0");
  url.searchParams.set("currency", "pln");
  url.searchParams.set("token", token);
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { success?: boolean; data?: TpRoundTripEntry[] };
    if (!body.success || !Array.isArray(body.data)) return [];
    // Pre-filter: prefer entries reasonably close to user's requested dates
    // (within ±7 days). The endpoint returns the cache's most-recent data
    // across the year; we'd rather show fresh nearby pairs than a cheap-
    // but-distant January option for a May query.
    const target = new Date(`${departureDate}T00:00:00Z`).getTime();
    void returnDate;
    const SEVEN_DAYS = 7 * 86_400_000;
    return body.data.filter((e) => {
      const t = new Date(e.depart_date).getTime();
      return Number.isFinite(t) && Math.abs(t - target) <= SEVEN_DAYS;
    });
  } catch {
    return [];
  }
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

  // Sesja C1 FIX 2 — round-trip path. When the user supplies a returnDate,
  // try `/v3/get_latest_prices?one_way=false` first; that's the only TP v3
  // endpoint that returns paired itineraries (depart_date + return_date in
  // one row). Fall back to the one-way `prices_for_dates` if it returns
  // nothing.
  if (input.returnDate) {
    const rtEntries = await fetchTpRoundTrip(
      originIata,
      destinationIata,
      input.departureDate,
      input.returnDate,
      token,
    );
    if (rtEntries.length > 0) {
      const offers: NormalizedFlightOffer[] = rtEntries.map((entry, idx) => {
        const totalMin = entry.duration ?? 0;
        // We don't get split outbound/return durations from this endpoint —
        // halve the round-trip total as a reasonable per-leg estimate.
        const legMin = Math.max(0, Math.round(totalMin / 2));
        const halfStops = Math.max(0, Math.round((entry.number_of_changes ?? 0) / 2));
        const outDuration = minutesToHuman(legMin);
        return {
          offerId: `tp-rt-${entry.gate ?? "x"}-${entry.depart_date}-${idx}`,
          airline: entry.gate ?? "Aviasales",
          total_amount: Math.round(entry.value),
          currency: "PLN",
          number_of_stops: halfStops,
          departure_time: entry.depart_date,
          arrival_time: legMin > 0
            ? new Date(new Date(entry.depart_date).getTime() + legMin * 60_000).toISOString()
            : entry.depart_date,
          total_duration: outDuration.text,
          total_duration_minutes: outDuration.minutes,
          origin: entry.origin,
          destination: entry.destination,
          cabinClass: input.cabinClass,
          // No per-itinerary deeplink from this endpoint — use the
          // round-trip Aviasales URL the panel already builds (covers
          // every airline, not just one).
          bookingUrl: undefined,
          return_departure_time: entry.return_date,
          return_arrival_time: legMin > 0
            ? new Date(new Date(entry.return_date).getTime() + legMin * 60_000).toISOString()
            : entry.return_date,
          return_duration: outDuration.text,
          return_duration_minutes: outDuration.minutes,
          return_number_of_stops: halfStops,
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
    // else fall through to one-way path
  }

  // 1) Pierwszy strzal: konkretny dzien
  const dayEntries = await fetchTpFlights(originIata, destinationIata, input.departureDate, token, input.sortBy);

  // 2) Doladuj z miesiaca, ale tylko +/- DAY_WINDOW dni od wybranej daty.
  // Strict same-day filter zostawial nas z 1-3 ofertami na krotkich trasach
  // (TP cache jest rzadki). Okno +/- 2 dni daje 4-9 ofert i NIE wprowadza
  // dezorientacji bo:
  //   (a) karta pokazuje pelna date (np. "24 maj"),
  //   (b) Aviasales CTA uzywa offer.departure_at (rzeczywista data oferty),
  //       nie daty z URL'a — co widac na karcie ladujesz na Aviasales.
  const DAY_WINDOW = 2;
  const targetDate = new Date(`${input.departureDate}T00:00:00Z`).getTime();
  const entries = [...dayEntries];
  if (entries.length < 8) {
    const month = input.departureDate.slice(0, 7); // YYYY-MM
    const monthEntries = await fetchTpFlights(originIata, destinationIata, month, token, input.sortBy);
    const seen = new Set(entries.map((e) => `${e.airline}-${e.flight_number}-${e.departure_at}`));
    for (const entry of monthEntries) {
      if (!entry.departure_at) continue;
      const entryDate = new Date(`${entry.departure_at.slice(0, 10)}T00:00:00Z`).getTime();
      const dayDiff = Math.abs((entryDate - targetDate) / 86_400_000);
      if (!Number.isFinite(dayDiff) || dayDiff > DAY_WINDOW) continue;
      const key = `${entry.airline}-${entry.flight_number}-${entry.departure_at}`;
      if (!seen.has(key)) {
        entries.push(entry);
        seen.add(key);
      }
    }
  }
  // Sort: exact-date matches first (so the date the user actually picked
  // bubbles to the top), then closest-date adjacent.
  entries.sort((a, b) => {
    const aDate = new Date(`${a.departure_at.slice(0, 10)}T00:00:00Z`).getTime();
    const bDate = new Date(`${b.departure_at.slice(0, 10)}T00:00:00Z`).getTime();
    return Math.abs(aDate - targetDate) - Math.abs(bDate - targetDate);
  });

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
