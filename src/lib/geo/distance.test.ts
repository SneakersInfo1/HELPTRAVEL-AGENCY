// FAZA 7 — testy odległości + guardraili. Przypadki wymagane przez prompt:
// hotel w centrum, 8 km (pokazuje), 40 km (ukrywa), nadmorski blisko plaży
// (pokazuje), nadmorski 20 km od plaży (ukrywa), miasto spoza tabeli (ukrywa).

import assert from "node:assert/strict";
import { test } from "node:test";

import { haversineKm, isValidCoord } from "./haversine";
import { hotelDistanceLabels } from "./distance-label";

// Barcelona (nadmorska): centrum 41.3851,2.1734; plaża Barceloneta 41.3785,2.1925.
const BCN_CENTER = { lat: 41.3851, lng: 2.1734 };
const BCN_BEACH = { lat: 41.3785, lng: 2.1925 };
const kmNorth = (base: { lat: number; lng: number }, km: number) => ({ lat: base.lat + km / 111, lng: base.lng });

test("haversine: ten sam punkt = 0, znana odległość rozsądna", () => {
  assert.equal(Math.round(haversineKm(BCN_CENTER, BCN_CENTER)), 0);
  // Barcelona → Madryt ~ 505 km
  const d = haversineKm({ lat: 41.3851, lng: 2.1734 }, { lat: 40.4168, lng: -3.7038 });
  assert.ok(d > 480 && d < 540, `oczekiwano ~505 km, było ${d}`);
});

test("isValidCoord: odrzuca 0/0, NaN, poza zakresem", () => {
  assert.equal(isValidCoord({ lat: 0, lng: 0 }), false);
  assert.equal(isValidCoord({ lat: NaN, lng: 2 }), false);
  assert.equal(isValidCoord({ lat: 91, lng: 2 }), false);
  assert.equal(isValidCoord({ lat: 41.38, lng: 2.17 }), true);
});

test("hotel ~100 m od centrum → w samym centrum (<300 m)", () => {
  const out = hotelDistanceLabels(kmNorth(BCN_CENTER, 0.1), "Barcelona", "ES");
  assert.equal(out.center, "w samym centrum");
});

test("hotel 8 km od centrum → pokazuje 8,0 km od centrum", () => {
  const out = hotelDistanceLabels(kmNorth(BCN_CENTER, 8), "Barcelona", "ES");
  assert.equal(out.center, "8,0 km od centrum");
});

test("hotel 40 km od centrum → centrum UKRYTE (próg 12 km)", () => {
  const out = hotelDistanceLabels(kmNorth(BCN_CENTER, 40), "Barcelona", "ES");
  assert.equal(out.center, undefined);
});

test("nadmorski hotel ~400 m od plaży → pokazuje plażę", () => {
  const out = hotelDistanceLabels(kmNorth(BCN_BEACH, 0.4), "Barcelona", "ES");
  assert.ok(out.beach && /plaży/.test(out.beach), `oczekiwano etykiety plaży, było ${out.beach}`);
});

test("nadmorski hotel 20 km od plaży → plaża UKRYTA (próg 5 km)", () => {
  const out = hotelDistanceLabels(kmNorth(BCN_BEACH, 20), "Barcelona", "ES");
  assert.equal(out.beach, undefined);
});

test("miasto śródlądowe (Rzym) → centrum tak, plaża nigdy", () => {
  const out = hotelDistanceLabels({ lat: 41.9, lng: 12.5 }, "Rome", "IT");
  assert.ok(out.center, "centrum powinno się pokazać");
  assert.equal(out.beach, undefined);
});

test("miasto spoza tabeli → nic", () => {
  const out = hotelDistanceLabels({ lat: 64.1466, lng: -21.9426 }, "Reykjavik", "IS");
  assert.deepEqual(out, {});
});

test("niepoprawne współrzędne hotelu (0/0) → nic", () => {
  const out = hotelDistanceLabels({ lat: 0, lng: 0 }, "Barcelona", "ES");
  assert.deepEqual(out, {});
});
