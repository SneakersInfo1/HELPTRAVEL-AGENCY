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

test("bookHotel: hits booking host, sends payment.method TRANSACTION (LiteAPI Payment SDK), returns confirmation", async () => {
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
      // Locked to the EXACT LiteAPI-documented enum value. Two real-card
      // production failures (sids d9eaa09e, db11dc23) traced back to sending
      // "TRANSACTION_ID" here instead of the documented "TRANSACTION" —
      // LiteAPI rejects with HTTP 400 + code 4002. This assertion fails the
      // test if anyone reverts to the wrong value.
      assert.equal(payment.method, "TRANSACTION");
      assert.equal(payment.transactionId, "tx_123");
      assert.equal(body.prebookId, "pb_123");
      assert.equal(res.bookingId, "bk_999");
      assert.equal(res.status, "CONFIRMED");
    } finally {
      m.restore();
    }
  });
});

test("bookHotel: missing guest email is filled from holder.email at the boundary", async () => {
  // Regression for the 2026-05-24 production failure (sid 41dfe194). LiteAPI
  // requires `guests[0].email` on POST /rates/book — our form only collects
  // email at the holder level, so guests came through without email and LiteAPI
  // rejected with 4002 "Key: 'BookRequest.Guests[0].Email' Error: Field validation
  // for 'Email' failed on the 'required' tag". Fix: book.ts fills missing guest
  // emails from holder.email. This assertion locks the behavior.
  const { bookHotel } = await import("./booking");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce(BOOK_OK);
    try {
      const GUESTS_NO_EMAIL = [
        { occupancyNumber: 1, firstName: "Jakub", lastName: "Ogrodniczuk" },
        { occupancyNumber: 1, firstName: "Anna", lastName: "Nowak" },
      ];
      await bookHotel({
        prebookId: "pb_123",
        transactionId: "tx_123",
        clientReference: "cr-1",
        guests: GUESTS_NO_EMAIL,
        holder: HOLDER,
      });
      const req = m.captured[0];
      const body = req.body as { guests: Array<{ email?: string }> };
      assert.equal(
        body.guests[0].email,
        HOLDER.email,
        "guest[0] email must be filled from holder when missing",
      );
      assert.equal(
        body.guests[1].email,
        HOLDER.email,
        "all guests missing email must inherit holder.email",
      );
    } finally {
      m.restore();
    }
  });
});

test("bookHotel: explicit guest email is preserved (not overwritten by holder.email)", async () => {
  // Symmetric guarantee: when a caller DOES provide per-guest email (e.g. a
  // future multi-guest form that asks each guest separately), we must not
  // overwrite it with the holder.
  const { bookHotel } = await import("./booking");
  await withEnv(BASE_ENV, async () => {
    const m = mockFetchOnce(BOOK_OK);
    try {
      await bookHotel({
        prebookId: "pb_123",
        transactionId: "tx_123",
        clientReference: "cr-1",
        guests: [
          {
            occupancyNumber: 1,
            firstName: "Anna",
            lastName: "Nowak",
            email: "anna@example.com",
          },
        ],
        holder: HOLDER,
      });
      const req = m.captured[0];
      const body = req.body as { guests: Array<{ email?: string }> };
      assert.equal(body.guests[0].email, "anna@example.com");
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

test("CRITICAL: book() failing with a plain Error → wrapped as LiteApiUnknownError + errorDiag in log", async () => {
  // Regression for the 2026-05-24 diagnostic-blind failure (sid d9eaa09e):
  // a non-LiteApiError, non-TypeError, non-AbortError throw inside fetch would
  // escape unwrapped from liteApiRequest, leaving the [CRITICAL] log line with
  // `underlying_code=UNKNOWN` and no liteApiStatus/liteApiCode/liteApiBody —
  // operator-blind. Post-fix: client.ts wraps anything else as
  // LiteApiUnknownError + booking.ts logs errClass/errName/errMessage/cause.
  const { bookHotel } = await import("./booking");
  const { BookFailedAfterPaymentError } = await import("./booking-errors");
  await withEnv(BASE_ENV, async () => {
    class WeirdNonStandardError extends Error {
      constructor() {
        super("simulated platform glitch");
        this.name = "WeirdNonStandardError";
      }
    }
    const m = mockFetchReject(new WeirdNonStandardError());
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
          return true;
        },
      );
      const critical = cc.lines.find((l) => l.includes("[liteapi][booking][CRITICAL]"));
      assert.ok(critical, "expected a [CRITICAL] log line");
      // errorDiag MUST surface the underlying class + message even though
      // the err wasn't a LiteApiError originally.
      assert.match(
        critical!,
        /errClass=LiteApiUnknownError/,
        "outer error must be wrapped LiteApiUnknownError after client.ts catch-all",
      );
      assert.match(
        critical!,
        /errCauseClass=WeirdNonStandardError/,
        "cause chain must preserve the original error class",
      );
      assert.match(
        critical!,
        /errCauseMessage=simulated platform glitch/,
        "cause message must be preserved verbatim",
      );
    } finally {
      cc.restore();
      m.restore();
    }
  });
});

test("CRITICAL: Node 22 plain-Error AbortError → mapped to LiteApiTimeoutError (not UNKNOWN)", async () => {
  // Some Node 22 + undici configurations throw AbortError as a plain Error
  // (name === "AbortError"), not as a DOMException. The original narrow check
  // would skip the AbortError branch and fall through to the catch-all → log
  // shape would lose the timeout signal. Verify the broader detector catches
  // both shapes.
  const { bookHotel } = await import("./booking");
  const { BookFailedAfterPaymentError } = await import("./booking-errors");
  await withEnv(BASE_ENV, async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    const m = mockFetchReject(abortErr);
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
          return true;
        },
      );
      const critical = cc.lines.find((l) => l.includes("[liteapi][booking][CRITICAL]"));
      assert.ok(critical, "expected a [CRITICAL] log line");
      assert.match(
        critical!,
        /liteApiCode=LITEAPI_TIMEOUT/,
        "plain-Error AbortError must be recognized as timeout, not UNKNOWN",
      );
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
