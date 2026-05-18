// Phase 1 — booking facade unit tests. Fetch-mocked (no network). Mirrors the
// withEnv + mockFetchOnce pattern from client.test.ts (house style).

import assert from "node:assert/strict";
import { test } from "node:test";

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

async function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function mockFetchOnce(
  responseBody: unknown,
  status = 200,
): { captured: CapturedRequest[]; restore: () => void } {
  const original = globalThis.fetch;
  const captured: CapturedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    let body: unknown = null;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    captured.push({ url, method: init?.method ?? "GET", headers, body });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { captured, restore: () => { globalThis.fetch = original; } };
}

function mockFetchReject(error: Error): { restore: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw error;
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = original; } };
}

function captureConsoleError(): { lines: string[]; restore: () => void } {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  return { lines, restore: () => { console.error = original; } };
}

const BASE_ENV = {
  LITEAPI_BASE_URL: "https://api.liteapi.travel/v3.0",
  LITEAPI_BOOK_BASE_URL: "https://book.liteapi.travel/v3.0",
  LITEAPI_SANDBOX_KEY: undefined,
  LITEAPI_SANDBOX_PRIVATE_KEY: undefined,
  LITEAPI_PROD_KEY: undefined,
  LITEAPI_PROD_PRIVATE_KEY: "prod_test_private",
  LITEAPI_PROD_PUBLIC_KEY: undefined,
  LITEAPI_API_KEY: undefined,
  LITEAPI_ENV: "production",
} as const;

const PREBOOK_OK = {
  data: {
    prebookId: "pb_123",
    transactionId: "tx_123",
    secretKey: "sk_live_xyz",
    hotelId: "lp1",
    rateId: "OFFER_ABC",
    price: 3628.89,
    currency: "PLN",
  },
};

const BOOK_OK = {
  data: {
    bookingId: "bk_999",
    status: "CONFIRMED",
    hotelConfirmationCode: "HCC-1",
    checkin: "2026-07-15",
    checkout: "2026-07-18",
    hotel: { hotelId: "lp1", name: "Seventy Barcelona" },
  },
};

const HOLDER = { firstName: "Jan", lastName: "Kowalski", email: "jan@example.com", phone: "+48500600700" };
const GUESTS = [{ occupancyNumber: 1, firstName: "Jan", lastName: "Kowalski" }];

test("prebookHotel: hits booking host with private key, sends offerId + usePaymentSdk, returns SDK handles", async () => {
  const { prebookHotel } = await import("./booking");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce(PREBOOK_OK);
    try {
      const res = await prebookHotel({ rateId: "OFFER_ABC", clientReference: "cr-1" });
      const req = m.captured[0];
      assert.equal(req.method, "POST");
      assert.equal(req.url, "https://book.liteapi.travel/v3.0/rates/prebook");
      assert.equal(req.headers["x-api-key"], "prod_test_private");
      const body = req.body as Record<string, unknown>;
      assert.equal(body.offerId, "OFFER_ABC");
      assert.equal(body.rateId, undefined, "rateId must not leak across boundary");
      assert.equal(body.usePaymentSdk, true);
      assert.equal(res.prebookId, "pb_123");
      assert.equal(res.transactionId, "tx_123");
      assert.equal(res.secretKey, "sk_live_xyz");
      assert.equal(res.price, 3628.89);
      assert.equal(res.currency, "PLN");
      assert.equal(res.expiresAt, undefined, "LiteAPI does not return expiresAt (Q2)");
    } finally {
      m.restore();
    }
  });
});

test("bookHotel: hits booking host, sends payment.method TRANSACTION_ID, returns confirmation", async () => {
  const { bookHotel } = await import("./booking");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce(BOOK_OK);
    try {
      const res = await bookHotel({
        prebookId: "pb_123",
        transactionId: "tx_123",
        clientReference: "cr-1",
        guests: GUESTS,
        holder: HOLDER,
      });
      const req = m.captured[0];
      assert.equal(req.method, "POST");
      assert.equal(req.url, "https://book.liteapi.travel/v3.0/rates/book");
      assert.equal(req.headers["x-api-key"], "prod_test_private");
      const body = req.body as Record<string, unknown>;
      const payment = body.payment as Record<string, unknown>;
      assert.equal(payment.method, "TRANSACTION_ID");
      assert.equal(payment.transactionId, "tx_123");
      assert.equal(body.prebookId, "pb_123");
      assert.equal(res.bookingId, "bk_999");
      assert.equal(res.status, "CONFIRMED");
    } finally {
      m.restore();
    }
  });
});

test("prebookHotel: LiteAPI 401 maps to BookingError code LITEAPI_DOWN (not a crash)", async () => {
  const { prebookHotel } = await import("./booking");
  const { BookingError } = await import("./booking-errors");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({ error: "unauthorized" }, 401);
    const cc = captureConsoleError();
    try {
      await assert.rejects(
        () => prebookHotel({ rateId: "OFFER_ABC" }),
        (err: unknown) => {
          assert.ok(err instanceof BookingError);
          assert.equal((err as InstanceType<typeof BookingError>).code, "LITEAPI_DOWN");
          return true;
        },
      );
      assert.ok(cc.lines.some((l) => l.includes("[liteapi][booking][prebook]") && l.includes("status=error")));
    } finally {
      cc.restore();
      m.restore();
    }
  });
});

test("prebookHotel: network failure maps to LITEAPI_DOWN", async () => {
  const { prebookHotel } = await import("./booking");
  const { BookingError } = await import("./booking-errors");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchReject(new TypeError("fetch failed"));
    const cc = captureConsoleError();
    try {
      await assert.rejects(
        () => prebookHotel({ rateId: "OFFER_ABC" }),
        (err: unknown) => {
          assert.ok(err instanceof BookingError);
          assert.equal((err as InstanceType<typeof BookingError>).code, "LITEAPI_DOWN");
          return true;
        },
      );
    } finally {
      cc.restore();
      m.restore();
    }
  });
});

test("CRITICAL: book() failing AFTER payment throws BookFailedAfterPaymentError + logs [CRITICAL]", async () => {
  const { bookHotel } = await import("./booking");
  const { BookFailedAfterPaymentError } = await import("./booking-errors");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce({ error: "internal" }, 500);
    const cc = captureConsoleError();
    try {
      await assert.rejects(
        () =>
          bookHotel({
            prebookId: "pb_123",
            transactionId: "tx_123",
            clientReference: "cr-1",
            guests: GUESTS,
            holder: HOLDER,
          }),
        (err: unknown) => {
          assert.ok(err instanceof BookFailedAfterPaymentError);
          assert.equal((err as InstanceType<typeof BookFailedAfterPaymentError>).code, "BOOK_FAILED_AFTER_PAYMENT");
          return true;
        },
      );
      const critical = cc.lines.find((l) => l.includes("[liteapi][booking][CRITICAL]"));
      assert.ok(critical, "expected a [CRITICAL] log line");
      assert.ok(critical!.includes("book_failed_after_payment"));
      assert.ok(critical!.includes("prebookId=pb_123"));
      assert.ok(critical!.includes("transactionId=tx_123"));
      assert.ok(critical!.includes("manual recovery required"));
    } finally {
      cc.restore();
      m.restore();
    }
  });
});

test("BOOKING_FLOW_MODE feature flag: default disabled; 'live' only when set", async () => {
  const { getBookingFlowMode, isBookingLive } = await import("@/lib/config/featureFlags");
  await withEnv({ BOOKING_FLOW_MODE: undefined }, async () => {
    assert.equal(getBookingFlowMode(), "disabled");
    assert.equal(isBookingLive(), false);
  });
  await withEnv({ BOOKING_FLOW_MODE: "live" }, async () => {
    assert.equal(getBookingFlowMode(), "live");
    assert.equal(isBookingLive(), true);
  });
  await withEnv({ BOOKING_FLOW_MODE: "LIVE" }, async () => {
    assert.equal(getBookingFlowMode(), "live");
  });
  await withEnv({ BOOKING_FLOW_MODE: "garbage" }, async () => {
    assert.equal(getBookingFlowMode(), "disabled");
  });
});
