// Klient Travelpayouts Flight Data API (Aviasales).
// UWAGA: zwraca CACHE'OWANE ceny (nie live booking). Klik prowadzi do Aviasales,
// gdzie user widzi aktualne ceny i kupuje. Pasuje do modelu meta-search.

import { getAffiliateConfig } from "./affiliate-config";
import {
  getDestinationAirports,
  getOriginAirports,
  type AirportCandidate,
} from "./airport-groups";
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
  // The cache holds thousands of dated pairs per route — pull a wide window
  // so the strict same-day/same-return filter below has enough material.
  url.searchParams.set("limit", "1000");
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
    // Hard date guarantee: only keep pairs where BOTH legs match exactly.
    // Previous behaviour (±7 days, ignoring returnDate) is what caused the
    // "wybrałem 1.06–12.06, pokazuje powrót 10.06" bug. With a 1000-row
    // sample window above we still get plenty of options for popular dates
    // without ever silently swapping the user's dates.
    return body.data.filter(
      (e) => e.depart_date === departureDate && e.return_date === returnDate,
    );
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
  // TP /v3/prices_for_dates accepts up to 1000 rows. Bumped from 30 because
  // the month fallback was running out of headroom after the strict same-day
  // filter — 30 raw rows often meant ≤3 matching the user's date. With 1000
  // we keep the same strict filter but stop reporting "brak ofert" on
  // popular but mid-volume routes (Warszawa→Lizbona, Wrocław→Barcelona).
  url.searchParams.set("limit", "1000");
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

// Nearby-airport fanout config (Sesja C2). Once the primary route returns
// enough hits we stop; otherwise we walk the alternatives in distance order
// until we either fill `MIN_OFFERS_TARGET` rows or hit `MAX_FANOUT_CALLS`.
// The cap protects us from blowing the API quota when the user picks an
// aggregated metro pair (e.g. WAW→LON expands to 5+ destinations).
//
// Targets bumped after the inventory-bump pass: now that `limit=1000` on
// each TP call gives us ~30× more raw rows per pair, we want to walk a
// couple more alts before quitting (10 hits is the sweet spot — fills the
// "Show more" UI without overshooting useful results) and we allow up to
// 8 pair attempts before hitting the safety cap.
const MIN_OFFERS_TARGET = 10;
const MAX_FANOUT_CALLS = 8;

type FanoutPair = { origin: AirportCandidate; destination: AirportCandidate };

function makeOfferKey(entry: TpFlightEntry): string {
  return `${entry.airline}-${entry.flight_number}-${entry.departure_at}`;
}

function makeRtKey(entry: TpRoundTripEntry, idx: number): string {
  // Round-trip rows don't carry flight numbers — fall back to gate + dates
  // (idx is appended only as a last-ditch tiebreaker so two identical-looking
  // rows from different aggregators don't collapse to one).
  return `${entry.gate ?? "x"}-${entry.depart_date}-${entry.return_date}-${entry.value}-${idx}`;
}

/**
 * Build the ordered pair plan: primary→primary first, then expand the cheaper
 * dimensions first (primary→alt_dest, alt_origin→primary), then full
 * cross-product. Same shape used for both one-way and round-trip flows.
 */
function buildFanoutPlan(
  origins: AirportCandidate[],
  destinations: AirportCandidate[],
): FanoutPair[] {
  if (origins.length === 0 || destinations.length === 0) return [];
  const primaryOrigin = origins[0];
  const primaryDestination = destinations[0];
  const altOrigins = origins.slice(1);
  const altDestinations = destinations.slice(1);

  const plan: FanoutPair[] = [{ origin: primaryOrigin, destination: primaryDestination }];
  for (const dest of altDestinations) plan.push({ origin: primaryOrigin, destination: dest });
  for (const orig of altOrigins) plan.push({ origin: orig, destination: primaryDestination });
  for (const orig of altOrigins) {
    for (const dest of altDestinations) plan.push({ origin: orig, destination: dest });
  }
  return plan;
}

export async function searchTravelpayoutsFlights(
  input: TpFlightSearchInput,
): Promise<FlightSearchResponse> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN?.trim();
  if (!token) {
    return emptyResponse(input, "Brak TRAVELPAYOUTS_API_TOKEN.");
  }

  const originCandidates = getOriginAirports(input.origin);
  const destinationCandidates = getDestinationAirports(input.destination);
  if (originCandidates.length === 0 || destinationCandidates.length === 0) {
    return emptyResponse(input, "Nie udalo się ustalic kodu lotniska (IATA).");
  }

  const plan = buildFanoutPlan(originCandidates, destinationCandidates);
  const { travelpayoutsMarker } = getAffiliateConfig();
  const usedAlternativeOrigins = new Set<string>();
  const usedAlternativeDestinations = new Set<string>();

  // ---- Round-trip path (Sesja C1 FIX 2) --------------------------------
  // Same fanout, but each pair queries /v3/get_latest_prices?one_way=false.
  // We try the primary first; if it has paired itineraries, we walk
  // alternatives only when below MIN_OFFERS_TARGET, same as one-way.
  if (input.returnDate) {
    const rtAggregated: Array<{ entry: TpRoundTripEntry; pair: FanoutPair; idx: number }> = [];
    const rtSeen = new Set<string>();
    let rtCalls = 0;

    for (const pair of plan) {
      if (rtCalls >= MAX_FANOUT_CALLS) break;
      if (rtAggregated.length >= MIN_OFFERS_TARGET && rtCalls > 0) break;
      rtCalls += 1;
      const rtEntries = await fetchTpRoundTrip(
        pair.origin.iata,
        pair.destination.iata,
        input.departureDate,
        input.returnDate,
        token,
      );
      if (rtEntries.length === 0) continue;
      for (let i = 0; i < rtEntries.length; i += 1) {
        const entry = rtEntries[i];
        const key = makeRtKey(entry, rtAggregated.length);
        if (rtSeen.has(key)) continue;
        rtSeen.add(key);
        rtAggregated.push({ entry, pair, idx: rtAggregated.length });
      }
      if (pair.origin.alternative) usedAlternativeOrigins.add(pair.origin.iata);
      if (pair.destination.alternative) usedAlternativeDestinations.add(pair.destination.iata);
    }

    if (rtAggregated.length > 0) {
      const offers: NormalizedFlightOffer[] = rtAggregated.map(({ entry, pair, idx }) => {
        const totalMin = entry.duration ?? 0;
        // The endpoint reports round-trip totals; halve as a per-leg estimate.
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
          // No per-itinerary deeplink from this endpoint — round-trip URL
          // is built by the panel from the search context.
          bookingUrl: undefined,
          return_departure_time: entry.return_date,
          return_arrival_time: legMin > 0
            ? new Date(new Date(entry.return_date).getTime() + legMin * 60_000).toISOString()
            : entry.return_date,
          return_duration: outDuration.text,
          return_duration_minutes: outDuration.minutes,
          return_number_of_stops: halfStops,
          isAlternativeOrigin: pair.origin.alternative,
          isAlternativeDestination: pair.destination.alternative,
          alternativeOriginHint: pair.origin.alternative ? pair.origin.hint : undefined,
          alternativeDestinationHint: pair.destination.alternative ? pair.destination.hint : undefined,
        } satisfies NormalizedFlightOffer;
      });

      // Belt-and-suspenders date guard. The cache filter above already
      // enforces depart_date === departureDate AND return_date === returnDate,
      // but we re-check here against the normalized offer fields so any
      // future code path that bypasses the filter still cannot leak a
      // wrong-date offer to the UI.
      const safeOffers = offers.filter(
        (o) =>
          o.departure_time.slice(0, 10) === input.departureDate &&
          (!o.return_departure_time || o.return_departure_time.slice(0, 10) === input.returnDate),
      );
      if (safeOffers.length > 0) {
        const response: FlightSearchResponse = {
          origin: input.origin,
          destination: input.destination,
          departureDate: input.departureDate,
          passengers: input.passengers,
          cabinClass: input.cabinClass,
          sortBy: input.sortBy,
          offers: sortOffers(safeOffers, input.sortBy),
          fetchedAt: new Date().toISOString(),
          source: "travelpayouts",
        };
        if (usedAlternativeOrigins.size > 0 || usedAlternativeDestinations.size > 0) {
          response.usedAlternativeAirports = {
            origins: [...usedAlternativeOrigins],
            destinations: [...usedAlternativeDestinations],
          };
        }
        return response;
      }
    }
    // else fall through to the one-way path with the same fanout plan.
  }

  // ---- One-way path with strict same-day filter ------------------------
  // The product invariant is non-negotiable: only flights departing on the
  // user's chosen YYYY-MM-DD are shown. Cards already render the date, and
  // we'd rather return an empty state than mix a 26 May ticket into a 25
  // May query. The fanout adds new airport pairs, but the day-filter still
  // applies to every fetched row.
  const aggregated: Array<{ entry: TpFlightEntry; pair: FanoutPair }> = [];
  const seen = new Set<string>();
  let calls = 0;

  for (const pair of plan) {
    if (calls >= MAX_FANOUT_CALLS) break;
    if (aggregated.length >= MIN_OFFERS_TARGET && calls > 0) break;
    calls += 1;

    // (a) Konkretny dzień.
    const dayEntries = await fetchTpFlights(
      pair.origin.iata,
      pair.destination.iata,
      input.departureDate,
      token,
      input.sortBy,
    );
    const sameDay = dayEntries.filter(
      (e) => e.departure_at && e.departure_at.slice(0, 10) === input.departureDate,
    );

    // (b) Doładuj z miesiąca jeżeli mało wyników, ale FILTRUJ ostro do
    // wybranej daty. To samo zachowanie jak przed fanout-em.
    let pairEntries = sameDay;
    if (sameDay.length < 8) {
      const month = input.departureDate.slice(0, 7);
      const monthEntries = await fetchTpFlights(
        pair.origin.iata,
        pair.destination.iata,
        month,
        token,
        input.sortBy,
      );
      const pairSeen = new Set(sameDay.map(makeOfferKey));
      for (const entry of monthEntries) {
        if (!entry.departure_at) continue;
        if (entry.departure_at.slice(0, 10) !== input.departureDate) continue;
        const key = makeOfferKey(entry);
        if (pairSeen.has(key)) continue;
        pairSeen.add(key);
        pairEntries = pairEntries.concat(entry);
      }
    }

    if (pairEntries.length === 0) continue;

    let addedFromPair = false;
    for (const entry of pairEntries) {
      const key = makeOfferKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      aggregated.push({ entry, pair });
      addedFromPair = true;
    }
    if (addedFromPair) {
      if (pair.origin.alternative) usedAlternativeOrigins.add(pair.origin.iata);
      if (pair.destination.alternative) usedAlternativeDestinations.add(pair.destination.iata);
    }
  }

  if (aggregated.length === 0) {
    return emptyResponse(input, "Brak ofert lotów dla tej trasy.");
  }

  const offers: NormalizedFlightOffer[] = aggregated.map(({ entry, pair }) => {
    // Sesja C pkt 7: use `duration_to` (outbound flight time) NOT `duration`.
    // Travelpayouts v3 `prices_for_dates` returns three fields:
    //   • duration_to — outbound flight time, minutes (what we want)
    //   • duration_back — return flight time, minutes (0 for one-way queries)
    //   • duration — aggregated "trip duration" that empirically includes
    //     overnight layover wait-time and is ~6× larger than the actual
    //     fly-time (e.g. 1515 min for a WAW-BER 2-stop where duration_to=245).
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
      isAlternativeOrigin: pair.origin.alternative,
      isAlternativeDestination: pair.destination.alternative,
      alternativeOriginHint: pair.origin.alternative ? pair.origin.hint : undefined,
      alternativeDestinationHint: pair.destination.alternative ? pair.destination.hint : undefined,
    } satisfies NormalizedFlightOffer;
  });

  // Final date guard for the one-way path. The per-pair filter inside the
  // fanout loop already drops any non-matching depart_at, but we re-check
  // the mapped offers here as defense in depth: if TP ever returns a row
  // with a malformed departure_at that we didn't filter, the UI still gets
  // a 100% clean list. Honest UX > fake inventory.
  const safeOffers = offers.filter(
    (o) => o.departure_time.slice(0, 10) === input.departureDate,
  );
  if (safeOffers.length === 0) {
    return emptyResponse(input, "Brak ofert lotów dla tej trasy.");
  }
  const response: FlightSearchResponse = {
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    passengers: input.passengers,
    cabinClass: input.cabinClass,
    sortBy: input.sortBy,
    offers: sortOffers(safeOffers, input.sortBy),
    fetchedAt: new Date().toISOString(),
    source: "travelpayouts",
  };
  if (usedAlternativeOrigins.size > 0 || usedAlternativeDestinations.size > 0) {
    response.usedAlternativeAirports = {
      origins: [...usedAlternativeOrigins],
      destinations: [...usedAlternativeDestinations],
    };
  }
  return response;
}
