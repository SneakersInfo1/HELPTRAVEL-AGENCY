// Testy sweepa crona (deadline'y + polling) i ekstraktora statusu rezerwacji.

import test from "node:test";
import assert from "node:assert/strict";

import { extractFlightBookingStatus, runPackageSagaSweep, type SweepDeps } from "./sagaSweep";
import type { SagaEvent } from "./sagaTypes";

function deps(over: Partial<SweepDeps>): { deps: SweepDeps; applied: { id: string; event: SagaEvent }[] } {
  const applied: { id: string; event: SagaEvent }[] = [];
  return {
    applied,
    deps: {
      listDueDeadlines: async () => [],
      listAwaitingFlightConfirmation: async () => [],
      fetchFlightBookingStatus: async () => "pending",
      apply: async (id, event) => {
        applied.push({ id, event });
        return { kind: "applied" };
      },
      ...over,
    },
  };
}

test("miniony deadline odpala DEADLINE_REACHED per saga", async () => {
  const { deps: d, applied } = deps({
    listDueDeadlines: async () => [{ id: "pkg-1" }, { id: "pkg-2" }],
  });
  const s = await runPackageSagaSweep(d);
  assert.equal(s.deadlinesFired, 2);
  assert.deepEqual(applied.map((a) => [a.id, a.event.type]), [
    ["pkg-1", "DEADLINE_REACHED"],
    ["pkg-2", "DEADLINE_REACHED"],
  ]);
});

test("polling: confirmed → FLIGHT_CONFIRMED, expired/failed → FLIGHT_EXPIRED, pending → czeka", async () => {
  const statuses: Record<string, "confirmed" | "expired" | "failed" | "pending"> = {
    "fb-a": "confirmed",
    "fb-b": "expired",
    "fb-c": "pending",
    "fb-d": "failed",
  };
  const { deps: d, applied } = deps({
    listAwaitingFlightConfirmation: async () => [
      { id: "p-a", flightBookingId: "fb-a" },
      { id: "p-b", flightBookingId: "fb-b" },
      { id: "p-c", flightBookingId: "fb-c" },
      { id: "p-d", flightBookingId: "fb-d" },
    ],
    fetchFlightBookingStatus: async (id) => statuses[id],
  });
  const s = await runPackageSagaSweep(d);
  assert.equal(s.confirmed, 1);
  assert.equal(s.expired, 2); // expired + failed
  assert.equal(s.stillPending, 1);
  assert.deepEqual(applied.map((a) => [a.id, a.event.type]), [
    ["p-a", "FLIGHT_CONFIRMED"],
    ["p-b", "FLIGHT_EXPIRED"],
    ["p-d", "FLIGHT_EXPIRED"],
  ]);
});

test("błąd API pollingu nie przerywa sweepa i NIE kompensuje na ślepo", async () => {
  const { deps: d, applied } = deps({
    listAwaitingFlightConfirmation: async () => [
      { id: "p-err", flightBookingId: "fb-err" },
      { id: "p-ok", flightBookingId: "fb-ok" },
    ],
    fetchFlightBookingStatus: async (id) => {
      if (id === "fb-err") throw new Error("timeout");
      return "confirmed";
    },
  });
  const s = await runPackageSagaSweep(d);
  assert.equal(s.confirmed, 1);
  assert.equal(s.errors.length, 1);
  assert.match(s.errors[0], /p-err/);
  assert.deepEqual(applied.map((a) => a.id), ["p-ok"]);
});

test("saga w FLIGHT_BOOKED bez flightBookingId ląduje w błędach (manual)", async () => {
  const { deps: d } = deps({
    listAwaitingFlightConfirmation: async () => [{ id: "p-x", flightBookingId: null }],
  });
  const s = await runPackageSagaSweep(d);
  assert.equal(s.errors.length, 1);
  assert.match(s.errors[0], /p-x/);
});

test("extractFlightBookingStatus: tolerancyjny na kształt, nieznane = pending", () => {
  assert.equal(extractFlightBookingStatus({ data: { status: "CONFIRMED" } }), "confirmed");
  assert.equal(extractFlightBookingStatus({ data: [{ bookingStatus: "Ticketed" }] }), "confirmed");
  assert.equal(extractFlightBookingStatus({ status: "expired" }), "expired");
  assert.equal(extractFlightBookingStatus({ data: { state: "FAILED" } }), "failed");
  assert.equal(extractFlightBookingStatus({ data: { status: "PENDING_CONFIRMATION" } }), "pending");
  assert.equal(extractFlightBookingStatus({ zupelnie: "inny kształt" }), "pending");
  assert.equal(extractFlightBookingStatus(null), "pending");
});
