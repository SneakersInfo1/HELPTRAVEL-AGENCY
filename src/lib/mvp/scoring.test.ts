import assert from "node:assert/strict";
import test from "node:test";

import { scoreDestinations } from "./scoring";
import type { DestinationProfile, DiscoveryPreferences } from "./types";

const baseDestination = (overrides: Partial<DestinationProfile>): DestinationProfile => ({
  id: "dest-1",
  slug: "malaga-spain",
  city: "Malaga",
  country: "Spain",
  visaForPL: true,
  avgTempByMonth: Array.from({ length: 12 }, () => 24),
  costIndex: 1,
  beachScore: 0.8,
  cityScore: 0.8,
  sightseeingScore: 0.8,
  nightlifeScore: 0.6,
  natureScore: 0.5,
  safetyScore: 0.8,
  accessScore: 0.8,
  typicalFlightHoursFromPL: 3,
  affiliateLinks: {
    flights: "https://example.com/flights",
    stays: "https://example.com/stays",
    attractions: "https://example.com/attractions",
  },
  ...overrides,
});

const prefs: DiscoveryPreferences = {
  budgetMaxPln: 2500,
  durationMinDays: 4,
  durationMaxDays: 5,
  travelers: 2,
  originCountry: "Poland",
  originCity: "Warszawa",
  destinationFocus: "malaga-spain",
  departureMonth: 6,
  temperaturePreference: "warm",
  visaPreference: "visa_free",
  maxTransfers: 1,
  mustTags: [],
  niceTags: ["beach", "sightseeing"],
  styleWeights: {
    beach: 0.9,
    city: 0.6,
    sightseeing: 0.8,
    nightlife: 0.3,
    nature: 0.3,
    food: 0.5,
  },
  confidence: 0.9,
};

test("scoreDestinations keeps focused visa-free destinations and ranks focus first", () => {
  const results = scoreDestinations(
    [
      baseDestination({ slug: "malaga-spain", city: "Malaga" }),
      baseDestination({ id: "dest-2", slug: "rome-italy", city: "Rome", country: "Italy", visaForPL: true }),
      baseDestination({ id: "dest-3", slug: "london-uk", city: "London", country: "United Kingdom", visaForPL: false }),
    ],
    prefs,
    5,
  );

  assert.ok(results.length >= 1);
  assert.equal(results[0].destination.slug, "malaga-spain");
  assert.ok(results.every((item) => item.destination.visaForPL));
});
