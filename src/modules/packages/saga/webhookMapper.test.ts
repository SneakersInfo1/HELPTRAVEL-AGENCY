// Testy mapowania eventów webhooka lotów (realny kontrakt koperty z repo 1.6:
// event_name + bookingId/prebookId z response) na zdarzenia sagi pakietowej.

import test from "node:test";
import assert from "node:assert/strict";

import { sagaEventForFlightWebhook } from "./webhookMapper";

test("flight.book.confirmed → FLIGHT_CONFIRMED", () => {
  assert.deepEqual(sagaEventForFlightWebhook("flight.book.confirmed", "ev-1"), { type: "FLIGHT_CONFIRMED" });
});

test("flight.book.failed i .expired → FLIGHT_EXPIRED z powodem zawierającym event_id", () => {
  for (const name of ["flight.book.failed", "flight.book.expired"]) {
    const e = sagaEventForFlightWebhook(name, "ev-77");
    assert.equal(e?.type, "FLIGHT_EXPIRED", name);
    const reason = e?.type === "FLIGHT_EXPIRED" ? e.reason ?? "" : "";
    assert.match(reason, new RegExp(name.replace(/\./g, "\\.")));
    assert.match(reason, /ev-77/);
  }
});

test("eventy informacyjne / post-terminalne / nieznane → null (bez przejścia)", () => {
  for (const name of [
    "flight.book.pending.confirmation",
    "flight.book.created",
    "flight.book.cancelled", // po CONFIRMED = ręczna operacja, nie automat
    "flight.prebook",
    "flight.attachServices",
    "totally.unknown",
  ]) {
    assert.equal(sagaEventForFlightWebhook(name, "ev-1"), null, name);
  }
});
