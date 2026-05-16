import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  nearestFlightableAirport,
  resolveAirportFromTPDirectory,
} from "./tp-airport-directory";

const CACHE_ROOT = path.resolve(process.cwd(), "data", ".cache");
const REQUIRED_CACHE_FILES = ["tp-cities.json", "tp-airports.json"];

function ensureTravelpayoutsDirectoryCache() {
  const missing = REQUIRED_CACHE_FILES.some((file) => !existsSync(path.join(CACHE_ROOT, file)));
  if (!missing) return;

  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["tsx", "scripts/download-tp-airports.ts"], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

ensureTravelpayoutsDirectoryCache();

test("resolveAirportFromTPDirectory resolves Madrid in Spain to MAD", async () => {
  const result = await resolveAirportFromTPDirectory("Madrid", "ES");
  assert.equal(result?.iata, "MAD");
  assert.equal(result?.source, "tp-city-exact");
});

test("resolveAirportFromTPDirectory rejects Bergen when country is Germany", async () => {
  const result = await resolveAirportFromTPDirectory("Bergen", "DE");
  assert.equal(result, null);
});

test("resolveAirportFromTPDirectory rejects Halifax GB instead of leaking Canada's YHZ", async () => {
  const result = await resolveAirportFromTPDirectory("Halifax", "GB");
  assert.equal(result, null);
});

test("resolveAirportFromTPDirectory resolves Polish city names through CITY_PL", async () => {
  const result = await resolveAirportFromTPDirectory("Lizbona", "PT");
  assert.equal(result?.iata, "LIS");
});

test("resolveAirportFromTPDirectory resolves canonical Lisbon to LIS", async () => {
  const result = await resolveAirportFromTPDirectory("Lisbon", "PT");
  assert.equal(result?.iata, "LIS");
});

test("resolveAirportFromTPDirectory resolves Porto to OPO", async () => {
  const result = await resolveAirportFromTPDirectory("Porto", "PT");
  assert.equal(result?.iata, "OPO");
});

test("resolveAirportFromTPDirectory rejects exact city names in the wrong country", async () => {
  const result = await resolveAirportFromTPDirectory("Madrid", "PT");
  assert.equal(result, null);
});

test("nearestFlightableAirport resolves Aalsmeer-area coordinates to AMS", async () => {
  const result = await nearestFlightableAirport(52.3676, 4.9041, "NL", 100);
  assert.equal(result?.iata, "AMS");
  assert.equal(result?.source, "tp-geo-nearest");
});

test("nearestFlightableAirport respects the configured radius", async () => {
  const result = await nearestFlightableAirport(52.3676, 4.9041, "NL", 0);
  assert.equal(result, null);
});

test("nearestFlightableAirport respects country constraints", async () => {
  const result = await nearestFlightableAirport(35.0, 140.0, "PL", 100);
  assert.equal(result, null);
});
