import assert from "node:assert/strict";
import test from "node:test";

import { parseDiscoveryInput } from "./parser";

test("parseDiscoveryInput extracts budget, duration and visa preference", () => {
  const parsed = parseDiscoveryInput({
    query: "Chcę polecieć do ciepłego kraju do 2000 zł na 5 dni, bez wizy, z Polski, plażą i zwiedzanie.",
    originCity: "Warszawa",
    travelers: 2,
  });

  assert.equal(parsed.budgetMaxPln, 2000);
  assert.equal(parsed.durationMinDays, 5);
  assert.equal(parsed.durationMaxDays, 5);
  assert.equal(parsed.visaPreference, "visa_free");
  assert.equal(parsed.temperaturePreference, "warm");
  assert.equal(parsed.originCity, "Warszawa");
  assert.equal(parsed.wantsBeachSightseeingMix, true);
});

test("parseDiscoveryInput understands intent for easy logistics, short flight and family mood", () => {
  const parsed = parseDiscoveryInput({
    query: "Chcę rodzinny city break 4-5 dni z Gdańska, z prostą logistyką, krótkim lotem i dobrą pogodą.",
    travelers: 3,
  });

  assert.equal(parsed.durationMinDays, 4);
  assert.equal(parsed.durationMaxDays, 5);
  assert.equal(parsed.originCity, "Gdańsk");
  assert.equal(parsed.tripMood, "family");
  assert.equal(parsed.logisticsPreference, "easy");
  assert.equal(parsed.wantsShortFlight, true);
  assert.equal(parsed.wantsWeatherReliability, true);
});

test("parseDiscoveryInput supports english travel briefs and keeps foodie + romantic intent", () => {
  const parsed = parseDiscoveryInput({
    query: "I want a romantic city break with great food, beach and sightseeing, a short flight and budget under 2500 PLN.",
    travelers: 2,
  });

  assert.equal(parsed.budgetMaxPln, 2500);
  assert.equal(parsed.tripMood, "romantic");
  assert.equal(parsed.wantsShortFlight, true);
  assert.equal(parsed.wantsBeachSightseeingMix, true);
  assert.ok(parsed.styleWeights.food >= 0.8);
  assert.ok(parsed.styleWeights.beach >= 0.9);
  assert.ok(parsed.styleWeights.sightseeing >= 0.9);
});
