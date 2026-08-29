// Testy route'ów lotów — BRAMKA CENY, idempotencja i finalizacja.
//
// node:test + tsx. LiteAPI jest mockowane przez `globalThis.fetch`, Upstash
// zastąpiony fake'iem w pamięci przez seam z `flights/session`, limiter przez
// seam z `rate-limit`. Zero sieci, zero prawdziwego Redisa, ZERO prawdziwych
// płatności i rezerwacji.
//
// Testujemy przede wszystkim to, co powstało 2026-08-29: prebook nie może
// oddać sesji płatności, gdy kwota locka rozjeżdża się z kwotą zaakceptowaną
// przez klienta.

import assert from "node:assert/strict";
import { test } from "node:test";

import { NextRequest } from "next/server";

import {
  __resetFlightRedisForTests,
  __setFlightRedisForTests,
  getFlightSession,
} from "@/lib/flights/session";
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
function mockFetch(handler: (url: string, body: unknown) => { status: number; body: unknown }): () => void {
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
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

async function withEnv(over: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
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
  LITEAPI_PROD_PRIVATE_KEY: "prod_test_private",
  LITEAPI_PROD_KEY: undefined,
  LITEAPI_SANDBOX_KEY: undefined,
  LITEAPI_SANDBOX_PRIVATE_KEY: undefined,
  LITEAPI_PROD_PUBLIC_KEY: undefined,
  LITEAPI_API_KEY: undefined,
  LITEAPI_ENV: "production",
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  // Mail ma być bezczynny niezależnie od powłoki dewelopera.
  RESEND_API_KEY: undefined,
  EMAIL_FROM: undefined,
  EMAIL_REPLY_TO: undefined,
  EMAIL_BCC: undefined,
  ALERT_WEBHOOK_URL: undefined,
};

const PASSENGER = {
  firstName: "Jan",
  lastName: "Kowalski",
  birthday: "1990-05-04",
  gender: "M",
  nationality: "PL",
  type: "ADT",
  documentType: "passport",
  documentNumber: "AB1234567",
  documentExpiry: "2030-01-01",
  documentIssueCountry: "PL",
};
const CONTACT = {
  firstName: "Jan",
  lastName: "Kowalski",
  email: "jan@example.com",
  phoneNumber: "500600700",
  phoneCountryCode: "48",
};

function prebookBody(over: Record<string, unknown> = {}) {
  return {
    offerId: "OFFER_ABCDEFGH",
    lastTravelDate: "2026-09-27",
    acceptedTotal: 1918.34,
    acceptedCurrency: "PLN",
    contact: CONTACT,
    passengers: [PASSENGER],
    ...over,
  };
}

function prebookRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/flights/prebook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Odpowiedź LiteAPI /flights/prebooks z zadaną ceną. */
function prebookOk(price: number, currency = "PLN") {
  return {
    data: [
      {
        prebookId: "pb_flight_1",
        transactionId: "tx_flight_1",
        secretKey: "pi_secret_flight_1",
        price,
        currency,
        paymentTypes: ["CARD"],
        sandbox: false,
      },
    ],
  };
}

async function setup() {
  __setLimiterForTests("booking-prebook", null);
  __setLimiterForTests("booking-book", null);
  const redis = makeFakeRedis();
  __setFlightRedisForTests(redis);
  return redis;
}
function teardown(restoreFetch: () => void) {
  restoreFetch();
  __resetFlightRedisForTests();
  __resetLimitersForTests();
}

// ── BRAMKA CENY ──────────────────────────────────────────────────────────────

test("prebook: cena locka == zaakceptowana → 200 + secretKey", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody()));
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.equal(json.secretKey, "pi_secret_flight_1");
      assert.equal(json.price, 1918.34);
      // transactionId NIGDY nie wychodzi do klienta.
      assert.equal(json.transactionId, undefined);
      const session = await getFlightSession(json.sessionId);
      assert.equal(session?.priceGatePassed, true);
      assert.equal(session?.acceptedTotal, 1918.34);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: cena locka WYŻSZA niż zaakceptowana → 409 PRICE_CHANGED, BEZ secretKey", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(2900) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody({ acceptedTotal: 2727 })));
      const json = await res.json();
      assert.equal(res.status, 409);
      assert.equal(json.error, "PRICE_CHANGED");
      assert.equal(json.acceptedTotal, 2727);
      assert.equal(json.lockedTotal, 2900);
      // NAJWAŻNIEJSZE: klient nie dostaje czym zapłacić.
      assert.equal(json.secretKey, undefined);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: cena locka NIŻSZA niż zaakceptowana też zatrzymuje — spadek to też zmiana", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(2500) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody({ acceptedTotal: 2727 })));
      const json = await res.json();
      assert.equal(res.status, 409);
      assert.equal(json.error, "PRICE_CHANGED");
      assert.equal(json.lockedTotal, 2500);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: różnica +1 grosz JEST zmianą (2727 → 2727,01)", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(2727.01) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody({ acceptedTotal: 2727 })));
      assert.equal(res.status, 409);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: szum zmiennoprzecinkowy poniżej grosza NIE blokuje płatności", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.3400001) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody({ acceptedTotal: 1918.34 })));
      assert.equal(res.status, 200);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: inna waluta niż zaakceptowana → 409 CURRENCY_MISMATCH, bez secretKey", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34, "EUR") }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody()));
      const json = await res.json();
      assert.equal(res.status, 409);
      assert.equal(json.error, "CURRENCY_MISMATCH");
      assert.equal(json.secretKey, undefined);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: odpowiedź BEZ ceny → 502, nie otwieramy płatności na nieznaną kwotę", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({
      status: 200,
      body: { data: [{ prebookId: "pb_1", transactionId: "tx_1", secretKey: "sk_1", currency: "PLN" }] },
    }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody()));
      const json = await res.json();
      assert.equal(res.status, 502);
      assert.equal(json.error, "prebook_no_price");
      assert.equal(json.secretKey, undefined);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: brak `acceptedTotal` w body → 400 (bramka zgody jest OBOWIĄZKOWA)", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34) }));
    try {
      const { POST } = await import("./prebook/route");
      const body = prebookBody();
      delete (body as Record<string, unknown>).acceptedTotal;
      const res = await POST(prebookRequest(body));
      assert.equal(res.status, 400);
      // Nie wolno nam było w ogóle dotknąć dostawcy.
      assert.equal(fetchCalls.length, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: rekord sesji powstaje TAKŻE przy rozjeździe kwoty (RULE 6 — nic nie gubimy)", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(2900) }));
    try {
      const { POST } = await import("./prebook/route");
      await POST(prebookRequest(prebookBody({ acceptedTotal: 2727 })));
      const sessions = [...redis.store.entries()].filter(([k]) => k.includes(":session:"));
      assert.equal(sessions.length, 1);
      const rec = sessions[0][1] as { prebookId?: string; priceGatePassed?: boolean; price?: number };
      assert.equal(rec.prebookId, "pb_flight_1");
      assert.equal(rec.priceGatePassed, false);
      assert.equal(rec.price, 2900);
    } finally {
      teardown(restore);
    }
  });
});

test("prebook: dokument wygasający PRZED końcem podróży → 400 bez dotykania dostawcy", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(
        prebookRequest(
          prebookBody({ passengers: [{ ...PASSENGER, documentExpiry: "2026-09-01" }], lastTravelDate: "2026-09-27" }),
        ),
      );
      assert.equal(res.status, 400);
      assert.equal(fetchCalls.length, 0);
    } finally {
      teardown(restore);
    }
  });
});

// ── IDEMPOTENCJA ─────────────────────────────────────────────────────────────

test("prebook: ten sam Idempotency-Key → JEDEN prebook u dostawcy, ta sama odpowiedź", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34) }));
    try {
      const { POST } = await import("./prebook/route");
      const key = { "idempotency-key": "idem-abc-123" };
      const first = await POST(prebookRequest(prebookBody(), key));
      const firstJson = await first.json();
      const second = await POST(prebookRequest(prebookBody(), key));
      const secondJson = await second.json();

      assert.equal(second.status, 200);
      assert.equal(secondJson.sessionId, firstJson.sessionId);
      // Dostawca dotknięty DOKŁADNIE raz.
      const prebookCalls = fetchCalls.filter((c) => c.url.includes("/flights/prebooks"));
      assert.equal(prebookCalls.length, 1);
    } finally {
      teardown(restore);
    }
  });
});

// ── FINALIZACJA PO PŁATNOŚCI ─────────────────────────────────────────────────

// To jest scenariusz z §9 briefu: „jedna intencja użytkownika nie może
// zabookować innej taryfy niż zaakceptowana". Sesja, w której bramka kwoty nie
// przeszła, nigdy nie dostała `secretKey` — ale jej `sessionId` klient ZNA
// (widzi go we własnym URL-u powrotu), więc finalizacja musi jej odmówić sama
// z siebie, a nie liczyć na to, że nikt tam nie wejdzie.
test("book: sesja z niezaliczoną bramką ceny NIE zostaje zbookowana", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "11111111-1111-4111-8111-111111111111";
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      prebookId: "pb_flight_1",
      transactionId: "tx_flight_1",
      paymentStatus: "pending",
      bookingStatus: "prebooked",
      priceGatePassed: false,
      price: 2900,
      currency: "PLN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_1", status: "CONFIRMED" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId);
      assert.equal(out.status, 409);
      assert.equal(out.body.error, "price_not_confirmed");
      // Dostawca NIE został dotknięty — nie bookujemy czegoś, za co nikt nie zapłacił.
      assert.equal(fetchCalls.filter((c) => c.url.includes("/flights/bookings")).length, 0);
      // Sesja NIE została oznaczona jako opłacona.
      const after = await getFlightSession(sessionId);
      assert.equal(after?.paymentStatus, "pending");
    } finally {
      teardown(restore);
    }
  });
});

test("book: powtórne wywołanie na potwierdzonej sesji nie bookuje drugi raz", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "22222222-2222-4222-8222-222222222222";
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      prebookId: "pb_1",
      transactionId: "tx_1",
      paymentStatus: "paid",
      bookingStatus: "confirmed",
      bookingId: "bk_existing",
      priceGatePassed: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_new" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId);
      assert.equal(out.status, 200);
      assert.equal(out.body.bookingId, "bk_existing");
      assert.equal(out.body.alreadyBooked, true);
      assert.equal(fetchCalls.filter((c) => c.url.includes("/flights/bookings")).length, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("book: błąd dostawcy po płatności → manual_review, rekord awarii, 202 (nigdy ciche zgubienie)", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "33333333-3333-4333-8333-333333333333";
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      prebookId: "pb_1",
      transactionId: "tx_1",
      paymentStatus: "pending",
      bookingStatus: "prebooked",
      priceGatePassed: true,
      contactData: CONTACT,
      price: 1918.34,
      currency: "PLN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const restore = mockFetch(() => ({ status: 500, body: { error: { code: 50000, description: "boom" } } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId);
      assert.equal(out.status, 202);
      assert.equal(out.body.bookingStatus, "manual_review");
      const after = await getFlightSession(sessionId);
      // Płatność JEST odnotowana, booking oznaczony do ręcznej weryfikacji.
      assert.equal(after?.paymentStatus, "paid");
      assert.equal(after?.bookingStatus, "manual_review");
      const failed = [...redis.store.keys()].filter((k) => k.includes(":failed:"));
      assert.equal(failed.length, 1);
    } finally {
      teardown(restore);
    }
  });
});

// ── ENDPOINT KWOTY DLA STRONY PŁATNOŚCI ──────────────────────────────────────

test("GET session: oddaje kwotę i `payable`, NIGDY transactionId/prebookId", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "44444444-4444-4444-8444-444444444444";
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      prebookId: "pb_secret",
      transactionId: "tx_secret",
      paymentStatus: "pending",
      bookingStatus: "prebooked",
      priceGatePassed: true,
      price: 1918.34,
      currency: "PLN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const restore = mockFetch(() => ({ status: 200, body: {} }));
    try {
      const { GET } = await import("./session/[sessionId]/route");
      const res = await GET(new Request("http://localhost/api/flights/session/x"), {
        params: Promise.resolve({ sessionId }),
      });
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.equal(json.amount, 1918.34);
      assert.equal(json.currency, "PLN");
      assert.equal(json.payable, true);
      const serialized = JSON.stringify(json);
      assert.ok(!serialized.includes("tx_secret"), "transactionId wyciekł do klienta");
      assert.ok(!serialized.includes("pb_secret"), "prebookId wyciekł do klienta");
    } finally {
      teardown(restore);
    }
  });
});

test("GET session: sesja z niezaliczoną bramką ceny NIE jest `payable`", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "55555555-5555-4555-8555-555555555555";
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      paymentStatus: "pending",
      bookingStatus: "prebooked",
      priceGatePassed: false,
      price: 2900,
      currency: "PLN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const restore = mockFetch(() => ({ status: 200, body: {} }));
    try {
      const { GET } = await import("./session/[sessionId]/route");
      const res = await GET(new Request("http://localhost/api/flights/session/x"), {
        params: Promise.resolve({ sessionId }),
      });
      const json = await res.json();
      assert.equal(json.payable, false);
    } finally {
      teardown(restore);
    }
  });
});

test("GET session: nieznany identyfikator → 404 (bez wycieku informacji)", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: {} }));
    try {
      const { GET } = await import("./session/[sessionId]/route");
      const res = await GET(new Request("http://localhost/api/flights/session/x"), {
        params: Promise.resolve({ sessionId: "nie-ma-takiej" }),
      });
      assert.equal(res.status, 404);
    } finally {
      teardown(restore);
    }
  });
});
