// Sesja C pkt 7 — regression tests for duration normalization. The
// Travelpayouts v3 `prices_for_dates` endpoint returns three duration fields;
// we must prefer `duration_to` over `duration` (which conflates layover idle
// time and produces ~6× inflated values).
//
// We test the helper indirectly via fetch stubs: the adapter is otherwise
// network-bound so this is the cheapest way to lock the contract.

import { test } from "node:test";
import assert from "node:assert/strict";

import { searchTravelpayoutsFlights } from "./travelpayouts-flights";

interface MockEntry {
  origin: string;
  destination: string;
  origin_airport: string;
  destination_airport: string;
  price: number;
  airline: string;
  flight_number: number;
  departure_at: string;
  transfers: number;
  duration: number;
  duration_to: number;
  duration_back?: number;
  link: string;
}

function stubFetch(entries: MockEntry[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: true, data: entries }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const sampleEntry = (overrides: Partial<MockEntry> = {}): MockEntry => ({
  origin: "WAW",
  destination: "BER",
  origin_airport: "WAW",
  destination_airport: "BER",
  price: 261,
  airline: "W6",
  flight_number: 1423,
  departure_at: "2026-05-21T06:30:00+02:00",
  transfers: 2,
  duration: 1515, // poisoned aggregate value (~25h)
  duration_to: 245, // real outbound time (4h5m)
  duration_back: 0,
  link: "/search/WAW2105BER1",
  ...overrides,
});

test("adapter uses duration_to (outbound), not the inflated duration field", async () => {
  process.env.TRAVELPAYOUTS_API_TOKEN = "stub";
  const restore = stubFetch([sampleEntry()]);
  try {
    const result = await searchTravelpayoutsFlights({
      origin: "Warszawa",
      destination: "Berlin",
      departureDate: "2026-05-21",
      passengers: 1,
      cabinClass: "economy",
      sortBy: "cheap",
    });
    assert.equal(result.offers.length, 1);
    const offer = result.offers[0];
    assert.equal(
      offer.total_duration_minutes,
      245,
      "must use duration_to (245 min outbound), not duration (1515 min aggregate)",
    );
    assert.match(offer.total_duration, /4h\s*05m/);
  } finally {
    restore();
  }
});

test("adapter price stays per-person in PLN, not multiplied by passengers", async () => {
  process.env.TRAVELPAYOUTS_API_TOKEN = "stub";
  const restore = stubFetch([sampleEntry({ price: 261 })]);
  try {
    const result = await searchTravelpayoutsFlights({
      origin: "Warszawa",
      destination: "Berlin",
      departureDate: "2026-05-21",
      passengers: 2,
      cabinClass: "economy",
      sortBy: "cheap",
    });
    const offer = result.offers[0];
    assert.equal(offer.total_amount, 261, "price must be per-person, untouched");
    assert.equal(offer.currency, "PLN");
  } finally {
    restore();
  }
});

test("falls back to duration when duration_to is missing", async () => {
  process.env.TRAVELPAYOUTS_API_TOKEN = "stub";
  const restore = stubFetch([sampleEntry({ duration_to: undefined as unknown as number })]);
  try {
    const result = await searchTravelpayoutsFlights({
      origin: "Warszawa",
      destination: "Berlin",
      departureDate: "2026-05-21",
      passengers: 1,
      cabinClass: "economy",
      sortBy: "cheap",
    });
    assert.equal(result.offers[0].total_duration_minutes, 1515);
  } finally {
    restore();
  }
});
