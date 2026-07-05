// Testy ścisłego dopasowania lotu do odzyskiwania po wygaśnięciu oferty (52099).
// Klucz: ten sam lot (te same rejsy/godziny) łapie ŚWIEŻY offerId; inny lot lub
// inne godziny NIE łapią (zero cichej podmiany w lejku płatności).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { DisplayLeg, DisplayOffer, FareOption } from "./display";
import { findMatchingFare, findMatchingOffer, offerSignature } from "./offer-match";

function seg(over: Partial<DisplayLeg["segments"][number]> = {}) {
  return {
    originCode: "KTW",
    destinationCode: "ALC",
    departureTime: "2026-08-22T06:00:00",
    arrivalTime: "2026-08-22T09:30:00",
    carrierName: "Ryanair",
    carrierCode: "FR",
    flightNumber: "1234",
    ...over,
  };
}

function leg(over: Partial<DisplayLeg> = {}): DisplayLeg {
  return {
    direction: "OUTBOUND",
    originCode: "KTW",
    destinationCode: "ALC",
    departureTime: "2026-08-22T06:00:00",
    arrivalTime: "2026-08-22T09:30:00",
    durationMinutes: 210,
    stops: 0,
    carriers: ["Ryanair"],
    carrierCode: "FR",
    segments: [seg()],
    ...over,
  };
}

function fare(over: Partial<FareOption> = {}): FareOption {
  return { offerId: "F", fareName: "Podstawowa", total: 500, currency: "PLN", hasCheckedBag: false, hasCarryOnBag: true, ...over };
}

function offer(over: Partial<DisplayOffer> = {}): DisplayOffer {
  return {
    offerId: "O",
    total: 500,
    currency: "PLN",
    legs: [leg()],
    maxDurationMinutes: 210,
    hasCheckedBag: false,
    hasCarryOnBag: true,
    fares: [fare()],
    ...over,
  };
}

test("findMatchingOffer: ten sam lot (te same rejsy) łapie świeży offerId", () => {
  const stale = offer({ offerId: "OLD" });
  const fresh = offer({ offerId: "FRESH", total: 540 }); // ten sam lot, inny offerId/cena
  const other = offer({ offerId: "OTHER", legs: [leg({ segments: [seg({ flightNumber: "9999" })] })] });
  const match = findMatchingOffer([other, fresh], stale);
  assert.equal(match?.offerId, "FRESH");
});

test("findMatchingOffer: inna godzina wylotu → BRAK dopasowania (null)", () => {
  const stale = offer();
  const later = offer({ legs: [leg({ segments: [seg({ departureTime: "2026-08-22T18:00:00" })] })] });
  assert.equal(findMatchingOffer([later], stale), null);
});

test("findMatchingOffer: inny numer rejsu → BRAK dopasowania", () => {
  const stale = offer();
  const diff = offer({ legs: [leg({ segments: [seg({ flightNumber: "0001" })] })] });
  assert.equal(findMatchingOffer([diff], stale), null);
});

test("findMatchingOffer: brak segmentów w target → null (nie zgadujemy)", () => {
  const stale = offer({ legs: [leg({ segments: [] })] });
  assert.equal(findMatchingOffer([offer()], stale), null);
});

test("offerSignature: kolejność odcinków nie ma znaczenia (sort po direction)", () => {
  const out = leg({ direction: "OUTBOUND" });
  const inb = leg({ direction: "INBOUND", segments: [seg({ originCode: "ALC", destinationCode: "KTW", flightNumber: "5678" })] });
  assert.equal(offerSignature(offer({ legs: [out, inb] })), offerSignature(offer({ legs: [inb, out] })));
});

test("findMatchingFare: dopasowanie po nazwie taryfy", () => {
  const o = offer({ fares: [fare({ offerId: "A", fareName: "Podstawowa" }), fare({ offerId: "B", fareName: "Z pełnym bagażem", hasCheckedBag: true })] });
  const f = findMatchingFare(o, { name: "Z pełnym bagażem", hasCarryOnBag: true, hasCheckedBag: true });
  assert.equal(f?.offerId, "B");
});

test("findMatchingFare: fallback po profilu bagażu, gdy brak nazwy", () => {
  const o = offer({ fares: [fare({ offerId: "A", hasCarryOnBag: true, hasCheckedBag: false }), fare({ offerId: "B", hasCarryOnBag: true, hasCheckedBag: true })] });
  const f = findMatchingFare(o, { name: null, hasCarryOnBag: true, hasCheckedBag: true });
  assert.equal(f?.offerId, "B");
});

test("findMatchingFare: brak taryfy o tym profilu → null", () => {
  const o = offer({ fares: [fare({ hasCarryOnBag: false, hasCheckedBag: false })] });
  assert.equal(findMatchingFare(o, { name: "Nieznana", hasCarryOnBag: true, hasCheckedBag: true }), null);
});
