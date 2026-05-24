// Phase 1 unit tests for /lib/liteapi/* — pure helpers (no network).
// Network-bound contract tests against the LiteAPI sandbox are deferred to
// scripts/smoke-liteapi.ts (Phase 1 deliverable) and a Phase 8 vitest+msw
// suite that gates on PR. This file covers the boundary helpers we ship now.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LiteApiAuthError,
  LiteApiNetworkError,
  LiteApiRateExpiredError,
  LiteApiRateLimitError,
  LiteApiSoldOutError,
  LiteApiValidationError,
  liteApiErrorFromResponse,
} from "./errors";
import { resolveCountryCode } from "./search";
import { getEnv } from "./client";
import { LiteApiHotelsListResponseSchema, LiteApiPrebookResponseSchema } from "./types";
import { addMinor, fromMinor, mulMinor, subMinor, toMinor } from "../money";
import { verifyWebhookSignature, verifyWebhookAuthToken } from "./webhook";
import { createHmac } from "node:crypto";

test("liteApiErrorFromResponse maps statuses", () => {
  assert.ok(liteApiErrorFromResponse(401, null) instanceof LiteApiAuthError);
  assert.ok(liteApiErrorFromResponse(403, null) instanceof LiteApiAuthError);
  assert.ok(liteApiErrorFromResponse(409, null) instanceof LiteApiRateExpiredError);
  assert.ok(liteApiErrorFromResponse(410, null) instanceof LiteApiSoldOutError);
  assert.ok(liteApiErrorFromResponse(422, null) instanceof LiteApiValidationError);
  assert.ok(liteApiErrorFromResponse(429, null) instanceof LiteApiRateLimitError);
  assert.ok(liteApiErrorFromResponse(503, null) instanceof LiteApiNetworkError);
});

test("liteApiErrorFromResponse exposes Polish user-facing message", () => {
  const e = liteApiErrorFromResponse(409, { foo: 1 });
  assert.match(e.userMessagePl, /Cena.*wygasła/);
  assert.equal(e.status, 409);
  assert.equal(e.internalCode, "LITEAPI_RATE_EXPIRED");
});

test("resolveCountryCode handles common variants", () => {
  assert.equal(resolveCountryCode("Spain"), "ES");
  assert.equal(resolveCountryCode("United Kingdom"), "GB");
  assert.equal(resolveCountryCode("UK"), "GB");
  assert.equal(resolveCountryCode("PL"), "PL");
  assert.equal(resolveCountryCode("Republic of Italy"), "IT");
  assert.equal(resolveCountryCode("Atlantis"), null);
});

test("resolveCountryCode handles Polish localised names from Geoapify", () => {
  // Geoapify is queried with lang=pl, so country arrives in Polish.
  // These mappings are what stops the planner falling through to error.tsx.
  assert.equal(resolveCountryCode("Niemcy"), "DE");
  assert.equal(resolveCountryCode("Hiszpania"), "ES");
  assert.equal(resolveCountryCode("Portugalia"), "PT");
  assert.equal(resolveCountryCode("Włochy"), "IT");
  assert.equal(resolveCountryCode("Wielka Brytania"), "GB");
  assert.equal(resolveCountryCode("Grecja"), "GR");
  assert.equal(resolveCountryCode("Francja"), "FR");
});

test("LiteApiHotelsListResponseSchema accepts the documented shape", () => {
  const ok = LiteApiHotelsListResponseSchema.safeParse({
    data: [
      {
        id: "lp101",
        name: "Sample Hotel",
        city: "Malaga",
        country: "Spain",
        latitude: 36.7,
        longitude: -4.4,
        stars: 4,
        main_photo: "https://static.cupid.travel/hotels/abc.jpg",
      },
    ],
    total: 1,
  });
  assert.ok(ok.success, ok.success ? "" : JSON.stringify(ok.error.issues));
});

test("LiteApiPrebookResponseSchema accepts SDK handle (Payments activated)", () => {
  const ok = LiteApiPrebookResponseSchema.safeParse({
    data: {
      prebookId: "pb_123",
      transactionId: "tx_abc",
      secretKey: "sk_xyz",
      hotelId: "lp101",
      rateId: "rt_1",
      price: 1234.56,
      currency: "PLN",
    },
  });
  assert.ok(ok.success);
});

test("LiteApiPrebookResponseSchema accepts response without SDK handle (Payments NOT activated)", () => {
  const ok = LiteApiPrebookResponseSchema.safeParse({
    data: { prebookId: "pb_123", price: 100, currency: "PLN" },
  });
  // Schema must NOT reject — but caller (smoke test) treats this as failure.
  assert.ok(ok.success);
});

test("money.toMinor rounds half-away-from-zero", () => {
  assert.equal(toMinor(1234.56), BigInt(123456));
  assert.equal(toMinor(0), BigInt(0));
  assert.equal(toMinor(0.005), BigInt(1));
  assert.equal(toMinor(-12.34), BigInt(-1234));
});

test("money.fromMinor produces display-only number", () => {
  assert.equal(fromMinor(BigInt(123456)), 1234.56);
  assert.equal(fromMinor(BigInt(-1234)), -12.34);
  assert.equal(fromMinor(BigInt(0)), 0);
});

test("money arithmetic stays in bigint", () => {
  const a = toMinor(100.5);
  const b = toMinor(50.25);
  assert.equal(addMinor(a, b), BigInt(15075));
  assert.equal(subMinor(a, b), BigInt(5025));
  assert.equal(mulMinor(a, 23), toMinor(23.115));
});

test("verifyWebhookSignature rejects bad signature", () => {
  const secret = "test-secret";
  // Envelope updated 2026-05-24: LiteAPI confirmed canonical shape is
  // { event_id, event_name, request, response, sandbox }. HMAC path is kept
  // for legacy/custom senders, but the envelope MUST match the new schema
  // regardless of which verification method we use.
  const body = JSON.stringify({
    event_id: "evt_test",
    event_name: "booking.book",
    request: "{}",
    response: "{}",
    sandbox: false,
  });
  assert.throws(() =>
    verifyWebhookSignature({ rawBody: body, signatureHeader: "deadbeef", secret }),
  );
  assert.throws(() =>
    verifyWebhookSignature({ rawBody: body, signatureHeader: null, secret }),
  );
});

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T | Promise<T>): T | Promise<T> {
  const prior: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) {
    prior[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  const restore = () => {
    for (const k of Object.keys(prior)) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k];
    }
  };
  let result: T | Promise<T>;
  try {
    result = fn();
  } catch (err) {
    restore();
    throw err;
  }
  if (result && typeof (result as Promise<T>).then === "function") {
    return (result as Promise<T>).then(
      (v) => { restore(); return v; },
      (e) => { restore(); throw e; },
    );
  }
  restore();
  return result;
}

test("getEnv throws when LITEAPI_BASE_URL points at non-existent sandbox subdomain", () => {
  withEnv(
    {
      LITEAPI_BASE_URL: "https://api.sandbox.liteapi.travel/v3.0",
      LITEAPI_SANDBOX_KEY: "sand_test",
    },
    () => {
      assert.throws(() => getEnv(), /single hostname/i);
    },
  );
});

test("getEnv defaults to documented hosts when env vars are absent", () => {
  withEnv(
    {
      LITEAPI_BASE_URL: undefined,
      LITEAPI_BOOK_BASE_URL: undefined,
      LITEAPI_SANDBOX_KEY: "sand_test",
      LITEAPI_SANDBOX_PRIVATE_KEY: "sand_test_priv",
      LITEAPI_PROD_KEY: undefined,
      LITEAPI_PROD_PRIVATE_KEY: undefined,
      LITEAPI_PROD_PUBLIC_KEY: undefined,
      LITEAPI_API_KEY: undefined,
      LITEAPI_ENV: undefined,
    },
    () => {
      const env = getEnv();
      assert.equal(env.apiBase, "https://api.liteapi.travel/v3.0");
      assert.equal(env.bookBase, "https://book.liteapi.travel/v3.0");
    },
  );
});

test("getEnv mode is driven by API key prefix", () => {
  withEnv(
    {
      LITEAPI_BASE_URL: undefined,
      LITEAPI_BOOK_BASE_URL: undefined,
      LITEAPI_SANDBOX_KEY: "sand_abc",
      LITEAPI_SANDBOX_PRIVATE_KEY: undefined,
      LITEAPI_PROD_KEY: undefined,
      LITEAPI_PROD_PRIVATE_KEY: undefined,
      LITEAPI_PROD_PUBLIC_KEY: undefined,
      LITEAPI_API_KEY: undefined,
      LITEAPI_ENV: undefined,
    },
    () => assert.equal(getEnv().mode, "sandbox"),
  );
  withEnv(
    {
      LITEAPI_BASE_URL: undefined,
      LITEAPI_BOOK_BASE_URL: undefined,
      LITEAPI_SANDBOX_KEY: undefined,
      LITEAPI_SANDBOX_PRIVATE_KEY: undefined,
      LITEAPI_PROD_KEY: "prod_xyz",
      LITEAPI_PROD_PRIVATE_KEY: "prod_xyz_priv",
      LITEAPI_PROD_PUBLIC_KEY: undefined,
      LITEAPI_API_KEY: undefined,
      LITEAPI_ENV: "production",
    },
    () => assert.equal(getEnv().mode, "production"),
  );
});

test("verifyWebhookSignature accepts a correct signature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({
    event_id: "evt_test",
    event_name: "booking.book",
    request: "{}",
    response: "{}",
    sandbox: false,
  });
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  const event = verifyWebhookSignature({ rawBody: body, signatureHeader: sig, secret });
  assert.equal(event.event_name, "booking.book");
  assert.equal(event.event_id, "evt_test");
});

// ── verifyWebhookAuthToken (canonical, per LiteAPI 2026-05-24) ───────────────

test("verifyWebhookAuthToken accepts when Authorization header == token", () => {
  const token = "shared-secret-from-liteapi-dashboard";
  const body = JSON.stringify({
    event_id: "evt_abc",
    event_name: "booking.refund",
    request: '{"bookingId":"r1"}',
    response: '{"amountRefunded":99}',
    sandbox: false,
  });
  const event = verifyWebhookAuthToken({
    rawBody: body,
    authorizationHeader: token,
    authToken: token,
  });
  assert.equal(event.event_name, "booking.refund");
});

test("verifyWebhookAuthToken accepts Bearer prefix (defensive — LiteAPI doesn't use it, but tolerant)", () => {
  const token = "shared-secret-2";
  const body = JSON.stringify({
    event_id: "evt_xyz",
    event_name: "booking.book",
    request: "{}",
    response: "{}",
  });
  const event = verifyWebhookAuthToken({
    rawBody: body,
    authorizationHeader: `Bearer ${token}`,
    authToken: token,
  });
  assert.equal(event.event_id, "evt_xyz");
});

test("verifyWebhookAuthToken rejects when Authorization header is missing or mismatches", () => {
  const token = "right-token";
  const body = JSON.stringify({
    event_id: "e",
    event_name: "booking.book",
    request: "{}",
    response: "{}",
  });
  assert.throws(() =>
    verifyWebhookAuthToken({ rawBody: body, authorizationHeader: null, authToken: token }),
  );
  assert.throws(() =>
    verifyWebhookAuthToken({
      rawBody: body,
      authorizationHeader: "wrong-token",
      authToken: token,
    }),
  );
});

test("verifyWebhookAuthToken throws when LITEAPI_WEBHOOK_AUTH_TOKEN is unconfigured", () => {
  // No authToken override AND no env var → fail closed.
  const body = JSON.stringify({
    event_id: "e",
    event_name: "booking.book",
    request: "{}",
    response: "{}",
  });
  const prior = process.env.LITEAPI_WEBHOOK_AUTH_TOKEN;
  delete process.env.LITEAPI_WEBHOOK_AUTH_TOKEN;
  try {
    assert.throws(() =>
      verifyWebhookAuthToken({ rawBody: body, authorizationHeader: "anything" }),
    );
  } finally {
    if (prior !== undefined) process.env.LITEAPI_WEBHOOK_AUTH_TOKEN = prior;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API boundary contract tests
//
// These tests mock `globalThis.fetch` to capture the outgoing request body /
// URL and assert the JSON keys match the LiteAPI documented contract. They
// guard against regressions like the prebook `rateId` → `offerId` field-name
// drift that broke Phase 1 sandbox smoke.
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockFetchOnce(responseBody: unknown, status = 200): {
  captured: CapturedRequest[];
  restore: () => void;
} {
  const original = globalThis.fetch;
  const captured: CapturedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = new Headers(init.headers);
      h.forEach((v, k) => (headers[k] = v));
    }
    let body: unknown = null;
    if (init?.body && typeof init.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    captured.push({ url, method: init?.method ?? "GET", headers, body });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { captured, restore: () => { globalThis.fetch = original; } };
}

const BASE_ENV = {
  LITEAPI_BASE_URL: "https://api.liteapi.travel/v3.0",
  LITEAPI_BOOK_BASE_URL: "https://book.liteapi.travel/v3.0",
  LITEAPI_SANDBOX_KEY: "sand_test_public",
  LITEAPI_SANDBOX_PRIVATE_KEY: "sand_test_private",
  LITEAPI_PROD_KEY: undefined,
  LITEAPI_PROD_PRIVATE_KEY: undefined,
  LITEAPI_PROD_PUBLIC_KEY: undefined,
  LITEAPI_API_KEY: undefined,
  LITEAPI_ENV: undefined,
} as const;

test("contract: searchHotels (GET /data/hotels) sends countryCode + cityName + limit", async () => {
  const { fetchHotelsList } = await import("./search");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({ data: [], total: 0 });
    try {
      await fetchHotelsList({ city: "Malaga", country: "Spain", limit: 5 });
      const req = m.captured[0];
      assert.equal(req.method, "GET");
      assert.match(req.url, /^https:\/\/api\.liteapi\.travel\/v3\.0\/data\/hotels\?/);
      assert.match(req.url, /countryCode=ES/);
      assert.match(req.url, /cityName=Malaga/);
      assert.match(req.url, /limit=5/);
      assert.equal(req.headers["x-api-key"], "sand_test_public");
    } finally { m.restore(); }
  });
});

test("contract: getRates (POST /hotels/rates) sends documented body keys", async () => {
  const { getRates } = await import("./rates");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({ data: [] });
    try {
      await getRates({
        hotelIds: ["lp1"],
        checkin: "2026-06-01",
        checkout: "2026-06-05",
        currency: "PLN",
        occupancies: [{ adults: 2, children: [] }],
      });
      const req = m.captured[0];
      assert.equal(req.method, "POST");
      assert.equal(req.url, "https://api.liteapi.travel/v3.0/hotels/rates");
      const body = req.body as Record<string, unknown>;
      assert.deepEqual(Object.keys(body).sort(), [
        "checkin", "checkout", "currency", "guestNationality", "hotelIds", "limit", "occupancies",
      ]);
      assert.equal(req.headers["x-api-key"], "sand_test_public");
    } finally { m.restore(); }
  });
});

test("contract: getHotelDetail (GET /data/hotel) sends hotelId query", async () => {
  const { getHotelDetail } = await import("./hotel");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({
      data: { id: "lp1", name: "X", city: "Malaga", main_photo: "https://x/y.jpg" },
    });
    try {
      await getHotelDetail("lp1");
      const req = m.captured[0];
      assert.equal(req.method, "GET");
      assert.match(req.url, /^https:\/\/api\.liteapi\.travel\/v3\.0\/data\/hotel\?hotelId=lp1$/);
    } finally { m.restore(); }
  });
});

test("contract: prebook (POST /rates/book base, /rates/prebook path) sends offerId — NOT rateId", async () => {
  const { prebook } = await import("./prebook");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({ data: { prebookId: "pb_1" } });
    try {
      await prebook({ rateId: "OFFER_ABC", clientReference: "cr-1" });
      const req = m.captured[0];
      assert.equal(req.method, "POST");
      assert.equal(req.url, "https://book.liteapi.travel/v3.0/rates/prebook");
      const body = req.body as Record<string, unknown>;
      // Key contract: offerId must be present, rateId must NOT be present.
      assert.equal(body.offerId, "OFFER_ABC", "expected offerId at boundary");
      assert.equal(body.rateId, undefined, "rateId leaked across boundary");
      assert.equal(body.usePaymentSdk, true);
      assert.equal(body.clientReference, "cr-1");
      // private-key endpoint
      assert.equal(req.headers["x-api-key"], "sand_test_private");
    } finally { m.restore(); }
  });
});

test("contract: book (POST /rates/book) sends guests (NOT guestInfo) + payment.method", async () => {
  const { book } = await import("./book");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({
      data: {
        bookingId: "b1",
        status: "CONFIRMED",
        checkin: "2026-06-01",
        checkout: "2026-06-05",
        hotel: { hotelId: "lp1" },
      },
    });
    try {
      await book({
        prebookId: "pb_1",
        transactionId: "tx_1",
        clientReference: "cr-1",
        guests: [{ occupancyNumber: 1, firstName: "Jan", lastName: "Kowalski" }],
        holder: { firstName: "Jan", lastName: "Kowalski", email: "j@k.pl", phone: "+48500111222" },
      });
      const req = m.captured[0];
      // `?timeout=60` is an explicit LiteAPI-side timeout (confirmed by their
      // support 2026-05-24) telling their backend to wait up to 60s for the
      // supplier upstream instead of returning early. Pin both the path and
      // the query param.
      assert.equal(req.url, "https://book.liteapi.travel/v3.0/rates/book?timeout=60");
      const body = req.body as Record<string, unknown>;
      assert.ok(Array.isArray(body.guests), "expected `guests` array at boundary");
      assert.equal(body.guestInfo, undefined, "guestInfo leaked across boundary");
      const payment = body.payment as Record<string, unknown>;
      // LiteAPI Payment SDK requires the literal value "TRANSACTION_ID" — see
      // book.ts JSDoc for the enum spec confirmed by LiteAPI support 2026-05-24.
      assert.equal(payment.method, "TRANSACTION_ID");
      assert.equal(payment.transactionId, "tx_1");
      assert.equal(body.prebookId, "pb_1");
      assert.equal(req.headers["x-api-key"], "sand_test_private");
    } finally { m.restore(); }
  });
});

test("contract: getBooking (GET /bookings/{id}) routes to book host with private key", async () => {
  const { getBooking } = await import("./retrieve");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({
      data: {
        bookingId: "b1",
        status: "CONFIRMED",
        checkin: "2026-06-01",
        checkout: "2026-06-05",
        hotel: { hotelId: "lp1" },
      },
    });
    try {
      await getBooking("b1");
      const req = m.captured[0];
      assert.equal(req.method, "GET");
      assert.equal(req.url, "https://book.liteapi.travel/v3.0/bookings/b1");
      assert.equal(req.headers["x-api-key"], "sand_test_private");
    } finally { m.restore(); }
  });
});

test("contract: cancelBooking (DELETE /bookings/{id}) routes to book host with private key", async () => {
  const { cancelBooking } = await import("./cancel");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({ data: { bookingId: "b1", status: "CANCELLED" } });
    try {
      await cancelBooking("b1");
      const req = m.captured[0];
      assert.equal(req.method, "DELETE");
      assert.equal(req.url, "https://book.liteapi.travel/v3.0/bookings/b1");
      assert.equal(req.headers["x-api-key"], "sand_test_private");
    } finally { m.restore(); }
  });
});
