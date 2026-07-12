import assert from "node:assert/strict";
import { test } from "node:test";

import type { DisplayLeg, DisplayOffer } from "@/lib/flights/display";
import type { FlightSearchInput } from "@/lib/flights/types";
import type { LiteApiRoomType } from "@/lib/liteapi";

import type { PackageSearchParams } from "../types";
import { searchPackages, type PackageHotelMeta, type SearchPackagesDeps } from "./packageSearch";

// ── fixtures ──────────────────────────────────────────────────────────────────

function leg(direction: "OUTBOUND" | "INBOUND", stops = 0): DisplayLeg {
  return {
    direction,
    originCode: direction === "OUTBOUND" ? "WAW" : "BCN",
    destinationCode: direction === "OUTBOUND" ? "BCN" : "WAW",
    departureTime: "2026-08-01T09:00:00",
    arrivalTime: "2026-08-01T12:00:00",
    durationMinutes: 180,
    stops,
    carriers: ["LOT"],
    carrierCode: "LO",
    segments: [],
  };
}

function flightOffer(id: string, total: number | null, stops = 0): DisplayOffer {
  const legs = [leg("OUTBOUND", stops), leg("INBOUND", stops)];
  return {
    offerId: id,
    total,
    currency: "PLN",
    legs,
    maxDurationMinutes: 180,
    hasCheckedBag: false,
    hasCarryOnBag: true,
    fares: [],
  };
}

let seq = 0;
function roomType(price: number, refundable: boolean): LiteApiRoomType {
  seq += 1;
  return {
    offerId: `HOFF_${seq}`,
    supplier: "nuitee",
    rates: [
      {
        rateId: `HRATE_${seq}`,
        name: "Room",
        maxOccupancy: 2,
        boardName: "Room Only",
        retailRate: { total: [{ amount: price, currency: "PLN" }] },
        cancellationPolicies: refundable
          ? { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: "2026-07-30 04:00:00", amount: 0 }] }
          : { refundableTag: "NRFN" },
      },
    ],
  } as LiteApiRoomType;
}

const params: PackageSearchParams = {
  origin: "Warszawa",
  destinationId: "barcelona",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-04",
  occupancies: [{ adults: 2, children: [1, 5] }],
  cabinClass: "economy",
};

function makeDeps(over: Partial<SearchPackagesDeps> & { captureFlightInput?: (i: FlightSearchInput) => void } = {}): SearchPackagesDeps {
  const pool: PackageHotelMeta[] = [
    { id: "h1", name: "Hotel Uno", stars: 4 },
    { id: "h2", name: "Hotel Dos", stars: 3 },
    { id: "h3", name: "Hotel Tres", stars: 5 },
  ];
  const rates = new Map<string, LiteApiRoomType[]>([
    ["h1", [roomType(1600, true), roomType(1400, false)]], // najtańszy zwrotny 1600
    ["h2", [roomType(1200, false)]], // tylko bezzwrotny → wypada
    ["h3", [roomType(2000, true)]],
  ]);
  return {
    resolveOriginAirport: () => "WAW",
    resolveDestinationAirport: () => "BCN",
    searchFlightOffers: async (input) => {
      over.captureFlightInput?.(input);
      return [flightOffer("cheap-stop", 1500, 1), flightOffer("direct", 2198, 0)];
    },
    fetchHotelPool: async () => pool,
    fetchHotelRates: async () => rates,
    ...over,
  };
}

// ── testy ─────────────────────────────────────────────────────────────────────

test("składa oferty: lot bazowy = bezpośredni, hotele tylko ze zwrotną taryfą", async () => {
  const res = await searchPackages(params, makeDeps());
  assert.ok(res);
  assert.equal(res.baseFlight.offerId, "direct"); // bezpośredni bije tańszy z przesiadką
  assert.equal(res.baseFlight.direct, true);
  // h2 (tylko bezzwrotny) wypada; zostają h1 i h3, sort po cenie/os.
  assert.deepEqual(res.offers.map((o) => o.hotel.hotelId), ["h1", "h3"]);
});

test("wycena: total = hotel(zwrotny) + lot bazowy; cena/os. = ceil(total/adults)", async () => {
  const res = await searchPackages(params, makeDeps());
  const h1 = res!.offers[0];
  assert.deepEqual(h1.pricing.total, { amount: 3798, currency: "PLN" }); // 1600 + 2198
  assert.deepEqual(h1.pricing.pricePerPerson, { amount: 1899, currency: "PLN" }); // /2 dorosłych
  assert.equal(h1.flight.offerId, "direct");
});

test("mapowanie pasażerów end-to-end: 2 dorosłych, 1 infant (<2), 1 child (≥2)", async () => {
  let captured: FlightSearchInput | undefined;
  await searchPackages(params, makeDeps({ captureFlightInput: (i) => (captured = i) }));
  assert.equal(captured?.adults, 2);
  assert.equal(captured?.infants, 1); // wiek 1
  assert.equal(captured?.children, 1); // wiek 5
  assert.equal(captured?.legs[0].origin, "WAW");
  assert.equal(captured?.legs[0].destination, "BCN");
});

test("nierozwiązane lotnisko → null", async () => {
  const res = await searchPackages(params, makeDeps({ resolveDestinationAirport: () => null }));
  assert.equal(res, null);
});

test("brak lotów (pusta lista) → null", async () => {
  const res = await searchPackages(params, makeDeps({ searchFlightOffers: async () => [] }));
  assert.equal(res, null);
});

test("wszystkie hotele bezzwrotne → oferty puste, ale lot bazowy jest", async () => {
  const rates = new Map<string, LiteApiRoomType[]>([
    ["h1", [roomType(1600, false)]],
    ["h2", [roomType(1200, false)]],
    ["h3", [roomType(2000, false)]],
  ]);
  const res = await searchPackages(params, makeDeps({ fetchHotelRates: async () => rates }));
  assert.ok(res);
  assert.equal(res.offers.length, 0);
  assert.equal(res.baseFlight.offerId, "direct");
});
