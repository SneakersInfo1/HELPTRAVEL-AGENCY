// Mapa PackageSearchParams → FlightSearchInput (round-trip). CZYSTE.
// Punkt najwyższego ryzyka integracji (patrz incydent guests 2026-07-10): loty
// liczą pasażerów PŁASKO (adults/children/infants jako liczby), nie per-pokój.
//   • adults   = suma dorosłych ze wszystkich pokoi,
//   • infants  = dzieci < 2 lat (wg WIEKU z occupancies.children[]),
//   • children = dzieci ≥ 2 lat.
// Lotniska (IATA) muszą być już rozwiązane przez wołającego — destinationId→IATA
// i origin→WAW/WMI to I/O (airport-groups), nie należy do czystego mappera.
//
// STUB — implementacja przez TDD.

import type { FlightSearchInput } from "@/lib/flights/types";

import type { PackageSearchParams } from "../types";

export interface BuildFlightInput {
  originAirport: string; // IATA (3 litery)
  destinationAirport: string; // IATA
  dateFrom: string; // ISO
  dateTo: string; // ISO
  occupancies: PackageSearchParams["occupancies"];
  cabinClass: PackageSearchParams["cabinClass"];
}

/** Wiek graniczny niemowlęcia na locie: < 2 lata = infant. */
export const INFANT_MAX_AGE = 2;

const CABIN_MAP: Record<PackageSearchParams["cabinClass"], FlightSearchInput["cabinClass"]> = {
  economy: "ECONOMY",
  premium_economy: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST",
};

export function buildFlightSearchInput(input: BuildFlightInput): FlightSearchInput {
  const adults = input.occupancies.reduce((sum, o) => sum + o.adults, 0);
  const ages = input.occupancies.flatMap((o) => o.children);
  const infants = ages.filter((age) => age < INFANT_MAX_AGE).length;
  const children = ages.length - infants;

  return {
    legs: [
      { origin: input.originAirport, destination: input.destinationAirport, date: input.dateFrom, direction: "OUTBOUND" },
      { origin: input.destinationAirport, destination: input.originAirport, date: input.dateTo, direction: "INBOUND" },
    ],
    adults,
    children,
    infants,
    cabinClass: CABIN_MAP[input.cabinClass],
    currency: "PLN",
    country: "PL",
  };
}
