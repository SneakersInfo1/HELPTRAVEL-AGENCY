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
    const restore = mockFetch(() => ({ status: 200, body: BOOK_OK }));
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
      assert.equal(fetchCalls.length, 0, "must NOT call LiteAPI book — session is gone");
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
    const restore = mockFetch(() => ({ status: 200, body: BOOK_OK }));
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
