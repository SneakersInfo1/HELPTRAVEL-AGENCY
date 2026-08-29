// Unit tests for the booking confirmation email template.
//
// Coverage focus — bits that silently rot if we don't guard them:
//   • Polish pluralization (nights, guests) — wrong forms read as illiterate.
//   • Date formatting in Europe/Warsaw — DST + bare YYYY-MM-DD edge cases.
//   • HTML escaping — hotel names with apostrophes / quotes / <tags> must
//     never escape into raw HTML (template injection / broken markup).
//   • Conditional sections — price absent, board absent, confirmation code
//     absent should NOT print empty rows.
//   • Plain-text variant — must contain the same key facts as HTML.

import test from "node:test";
import assert from "node:assert/strict";

import { renderBookingConfirmation } from "./booking-confirmation";

function base() {
  return {
    bookingId: "BK-12345",
    confirmationCode: "HTL-CONF-XYZ" as string | null,
    hotelName: "Hotel Riviera",
    city: "Malaga, Hiszpania",
    checkin: "2026-07-15",
    checkout: "2026-07-19",
    boardName: "Pokój dwuosobowy ze śniadaniem",
    price: 2480.5,
    currency: "PLN",
    holder: { firstName: "Anna", lastName: "Kowalska", email: "anna@example.com" },
    guestCount: 2,
    supportEmail: "pomoc@helptravel.pl",
  } as const;
}

test("renders a complete email with all optional fields", () => {
  const out = renderBookingConfirmation(base());
  assert.match(out.subject, /Potwierdzenie rezerwacji/);
  assert.match(out.subject, /Hotel Riviera/);

  // HTML contains all key facts
  assert.match(out.html, /Cześć Anna/); // greeting
  assert.match(out.html, /Hotel Riviera/);
  assert.match(out.html, /Malaga, Hiszpania/);
  assert.match(out.html, /BK-12345/);
  assert.match(out.html, /HTL-CONF-XYZ/);
  assert.match(out.html, /Pokój dwuosobowy/);
  assert.match(out.html, /2[\s ]?480,50\s*z[lł]/);

  // Plain-text variant exists and mirrors the HTML facts
  assert.match(out.text, /Hotel Riviera/);
  assert.match(out.text, /BK-12345/);
  assert.match(out.text, /HTL-CONF-XYZ/);
  assert.match(out.text, /pomoc@helptravel\.pl/);
});

test("Polish pluralization — nights (1 / 2-4 / 5+)", () => {
  // 1 night
  let out = renderBookingConfirmation({
    ...base(),
    checkin: "2026-07-15",
    checkout: "2026-07-16",
  });
  assert.match(out.text, /1 noc(?!\w)/);

  // 3 nights → "noce"
  out = renderBookingConfirmation({
    ...base(),
    checkin: "2026-07-15",
    checkout: "2026-07-18",
  });
  assert.match(out.text, /3 noce(?!\w)/);

  // 7 nights → "nocy"
  out = renderBookingConfirmation({
    ...base(),
    checkin: "2026-07-15",
    checkout: "2026-07-22",
  });
  assert.match(out.text, /7 nocy/);

  // 12 nights → "nocy" (the 12-14 special-case)
  out = renderBookingConfirmation({
    ...base(),
    checkin: "2026-07-01",
    checkout: "2026-07-13",
  });
  assert.match(out.text, /12 nocy/);

  // 22 nights → "noce" again (lastDigit=2, lastTwo=22 → not in 12-14 range)
  out = renderBookingConfirmation({
    ...base(),
    checkin: "2026-07-01",
    checkout: "2026-07-23",
  });
  assert.match(out.text, /22 noce/);

  // 21 nights → "nocy" (lastDigit=1, lastTwo=21 → falls to default branch).
  // This is the classic Polish-plural trap: 1 is "noc", but 21 is "nocy".
  out = renderBookingConfirmation({
    ...base(),
    checkin: "2026-07-01",
    checkout: "2026-07-22",
  });
  assert.match(out.text, /21 nocy/);
});

test("Polish pluralization — guests (1 / 2-4 / 5+)", () => {
  let out = renderBookingConfirmation({ ...base(), guestCount: 1 });
  assert.match(out.text, /1 osoba/);

  out = renderBookingConfirmation({ ...base(), guestCount: 3 });
  assert.match(out.text, /3 osoby/);

  out = renderBookingConfirmation({ ...base(), guestCount: 5 });
  assert.match(out.text, /5 osób/);
});

test("HTML escapes user-supplied strings (no injection)", () => {
  const out = renderBookingConfirmation({
    ...base(),
    hotelName: 'Hotel <script>alert("xss")</script>',
    city: "City & Country",
    holder: {
      firstName: "Anna's",
      lastName: "Kowalska",
      email: "anna+test@example.com",
    },
  });

  // Raw <script> tag must NEVER appear in the HTML payload.
  assert.ok(
    !out.html.includes("<script>"),
    "Raw <script> leaked into HTML — escaping broken",
  );
  assert.match(out.html, /&lt;script&gt;/);
  assert.match(out.html, /City &amp; Country/);
  assert.match(out.html, /Anna&#39;s/);
});

test("omits price block when price is 0 or undefined", () => {
  const noPrice = renderBookingConfirmation({ ...base(), price: undefined });
  assert.ok(!noPrice.html.includes("Kwota zapłacona"));
  assert.ok(!noPrice.text.includes("Kwota zapłacona"));

  const zeroPrice = renderBookingConfirmation({ ...base(), price: 0 });
  assert.ok(!zeroPrice.html.includes("Kwota zapłacona"));
});

test("omits confirmation code section when absent", () => {
  const out = renderBookingConfirmation({ ...base(), confirmationCode: null });
  // The "Numer w hotelu" label appears only when we have a code.
  assert.ok(!out.html.includes("Numer w hotelu"));
  // Plain text omits the line too.
  assert.ok(!out.text.includes("Numer rezerwacji w hotelu"));
});

test("omits board name when absent", () => {
  const out = renderBookingConfirmation({ ...base(), boardName: undefined });
  assert.ok(!out.text.includes("Pakiet:"));
});

test("Polish date formatting includes weekday + month name", () => {
  const out = renderBookingConfirmation({
    ...base(),
    checkin: "2026-07-15", // środa
    checkout: "2026-07-19",
  });
  // Polish month name "lipca" (July, genitive) appears in pl-PL Intl output
  assert.match(out.text, /lipca/);
  assert.match(out.text, /2026/);
});

test("bare YYYY-MM-DD does not roll back a day in Europe/Warsaw", () => {
  // If the parser interpreted "2026-07-15" as midnight UTC and Intl rendered
  // it in Europe/Warsaw (UTC+2 in July), the user would see July 14. Guard:
  // we anchor bare dates at noon UTC so the formatted day matches the input.
  const out = renderBookingConfirmation({
    ...base(),
    checkin: "2026-07-15",
    checkout: "2026-07-19",
  });
  assert.match(out.text, /Przyjazd:.*15\s*lipca/);
});

test("subject contains hotel name", () => {
  const out = renderBookingConfirmation({ ...base(), hotelName: "Hotel ABC" });
  assert.ok(out.subject.includes("Hotel ABC"));
});

test("HTML always closes <body> and <html>", () => {
  const out = renderBookingConfirmation(base());
  assert.match(out.html, /<\/body>\s*<\/html>\s*$/);
});

test("plain text contains site footer links", () => {
  const out = renderBookingConfirmation(base());
  assert.match(out.text, /\/regulamin/);
  assert.match(out.text, /\/polityka-prywatnosci/);
  // Stopka maila NIE może linkować do /linki-partnerskie — strona zdjęta
  // 2026-07-30. Mail idzie do klienta, który zapłacił; martwy link w takim
  // miejscu kosztuje więcej niż gdziekolwiek indziej.
  assert.doesNotMatch(out.text, /\/linki-partnerskie/);
  assert.doesNotMatch(out.html, /\/linki-partnerskie/);
});

// ── Guest count is omitted, never invented ─────────────────────────────────
// A manual resend for an older booking has no `pax` (the session that carried
// it expired long ago). Printing "1 osoba" on a confirmation for a 5-person
// apartment would be a visible lie, so the row is dropped instead.

test("guestCount omitted → no Goście row in HTML or text", () => {
  const rendered = renderBookingConfirmation({
    bookingId: "9c-OQvmqJ",
    confirmationCode: null,
    hotelName: "Globales Costa de la Calma",
    city: "Santa Ponsa",
    checkin: "2026-09-10",
    checkout: "2026-09-17",
    boardName: "Room Only",
    price: 6240.43,
    currency: "PLN",
    holder: { firstName: "Marcin", lastName: "Kubina", email: "m@example.com" },
    supportEmail: "pomoc@helptravel.pl",
  });
  assert.ok(!rendered.html.includes("Goście"), "HTML must not show a guests row");
  assert.ok(!rendered.text.includes("Goście"), "text body must not show a guests line");
  assert.ok(!rendered.html.includes("osoba"), "no invented person count anywhere");
  assert.ok(!rendered.html.includes("osób"), "no invented person count anywhere");
  // Everything else still renders.
  assert.ok(rendered.html.includes("Globales Costa de la Calma"));
  assert.ok(rendered.html.includes("Santa Ponsa"));
  assert.ok(rendered.html.includes("Room Only"));
  assert.match(rendered.subject, /Globales Costa de la Calma/);
});

test("guestCount null / zero / negative are all treated as unknown", () => {
  for (const guestCount of [null, undefined, 0, -3]) {
    const r = renderBookingConfirmation({
      bookingId: "bk",
      hotelName: "H",
      checkin: "2026-09-10",
      checkout: "2026-09-12",
      holder: { firstName: "A", lastName: "B", email: "a@b.pl" },
      guestCount: guestCount as number | null | undefined,
      supportEmail: "pomoc@helptravel.pl",
    });
    assert.ok(!r.html.includes("Goście"), `guestCount=${String(guestCount)} must omit the row`);
  }
});

test("a known guestCount still renders, correctly pluralised", () => {
  const one = renderBookingConfirmation({
    bookingId: "bk",
    hotelName: "H",
    checkin: "2026-09-10",
    checkout: "2026-09-12",
    holder: { firstName: "A", lastName: "B", email: "a@b.pl" },
    guestCount: 1,
    supportEmail: "pomoc@helptravel.pl",
  });
  assert.ok(one.html.includes("Goście"));
  assert.ok(one.html.includes("1 osoba"));

  const five = renderBookingConfirmation({
    bookingId: "bk",
    hotelName: "H",
    checkin: "2026-09-10",
    checkout: "2026-09-12",
    holder: { firstName: "A", lastName: "B", email: "a@b.pl" },
    guestCount: 5,
    supportEmail: "pomoc@helptravel.pl",
  });
  assert.ok(five.html.includes("5 osób"));
  assert.ok(five.text.includes("Goście: 5 osób"));
});
