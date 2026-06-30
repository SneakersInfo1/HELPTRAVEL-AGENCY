// Testy jednostkowe LiteAPI Flights (Faza 1): store Redis (fake), maskowanie
// dokumentu, idempotencja webhooków, mapowanie błędów, walidacja wejścia.

import assert from "node:assert/strict";
import { test } from "node:test";

import { LiteApiError } from "../liteapi/errors";
import { toFlightApiError } from "./client";
import {
  FlightContactSchema,
  FlightPassengerSchema,
  FlightSearchInputSchema,
} from "./types";
import {
  __resetFlightRedisForTests,
  __setFlightRedisForTests,
  getFlightSession,
  markWebhookEventProcessed,
  maskDocumentNumber,
  saveFlightFailed,
  saveFlightSession,
  type FlightBookingRecord,
} from "./session";

// Fake Redis (Map) z obsługą nx + ex.
function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async <T>(k: string) => (store.has(k) ? (store.get(k) as T) : null),
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    del: async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return keys.length;
    },
  };
}

test("maskDocumentNumber: ostatnie 3 znaki jawne, reszta gwiazdki", () => {
  assert.equal(maskDocumentNumber("AB1234567"), "******567");
  assert.equal(maskDocumentNumber("X1"), "**");
  assert.equal(maskDocumentNumber(""), "");
  assert.equal(maskDocumentNumber(undefined), "");
});

test("store: zapis i odczyt sesji (fail-loud na braku store sprawdzony osobno)", async () => {
  const r = fakeRedis();
  __setFlightRedisForTests(r);
  const rec: FlightBookingRecord = {
    searchSessionId: "sid-1",
    offerId: "OFFER",
    paymentStatus: "pending",
    bookingStatus: "intent",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveFlightSession("sid-1", rec);
  const back = await getFlightSession("sid-1");
  assert.equal(back?.searchSessionId, "sid-1");
  assert.equal(back?.bookingStatus, "intent");
  __resetFlightRedisForTests();
});

test("store: rekord paid-but-unbooked persystuje (RULE 6)", async () => {
  const r = fakeRedis();
  __setFlightRedisForTests(r);
  await saveFlightFailed({ sessionId: "sid-2", prebookId: "pb", transactionId: "tx", errorCode: "PROVIDER_ERROR", message: "x", createdAt: Date.now() });
  assert.ok([...r.store.keys()].some((k) => k.includes("failed:sid-2")));
  __resetFlightRedisForTests();
});

test("webhook idempotencja: pierwszy event_id nowy, drugi duplikat", async () => {
  const r = fakeRedis();
  __setFlightRedisForTests(r);
  assert.equal(await markWebhookEventProcessed("ev-1"), true);
  assert.equal(await markWebhookEventProcessed("ev-1"), false);
  assert.equal(await markWebhookEventProcessed("ev-2"), true);
  __resetFlightRedisForTests();
});

test("toFlightApiError: sold out (53010) → OFFER_UNAVAILABLE 409", () => {
  const liteErr = new LiteApiError("LITEAPI_UNKNOWN", "x", "x", {
    status: 502,
    body: { error: { code: 53010, description: "provider error: offer is sold out" } },
  });
  const e = toFlightApiError(liteErr, "prebook");
  assert.equal(e.code, "OFFER_UNAVAILABLE");
  assert.equal(e.httpStatus, 409);
});

test("toFlightApiError: walidacja (43001) → VALIDATION 422", () => {
  const liteErr = new LiteApiError("LITEAPI_UNKNOWN", "x", "x", {
    status: 400,
    body: { error: { code: 43001, description: "field required" } },
  });
  const e = toFlightApiError(liteErr, "prebook");
  assert.equal(e.code, "VALIDATION");
  assert.equal(e.httpStatus, 422);
});

test("toFlightApiError: 5xx bez kodu → PROVIDER_ERROR 502", () => {
  const liteErr = new LiteApiError("LITEAPI_NETWORK", "HTTP 503", "x", { status: 503 });
  const e = toFlightApiError(liteErr, "search");
  assert.equal(e.code, "PROVIDER_ERROR");
  assert.equal(e.httpStatus, 502);
});

// Regresja prod 2026-06-30: LiteAPI dla verify zwraca HTTP 500 z
// `{error:{code:52099,description:"failed to verify flight offer",
// message:"unable to process verify request"}}` gdy oferta nie da się
// potwierdzić (wygasła / GDS nie przeliczy). To NIE jest błąd przejściowy —
// ten sam offerId zawsze da 500. Mapowanie na PROVIDER_ERROR mówiło userowi
// „spróbuj ponownie" (a retry tej samej oferty nigdy nie pomoże) i route'a
// retry'ował 5xx 3× → burst 500 do LiteAPI. Musi mapować na OFFER_UNAVAILABLE,
// żeby UI skierował usera po ŚWIEŻE wyniki (?fresh=1).
test("toFlightApiError: verify 52099 (failed to verify) → OFFER_UNAVAILABLE 409", () => {
  const liteErr = new LiteApiError("LITEAPI_NETWORK", "HTTP 500", "x", {
    status: 500,
    body: { error: { code: 52099, description: "failed to verify flight offer", message: "unable to process verify request" } },
  });
  const e = toFlightApiError(liteErr, "verify");
  assert.equal(e.code, "OFFER_UNAVAILABLE");
  assert.equal(e.httpStatus, 409);
});

// Prawdziwa awaria dostawcy (500 BEZ markera oferty) musi zostać
// PROVIDER_ERROR — „spróbuj ponownie" jest tu poprawne (nie wysyłamy usera
// po świeże wyniki, bo to nie wygasła oferta tylko chwilowy problem API).
test("toFlightApiError: 500 z generycznym body NIE jest OFFER_UNAVAILABLE", () => {
  const liteErr = new LiteApiError("LITEAPI_NETWORK", "HTTP 500", "x", {
    status: 500,
    body: { error: { code: 50000, description: "internal server error" } },
  });
  const e = toFlightApiError(liteErr, "verify");
  assert.equal(e.code, "PROVIDER_ERROR");
});

test("verifyFlightOffer: na powtarzalnym 500 (52099) NIE retry'uje (1 strzał, bez bursta do LiteAPI)", async () => {
  const priorKey = process.env.LITEAPI_SANDBOX_KEY;
  const priorEnv = process.env.LITEAPI_ENV;
  const priorFetch = globalThis.fetch;
  process.env.LITEAPI_SANDBOX_KEY = "sand_test_verify";
  delete process.env.LITEAPI_ENV;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ error: { code: 52099, description: "failed to verify flight offer", message: "unable to process verify request" } }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const { verifyFlightOffer } = await import("./client");
    await assert.rejects(() => verifyFlightOffer("OFFER_DEAD"));
    assert.equal(calls, 1, `oczekiwano 1 wywołania verify, było ${calls} (retry hamerował LiteAPI)`);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.LITEAPI_SANDBOX_KEY; else process.env.LITEAPI_SANDBOX_KEY = priorKey;
    if (priorEnv === undefined) delete process.env.LITEAPI_ENV; else process.env.LITEAPI_ENV = priorEnv;
  }
});

test("walidacja search: poprawne wejście przechodzi, IATA i daty pilnowane", () => {
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const ok = FlightSearchInputSchema.safeParse({ legs: [{ origin: "waw", destination: "lhr", date: future }], adults: 1 });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.legs[0].origin, "WAW"); // uppercased

  const badIata = FlightSearchInputSchema.safeParse({ legs: [{ origin: "WARSAW", destination: "LHR", date: future }], adults: 1 });
  assert.equal(badIata.success, false);

  const pastDate = FlightSearchInputSchema.safeParse({ legs: [{ origin: "WAW", destination: "LHR", date: "2000-01-01" }], adults: 1 });
  assert.equal(pastDate.success, false);

  const sameAirport = FlightSearchInputSchema.safeParse({ legs: [{ origin: "WAW", destination: "WAW", date: future }], adults: 1 });
  assert.equal(sameAirport.success, false);
});

test("walidacja pasażera: gender M/F/X, documentType małymi, nationality ISO-2", () => {
  const base = { firstName: "Jan", lastName: "Kowalski", birthday: "1990-05-15", gender: "M", nationality: "PL", documentType: "passport", documentNumber: "AB1234567", documentExpiry: "2031-01-01", documentIssueCountry: "PL" };
  assert.equal(FlightPassengerSchema.safeParse(base).success, true);
  assert.equal(FlightPassengerSchema.safeParse({ ...base, gender: "MALE" }).success, false);
  assert.equal(FlightPassengerSchema.safeParse({ ...base, documentType: "PASSPORT" }).success, false);
  assert.equal(FlightPassengerSchema.safeParse({ ...base, nationality: "POL" }).success, false);
});

test("walidacja kontaktu: email + phoneCountryCode domyślnie 48", () => {
  const ok = FlightContactSchema.safeParse({ firstName: "Jan", lastName: "Kowalski", email: "jan@example.com", phoneNumber: "600100200" });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.phoneCountryCode, "48");
  assert.equal(FlightContactSchema.safeParse({ firstName: "Jan", lastName: "Kowalski", email: "nie-email", phoneNumber: "600100200" }).success, false);
});
