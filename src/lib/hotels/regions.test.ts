// Zadanie 2 — testy dopasowania regionów i przycinania haversine.

import assert from "node:assert/strict";
import { test } from "node:test";

import { REGIONS } from "../../../data/regions";
import { foldRegionText, getRegionById, isInRegion, matchRegions } from "./regions";

test("regions: słownik ma unikalne id i komplet danych do wyszukiwania", () => {
  const ids = new Set(REGIONS.map((r) => r.id));
  assert.equal(ids.size, REGIONS.length);
  for (const r of REGIONS) {
    assert.ok(r.placeId.startsWith("ChIJ"), `${r.id}: placeId`);
    assert.ok(r.filterPoints.length >= 1, `${r.id}: filterPoints`);
    assert.ok(r.airports.length >= 1, `${r.id}: airports`);
  }
});

test("matchRegions: polska nazwa, alias EN i brak diakrytyków", () => {
  assert.equal(matchRegions("Majorka")[0]?.id, "majorka");
  assert.equal(matchRegions("mallorca")[0]?.id, "majorka");
  assert.equal(matchRegions("majorka")[0]?.id, "majorka");
  assert.equal(matchRegions("TENERYFA")[0]?.id, "teneryfa");
  assert.equal(matchRegions("gozo")[0]?.id, "gozo");
  assert.equal(matchRegions("santoryn")[0]?.id, "santoryn");
  assert.equal(matchRegions("kreta")[0]?.id, "kreta");
});

test("matchRegions: archipelag podpowiada poszczególne wyspy", () => {
  const kanary = matchRegions("kanary");
  assert.ok(kanary.length >= 4);
  assert.deepEqual(
    kanary.map((r) => r.id).sort(),
    ["fuerteventura", "gran-canaria", "lanzarote", "teneryfa"],
  );
  const baleary = matchRegions("baleary", 8).map((r) => r.id);
  assert.ok(baleary.includes("majorka") && baleary.includes("ibiza"));
});

test("matchRegions: krótkie/nietrafione zapytania nie zwracają nic", () => {
  assert.equal(matchRegions("m").length, 0);
  assert.equal(matchRegions("barcelona").length, 0);
  assert.equal(matchRegions("warszawa").length, 0);
});

test("getRegionById: slug z URL, odporny na wielkość liter", () => {
  assert.equal(getRegionById("majorka")?.namePl, "Majorka");
  assert.equal(getRegionById("MAJORKA")?.namePl, "Majorka");
  assert.equal(getRegionById("nope"), null);
});

test("isInRegion: Palma zostaje na Majorce, Barcelona odpada; brak współrzędnych zostaje", () => {
  const majorka = getRegionById("majorka")!;
  assert.ok(isInRegion(majorka, { latitude: 39.5696, longitude: 2.6502 })); // Palma
  assert.ok(!isInRegion(majorka, { latitude: 41.3874, longitude: 2.1686 })); // Barcelona
  assert.ok(isInRegion(majorka, { latitude: null, longitude: null }));
});

test("isInRegion: Gozo nie łapie hoteli z północnej Malty (zmierzony przeciek placeId)", () => {
  const gozo = getRegionById("gozo")!;
  assert.ok(isInRegion(gozo, { latitude: 36.044, longitude: 14.24 })); // Victoria (Gozo)
  assert.ok(!isInRegion(gozo, { latitude: 35.949, longitude: 14.402 })); // St Paul's Bay (Malta)
  const malta = getRegionById("malta")!;
  assert.ok(isInRegion(malta, { latitude: 35.949, longitude: 14.402 }));
  assert.ok(!isInRegion(malta, { latitude: 36.044, longitude: 14.24 })); // Victoria zostaje na Gozo
});

test("foldRegionText: diakrytyki i spacje", () => {
  assert.equal(foldRegionText("  Wyspy   Kanaryjskie "), "wyspy kanaryjskie");
  assert.equal(foldRegionText("Łeba"), "leba");
});
