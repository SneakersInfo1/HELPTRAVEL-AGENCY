// Phase 2 — booking API route tests. node:test + tsx. LiteAPI fetch is mocked;
// Upstash is replaced with an in-memory fake via the session test seam; the
// rate limiter uses the rate-limit test seam. No network, no real Redis.

import assert from "node:assert/strict";
import { test } from "node:test";

import { NextRequest } from "next/server";

import {
  __resetBookingRedisForTests,
  __setBookingRedisForTests,
} from "@/lib/booking/session";
import { __resetLimitersForTests, __setLimiterForTests } from "@/lib/rate-limit";
import { __resetResendClientForTests } from "@/lib/email/client";

function makeFakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    async get<T>(k: string): Promise<T | null> {
      return store.has(k) ? (store.get(k) as T) : null;
    },
    async set(k: string, v: unknown): Promise<string> {
      store.set(k, JSON.parse(JSON.stringify(v)));
      return "OK";
    },
    async del(...ks: string[]): Promise<number> {
      let n = 0;
      for (const k of ks) if (store.delete(k)) n += 1;
      return n;
    },
  };
}

let fetchCalls: Array<{ url: string; body: unknown }> = [];
function mockFetch(
  handler: (url: string, body: unknown) => { status: number; body: unknown },
): () => void {
  const orig = globalThis.fetch;
  fetchCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    let body: unknown = null;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    fetchCalls.push({ url, body });
    const r = handler(url, body);
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

async function withEnv(
  over: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(over)) {
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

const LIVE_ENV: Record<string, string | undefined> = {
  LITEAPI_BASE_URL: "https://api.liteapi.travel/v3.0",
  LITEAPI_BOOK_BASE_URL: "https://book.liteapi.travel/v3.0",
  LITEAPI_PROD_PRIVATE_KEY: "prod_test_private",
  LITEAPI_PROD_KEY: undefined,
  LITEAPI_SANDBOX_KEY: undefined,
  LITEAPI_SANDBOX_PRIVATE_KEY: undefined,
  LITEAPI_PROD_PUBLIC_KEY: undefined,
  LITEAPI_API_KEY: undefined,
  LITEAPI_ENV: "production",
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  BOOKING_FLOW_MODE: "live",
  // Keep the confirmation-email send fully inert during tests regardless of the
  // developer's real shell env: with no RESEND_API_KEY the sender hits its
  // documented skip path (no network, no `fetch`), so `emailSent` is false and
  // the `fetchCalls.length === 0` assertions stay deterministic.
  RESEND_API_KEY: undefined,
  EMAIL_FROM: undefined,
  EMAIL_REPLY_TO: undefined,
  EMAIL_BCC: undefined,
};

const PREBOOK_REQ_BODY = {
  offerId: "OFFER_ABCDEFGH",
  hotel: { name: "Seventy Barcelona", city: "Barcelona" },
  rate: {
    boardName: "RO",
    price: 2878.92,
    currency: "PLN",
    checkin: "2026-07-15",
    checkout: "2026-07-18",
  },
};
const HOLDER = {
  firstName: "Jan",
  lastName: "Kowalski",
  email: "jan@example.com",
  phone: "+48500600700",
};
const GUESTS = [{ occupancyNumber: 1, firstName: "Jan", lastName: "Kowalski" }];

const PREBOOK_OK = {
  data: {
    prebookId: "pb_1",
    transactionId: "tx_1",
    secretKey: "pi_sk_1",
    price: 2878.92,
    currency: "PLN",
  },
};
const BOOK_OK = {
  data: {
    bookingId: "bk_1",
    status: "CONFIRMED",
    hotelConfirmationCode: "HCC-1",
    checkin: "2026-07-15",
    checkout: "2026-07-18",
    hotel: { hotelId: "lp1", name: "Seventy Barcelona" },
  },
};

/** Only real provider booking calls — reconcile GETs and alert/email POSTs excluded. */
function bookCalls(): Array<{ url: string; body: unknown }> {
  return fetchCalls.filter((c) => c.url.includes("/rates/book"));
}
/** Alert webhook POSTs, so a test can assert on what was (not) raised. */
function alertCalls(): Array<Record<string, unknown>> {
  return fetchCalls
    .filter((c) => c.url.includes(ALERT_URL))
    .map((c) => c.body as Record<string, unknown>);
}
const ALERT_URL = "https://alerts.test.invalid/hook";
const RESEND_URL = "api.resend.com";

function post(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("happy path: prebook → session persisted (no transactionId leaked) → book → confirmed", async () => {
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    __setBookingRedisForTests(fake);
    const restore = mockFetch((url) =>
      url.includes("/rates/prebook")
        ? { status: 200, body: PREBOOK_OK }
        : { status: 200, body: BOOK_OK },
    );
    try {
      const { POST: prebookPOST } = await import("./prebook/route");
      const r1 = await prebookPOST(post("http://t/api/booking/prebook", PREBOOK_REQ_BODY));
      assert.equal(r1.status, 200);
      const j1 = (await r1.json()) as Record<string, unknown>;
      assert.ok(j1.sessionId);
      assert.equal(j1.secretKey, "pi_sk_1");
      assert.equal(j1.transactionId, undefined, "transactionId must NOT leak to client");
      assert.ok(typeof j1.expiresAt === "string");
      const sessionId = j1.sessionId as string;
      assert.ok(fake.store.has(`booking:v1:session:${sessionId}`));

      const { POST: bookPOST } = await import("./book/route");
      const r2 = await bookPOST(
        post("http://t/api/booking/book", { sessionId, holder: HOLDER, guests: GUESTS }),
      );
      assert.equal(r2.status, 200);
      const j2 = (await r2.json()) as Record<string, unknown>;
      assert.equal(j2.status, "confirmed");
      assert.equal(j2.bookingId, "bk_1");
      assert.ok(fake.store.has("booking:v1:completed:bk_1"));
      assert.equal(fake.store.has(`booking:v1:session:${sessionId}`), false, "session deleted");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("confirmed book response carries booking details + emailSent flag (for the confirmation page)", async () => {
  // The return page renders trustworthy post-payment details (dates, board,
  // price, guests) and an honest "email sent" line from THIS response body.
  // With no RESEND_API_KEY in the test env the email is skipped, so emailSent
  // MUST be false (we never claim a mail went out when it did not).
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    __setBookingRedisForTests(fake);
    const restore = mockFetch((url) =>
      url.includes("/rates/prebook")
        ? { status: 200, body: PREBOOK_OK }
        : { status: 200, body: BOOK_OK },
    );
    try {
      const { POST: prebookPOST } = await import("./prebook/route");
      const r1 = await prebookPOST(
        post("http://t/api/booking/prebook", { ...PREBOOK_REQ_BODY, holder: HOLDER, guests: GUESTS }),
      );
      const sessionId = (await r1.json()).sessionId as string;

      const { POST: bookPOST } = await import("./book/route");
      const r2 = await bookPOST(post("http://t/api/booking/book", { sessionId }));
      assert.equal(r2.status, 200);
      const j = (await r2.json()) as Record<string, unknown>;

      assert.equal(j.status, "confirmed");
      assert.equal(j.bookingId, "bk_1");
      const rate = j.rateSummary as Record<string, unknown> | undefined;
      assert.ok(rate, "rateSummary must be returned so the page can show dates/board");
      assert.equal(rate.checkin, "2026-07-15");
      assert.equal(rate.checkout, "2026-07-18");
      assert.equal(j.currency, "PLN");
      assert.equal(typeof j.price, "number");
      assert.equal(j.guestCount, 1);
      assert.equal(j.emailSent, false, "no RESEND_API_KEY → must not claim email sent");
      assert.equal(j.emailTo ?? null, null, "no recipient echoed when email not sent");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("validation failure → 400", async () => {
  await withEnv(LIVE_ENV, async () => {
    __setBookingRedisForTests(makeFakeRedis());
    const restore = mockFetch(() => ({ status: 200, body: PREBOOK_OK }));
    try {
      const { POST } = await import("./prebook/route");
      const r = await POST(post("http://t/api/booking/prebook", { offerId: "x" }));
      assert.equal(r.status, 400);
      assert.equal((await r.json()).error, "invalid_body");
      assert.equal(fetchCalls.length, 0, "must not call LiteAPI on invalid input");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("feature flag disabled → 503 on prebook AND book", async () => {
  await withEnv({ ...LIVE_ENV, BOOKING_FLOW_MODE: undefined }, async () => {
    __setBookingRedisForTests(makeFakeRedis());
    const restore = mockFetch(() => ({ status: 200, body: PREBOOK_OK }));
    try {
      const { POST: pre } = await import("./prebook/route");
      const r1 = await pre(post("http://t/api/booking/prebook", PREBOOK_REQ_BODY));
      assert.equal(r1.status, 503);
      assert.equal((await r1.json()).error, "booking_disabled");
      const { POST: bk } = await import("./book/route");
      const r2 = await bk(
        post("http://t/api/booking/book", { sessionId: "x".repeat(10), holder: HOLDER, guests: GUESTS }),
      );
      assert.equal(r2.status, 503);
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("rate limit exceeded → 429", async () => {
  await withEnv(LIVE_ENV, async () => {
    __setBookingRedisForTests(makeFakeRedis());
    __setLimiterForTests("booking-prebook", {
      limit: async () => ({
        success: false,
        reset: Date.now() + 60_000,
        limit: 10,
        remaining: 0,
      }),
    } as never);
    const restore = mockFetch(() => ({ status: 200, body: PREBOOK_OK }));
    try {
      const { POST } = await import("./prebook/route");
      const r = await POST(post("http://t/api/booking/prebook", PREBOOK_REQ_BODY));
      assert.equal(r.status, 429);
      assert.equal(fetchCalls.length, 0);
    } finally {
      restore();
      __resetLimitersForTests();
      __resetBookingRedisForTests();
    }
  });
});

test("session expired (no payment evidence) → 410 session_expired, no recovery record", async () => {
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    // Pre-seed an expired session (createdAt > 24h in the past — new TTL).
    fake.store.set("booking:v1:session:expired-sess", {
      prebookId: "pb_x",
      transactionId: "tx_x",
      offerId: "o",
      hotelSummary: { name: "H" },
      rateSummary: { checkin: "2026-07-15", checkout: "2026-07-18" },
      createdAt: Date.now() - 25 * 3600 * 1000,
    });
    __setBookingRedisForTests(fake);
    const restore = mockFetch(() => ({ status: 200, body: BOOK_OK }));
    try {
      const { POST } = await import("./book/route");
      const r = await POST(
        post("http://t/api/booking/book", {
          sessionId: "expired-sess",
          holder: HOLDER,
          guests: GUESTS,
          // NO paymentIntentId — caller is not a fresh Stripe redirect.
        }),
      );
      assert.equal(r.status, 410);
      assert.equal((await r.json()).error, "session_expired");
      assert.equal(fetchCalls.length, 0, "no LiteAPI book call for an expired session");
      assert.equal(
        fake.store.has("booking:v1:failed:expired-sess"),
        false,
        "no recovery record without payment evidence — benign session expiry",
      );
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("session expired WITH payment_intent → 410 book_failed + recovery record persisted", async () => {
  // The real-money loss path (sid 3124f752, 2026-05-23): Stripe redirected the
  // user back AFTER capturing the charge, but our Redis session had already
  // expired during the SCA flow. Pre-fix we returned 410 session_expired and
  // walked away — Stripe charge orphaned, LiteAPI never called. Post-fix: when
  // the return page forwards `payment_intent`, we persist a recovery record
  // and surface the BOOK_FAILED_AFTER_PAYMENT recovery message.
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    fake.store.set("booking:v1:session:lost-sess", {
      prebookId: "pb_lost",
      transactionId: "tx_lost",
      offerId: "o",
      hotelSummary: { name: "H" },
      rateSummary: { checkin: "2026-07-15", checkout: "2026-07-18" },
      createdAt: Date.now() - 25 * 3600 * 1000,
    });
    __setBookingRedisForTests(fake);
    // The provider is consulted first (authoritative `clientReference` index)
    // and confirms it has NO booking → this is a genuine paid-but-unbooked.
    const restore = mockFetch(() => ({ status: 200, body: { data: [] } }));
    try {
      const { POST } = await import("./book/route");
      const r = await POST(
        post("http://t/api/booking/book", {
          sessionId: "lost-sess",
          paymentIntentId: "pi_3OqW7m_test",
          holder: HOLDER,
          guests: GUESTS,
        }),
      );
      assert.equal(r.status, 410);
      const j = (await r.json()) as Record<string, unknown>;
      assert.equal(j.error, "book_failed");
      assert.equal(j.recoveryId, "lost-sess");
      assert.match(String(j.message), /Skontaktuj się z nami/);
      assert.equal(bookCalls().length, 0, "must NOT call /rates/book — session is gone");
      const rec = fake.store.get("booking:v1:failed:lost-sess") as
        | Record<string, unknown>
        | undefined;
      assert.ok(rec, "recovery record MUST be persisted (NON-NEGOTIABLE RULE 6)");
      assert.equal(rec.paymentIntentId, "pi_3OqW7m_test");
      assert.equal(rec.errorCode, "BOOK_FAILED_AFTER_PAYMENT");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("session missing entirely WITH payment_intent → 410 book_failed + recovery (24h+ Redis eviction)", async () => {
  // Variant of the above where Redis no longer holds the session at all
  // (eviction, manual flush, multi-region inconsistency). Recovery must still
  // fire — the sessionId + paymentIntentId alone are enough.
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    __setBookingRedisForTests(fake);
    const restore = mockFetch(() => ({ status: 200, body: { data: [] } }));
    try {
      const { POST } = await import("./book/route");
      const r = await POST(
        post("http://t/api/booking/book", {
          sessionId: "ghost-sess",
          paymentIntentId: "pi_ghost_test",
        }),
      );
      assert.equal(r.status, 410);
      const j = (await r.json()) as Record<string, unknown>;
      assert.equal(j.recoveryId, "ghost-sess");
      assert.equal(bookCalls().length, 0, "must NOT call /rates/book");
      const rec = fake.store.get("booking:v1:failed:ghost-sess") as
        | Record<string, unknown>
        | undefined;
      assert.ok(rec, "recovery record MUST persist even with no prior session");
      assert.equal(rec.paymentIntentId, "pi_ghost_test");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("idempotency: replayed prebook returns cached response, no 2nd LiteAPI call", async () => {
  await withEnv(LIVE_ENV, async () => {
    __setBookingRedisForTests(makeFakeRedis());
    const restore = mockFetch(() => ({ status: 200, body: PREBOOK_OK }));
    try {
      const { POST } = await import("./prebook/route");
      const h = { "idempotency-key": "idem-123" };
      const r1 = await POST(post("http://t/api/booking/prebook", PREBOOK_REQ_BODY, h));
      const j1 = await r1.json();
      assert.equal(r1.status, 200);
      assert.equal(fetchCalls.length, 1);
      const r2 = await POST(post("http://t/api/booking/prebook", PREBOOK_REQ_BODY, h));
      const j2 = await r2.json();
      assert.equal(r2.status, 200);
      assert.equal(fetchCalls.length, 1, "replay must NOT call LiteAPI again");
      assert.deepEqual(j2, j1);
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("book failure AFTER payment → 502 book_failed + recovery record persisted", async () => {
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    __setBookingRedisForTests(fake);
    const restore = mockFetch((url) =>
      url.includes("/rates/prebook")
        ? { status: 200, body: PREBOOK_OK }
        : { status: 500, body: { error: "provider exploded" } },
    );
    try {
      const { POST: pre } = await import("./prebook/route");
      const r1 = await pre(post("http://t/api/booking/prebook", PREBOOK_REQ_BODY));
      const sessionId = (await r1.json()).sessionId as string;

      const { POST: bk } = await import("./book/route");
      const r2 = await bk(
        post("http://t/api/booking/book", { sessionId, holder: HOLDER, guests: GUESTS }),
      );
      assert.equal(r2.status, 502);
      const j = (await r2.json()) as Record<string, unknown>;
      assert.equal(j.error, "book_failed");
      assert.equal(j.recoveryId, sessionId);
      assert.match(String(j.message), /Skontaktuj się z nami/);
      assert.ok(
        fake.store.has(`booking:v1:failed:${sessionId}`),
        "recovery record must be persisted",
      );
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("GET /api/booking/[bookingId]: 200 client-safe fields, 404 for unknown", async () => {
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    fake.store.set("booking:v1:completed:bk_42", {
      bookingId: "bk_42",
      confirmationCode: "HCC-42",
      status: "CONFIRMED",
      hotelSummary: { name: "Seventy Barcelona", city: "Barcelona" },
      rateSummary: { checkin: "2026-07-15", checkout: "2026-07-18", currency: "PLN" },
      price: 2878.92,
      currency: "PLN",
      createdAt: Date.now(),
    });
    __setBookingRedisForTests(fake);
    try {
      const { GET } = await import("./[bookingId]/route");
      const ok = await GET(new NextRequest("http://t/api/booking/bk_42"), {
        params: Promise.resolve({ bookingId: "bk_42" }),
      });
      assert.equal(ok.status, 200);
      const j = (await ok.json()) as Record<string, unknown>;
      assert.equal(j.bookingId, "bk_42");
      assert.equal(j.confirmationCode, "HCC-42");
      assert.equal(j.transactionId, undefined);
      assert.equal(j.prebookId, undefined);
      assert.equal(j.secretKey, undefined);

      const nf = await GET(new NextRequest("http://t/api/booking/nope"), {
        params: Promise.resolve({ bookingId: "nope" }),
      });
      assert.equal(nf.status, 404);
    } finally {
      __resetBookingRedisForTests();
    }
  });
});

// ── Phase 3 — guest data carried through the session (redirect flow) ──────────

test("Phase 3: prebook persists holder/guests into the session", async () => {
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    __setBookingRedisForTests(fake);
    const restore = mockFetch(() => ({ status: 200, body: PREBOOK_OK }));
    try {
      const { POST } = await import("./prebook/route");
      const r = await POST(
        post("http://t/api/booking/prebook", {
          ...PREBOOK_REQ_BODY,
          holder: HOLDER,
          guests: GUESTS,
        }),
      );
      assert.equal(r.status, 200);
      const sessionId = (await r.json()).sessionId as string;
      const sess = fake.store.get(`booking:v1:session:${sessionId}`) as Record<
        string,
        unknown
      >;
      assert.deepEqual(sess.holder, HOLDER);
      assert.deepEqual(sess.guests, GUESTS);
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("Phase 3: book with NO body holder/guests resolves them from the session", async () => {
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    __setBookingRedisForTests(fake);
    const restore = mockFetch((url) =>
      url.includes("/rates/prebook")
        ? { status: 200, body: PREBOOK_OK }
        : { status: 200, body: BOOK_OK },
    );
    try {
      const { POST: pre } = await import("./prebook/route");
      const r1 = await pre(
        post("http://t/api/booking/prebook", {
          ...PREBOOK_REQ_BODY,
          holder: HOLDER,
          guests: GUESTS,
        }),
      );
      const sessionId = (await r1.json()).sessionId as string;

      const { POST: bk } = await import("./book/route");
      const r2 = await bk(
        post("http://t/api/booking/book", { sessionId }), // no holder/guests
      );
      assert.equal(r2.status, 200);
      assert.equal((await r2.json()).status, "confirmed");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("Phase 3: book with neither body nor session guest data → 400", async () => {
  await withEnv(LIVE_ENV, async () => {
    const fake = makeFakeRedis();
    fake.store.set("booking:v1:session:no-guests", {
      prebookId: "pb",
      transactionId: "tx",
      offerId: "o",
      hotelSummary: { name: "H" },
      rateSummary: { checkin: "2026-07-15", checkout: "2026-07-18" },
      createdAt: Date.now(),
    });
    __setBookingRedisForTests(fake);
    const restore = mockFetch(() => ({ status: 200, body: BOOK_OK }));
    try {
      const { POST } = await import("./book/route");
      const r = await POST(post("http://t/api/booking/book", { sessionId: "no-guests" }));
      assert.equal(r.status, 400);
      assert.equal((await r.json()).error, "invalid_body");
      assert.equal(fetchCalls.length, 0, "must not call LiteAPI without guest data");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

// ── /api/booking/webhook — LiteAPI lifecycle event receiver ───────────────────

function makeWebhookRequest(body: string, authHeader: string | null): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authHeader !== null) headers["authorization"] = authHeader;
  return new NextRequest("http://t/api/booking/webhook", {
    method: "POST",
    headers,
    body,
  });
}

test("webhook: missing Authorization → 401, nothing persisted", async () => {
  await withEnv(
    { ...LIVE_ENV, LITEAPI_WEBHOOK_AUTH_TOKEN: "dashboard-token" },
    async () => {
      const fake = makeFakeRedis();
      __setBookingRedisForTests(fake);
      try {
        const { POST } = await import("./webhook/route");
        const body = JSON.stringify({
          event_id: "e1",
          event_name: "booking.book",
          request: "{}",
          response: '{"data":{"bookingId":"bk_evil"}}',
        });
        const r = await POST(makeWebhookRequest(body, null));
        assert.equal(r.status, 401);
        assert.equal(fake.store.has("booking:v1:completed:bk_evil"), false);
      } finally {
        __resetBookingRedisForTests();
      }
    },
  );
});

test("webhook: wrong Authorization → 401, nothing persisted", async () => {
  await withEnv(
    { ...LIVE_ENV, LITEAPI_WEBHOOK_AUTH_TOKEN: "dashboard-token" },
    async () => {
      const fake = makeFakeRedis();
      __setBookingRedisForTests(fake);
      try {
        const { POST } = await import("./webhook/route");
        const body = JSON.stringify({
          event_id: "e2",
          event_name: "booking.book",
          request: "{}",
          response: '{"data":{"bookingId":"bk_evil2"}}',
        });
        const r = await POST(makeWebhookRequest(body, "wrong-token"));
        assert.equal(r.status, 401);
        assert.equal(fake.store.has("booking:v1:completed:bk_evil2"), false);
      } finally {
        __resetBookingRedisForTests();
      }
    },
  );
});

test("webhook: valid Authorization + booking.book → persist completed record", async () => {
  await withEnv(
    { ...LIVE_ENV, LITEAPI_WEBHOOK_AUTH_TOKEN: "dashboard-token" },
    async () => {
      const fake = makeFakeRedis();
      __setBookingRedisForTests(fake);
      try {
        const { POST } = await import("./webhook/route");
        const body = JSON.stringify({
          event_id: "e3",
          event_name: "booking.book",
          request: '{"prebookId":"pb_1"}',
          response: JSON.stringify({
            data: {
              bookingId: "bk_via_webhook",
              status: "CONFIRMED",
              hotelConfirmationCode: "",
              checkin: "2026-07-15",
              checkout: "2026-07-18",
              hotel: { hotelId: "lp1", name: "Seventy Barcelona" },
              price: 3628.89,
              currency: "PLN",
            },
          }),
          sandbox: false,
        });
        const r = await POST(makeWebhookRequest(body, "dashboard-token"));
        assert.equal(r.status, 200);
        assert.equal((await r.json()).status, "ok");
        const persisted = fake.store.get("booking:v1:completed:bk_via_webhook") as
          | Record<string, unknown>
          | undefined;
        assert.ok(persisted, "webhook MUST persist a completed record");
        assert.equal(persisted.bookingId, "bk_via_webhook");
        assert.equal(persisted.status, "CONFIRMED");
        assert.equal(persisted.price, 3628.89);
      } finally {
        __resetBookingRedisForTests();
      }
    },
  );
});

test("webhook: unknown event_name → 200 no-op (don't retry-storm)", async () => {
  await withEnv(
    { ...LIVE_ENV, LITEAPI_WEBHOOK_AUTH_TOKEN: "dashboard-token" },
    async () => {
      const fake = makeFakeRedis();
      __setBookingRedisForTests(fake);
      try {
        const { POST } = await import("./webhook/route");
        const body = JSON.stringify({
          event_id: "e4",
          event_name: "foo.unknown",
          request: "{}",
          response: "{}",
        });
        const r = await POST(makeWebhookRequest(body, "dashboard-token"));
        assert.equal(r.status, 200);
        assert.equal(fake.store.size, 0);
      } finally {
        __resetBookingRedisForTests();
      }
    },
  );
});

test("webhook: malformed envelope after valid auth → 200 accepted_with_parse_error (no retry storm)", async () => {
  await withEnv(
    { ...LIVE_ENV, LITEAPI_WEBHOOK_AUTH_TOKEN: "dashboard-token" },
    async () => {
      const fake = makeFakeRedis();
      __setBookingRedisForTests(fake);
      try {
        const { POST } = await import("./webhook/route");
        // event_id is required by envelope schema — sending without it
        const body = JSON.stringify({ event_name: "booking.book" });
        const r = await POST(makeWebhookRequest(body, "dashboard-token"));
        assert.equal(r.status, 200);
        assert.equal((await r.json()).status, "accepted_with_parse_error");
      } finally {
        __resetBookingRedisForTests();
      }
    },
  );
});

test("webhook: booking.book without data.bookingId in embedded response → 200 noop (logged warn)", async () => {
  await withEnv(
    { ...LIVE_ENV, LITEAPI_WEBHOOK_AUTH_TOKEN: "dashboard-token" },
    async () => {
      const fake = makeFakeRedis();
      __setBookingRedisForTests(fake);
      try {
        const { POST } = await import("./webhook/route");
        const body = JSON.stringify({
          event_id: "e5",
          event_name: "booking.book",
          request: "{}",
          response: "{}", // empty — no data.bookingId
        });
        const r = await POST(makeWebhookRequest(body, "dashboard-token"));
        assert.equal(r.status, 200);
        assert.equal(fake.store.size, 0, "must not persist anything without bookingId");
      } finally {
        __resetBookingRedisForTests();
      }
    },
  );
});

// ────────────────────────────────────────────────────────────────────────────
// INCYDENT 2026-08-28 — booking 9c-OQvmqJ (sid c9897a4a-...)
//
// Provider log: /rates/prebook 200 @21:49:18, /rates/book 200 @21:54:14,
// booking CONFIRMED. Two things then went wrong:
//   1. Resend answered 403 — the sender was the hardcoded `onboarding@resend.dev`
//      testing domain, which only delivers to the Resend account owner.
//   2. 30m38s LATER a return-page revisit raised a FALSE [CRITICAL]
//      BOOK_FAILED_AFTER_PAYMENT, because `deleteSession` had removed the only
//      sessionId-keyed record and the 300s idem cache had expired.
//
// The cases below lock both fixes in. These env variants set ALERT_WEBHOOK_URL
// so `notify()` POSTs through the mocked fetch and alerts become assertable.
// ────────────────────────────────────────────────────────────────────────────

const ALERTING_ENV = { ...LIVE_ENV, ALERT_WEBHOOK_URL: ALERT_URL };
const EMAIL_ENV = {
  ...ALERTING_ENV,
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "HelpTravel.pl <rezerwacje@mail.helptravel.pl>",
  EMAIL_REPLY_TO: "kontakt@helptravel.pl",
};

/** Seeds a live session and returns its id. */
function seedSession(fake: ReturnType<typeof makeFakeRedis>, id: string): string {
  fake.store.set(`booking:v1:session:${id}`, {
    prebookId: "pb_1",
    transactionId: "tx_1",
    offerId: "o",
    price: 2878.92,
    currency: "PLN",
    hotelSummary: { name: "Seventy Barcelona", city: "Barcelona" },
    rateSummary: { boardName: "RO", checkin: "2026-07-15", checkout: "2026-07-18" },
    holder: HOLDER,
    guests: GUESTS,
    rooms: 1,
    pax: 2,
    createdAt: Date.now(),
  });
  return id;
}

test("CASE 1: payment -> book OK -> email OK => confirmed, session completed, email sent, NO critical alert", async () => {
  await withEnv(EMAIL_ENV, async () => {
    const fake = makeFakeRedis();
    const sid = seedSession(fake, "case1-sess");
    __setBookingRedisForTests(fake);
    // The Resend client is memoized per process and earlier tests ran without
    // RESEND_API_KEY, caching `null`. Reset so this test gets a live client.
    __resetResendClientForTests();
    const restore = mockFetch((url) => {
      if (url.includes(RESEND_URL)) return { status: 200, body: { id: "msg_case1" } };
      if (url.includes("/rates/book")) return { status: 200, body: BOOK_OK };
      return { status: 200, body: { data: [] } };
    });
    try {
      const { POST } = await import("./book/route");
      const r = await POST(post("http://t/api/booking/book", { sessionId: sid }));
      assert.equal(r.status, 200);
      const j = (await r.json()) as Record<string, unknown>;

      assert.equal(j.status, "confirmed");
      assert.equal(j.bookingId, "bk_1");
      assert.equal(j.emailSent, true, "email actually accepted by Resend");
      assert.equal(j.emailTo, HOLDER.email);

      assert.ok(fake.store.has("booking:v1:completed:bk_1"), "booking persisted");
      assert.ok(
        fake.store.has(`booking:v1:session-booking:${sid}`),
        "durable session->booking pointer persisted",
      );
      assert.equal(fake.store.has(`booking:v1:session:${sid}`), false, "session completed");

      const criticals = alertCalls().filter((a) => a.level === "critical");
      assert.deepEqual(criticals, [], "no critical alert on a fully successful booking");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("CASE 2: book OK -> email FAILS (Resend 403) => booking stays confirmed, warning only, never BOOK_FAILED_AFTER_PAYMENT", async () => {
  await withEnv(EMAIL_ENV, async () => {
    const fake = makeFakeRedis();
    const sid = seedSession(fake, "case2-sess");
    __setBookingRedisForTests(fake);
    __resetResendClientForTests();
    const restore = mockFetch((url) => {
      // The exact production failure: Resend rejects the send.
      if (url.includes(RESEND_URL)) {
        return {
          status: 403,
          body: {
            statusCode: 403,
            name: "validation_error",
            message:
              "The resend.dev domain is for testing and can only send to your own email address.",
          },
        };
      }
      if (url.includes("/rates/book")) return { status: 200, body: BOOK_OK };
      return { status: 200, body: { data: [] } };
    });
    try {
      const { POST } = await import("./book/route");
      const r = await POST(post("http://t/api/booking/book", { sessionId: sid }));

      assert.equal(r.status, 200, "email failure must NOT change the HTTP outcome");
      const j = (await r.json()) as Record<string, unknown>;
      assert.equal(j.status, "confirmed", "booking remains CONFIRMED");
      assert.equal(j.bookingId, "bk_1");
      assert.equal(j.emailSent, false, "honest: we never claim a mail went out");
      assert.equal(j.emailTo, null);

      const completed = fake.store.get("booking:v1:completed:bk_1") as Record<string, unknown>;
      assert.ok(completed, "booking persisted BEFORE the email side-effect");
      assert.equal(completed.status, "CONFIRMED");

      const alerts = alertCalls();
      assert.equal(
        alerts.filter((a) => a.level === "critical").length,
        0,
        "a failed email must NEVER raise a critical alert",
      );
      const warnings = alerts.filter((a) => a.level === "warning");
      assert.equal(warnings.length, 1, "exactly one warning for the failed email");
      const fields = warnings[0]!.fields as Record<string, unknown>;
      assert.equal(fields.errorCode, "BOOKING_CONFIRMATION_EMAIL_FAILED");
      assert.notEqual(fields.errorCode, "BOOK_FAILED_AFTER_PAYMENT");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("CASE 3: provider book FAILS after payment => real BOOK_FAILED_AFTER_PAYMENT still fires", async () => {
  await withEnv(ALERTING_ENV, async () => {
    const fake = makeFakeRedis();
    const sid = seedSession(fake, "case3-sess");
    __setBookingRedisForTests(fake);
    __resetResendClientForTests();
    const restore = mockFetch((url) => {
      if (url.includes("/rates/book")) {
        return { status: 500, body: { error: { code: 5000, message: "supplier down" } } };
      }
      return { status: 200, body: { data: [] } }; // reconcile: provider has nothing
    });
    try {
      const { POST } = await import("./book/route");
      const r = await POST(post("http://t/api/booking/book", { sessionId: sid }));

      assert.equal(r.status, 502);
      const j = (await r.json()) as Record<string, unknown>;
      assert.equal(j.error, "book_failed");
      assert.equal(j.recoveryId, sid);

      const rec = fake.store.get(`booking:v1:failed:${sid}`) as Record<string, unknown>;
      assert.ok(rec, "recovery record MUST be persisted");
      assert.equal(rec.errorCode, "BOOK_FAILED_AFTER_PAYMENT");

      const criticals = alertCalls().filter((a) => a.level === "critical");
      assert.equal(criticals.length, 1, "the REAL failure must still alert");
      assert.equal(criticals[0]!.title, "Booking failed after payment");
      assert.equal(
        fake.store.has(`booking:v1:session-booking:${sid}`),
        false,
        "no success pointer for a failed booking",
      );
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("CASE 4 (THE INCIDENT): confirmed booking, then return-page revisit after session+idem are gone => 200 replay, NO false alert, NO 2nd book", async () => {
  await withEnv(EMAIL_ENV, async () => {
    const fake = makeFakeRedis();
    const sid = seedSession(fake, "case4-sess");
    __setBookingRedisForTests(fake);
    __resetResendClientForTests();
    const restore = mockFetch((url) => {
      if (url.includes(RESEND_URL)) return { status: 200, body: { id: "msg_case4" } };
      if (url.includes("/rates/book")) return { status: 200, body: BOOK_OK };
      return { status: 200, body: { data: [] } };
    });
    try {
      const { POST } = await import("./book/route");

      // 1) The real booking. Succeeds, session deleted, pointer written.
      const first = await POST(
        post("http://t/api/booking/book", { sessionId: sid }, { "idempotency-key": sid }),
      );
      assert.equal(first.status, 200);
      const firstBody = (await first.json()) as Record<string, unknown>;
      assert.equal(firstBody.bookingId, "bk_1");
      assert.equal(bookCalls().length, 1);

      // 2) Simulate reality 30 minutes later: session already deleted by the
      //    success path, and the 300s idempotency cache has expired.
      fake.store.delete(`booking:v1:idem:${sid}`);
      assert.equal(fake.store.has(`booking:v1:session:${sid}`), false);

      // 3) The return page is force-dynamic, so a revisit re-POSTs with the
      //    same sid AND the Stripe payment_intent still in the URL.
      const revisit = await POST(
        post(
          "http://t/api/booking/book",
          { sessionId: sid, paymentIntentId: "pi_3U9Vm9A4FXPoRk9Y1ThZFXqx" },
          { "idempotency-key": sid },
        ),
      );

      assert.equal(revisit.status, 200, "a confirmed booking must replay as success, not 410");
      const replay = (await revisit.json()) as Record<string, unknown>;
      assert.equal(replay.bookingId, "bk_1", "same booking returned");
      assert.equal(replay.status, "confirmed");

      assert.equal(bookCalls().length, 1, "NO second /rates/book - provider untouched");
      assert.equal(
        fake.store.has(`booking:v1:failed:${sid}`),
        false,
        "no bogus recovery record for a booking that actually succeeded",
      );
      const criticals = alertCalls().filter((a) => a.level === "critical");
      assert.deepEqual(
        criticals,
        [],
        "session expiry alone is NOT evidence of failure - no BOOK_FAILED_AFTER_PAYMENT",
      );
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("CASE 4b: pointer lost, but provider HAS the booking => reconciled to 200, still no false alert", async () => {
  // Second net for bookings made before the pointer existed (e.g. 9c-OQvmqJ)
  // or when the pointer write failed.
  await withEnv(ALERTING_ENV, async () => {
    const fake = makeFakeRedis();
    __setBookingRedisForTests(fake);
    __resetResendClientForTests();
    const restore = mockFetch((url) => {
      if (url.includes("/rates/book")) return { status: 200, body: BOOK_OK };
      // Provider's authoritative clientReference index HAS the booking.
      return { status: 200, body: { data: [BOOK_OK.data] } };
    });
    try {
      const { POST } = await import("./book/route");
      const r = await POST(
        post("http://t/api/booking/book", {
          sessionId: "orphan-sess",
          paymentIntentId: "pi_orphan",
        }),
      );

      assert.equal(r.status, 200, "provider confirms the booking exists -> success, not failure");
      const j = (await r.json()) as Record<string, unknown>;
      assert.equal(j.bookingId, "bk_1");
      assert.equal(j.status, "confirmed");
      assert.equal(j.emailSent, false, "no holder data here - never claim a send");

      assert.equal(bookCalls().length, 0, "NO /rates/book - the booking already exists");
      assert.equal(fake.store.has("booking:v1:failed:orphan-sess"), false);
      assert.ok(fake.store.has("booking:v1:completed:bk_1"), "backfilled into our store");
      assert.deepEqual(
        alertCalls().filter((a) => a.level === "critical"),
        [],
      );
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("CASE 5: duplicate callback / user refresh (no idempotency-key) => NO second provider booking", async () => {
  await withEnv(ALERTING_ENV, async () => {
    const fake = makeFakeRedis();
    const sid = seedSession(fake, "case5-sess");
    __setBookingRedisForTests(fake);
    __resetResendClientForTests();
    const restore = mockFetch((url) =>
      url.includes("/rates/book")
        ? { status: 200, body: BOOK_OK }
        : { status: 200, body: { data: [] } },
    );
    try {
      const { POST } = await import("./book/route");
      const a = await POST(post("http://t/api/booking/book", { sessionId: sid }));
      assert.equal(a.status, 200);

      // No idempotency-key header at all - the durable pointer is what stops
      // the second provider call.
      const b = await POST(post("http://t/api/booking/book", { sessionId: sid }));
      assert.equal(b.status, 200);
      assert.equal((await b.json()).bookingId, "bk_1");
      assert.equal(bookCalls().length, 1, "exactly ONE /rates/book across both requests");
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("CASE 6: duplicate Stripe redirect (same sid + payment_intent, 3 hits) => exactly one provider booking", async () => {
  // There is no Stripe webhook route in this app - the only path that can
  // reach /rates/book is POST /api/booking/book, entered from the Stripe
  // return redirect. Replaying that redirect is the duplicate-event case.
  await withEnv(ALERTING_ENV, async () => {
    const fake = makeFakeRedis();
    const sid = seedSession(fake, "case6-sess");
    __setBookingRedisForTests(fake);
    __resetResendClientForTests();
    const restore = mockFetch((url) =>
      url.includes("/rates/book")
        ? { status: 200, body: BOOK_OK }
        : { status: 200, body: { data: [] } },
    );
    try {
      const { POST } = await import("./book/route");
      const body = { sessionId: sid, paymentIntentId: "pi_dup_evt" };
      for (let i = 0; i < 3; i += 1) {
        const r = await POST(post("http://t/api/booking/book", body));
        assert.equal(r.status, 200, `hit #${i + 1} must succeed`);
        assert.equal((await r.json()).bookingId, "bk_1");
      }
      assert.equal(bookCalls().length, 1, "exactly ONE /rates/book across 3 duplicate events");
      assert.equal(fake.store.has(`booking:v1:failed:${sid}`), false);
      assert.deepEqual(
        alertCalls().filter((a) => a.level === "critical"),
        [],
      );
    } finally {
      restore();
      __resetBookingRedisForTests();
    }
  });
});

test("CASE 4c: provider reconcile MERGES onto the stored record — never degrades it", async () => {
  // GET /bookings returns a sparser view than the session did: no city, no
  // boardName. Writing that shape blindly would silently strip "Santa Ponsa"
  // and "Room Only" off a real customer's confirmation page.
  await withEnv(ALERTING_ENV, async () => {
    const fake = makeFakeRedis();
    __resetResendClientForTests();
    // A rich record we already hold, exactly like production's 9c-OQvmqJ.
    fake.store.set("booking:v1:completed:bk_1", {
      bookingId: "bk_1",
      confirmationCode: "HCC-RICH",
      status: "CONFIRMED",
      hotelSummary: { name: "Seventy Barcelona", city: "Barcelona" },
      rateSummary: {
        boardName: "Room Only",
        price: 2878.92,
        currency: "PLN",
        checkin: "2026-07-15",
        checkout: "2026-07-18",
      },
      price: 2878.92,
      currency: "PLN",
      createdAt: 1700000000000,
    });
    __setBookingRedisForTests(fake);
    const restore = mockFetch((url) => {
      if (url.includes("/rates/book")) return { status: 200, body: BOOK_OK };
      // Sparse provider view: no city, no boardName, no confirmation code.
      return {
        status: 200,
        body: {
          data: [
            {
              bookingId: "bk_1",
              status: "CONFIRMED",
              hotelConfirmationCode: "",
              checkin: "2026-07-15",
              checkout: "2026-07-18",
              hotel: { hotelId: "lp1", name: "Seventy Barcelona" },
            },
          ],
        },
      };
    });
    try {
      const { POST } = await import("./book/route");
      const r = await POST(
        post("http://t/api/booking/book", {
          sessionId: "merge-sess",
          paymentIntentId: "pi_merge",
        }),
      );
      assert.equal(r.status, 200);

      const stored = fake.store.get("booking:v1:completed:bk_1") as Record<string, unknown>;
      const hotel = stored.hotelSummary as Record<string, unknown>;
      const rate = stored.rateSummary as Record<string, unknown>;
      assert.equal(hotel.city, "Barcelona", "city must survive the reconcile");
      assert.equal(rate.boardName, "Room Only", "board must survive the reconcile");
      assert.equal(stored.price, 2878.92, "price must survive the reconcile");
      assert.equal(stored.confirmationCode, "HCC-RICH", "hotel code must survive");
      assert.equal(stored.createdAt, 1700000000000, "original booking time preserved");

      // ...and the response the customer sees keeps the rich fields too.
      const j = (await r.json()) as Record<string, unknown>;
      assert.equal((j.hotelSummary as Record<string, unknown>).city, "Barcelona");
      assert.equal((j.rateSummary as Record<string, unknown>).boardName, "Room Only");

      assert.equal(bookCalls().length, 0, "NO /rates/book");
      assert.deepEqual(
        alertCalls().filter((a) => a.level === "critical"),
        [],
      );
    } finally {
      restore();
      __resetResendClientForTests();
      __resetBookingRedisForTests();
    }
  });
});
