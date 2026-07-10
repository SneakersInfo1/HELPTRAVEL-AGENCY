// Testy normalizacji gości→occupancy (incydent prod 2026-07-10: płatność
// pobrana, book 400 „invalid occupancy number"). Gwarancja pod testem:
// NIEZALEŻNIE od wejścia wychodzi dokładnie jeden gość główny na pokój
// 1..rooms — nigdy occupancy spoza prebooka.

import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeGuestsForRooms } from "./guests";

const HOLDER = {
  firstName: "Katarzyna",
  lastName: "Dabrowska",
  email: "katharina@example.com",
  phone: "+48600000000",
};

test("normalizeGuestsForRooms: REPLAY INCYDENTU — 3 gości przy 1 pokoju → tylko occupancy 1", () => {
  // Dokładny kształt z req_id 3BiA_qkKx6A8D9nCPYle6 (payload z logu LiteAPI).
  const incidentGuests = [
    { occupancyNumber: 1, firstName: "Katarzyna ", lastName: "Dabrowska", email: "katharina@example.com" },
    { occupancyNumber: 2, firstName: "Piotr", lastName: "Szafaniec", email: "katharina@example.com" },
    { occupancyNumber: 3, firstName: "Viktor", lastName: "Dabrowski", email: "katharina@example.com" },
  ];
  const out = normalizeGuestsForRooms(incidentGuests, HOLDER, 1);
  assert.equal(out.changed, true);
  assert.equal(out.guests.length, 1);
  assert.equal(out.guests[0].occupancyNumber, 1);
  // Trailing space z incydentu obcięty (trim), e-mail zachowany.
  assert.equal(out.guests[0].firstName, "Katarzyna");
  assert.equal(out.guests[0].lastName, "Dabrowska");
  assert.equal(out.guests[0].email, "katharina@example.com");
});

test("normalizeGuestsForRooms: poprawne wejście 1 pokój → bez zmian (changed=false)", () => {
  const guests = [{ occupancyNumber: 1, firstName: "Jan", lastName: "Kowalski" }];
  const out = normalizeGuestsForRooms(guests, HOLDER, 1);
  assert.equal(out.changed, false);
  assert.deepEqual(out.guests, [{ occupancyNumber: 1, firstName: "Jan", lastName: "Kowalski" }]);
});

test("normalizeGuestsForRooms: 2 pokoje, podany tylko gość pokoju 1 → pokój 2 zapisany na holdera", () => {
  const guests = [{ occupancyNumber: 1, firstName: "Jan", lastName: "Kowalski" }];
  const out = normalizeGuestsForRooms(guests, HOLDER, 2);
  assert.equal(out.guests.length, 2);
  assert.deepEqual(out.guests[1], {
    occupancyNumber: 2,
    firstName: "Katarzyna",
    lastName: "Dabrowska",
    email: "katharina@example.com",
  });
});

test("normalizeGuestsForRooms: brak gości w ogóle → holder na każdy pokój", () => {
  const out = normalizeGuestsForRooms(undefined, HOLDER, 3);
  assert.equal(out.guests.length, 3);
  assert.deepEqual(
    out.guests.map((g) => g.occupancyNumber),
    [1, 2, 3],
  );
  for (const g of out.guests) {
    assert.equal(g.firstName, "Katarzyna");
    assert.equal(g.lastName, "Dabrowska");
  }
});

test("normalizeGuestsForRooms: gość z pasującym occupancy ale pustym imieniem → fallback na holdera", () => {
  const guests = [{ occupancyNumber: 1, firstName: "   ", lastName: "Kowalski" }];
  const out = normalizeGuestsForRooms(guests, HOLDER, 1);
  assert.equal(out.guests[0].firstName, "Katarzyna");
  assert.equal(out.guests[0].lastName, "Dabrowska");
});

test("normalizeGuestsForRooms: rooms poza zakresem → clamp (0→1, 99→9)", () => {
  assert.equal(normalizeGuestsForRooms(undefined, HOLDER, 0).guests.length, 1);
  assert.equal(normalizeGuestsForRooms(undefined, HOLDER, 99).guests.length, 9);
  assert.equal(normalizeGuestsForRooms(undefined, HOLDER, Number.NaN).guests.length, 1);
});

test("normalizeGuestsForRooms: imię dłuższe niż limit LiteAPI (40) → przycięte, nie odrzucone", () => {
  const longName = "A".repeat(60);
  const out = normalizeGuestsForRooms(
    [{ occupancyNumber: 1, firstName: longName, lastName: "Kowalski" }],
    HOLDER,
    1,
  );
  assert.equal(out.guests[0].firstName.length, 40);
});
