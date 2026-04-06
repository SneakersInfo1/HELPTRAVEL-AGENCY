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
    cars: "https://example.com/cars",
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
  logisticsPreference: "any",
  tripMood: "any",
  wantsShortFlight: false,
  wantsWeatherReliability: false,
  wantsBeachSightseeingMix: false,
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

test("scoreDestinations boosts easy logistics and short flights when the brief asks for them", () => {
  const results = scoreDestinations(
    [
      baseDestination({
        slug: "budapest-hungary",
        city: "Budapest",
        accessScore: 0.92,
        typicalFlightHoursFromPL: 1.5,
        beachScore: 0.2,
        cityScore: 0.82,
        sightseeingScore: 0.78,
      }),
      baseDestination({
        id: "dest-2",
        slug: "marrakesh-morocco",
        city: "Marrakesh",
        country: "Morocco",
        accessScore: 0.58,
        typicalFlightHoursFromPL: 5.4,
        beachScore: 0.15,
        cityScore: 0.76,
        sightseeingScore: 0.8,
      }),
    ],
    {
      ...prefs,
      destinationFocus: undefined,
      tripMood: "family",
      logisticsPreference: "easy",
      wantsShortFlight: true,
      wantsWeatherReliability: true,
      niceTags: ["city", "family"],
    },
    5,
  );

  assert.equal(results[0]?.destination.slug, "budapest-hungary");
  assert.ok(results[0]?.breakdown.logisticsFit > results[1]?.breakdown.logisticsFit);
  assert.ok((results[0]?.score ?? 0) > (results[1]?.score ?? 0));
  assert.ok((results[1]?.tradeoffs.length ?? 0) > 0);
});

test("scoreDestinations surfaces mood fit and value fit for romantic warm breaks", () => {
  const results = scoreDestinations(
    [
      baseDestination({
        slug: "malaga-spain",
        city: "Malaga",
        beachScore: 0.86,
        cityScore: 0.78,
        sightseeingScore: 0.75,
        safetyScore: 0.84,
        accessScore: 0.82,
      }),
      baseDestination({
        id: "dest-2",
        slug: "berlin-germany",
        city: "Berlin",
        country: "Germany",
        beachScore: 0.1,
        cityScore: 0.86,
        sightseeingScore: 0.82,
        nightlifeScore: 0.78,
        safetyScore: 0.72,
        accessScore: 0.84,
      }),
    ],
    {
      ...prefs,
      destinationFocus: undefined,
      tripMood: "romantic",
      wantsBeachSightseeingMix: true,
      wantsWeatherReliability: true,
      niceTags: ["beach", "romantic", "beach_and_sightseeing"],
    },
    5,
  );

  assert.equal(results[0]?.destination.slug, "malaga-spain");
  assert.ok(results[0]?.breakdown.moodFit >= 0.7);
  assert.ok(results[0]?.breakdown.valueFit >= 0.6);
  assert.ok((results[0]?.score ?? 0) > (results[1]?.score ?? 0));
});
