import assert from "node:assert/strict";
import { test } from "node:test";

import { renderFlightCancellation, renderFlightConfirmation, type FlightEmailLeg } from "./flight-confirmation";

// Intl pl-PL wstawia U+00A0 jako separator tysięcy I przed symbolem waluty.
// Zapisujemy to JAWNIE — dosłowna spacja niełamliwa w źródle jest nie do
// odróżnienia od zwykłej, a test, który ich nie odróżnia, niczego nie chroni.
const NBSP = " ";

const LEGS: FlightEmailLeg[] = [
  {
    direction: "OUTBOUND",
    originCode: "WAW",
    destinationCode: "BCN",
    departureTime: "2026-09-20T14:35:00+02:00",
    arrivalTime: "2026-09-20T17:40:00+02:00",
    durationMinutes: 185,
    stops: 0,
    carrier: "Wizz Air",
  },
  {
    direction: "INBOUND",
    originCode: "BCN",
    destinationCode: "WAW",
    departureTime: "2026-09-27T09:30:00+02:00",
    arrivalTime: "2026-09-27T12:35:00+02:00",
    durationMinutes: 185,
    stops: 1,
    carrier: "Wizz Air",
  },
];

const BASE = {
  bookingId: "BK-12345",
  pnr: "XY7Z9Q",
  legs: LEGS,
  fareName: "Smart",
  hasCarryOnBag: true,
  hasCheckedBag: false,
  passengers: [
    { firstName: "Jan", lastName: "Kowalski", type: "ADT" },
    { firstName: "Anna", lastName: "Kowalska", type: "ADT" },
  ],
  price: 1918.34,
  currency: "PLN",
  supportEmail: "pomoc@helptravel.pl",
};

// Brief §11 wylicza, co MUSI być w potwierdzeniu. Poprzedni mail miał z tego
// numer rezerwacji, PNR i kwotę — i nic więcej. Ten test jest listą kontrolną.
test("potwierdzenie: zawiera komplet z §11 (trasa, daty, lotniska, nazwiska, taryfa, bagaż, kwota)", () => {
  const mail = renderFlightConfirmation({ ...BASE, ticketingPending: true });

  assert.ok(mail.html.includes("BK-12345"), "brak numeru rezerwacji");
  assert.ok(mail.html.includes("XY7Z9Q"), "brak PNR");
  assert.ok(mail.html.includes("WAW"), "brak lotniska wylotu");
  assert.ok(mail.html.includes("BCN"), "brak lotniska przylotu");
  assert.ok(mail.html.includes("14:35"), "brak godziny wylotu");
  assert.ok(mail.html.includes("17:40"), "brak godziny przylotu");
  assert.ok(/wrze[śs]nia/.test(mail.html), "brak daty słownej");
  assert.ok(mail.html.includes("Jan Kowalski"), "brak nazwiska pasażera");
  assert.ok(mail.html.includes("Anna Kowalska"), "brak drugiego pasażera");
  assert.ok(mail.html.includes("Smart"), "brak nazwy taryfy");
  assert.ok(mail.html.includes("bagaż podręczny"), "brak informacji o bagażu");
  assert.ok(mail.html.includes("bezpośredni"), "brak informacji o przesiadkach");
  assert.ok(mail.html.includes("1 przesiadka"), "brak przesiadki na powrocie");
  assert.ok(mail.html.includes("Wizz Air"), "brak przewoźnika");
});

test("potwierdzenie: kwota z groszami, TAK JAK obciążenie karty", () => {
  const mail = renderFlightConfirmation(BASE);
  // Ta sama reguła co `formatFlightPriceExact` w UI: grosze tylko gdy istnieją.
  assert.ok(mail.html.includes(`1${NBSP}918,34`), `brak kwoty z groszami w: ${mail.html.slice(0, 200)}`);
  assert.ok(!mail.html.includes("1918.34"), "kwota w formacie technicznym zamiast polskiego");
});

test("potwierdzenie: kwota okrągła bez „,00”", () => {
  const mail = renderFlightConfirmation({ ...BASE, price: 2780 });
  assert.ok(mail.html.includes(`2${NBSP}780`), "brak kwoty");
  assert.ok(!mail.html.includes(`2${NBSP}780,00`), "dopisane zbędne grosze");
});

test("potwierdzenie: temat i preheader niosą trasę oraz numer", () => {
  const mail = renderFlightConfirmation(BASE);
  assert.ok(mail.subject.includes("WAW → BCN"));
  assert.ok(mail.subject.includes("BK-12345"));
  assert.ok(mail.html.includes("nr BK-12345"), "preheader bez numeru rezerwacji");
});

test("potwierdzenie: wariant tekstowy ma to samo co HTML (spam filtry + czytniki)", () => {
  const mail = renderFlightConfirmation({ ...BASE, ticketingPending: true });
  assert.ok(mail.text.includes("BK-12345"));
  assert.ok(mail.text.includes("WAW"));
  assert.ok(mail.text.includes("Jan Kowalski"));
  assert.ok(mail.text.includes("Smart"));
  assert.ok(mail.text.includes(`1${NBSP}918,34`));
  assert.ok(mail.text.length > 200, "wariant tekstowy jest podejrzanie krótki");
});

test("potwierdzenie: e-bilet wystawiony vs oczekujący dają RÓŻNY komunikat", () => {
  const pending = renderFlightConfirmation({ ...BASE, ticketingPending: true });
  const issued = renderFlightConfirmation({ ...BASE, ticketingPending: false, eTicketNumbers: ["125-1234567890"] });
  assert.ok(pending.html.includes("Numer biletu"), "brak uczciwej noty o oczekującym bilecie");
  assert.ok(issued.html.includes("Bilet został wystawiony"));
  assert.ok(issued.html.includes("125-1234567890"), "brak numeru e-biletu");
});

test("potwierdzenie: brak trasy nie wywraca renderu (sesja bez migawki)", () => {
  const mail = renderFlightConfirmation({ bookingId: "BK-1", supportEmail: "pomoc@helptravel.pl" });
  assert.ok(mail.html.includes("BK-1"));
  assert.ok(mail.subject.includes("BK-1"));
  assert.ok(!mail.subject.includes("undefined"));
  assert.ok(!mail.html.includes("undefined"));
});

test("potwierdzenie: dane od użytkownika są escapowane (HTML nie ucieka)", () => {
  const mail = renderFlightConfirmation({
    ...BASE,
    passengers: [{ firstName: "<script>alert(1)</script>", lastName: "O'Brien & Co" }],
  });
  assert.ok(!mail.html.includes("<script>"), "wstrzyknięty tag przeszedł do HTML-a");
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.html.includes("&#39;"));
  assert.ok(mail.html.includes("&amp;"));
});

// Ten mail wychodził jako „Potwierdzenie rezerwacji lotu" do klienta,
// któremu przewoźnik właśnie anulował lot. Test pilnuje, żeby nie wrócił.
test("anulowanie: temat i treść mówią o ANULOWANIU, nie o potwierdzeniu", () => {
  const mail = renderFlightCancellation({
    bookingId: "BK-12345",
    pnr: "XY7Z9Q",
    price: 1918.34,
    currency: "PLN",
    supportEmail: "pomoc@helptravel.pl",
  });
  assert.ok(mail.subject.toLowerCase().includes("anulowana"));
  assert.ok(!mail.subject.toLowerCase().includes("potwierdzenie"));
  assert.ok(mail.html.includes("anulowana"));
  assert.ok(!/Rezerwacja lotu potwierdzona/.test(mail.html));
  assert.ok(mail.html.includes("BK-12345"));
  assert.ok(mail.text.toLowerCase().includes("anulowana"));
});

test("anulowanie: mówi o zwrocie tylko wtedy, gdy znamy kwotę", () => {
  const withPrice = renderFlightCancellation({ bookingId: "BK-1", price: 999, currency: "PLN", supportEmail: "x@y.pl" });
  const noPrice = renderFlightCancellation({ bookingId: "BK-1", supportEmail: "x@y.pl" });
  assert.ok(withPrice.html.includes("zwrócona"));
  assert.ok(!noPrice.html.includes("zwrócona"), "obietnica zwrotu bez znanej kwoty");
});
