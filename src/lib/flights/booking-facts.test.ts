// Fakty o rezerwacji — testy na ZMIERZONYM kształcie produkcyjnym.
//
// Kształt poniżej nie jest wymyślony: to szkielet odczytany 2026-08-30 z
// prawdziwej rezerwacji lotniczej przez `GET /flights/bookings/{id}`
// (`docs/liteapi-flights-sample-booking.json`, `pnpm probe:flight-booking-shape`).
// Dostawca pakuje rekord w `data[0].booking`, a nie w `data[0]` — i właśnie na
// tym potykały się trzy niezależne parsery w tym repo.

import assert from "node:assert/strict";
import { test } from "node:test";

import { readFlightBookingFacts } from "./booking-facts";

/** Kształt 1:1 ze zmierzonej odpowiedzi (wartości podmienione, struktura ta sama). */
const REALNY_GET = {
  data: [
    {
      booking: {
        bookingId: "019ec7ff-0000-7000-8000-0000000a62b0",
        status: "PENDING",
        timestamp: "2026-08-14T10:11:12.000Z",
        journey: {
          journeyKey: "jk_0000000000",
          segments: [
            {
              arrivalTime: "2026-09-14T07:35:00",
              carrier: { marketingCode: "W6", marketingName: "Wizz Air", operatingCode: "W6", operatingName: "Wizz Air" },
              departureTime: "2026-09-14T06:00:00",
              originCode: "WAW",
              destinationCode: "LTN",
              direction: "OUTBOUND",
              duration: { iso8601: "PT2H35M", minutes: 155 },
              flight: { marketingNumber: "1301", operatingNumber: "1301" },
            },
          ],
          pricing: { display: { total: 444.24, currency: "PLN" }, converted: false },
          baggage: { hasCarryOnBag: false, hasCheckedBag: false },
        },
        passengers: [],
        contact: {},
        pricing: {},
      },
    },
  ],
};

test("REALNY kształt: status czytany z data[0].booking, nie z data[0]", () => {
  const f = readFlightBookingFacts(REALNY_GET);
  // To jest cały sens tego modułu. Przed poprawką wychodziło `undefined`,
  // a `mapBookingStatus(undefined)` zwracało „confirmed" — czyli rezerwacja
  // PENDING u dostawcy była u nas POTWIERDZONA.
  assert.equal(f.status, "PENDING");
});

test("REALNY kształt: bookingId też siedzi poziom głębiej", () => {
  const f = readFlightBookingFacts(REALNY_GET);
  assert.equal(f.bookingId, "019ec7ff-0000-7000-8000-0000000a62b0");
});

test("REALNY kształt: brak biletów → ticketingStatus 'pending', nie błąd", () => {
  const f = readFlightBookingFacts(REALNY_GET);
  assert.equal(f.ticketingStatus, "pending");
  assert.equal(f.eTicketNumbers, undefined);
  assert.equal(f.pnr, undefined);
});

test("kształt PŁASKI (gdyby dostawca kiedyś spłaszczył) czytany tak samo", () => {
  const f = readFlightBookingFacts({
    data: [{ bookingId: "bk_1", status: "CONFIRMED", pnr: "ABC123", eTicketNumbers: ["125-1234567890"] }],
  });
  assert.equal(f.bookingId, "bk_1");
  assert.equal(f.status, "CONFIRMED");
  assert.equal(f.pnr, "ABC123");
  assert.deepEqual(f.eTicketNumbers, ["125-1234567890"]);
  assert.equal(f.ticketingStatus, "ticketed");
});

test("kształt HYBRYDOWY: część pól na wierzchu, część w booking — czytamy oba", () => {
  const f = readFlightBookingFacts({
    data: [{ eTicketNumbers: ["125-9999999999"], booking: { bookingId: "bk_2", status: "CONFIRMED", pnr: "XYZ789" } }],
  });
  assert.equal(f.bookingId, "bk_2");
  assert.equal(f.status, "CONFIRMED");
  assert.equal(f.pnr, "XYZ789");
  assert.deepEqual(f.eTicketNumbers, ["125-9999999999"]);
  assert.equal(f.ticketingStatus, "ticketed");
});

test("data jako OBIEKT (nie tablica) — wariant dopuszczony przez klienta", () => {
  const f = readFlightBookingFacts({ data: { booking: { bookingId: "bk_3", status: "CANCELLED" } } });
  assert.equal(f.bookingId, "bk_3");
  assert.equal(f.status, "CANCELLED");
});

test("śmieci na wejściu nie wywracają odczytu", () => {
  for (const bad of [null, undefined, 42, "tekst", [], {}, { data: [] }, { data: [null] }]) {
    const f = readFlightBookingFacts(bad);
    assert.equal(f.status, undefined);
    assert.equal(f.bookingId, undefined);
    assert.equal(f.ticketingStatus, "pending");
  }
});

test("puste stringi traktujemy jak brak, nie jak wartość", () => {
  const f = readFlightBookingFacts({ data: [{ booking: { bookingId: "  ", status: "", pnr: "   " } }] });
  assert.equal(f.bookingId, undefined);
  assert.equal(f.status, undefined);
  assert.equal(f.pnr, undefined);
});

test("pusta tablica biletów NIE oznacza 'ticketed'", () => {
  const f = readFlightBookingFacts({ data: [{ booking: { status: "CONFIRMED", eTicketNumbers: [] } }] });
  assert.equal(f.ticketingStatus, "pending");
  assert.equal(f.eTicketNumbers, undefined);
});
