// Testy mapowania webhooków LiteAPI → zdarzenia sagi + weryfikacji podpisu.

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { mapLiteApiWebhook, verifyWebhookSignature } from "./webhookMapper";

test("flight.book.confirmed → FLIGHT_CONFIRMED z referencjami", () => {
  const m = mapLiteApiWebhook({ event: "flight.book.confirmed", data: { bookingId: "fb-1", prebookId: "pb-1" } });
  assert.equal(m?.event.type, "FLIGHT_CONFIRMED");
  assert.equal(m?.ref.flightBookingId, "fb-1");
  assert.equal(m?.ref.flightPrebookId, "pb-1");
});

test("flight.book.failed → FLIGHT_BOOK_FAILED_PERMANENT z powodem", () => {
  const m = mapLiteApiWebhook({ event: "flight.book.failed", data: { bookingId: "fb-1", reason: "ticketing error" } });
  assert.equal(m?.event.type, "FLIGHT_BOOK_FAILED_PERMANENT");
  assert.equal(m?.event.type === "FLIGHT_BOOK_FAILED_PERMANENT" ? m.event.reason : "", "ticketing error");
});

test("flight.book.expired → FLIGHT_EXPIRED; brak powodu → domyślny z typu", () => {
  const m = mapLiteApiWebhook({ event: "flight.book.expired", data: { bookingId: "fb-1" } });
  assert.equal(m?.event.type, "FLIGHT_EXPIRED");
  assert.match(m?.event.type === "FLIGHT_EXPIRED" ? m.event.reason ?? "" : "", /flight\.book\.expired/);
});

test("booking.book_error (hotel) → HOTEL_BOOK_FAILED", () => {
  const m = mapLiteApiWebhook({ event: "booking.book_error", data: { bookingId: "hb-1", error: "sold out" } });
  assert.equal(m?.event.type, "HOTEL_BOOK_FAILED");
  assert.equal(m?.ref.hotelBookingId, "hb-1");
});

test("eventy informacyjne i nieznane → null (bez przejścia, handler odpowiada 200)", () => {
  assert.equal(mapLiteApiWebhook({ event: "flight.book.pending.confirmation", data: { bookingId: "x" } }), null);
  assert.equal(mapLiteApiWebhook({ event: "booking.prebook_error", data: {} }), null);
  assert.equal(mapLiteApiWebhook({ event: "totally.unknown" }), null);
  assert.equal(mapLiteApiWebhook(null), null);
  assert.equal(mapLiteApiWebhook("nie-obiekt"), null);
  assert.equal(mapLiteApiWebhook({}), null);
});

test("tolerancja kształtu: type zamiast event, pola płasko bez data", () => {
  const m = mapLiteApiWebhook({ type: "flight.book.confirmed", bookingId: "fb-2" });
  assert.equal(m?.event.type, "FLIGHT_CONFIRMED");
  assert.equal(m?.ref.flightBookingId, "fb-2");
});

test("podpis: poprawny hex i wariant sha256= przechodzą, zły nie", () => {
  const secret = "sekret-testowy";
  const body = JSON.stringify({ event: "flight.book.confirmed" });
  const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");

  assert.equal(verifyWebhookSignature(body, hex, secret), true);
  assert.equal(verifyWebhookSignature(body, `sha256=${hex}`, secret), true);
  assert.equal(verifyWebhookSignature(body, hex.toUpperCase(), secret), true);
  assert.equal(verifyWebhookSignature(body, "deadbeef", secret), false);
  assert.equal(verifyWebhookSignature(body, null, secret), false);
  assert.equal(verifyWebhookSignature(body, hex, ""), false);
  assert.equal(verifyWebhookSignature(`${body} `, hex, secret), false); // inne body = inny podpis
});
