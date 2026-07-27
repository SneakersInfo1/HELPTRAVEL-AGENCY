// Filtrowanie globalnych podpowiedzi. Wszystkie próbki to REALNE odpowiedzi
// /data/places zebrane sondą 2026-07-26 — nie wymyślone kształty.

import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyPlace, toPlaceSuggestions } from "./places-suggest";

test("miasto przechodzi i niesie kraj z formattedAddress", () => {
  const s = classifyPlace({
    placeId: "ChIJ82ENKDJgHTERIEjiXbIAAQE",
    displayName: "Bangkok",
    formattedAddress: "Thailand",
    types: ["geocode", "locality", "political"],
  });
  assert.deepEqual(s, {
    placeId: "ChIJ82ENKDJgHTERIEjiXbIAAQE",
    name: "Bangkok",
    countryLabel: "Thailand",
    kind: "city",
  });
});

test("kraj przechodzi jako kind=country", () => {
  const s = classifyPlace({
    placeId: "ChIJsU1CR_eNTTARAuhXB4gs154",
    displayName: "Tajlandia",
    formattedAddress: "",
    types: ["political", "geocode", "country"],
  });
  assert.equal(s?.kind, "country");
  assert.equal(s?.name, "Tajlandia");
});

test("region/wyspa przechodzi", () => {
  const s = classifyPlace({
    placeId: "ChIJT1JixOIxUDARIbo9BoWayuk",
    displayName: "Phuket",
    formattedAddress: "Thailand",
    types: ["geocode", "political", "administrative_area_level_1"],
  });
  assert.equal(s?.kind, "region");
});

// To jest sedno filtra: bez niego lista wyglądała jak wyniki Google Maps.
test("POI, lokale i sklepy NIE przechodzą", () => {
  const junk = [
    { placeId: "1", displayName: "The Bangkok Lounge", formattedAddress: "King Street, Charleston, SC, USA", types: ["point_of_interest", "establishment", "night_club", "karaoke", "bar"] },
    { placeId: "2", displayName: "Bangkok Nail Spa LLC", formattedAddress: "Shucker Circle, Mount Pleasant, SC, USA", types: ["establishment", "nail_salon", "service", "beauty_salon", "point_of_interest"] },
    { placeId: "3", displayName: "VIETNAMESE FAITH & GRACE BAPTIST CHURCH", formattedAddress: "USA", types: ["association_or_organization", "establishment"] },
    { placeId: "4", displayName: "Hurghada Golden Beach Hotel", formattedAddress: "Egypt", types: ["establishment", "hotel"] },
  ];
  for (const j of junk) {
    assert.equal(classifyPlace(j), null, `nie powinno przejść: ${j.displayName}`);
  }
});

test("lotniska NIE przechodzą — użytkownik wybiera miasto, IATA dokłada formularz", () => {
  assert.equal(
    classifyPlace({
      placeId: "5",
      displayName: "Phuket International Airport (HKT)",
      formattedAddress: "Thailand",
      types: ["airport", "point_of_interest"],
    }),
    null,
  );
  // Także wtedy, gdy Google otaguje lotnisko jako transportation_service.
  assert.equal(
    classifyPlace({
      placeId: "6",
      displayName: "Barcelona Airport (BCN)",
      formattedAddress: "Spain",
      types: ["transportation_service", "international_airport"],
    }),
    null,
  );
});

test("miejsce bez nazwy odpada zamiast renderować pusty wiersz", () => {
  assert.equal(classifyPlace({ placeId: "7", types: ["locality"] }), null);
  assert.equal(classifyPlace({ placeId: "8", displayName: "   ", types: ["locality"] }), null);
});

test("ten sam kierunek w kilku typach zwija się do jednej pozycji", () => {
  const out = toPlaceSuggestions(
    [
      { placeId: "a", displayName: "Phuket", formattedAddress: "Thailand", types: ["geocode", "political", "administrative_area_level_1"] },
      { placeId: "b", displayName: "Phuket", formattedAddress: "Thailand", types: ["locality", "political"] },
    ],
    6,
  );
  assert.equal(out.length, 1);
});

test("kolejność: miasta, potem regiony, na końcu kraje", () => {
  const out = toPlaceSuggestions(
    [
      { placeId: "c", displayName: "Tajlandia", formattedAddress: "", types: ["country", "political"] },
      { placeId: "r", displayName: "Phuket", formattedAddress: "Thailand", types: ["administrative_area_level_1"] },
      { placeId: "m", displayName: "Bangkok", formattedAddress: "Thailand", types: ["locality"] },
    ],
    6,
  );
  assert.deepEqual(out.map((x) => x.kind), ["city", "region", "country"]);
});

test("limit jest respektowany", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    placeId: `p${i}`,
    displayName: `Miasto ${i}`,
    formattedAddress: "Thailand",
    types: ["locality"],
  }));
  assert.equal(toPlaceSuggestions(many, 4).length, 4);
});
