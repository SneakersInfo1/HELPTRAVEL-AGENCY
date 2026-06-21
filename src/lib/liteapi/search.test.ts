// FAZA 2 — wybór placeId z /data/places. Realny problem (zmierzony na prod):
// textQuery "Sharm El Sheikh" zwraca i lokalność, i LOTNISKO ("Sharm El Sheikh
// International Airport") — wybranie lotniska dałoby pustą/złą pulę hoteli.
// pickPlaceId musi preferować lokalność i unikać lotniska.

import assert from "node:assert/strict";
import { test } from "node:test";

import { pickPlaceId } from "./search";

test("pusta lista → null", () => {
  assert.equal(pickPlaceId([]), null);
});

test("preferuje lokalność nad lotniskiem (realny kształt Sharm)", () => {
  const places = [
    { placeId: "loc", types: ["locality", "political", "geocode"] },
    { placeId: "airport", types: ["airport", "establishment", "point_of_interest"] },
  ];
  assert.equal(pickPlaceId(places), "loc");
});

test("kolejność bez znaczenia — lokalność wygrywa, nawet gdy lotnisko pierwsze", () => {
  const places = [
    { placeId: "airport", types: ["international_airport", "airport"] },
    { placeId: "loc", types: ["administrative_area_level_2", "political"] },
  ];
  assert.equal(pickPlaceId(places), "loc");
});

test("brak lokalności → pierwszy nie-lotniskowy", () => {
  const places = [
    { placeId: "airport", types: ["airport"] },
    { placeId: "poi", types: ["point_of_interest", "establishment"] },
  ];
  assert.equal(pickPlaceId(places), "poi");
});

test("same lotniska → pierwszy (lepsze to niż null)", () => {
  const places = [
    { placeId: "a1", types: ["airport"] },
    { placeId: "a2", types: ["international_airport"] },
  ];
  assert.equal(pickPlaceId(places), "a1");
});

test("brak pola types → traktowane jak nie-lotnisko, pierwszy wygrywa", () => {
  const places = [{ placeId: "x" }, { placeId: "y" }];
  assert.equal(pickPlaceId(places), "x");
});
