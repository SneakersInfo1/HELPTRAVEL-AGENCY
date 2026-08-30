// Testy walidacji formularza pasażerów (/loty/pasazerowie).
//
// Ta walidacja jest PIERWSZĄ z dwóch bramek — druga stoi w schemacie zod na
// serwerze (`FlightPrebookInputSchema`). Front nie jest jedyną ochroną, ale
// jest tą, która decyduje, czy żądanie prebooka w ogóle poleci: strona zwraca
// z `handleSubmit`, gdy ta mapa jest niepusta. Stąd testy „NO prebook request”
// (punkty A–D zlecenia) mierzą dokładnie to: niepustą mapę dla złych danych.

import assert from "node:assert/strict";
import { test } from "node:test";

import { NAME_TOO_SHORT_FIRST, NAME_TOO_SHORT_LAST } from "./name-policy";
import { collectPassengerFormErrors, type PassengerFormContact, type PassengerFormPax } from "./passenger-form";

function pax(over: Partial<PassengerFormPax> = {}): PassengerFormPax {
  return {
    type: "ADT",
    firstName: "Jan",
    lastName: "Kowalski",
    birthday: "1990-05-04",
    gender: "M",
    nationality: "PL",
    documentType: "passport",
    documentNumber: "AB1234567",
    documentExpiry: "2031-01-01",
    ...over,
  };
}

function contact(over: Partial<PassengerFormContact> = {}): PassengerFormContact {
  return {
    firstName: "Jan",
    lastName: "Kowalski",
    email: "jan@example.com",
    phoneNumber: "500600700",
    phoneCountryCode: "48",
    ...over,
  };
}

function collect(over: {
  pax?: PassengerFormPax[];
  contact?: PassengerFormContact;
  acceptTerms?: boolean;
  lastTravelDate?: string;
} = {}) {
  return collectPassengerFormErrors({
    pax: over.pax ?? [pax()],
    contact: over.contact ?? contact(),
    acceptTerms: over.acceptTerms ?? true,
    lastTravelDate: over.lastTravelDate ?? "2026-09-27",
  });
}

test("komplet poprawnych danych → zero błędów (prebook może polecieć)", () => {
  assert.deepEqual(collect(), {});
});

// ── A / B / C: próg 3 znaków na imieniu pasażera ─────────────────────────────

test("A. imię „J” zatrzymuje formularz — żądanie prebooka nie powstaje", () => {
  const e = collect({ pax: [pax({ firstName: "J" })] });
  assert.equal(e["p0.firstName"], NAME_TOO_SHORT_FIRST);
  assert.equal(Object.keys(e).length, 1, "zatrzymał się na czymś jeszcze");
});

test("B. imię „Ja” też zatrzymuje formularz", () => {
  const e = collect({ pax: [pax({ firstName: "Ja" })] });
  assert.equal(e["p0.firstName"], NAME_TOO_SHORT_FIRST);
  assert.equal(Object.keys(e).length, 1);
});

test("C. imię „Jan” przechodzi", () => {
  const e = collect({ pax: [pax({ firstName: "Jan" })] });
  assert.equal(e["p0.firstName"], undefined);
  assert.deepEqual(e, {});
});

test("D. nazwisko „Li” dostaje komunikat o ograniczeniu, nie leci do dostawcy", () => {
  const e = collect({ pax: [pax({ lastName: "Li" })] });
  assert.equal(e["p0.lastName"], NAME_TOO_SHORT_LAST);
  assert.equal(Object.keys(e).length, 1);
});

test("puste pole to „wpisz”, nie „za krótkie” — to dwie różne sytuacje", () => {
  const e = collect({ pax: [pax({ firstName: "", lastName: "  " })] });
  assert.equal(e["p0.firstName"], "Wpisz imię");
  assert.equal(e["p0.lastName"], "Wpisz nazwisko");
});

test("spacje nie robią z „Li” trzech znaków", () => {
  const e = collect({ pax: [pax({ lastName: " Li " })] });
  assert.equal(e["p0.lastName"], NAME_TOO_SHORT_LAST);
});

// ── Kontakt ma ten sam próg ──────────────────────────────────────────────────

test("imię kontaktu poniżej progu — dostawca liczy je tak samo", () => {
  const e = collect({ contact: contact({ firstName: "Ja" }) });
  assert.equal(e["c.firstName"], NAME_TOO_SHORT_FIRST);
});

test("nazwisko kontaktu poniżej progu", () => {
  const e = collect({ contact: contact({ lastName: "Ng" }) });
  assert.equal(e["c.lastName"], NAME_TOO_SHORT_LAST);
});

// ── H: dwóch dorosłych, błędny drugi ─────────────────────────────────────────

test("H. przy dwóch dorosłych błąd wskazuje PASAŻERA 2, nie pierwszego", () => {
  const dwoje = [pax({ firstName: "Jan" }), pax({ firstName: "Al", lastName: "Nowak" })];
  const e = collect({ pax: dwoje });
  assert.equal(e["p1.firstName"], NAME_TOO_SHORT_FIRST);
  assert.equal(e["p0.firstName"], undefined, "obwiniony niewłaściwy pasażer");
  assert.equal(Object.keys(e)[0], "p1.firstName", "przewinie do złego pola");
});

test("H. walidacja NIE dotyka danych, które użytkownik już wpisał", () => {
  const dwoje = [pax({ firstName: "Jan" }), pax({ firstName: "Al", lastName: "Nowak" })];
  const przed = JSON.stringify(dwoje);
  const kontakt = contact();
  const kontaktPrzed = JSON.stringify(kontakt);
  collect({ pax: dwoje, contact: kontakt });
  assert.equal(JSON.stringify(dwoje), przed, "walidacja zmieniła dane pasażerów");
  assert.equal(JSON.stringify(kontakt), kontaktPrzed, "walidacja zmieniła dane kontaktu");
});

// ── Reguły, które istniały wcześniej — nie wolno ich zgubić ──────────────────

test("data urodzenia, płeć, obywatelstwo, dokument", () => {
  const e = collect({
    pax: [pax({ birthday: "", gender: "", nationality: "P", documentNumber: "AB", documentExpiry: "" })],
  });
  assert.equal(e["p0.birthday"], "Wpisz datę urodzenia");
  assert.equal(e["p0.gender"], "Wybierz płeć");
  assert.equal(e["p0.nationality"], "Kod kraju (2 litery)");
  assert.equal(e["p0.documentNumber"], "Wpisz numer dokumentu");
  assert.equal(e["p0.documentExpiry"], "Wpisz datę ważności");
});

test("dokument musi być ważny PO ostatniej dacie podróży", () => {
  const e = collect({ pax: [pax({ documentExpiry: "2026-09-20" })], lastTravelDate: "2026-09-27" });
  assert.equal(e["p0.documentExpiry"], "Dokument musi być ważny po dacie podróży");
});

test("e-mail, telefon i regulamin", () => {
  const e = collect({ contact: contact({ email: "jan", phoneNumber: "12" }), acceptTerms: false });
  assert.equal(e["c.email"], "Wpisz poprawny e-mail");
  assert.equal(e["c.phoneNumber"], "Wpisz numer telefonu");
  assert.equal(e["terms"], "Zaakceptuj regulamin i politykę prywatności");
});

test("bez znanej daty podróży reguła ważności dokumentu nie strzela", () => {
  const e = collectPassengerFormErrors({
    pax: [pax({ documentExpiry: "2026-09-20" })],
    contact: contact(),
    acceptTerms: true,
  });
  assert.equal(e["p0.documentExpiry"], undefined);
});
