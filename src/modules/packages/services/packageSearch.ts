// packageSearch — orkiestracja hotele × loty → oferty pakietowe (§3.2).
// Hotel-first: JEDEN lot bazowy na cały listing; zamiana lotu (krok 2) = osobny
// pełny search na żądanie (nie tu). I/O WSTRZYKIWANE (SearchPackagesDeps) — dzięki
// temu orkiestracja jest testowalna bez żywego LiteAPI, a rdzeń obliczeniowy
// (bestFlight/pricing/assemble/pickCheapestRefundableRate) pozostaje odsprzęgnięty.

import { fromMinor } from "@/lib/money";
import type { DisplayLeg, DisplayOffer } from "@/lib/flights/display";
import type { FlightSearchInput } from "@/lib/flights/types";
import type { LiteApiRoomType } from "@/lib/liteapi";
import { localizeBoard } from "@/lib/liteapi/translations";
import {
  nightsBetween,
  pickCheapestRefundableRate,
  rateCancellationDeadline,
  rateCurrency,
  rateTotalMinor,
} from "@/lib/hotels/normalize";

import type {
  PackageFlightLeg,
  PackageFlightSummary,
  PackageSearchParams,
  PackageSearchResult,
} from "../types";
import { assemblePackageOffers, type PackageBaseFlight, type PackageHotelCandidate } from "./assembleOffers";
import { isDirectOffer, selectBaseFlight } from "./bestFlight";
import { buildFlightSearchInput } from "./flightSearchInput";
import { countAdults, pln } from "./packagePricing";

/** Meta hotelu z puli kierunku (nazwa przez istniejący translation layer — NIE tłumaczona maszynowo). */
export interface PackageHotelMeta {
  id: string;
  name: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
}

/** Wstrzykiwane I/O. Domyślne implementacje (produkcyjne) w packageSearch.deps.ts. */
export interface SearchPackagesDeps {
  /** Miasto „Skąd" → główny kod IATA (np. „Warszawa" → „WAW"). */
  resolveOriginAirport(city: string): string | null;
  /** Kierunek → główny kod IATA lotniska docelowego. */
  resolveDestinationAirport(destination: string): string | null;
  /** Pełny flight-search (jeden na listing) — zwraca znormalizowane oferty. */
  searchFlightOffers(input: FlightSearchInput): Promise<DisplayOffer[]>;
  /** Pula hoteli kierunku (bez rate'ów). */
  fetchHotelPool(args: { destination: string; limit: number }): Promise<PackageHotelMeta[]>;
  /** Rate'y per hotel (roomTypes) — do wyboru najtańszej ZWROTNEJ taryfy. */
  fetchHotelRates(args: {
    hotelIds: string[];
    checkin: string;
    checkout: string;
    occupancies: PackageSearchParams["occupancies"];
  }): Promise<Map<string, LiteApiRoomType[]>>;
}

const DEFAULT_HOTEL_LIMIT = 40;

function toLeg(l: DisplayLeg): PackageFlightLeg {
  return {
    fromCode: l.originCode,
    toCode: l.destinationCode,
    departISO: l.departureTime,
    arriveISO: l.arrivalTime,
    durationMinutes: l.durationMinutes,
    stops: l.stops,
  };
}

/** DisplayOffer → skrót lotu na kartę pakietu (pełny rozkład tam/powrót). */
function toFlightSummary(offer: DisplayOffer): PackageFlightSummary {
  const outboundLeg = offer.legs.find((l) => l.direction === "OUTBOUND") ?? offer.legs[0];
  const inboundLeg = offer.legs.find((l) => l.direction === "INBOUND");
  return {
    offerId: offer.offerId,
    direct: isDirectOffer(offer),
    carrierCode: outboundLeg?.carrierCode || undefined,
    carrierName: outboundLeg?.carriers[0] || undefined,
    outbound: outboundLeg ? toLeg(outboundLeg) : undefined,
    inbound: inboundLeg ? toLeg(inboundLeg) : undefined,
    baggageIncluded: { cabin: offer.hasCarryOnBag, checked: offer.hasCheckedBag },
  };
}

/** Meta + roomTypes → kandydat pakietowy (albo null: brak zwrotnej taryfy / nie-PLN). */
function toCandidate(
  meta: PackageHotelMeta,
  roomTypes: LiteApiRoomType[],
  nights: number,
): PackageHotelCandidate | null {
  const pick = pickCheapestRefundableRate(roomTypes);
  if (!pick) return null; // brak taryfy z darmową anulacją → hotel wypada (§3.4)
  const minor = rateTotalMinor(pick.rate);
  const currency = rateCurrency(pick.rate);
  if (minor === null || currency !== "PLN") return null; // MVP: wyłącznie PLN
  const board = pick.rate.boardName ? localizeBoard(pick.rate.boardName) : undefined;
  return {
    hotel: {
      hotelId: meta.id,
      name: meta.name,
      ...(meta.stars !== undefined ? { stars: meta.stars } : {}),
      ...(meta.rating !== undefined ? { rating: meta.rating } : {}),
      ...(meta.reviewCount !== undefined ? { reviewCount: meta.reviewCount } : {}),
      ...(board ? { boardName: board } : {}),
      ...(meta.thumbnailUrl ? { thumbnailUrl: meta.thumbnailUrl } : {}),
      freeCancellationUntil: rateCancellationDeadline(pick.rate) ?? "",
      hotelOfferId: pick.offerId,
      nights,
    },
    hotelNow: pln(fromMinor(minor)),
  };
}

/**
 * Wyszukuje oferty pakietowe. Zwraca null gdy nie ma bazowego lotu z ceną
 * (brak połączenia / same oferty bez ceny) — wołający pokazuje „brak lotów".
 */
export async function searchPackages(
  params: PackageSearchParams,
  deps: SearchPackagesDeps,
): Promise<PackageSearchResult | null> {
  const originAirport = deps.resolveOriginAirport(params.origin);
  const destinationAirport = deps.resolveDestinationAirport(params.destinationId);
  if (!originAirport || !destinationAirport) return null;

  // 1) JEDEN flight-search → lot bazowy (bezpośredni > cena > czas > godziny 7–21).
  const flightInput = buildFlightSearchInput({
    originAirport,
    destinationAirport,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    occupancies: params.occupancies,
    cabinClass: params.cabinClass,
  });
  const offers = await deps.searchFlightOffers(flightInput);
  const base = selectBaseFlight(offers);
  if (!base || base.total === null) return null;

  const baseFlight: PackageBaseFlight = { summary: toFlightSummary(base), price: pln(base.total) };

  // 2) Pula hoteli + rate'y → kandydaci z najtańszą ZWROTNĄ taryfą.
  const pool = await deps.fetchHotelPool({ destination: params.destinationId, limit: DEFAULT_HOTEL_LIMIT });
  const nights = nightsBetween(params.dateFrom, params.dateTo);
  const ratesByHotel =
    pool.length > 0
      ? await deps.fetchHotelRates({
          hotelIds: pool.map((h) => h.id),
          checkin: params.dateFrom,
          checkout: params.dateTo,
          occupancies: params.occupancies,
        })
      : new Map<string, LiteApiRoomType[]>();

  const candidates: PackageHotelCandidate[] = [];
  for (const meta of pool) {
    const cand = toCandidate(meta, ratesByHotel.get(meta.id) ?? [], nights);
    if (cand) candidates.push(cand);
  }

  // 3) Złożenie ofert (jeden lot bazowy, wycena per hotel, sort po cenie/os.).
  const packageOffers = assemblePackageOffers(candidates, baseFlight, countAdults(params.occupancies));

  return {
    params,
    baseFlight: baseFlight.summary,
    offers: packageOffers,
    pricedAt: new Date().toISOString(),
  };
}
