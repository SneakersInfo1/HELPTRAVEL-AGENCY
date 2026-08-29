// Trasa od dostawcy — czy potrafimy ją wyłuskać i czy nigdy nie psuje maila.
//
// Kształt segmentu jest zmierzony (docs/liteapi-flights-sample-rates.json).
// Niezmierzona jest GŁĘBOKOŚĆ, na której trasa siedzi w odpowiedzi prebooka
// i bookingu — dlatego testy sprawdzają kilka wariantów zagnieżdżenia i,
// przede wszystkim, że brak trasy degraduje do `null`, a nie do pustych pól.

import assert from "node:assert/strict";
import { test } from "node:test";

import { extractProviderItinerary, mergeItineraries } from "./provider-itinerary";
import type { FlightItinerarySnapshot } from "./types";

const SEG_OUT = {
  originCode: "WAW",
  destinationCode: "BCN",
  departureTime: "2026-09-20T08:20:00",
  arrivalTime: "2026-09-20T11:10:00",
  direction: "OUTBOUND",
  duration: { minutes: 170 },
  carrier: { marketingName: "Wizz Air", marketingCode: "W6" },
};
const SEG_BACK = {
  originCode: "BCN",
  destinationCode: "WAW",
  departureTime: "2026-09-27T12:00:00",
  arrivalTime: "2026-09-27T15:05:00",
  direction: "INBOUND",
  duration: { minutes: 185 },
  carrier: { marketingName: "Wizz Air", marketingCode: "W6" },
};

test("czyta trasę z `data[0].booking.journey` (kształt prebooka)", () => {
  const it = extractProviderItinerary({
    data: [{ prebookId: "pb_1", booking: { journey: { segments: [SEG_OUT, SEG_BACK], baggage: { hasCarryOnBag: true, hasCheckedBag: false }, fare: { family: "Basic" } } } }],
  });
  assert.ok(it);
  assert.equal(it.legs.length, 2);
  assert.equal(it.legs[0].originCode, "WAW");
  assert.equal(it.legs[0].destinationCode, "BCN");
  assert.equal(it.legs[0].carrier, "Wizz Air");
  assert.equal(it.legs[1].direction, "INBOUND");
  assert.equal(it.fareName, "Basic");
  assert.equal(it.hasCarryOnBag, true);
  assert.equal(it.hasCheckedBag, false);
});

test("czyta trasę z płaskiej odpowiedzi bookingu (inna głębokość)", () => {
  const it = extractProviderItinerary({ data: { journey: { segments: [SEG_OUT] } } });
  assert.ok(it);
  assert.equal(it.legs.length, 1);
  assert.equal(it.legs[0].stops, 0);
});

test("przesiadka: dwa segmenty jednego kierunku → jeden odcinek z 1 przesiadką", () => {
  const hop = { ...SEG_OUT, originCode: "WAW", destinationCode: "FRA", arrivalTime: "2026-09-20T09:40:00", duration: { minutes: 80 } };
  const leg2 = { ...SEG_OUT, originCode: "FRA", destinationCode: "BCN", departureTime: "2026-09-20T10:40:00", arrivalTime: "2026-09-20T12:30:00", duration: { minutes: 110 } };
  const it = extractProviderItinerary({ data: [{ booking: { journey: { segments: [leg2, hop] } } }] });
  assert.ok(it);
  assert.equal(it.legs.length, 1);
  assert.equal(it.legs[0].originCode, "WAW"); // sortowanie po godzinie wylotu
  assert.equal(it.legs[0].destinationCode, "BCN");
  assert.equal(it.legs[0].stops, 1);
  assert.equal(it.legs[0].durationMinutes, 190); // suma segmentów, gdy brak legDurations
});

test("legDurations wygrywa z sumą segmentów (zawiera czas przesiadki)", () => {
  const it = extractProviderItinerary({
    data: [{ booking: { journey: { segments: [SEG_OUT], legDurations: [{ direction: "OUTBOUND", duration: { minutes: 999 } }] } } }],
  });
  assert.equal(it?.legs[0].durationMinutes, 999);
});

test("brak trasy w payloadzie → null (mail zostaje przy migawce klienta)", () => {
  assert.equal(extractProviderItinerary({ data: [{ bookingId: "bk_1", status: "CONFIRMED" }] }), null);
  assert.equal(extractProviderItinerary(null), null);
  assert.equal(extractProviderItinerary("nonsens"), null);
  assert.equal(extractProviderItinerary({ data: [{ booking: { journey: { segments: [] } } }] }), null);
});

test("segment bez kodów lotnisk NIE tworzy odcinka z pustymi polami", () => {
  const broken = { ...SEG_OUT, destinationCode: undefined };
  assert.equal(extractProviderItinerary({ data: [{ booking: { journey: { segments: [broken] } } }] }), null);
});

test("wartości spoza zakresu schematu są przycinane, nie przepuszczane", () => {
  const it = extractProviderItinerary({
    data: [{ booking: { journey: { segments: [{ ...SEG_OUT, duration: { minutes: 99_999 } }] } } }],
  });
  assert.equal(it?.legs[0].durationMinutes, 10_000);
});

test("nie zapętla się na cyklicznym payloadzie", () => {
  const node: Record<string, unknown> = { data: [{}] };
  node.self = node;
  assert.equal(extractProviderItinerary(node), null);
});

// ── Scalanie źródeł ──────────────────────────────────────────────────────────

const CLIENT: FlightItinerarySnapshot = {
  legs: [{ direction: "OUTBOUND", originCode: "XXX", destinationCode: "YYY", departureTime: "2000-01-01T00:00:00", arrivalTime: "2000-01-01T01:00:00", durationMinutes: 60, stops: 0, carrier: "Podmienione" }],
  fareName: "Zmyślona",
  hasCarryOnBag: true,
  hasCheckedBag: true,
};

test("dostawca wygrywa trasą — podmieniona migawka klienta NIE trafia do maila", () => {
  const provider = extractProviderItinerary({ data: [{ booking: { journey: { segments: [SEG_OUT] } } }] });
  const { itinerary, source } = mergeItineraries(provider, CLIENT);
  assert.equal(itinerary?.legs[0].originCode, "WAW");
  assert.equal(itinerary?.legs[0].carrier, "Wizz Air");
  assert.equal(itinerary?.legs.length, 1);
  assert.equal(source, "provider+client");
});

test("klient uzupełnia WYŁĄCZNIE to, czego dostawca nie zwrócił (taryfa, bagaż)", () => {
  const provider = extractProviderItinerary({ data: [{ booking: { journey: { segments: [SEG_OUT] } } }] });
  const { itinerary } = mergeItineraries(provider, CLIENT);
  assert.equal(itinerary?.fareName, "Zmyślona"); // dostawca nie dał `fare.family`
  assert.equal(itinerary?.hasCheckedBag, true);
});

test("gdy dostawca dał taryfę i bagaż, klient nie ma czego uzupełnić", () => {
  const provider = extractProviderItinerary({
    data: [{ booking: { journey: { segments: [SEG_OUT], baggage: { hasCarryOnBag: false, hasCheckedBag: false }, fare: { family: "Smart" } } } }],
  });
  const { itinerary, source } = mergeItineraries(provider, CLIENT);
  assert.equal(itinerary?.fareName, "Smart");
  assert.equal(itinerary?.hasCarryOnBag, false);
  assert.equal(source, "provider");
});

test("brak danych dostawcy → migawka klienta, jawnie oznaczona jako taka", () => {
  const { itinerary, source } = mergeItineraries(null, CLIENT);
  assert.equal(itinerary, CLIENT);
  assert.equal(source, "client");
});

test("brak obu źródeł → brak trasy, a nie pusty szkielet", () => {
  const { itinerary, source } = mergeItineraries(null, undefined);
  assert.equal(itinerary, undefined);
  assert.equal(source, "none");
});
