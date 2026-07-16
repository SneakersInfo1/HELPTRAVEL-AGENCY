// Testy sinka efektów (na wstrzykniętych zależnościach — zero sieci):
// refundy = CRITICAL alert (świadomie ręczne, TODO:VERIFY), cancel wymaga
// hotelBookingId, e-maile wymagają contactEmail i mają uczciwą treść.

import test from "node:test";
import assert from "node:assert/strict";

import { newPackageBookingRecord, type PackageBookingRecord } from "./orchestrator";
import { createEffectSink } from "./productionEffectSink";

interface Calls {
  cancels: string[];
  emails: { to: string; subject: string; text: string }[];
  alerts: { title: string; level?: string }[];
  logs: string[];
}

function sinkWithCalls() {
  const calls: Calls = { cancels: [], emails: [], alerts: [], logs: [] };
  const sink = createEffectSink({
    cancelHotelBooking: async (id) => void calls.cancels.push(id),
    sendEmail: async (input) => void calls.emails.push(input),
    alert: async (input) => void calls.alerts.push({ title: input.title, level: input.level }),
    log: (message) => void calls.logs.push(message),
  });
  return { sink, calls };
}

function booking(over: Partial<PackageBookingRecord> = {}): PackageBookingRecord {
  return {
    ...newPackageBookingRecord("pkg-1"),
    sagaState: "COMPENSATING",
    hotelBookingId: "hb-1",
    flightBookingId: "fb-1",
    contactEmail: "klient@example.com",
    deadlineAt: "2026-08-10T12:15:00.000Z",
    ...over,
  };
}

test("CANCEL_HOTEL woła cancel z hotelBookingId; brak id = błąd (widoczny w logu kompensacji)", async () => {
  const { sink, calls } = sinkWithCalls();
  await sink.run(booking(), { type: "CANCEL_HOTEL" });
  assert.deepEqual(calls.cancels, ["hb-1"]);

  await assert.rejects(
    () => sink.run(booking({ hotelBookingId: null }), { type: "CANCEL_HOTEL" }),
    /bez hotelBookingId/,
  );
});

test("REFUND_HOTEL i REFUND_FLIGHT = CRITICAL alert do admina (ręczny zwrot, TODO:VERIFY)", async () => {
  const { sink, calls } = sinkWithCalls();
  await sink.run(booking(), { type: "REFUND_HOTEL" });
  await sink.run(booking(), { type: "REFUND_FLIGHT" });
  assert.equal(calls.alerts.length, 2);
  assert.ok(calls.alerts.every((a) => a.level === "critical"));
  assert.match(calls.alerts[0].title, /HOTEL/);
  assert.match(calls.alerts[1].title, /LOT/);
  assert.equal(calls.cancels.length, 0);
});

test("e-maile: resume ma deadline i link wznawiający, confirmation ma OBA numery rezerwacji", async () => {
  const { sink, calls } = sinkWithCalls();
  await sink.run(booking(), { type: "SEND_RESUME_EMAIL" });
  await sink.run(booking(), { type: "SEND_CONFIRMATION_EMAIL" });
  await sink.run(booking(), { type: "SEND_REFUND_EMAIL" });

  const [resume, confirm, refund] = calls.emails;
  assert.equal(resume.to, "klient@example.com");
  assert.match(resume.text, /dokończ/i);
  assert.match(resume.text, /pakiety\/checkout\?saga=pkg-1&step=flight/);
  assert.match(confirm.text, /hb-1/);
  assert.match(confirm.text, /fb-1/);
  assert.match(refund.text, /zwrot/i);
  assert.match(refund.text, /NUITEE TRAVEL/); // descriptor na wyciągu — uczciwość
});

test("e-mail bez contactEmail = błąd (nie gubimy cicho komunikacji z klientem)", async () => {
  const { sink } = sinkWithCalls();
  await assert.rejects(
    () => sink.run(booking({ contactEmail: null }), { type: "SEND_RESUME_EMAIL" }),
    /bez contactEmail/,
  );
});

test("ALERT_ADMIN przekazuje powód; SCHEDULE_DEADLINE i TRACK = tylko log (no-op)", async () => {
  const { sink, calls } = sinkWithCalls();
  await sink.run(booking(), { type: "ALERT_ADMIN", reason: "provider 500 po retry" });
  assert.equal(calls.alerts.length, 1);
  assert.equal(calls.alerts[0].level, "critical");

  await sink.run(booking(), { type: "SCHEDULE_DEADLINE", at: "2026-08-10T12:15:00.000Z" });
  await sink.run(booking(), { type: "TRACK", event: "package_saga_failed" });
  assert.equal(calls.logs.length, 2);
  assert.equal(calls.cancels.length, 0);
  assert.equal(calls.emails.length, 0);
});
