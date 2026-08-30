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
  // Kill-switch lotów WŁĄCZONY — domyślną (wyłączoną) sprawdza osobny test
  // niżej. Bez tego cała ta suita opisywałaby wyłącznie odmowę 503.
  FLIGHTS_FLOW_MODE: "live",
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
        // Realny kształt Stripe'owego client secret — z niego prebook wylicza
        // `paymentIntentId`, którym strona powrotu porównuje `?payment_intent=`.
        secretKey: "pi_3Ab9XyZ0000001_secret_kLmNoPqRsTu",
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
      assert.equal(json.secretKey, "pi_3Ab9XyZ0000001_secret_kLmNoPqRsTu");
      assert.equal(json.price, 1918.34);
      // transactionId NIGDY nie wychodzi do klienta.
      assert.equal(json.transactionId, undefined);
      const session = await getFlightSession(json.sessionId);
      assert.equal(session?.priceGatePassed, true);
      assert.equal(session?.acceptedTotal, 1918.34);
      // Identyfikator PaymentIntentu zapisany, SEKRET nie.
      assert.equal(session?.paymentIntentId, "pi_3Ab9XyZ0000001");
      assert.equal(JSON.stringify(session).includes("kLmNoPqRsTu"), false);
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
      // 5xx = NIEROZSTRZYGNIĘTE. Obciążenie mogło przejść, a odpowiedź zginąć,
      // więc rezerwacja idzie do człowieka — ale `paid` byłoby twierdzeniem o
      // pieniądzach, którego nikt nie potwierdził. Zostaje `processing`.
      assert.equal(after?.paymentStatus, "processing");
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


// ── DOWÓD PŁATNOŚCI NA STRONIE POWROTU ───────────────────────────────────────
//
// Rdzeń hardeningu 2026-08-29: samo wejście na `/loty/platnosc/return?sid=…`
// nie jest dowodem zapłaty. Adres zna każdy, kto zaczął checkout.

/** Sesja gotowa do finalizacji (po prebooku, bramka kwoty zdana). */
async function seedPrebookedSession(
  redis: ReturnType<typeof makeFakeRedis>,
  sessionId: string,
  over: Record<string, unknown> = {},
) {
  await redis.set(`flight:v1:session:${sessionId}`, {
    searchSessionId: sessionId,
    offerId: "OFFER_ABCDEFGH",
    prebookId: "pb_1",
    transactionId: "tx_1",
    paymentIntentId: "pi_3Ab9XyZ0000001",
    paymentStatus: "pending",
    bookingStatus: "prebooked",
    priceGatePassed: true,
    contactData: CONTACT,
    price: 1918.34,
    currency: "PLN",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  });
}

test("return: redirect_status=failed → 402, dostawca NIETKNIĘTY, sesja NIE jest paid", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "55555555-5555-4555-8555-555555555555";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x", status: "CONFIRMED" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_3Ab9XyZ0000001", redirectStatus: "failed" });
      assert.equal(out.status, 402);
      assert.equal(out.body.error, "payment_not_completed");
      assert.equal(fetchCalls.filter((c) => c.url.includes("/flights/bookings")).length, 0);
      const after = await getFlightSession(sessionId);
      assert.equal(after?.paymentStatus, "failed");
      assert.notEqual(after?.bookingStatus, "confirmed");
      // Zero rekordów paid-but-unbooked: nie było płatności, nie ma czego ratować.
      assert.equal([...redis.store.keys()].filter((k) => k.includes(":failed:")).length, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("return: payment_intent z CUDZEJ transakcji → 402 mismatch, brak bookingu", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666666";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x", status: "CONFIRMED" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_cudze", redirectStatus: "succeeded" });
      assert.equal(out.status, 402);
      assert.equal(out.body.reason, "payment_intent_mismatch");
      assert.equal(fetchCalls.filter((c) => c.url.includes("/flights/bookings")).length, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("return: płatność w toku (3DS) → 202 processing, brak bookingu, sesja NIEpłatna", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "77777777-7777-4777-8777-777777777777";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_3Ab9XyZ0000001", redirectStatus: "processing" });
      assert.equal(out.status, 202);
      assert.equal(out.body.error, "payment_processing");
      assert.equal(fetchCalls.filter((c) => c.url.includes("/flights/bookings")).length, 0);

      // Widget nie może się zamontować drugi raz w trakcie trwającego 3DS.
      const { GET } = await import("./session/[sessionId]/route");
      const ses = await (await GET(new Request("http://localhost/x"), { params: Promise.resolve({ sessionId }) })).json();
      assert.equal(ses.payable, false);
      assert.equal(ses.paymentStatus, "processing");
    } finally {
      teardown(restore);
    }
  });
});

test("return: nieudana próba NIE pali prebooka — po `failed` sesja znów jest płatna", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "88888888-8888-4888-8888-888888888888";
    await seedPrebookedSession(redis, sessionId, { paymentStatus: "failed" });
    const restore = mockFetch(() => ({ status: 200, body: {} }));
    try {
      const { GET } = await import("./session/[sessionId]/route");
      const ses = await (await GET(new Request("http://localhost/x"), { params: Promise.resolve({ sessionId }) })).json();
      assert.equal(ses.payable, true, "po odrzuconej karcie klient musi móc spróbować ponownie");
      assert.equal(ses.amount, 1918.34);
    } finally {
      teardown(restore);
    }
  });
});

test("return: brak parametrów Stripe'a NIE blokuje (autorytetem zostaje LiteAPI)", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "99999999-9999-4999-8999-999999999999";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_ok", status: "CONFIRMED" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId);
      assert.equal(out.status, 200);
      assert.equal(out.body.bookingId, "bk_ok");
      const after = await getFlightSession(sessionId);
      // `paid` DOPIERO po przyjęciu bookingu przez dostawcę.
      assert.equal(after?.paymentStatus, "paid");
      assert.equal(after?.paymentEvidence?.verdict, "unverified");
    } finally {
      teardown(restore);
    }
  });
});

test("book 4xx bez dowodu zapłaty → 402 płatności-nie-było, BEZ fałszywego manual_review", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 400, body: { error: { code: 43001, description: "transaction not captured" } } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId);
      assert.equal(out.status, 402);
      assert.equal(out.body.error, "payment_not_completed");
      const after = await getFlightSession(sessionId);
      assert.equal(after?.paymentStatus, "failed");
      assert.equal(after?.bookingStatus, "failed");
      // Kluczowe: człowiek NIE jest budzony do rezerwacji, za którą nikt nie zapłacił.
      assert.equal([...redis.store.keys()].filter((k) => k.includes(":failed:")).length, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("book 4xx MIMO potwierdzenia ze Stripe'a → manual_review + paid (pieniądze są)", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 400, body: { error: { code: 43001, description: "rejected" } } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_3Ab9XyZ0000001", redirectStatus: "succeeded" });
      assert.equal(out.status, 202);
      assert.equal(out.body.bookingStatus, "manual_review");
      const after = await getFlightSession(sessionId);
      assert.equal(after?.paymentStatus, "paid");
      assert.equal([...redis.store.keys()].filter((k) => k.includes(":failed:")).length, 1);
    } finally {
      teardown(restore);
    }
  });
});

// ── SEMANTYKA confirmationSent ───────────────────────────────────────────────

test("mail: confirmationSent odzwierciedla FAKT wysyłki, nie zamiar", async () => {
  await withEnv({ ...LIVE_ENV, RESEND_API_KEY: undefined }, async () => {
    const redis = await setup();
    const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_mail", status: "CONFIRMED" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId);
      assert.equal(out.status, 200);
      assert.equal(out.body.emailSent, false, "bez klucza Resend nie wolno twierdzić, że mail poszedł");
      const after = await getFlightSession(sessionId);
      // Rezerwacja stoi — porażka maila jej NIE cofa.
      assert.equal(after?.bookingStatus, "confirmed");
      assert.equal(after?.confirmationSent, false);
      assert.equal(after?.confirmationEmail, "EMAIL_FAILED");
      assert.equal(after?.confirmationAttempts, 1);
    } finally {
      teardown(restore);
    }
  });
});

test("mail: po nieudanej wysyłce webhook MOŻE ponowić; po udanej — nie ponawia", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await seedPrebookedSession(redis, sessionId, {
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      bookingId: "bk_r",
      confirmationSent: false,
      confirmationAttempts: 1,
    });
    const restore = mockFetch(() => ({ status: 200, body: {} }));
    try {
      const { sendConfirmationOnce } = await import("@/lib/flights/finalize");
      const session = (await getFlightSession(sessionId))!;
      const again = await sendConfirmationOnce(sessionId, session, { bookingId: "bk_r", ticketingPending: true });
      assert.equal(again.attempted, true, "nieudana wysyłka musi dać się ponowić");

      const sentAlready = await sendConfirmationOnce(
        sessionId,
        { ...session, confirmationSent: true },
        { bookingId: "bk_r", ticketingPending: true },
      );
      assert.equal(sentAlready.attempted, false, "udana wysyłka nie może się powtórzyć");
    } finally {
      teardown(restore);
    }
  });
});

test("mail: licznik prób zatrzymuje pętlę webhooków (żadnego spamu do klienta)", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await seedPrebookedSession(redis, sessionId, {
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      confirmationSent: false,
      confirmationAttempts: 3,
    });
    const restore = mockFetch(() => ({ status: 200, body: {} }));
    try {
      const { sendConfirmationOnce, MAX_CONFIRMATION_ATTEMPTS } = await import("@/lib/flights/finalize");
      assert.equal(MAX_CONFIRMATION_ATTEMPTS, 3);
      const session = (await getFlightSession(sessionId))!;
      const res = await sendConfirmationOnce(sessionId, session, { bookingId: "bk_r", ticketingPending: true });
      assert.equal(res.attempted, false);
    } finally {
      teardown(restore);
    }
  });
});

// ── TRASA W MAILU: DOSTAWCA PRZED PRZEGLĄDARKĄ ───────────────────────────────

test("mail: trasa z prebooka dostawcy WYPIERA podmienioną migawkę z przeglądarki", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch((url) =>
      url.includes("/flights/bookings")
        ? { status: 200, body: { data: [{ bookingId: "bk_it", status: "CONFIRMED" }] } }
        : {
            status: 200,
            body: {
              data: [
                {
                  ...prebookOk(1918.34).data[0],
                  booking: {
                    journey: {
                      segments: [
                        {
                          originCode: "WAW",
                          destinationCode: "BCN",
                          departureTime: "2026-09-20T08:20:00",
                          arrivalTime: "2026-09-20T11:10:00",
                          direction: "OUTBOUND",
                          duration: { minutes: 170 },
                          carrier: { marketingName: "Wizz Air" },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
    );
    try {
      const { POST } = await import("./prebook/route");
      // Klient wysyła migawkę z ZUPEŁNIE innym lotem.
      const body = prebookBody({
        itinerary: {
          legs: [
            {
              direction: "OUTBOUND",
              originCode: "AAA",
              destinationCode: "BBB",
              departureTime: "2000-01-01T00:00:00",
              arrivalTime: "2000-01-01T01:00:00",
              durationMinutes: 60,
              stops: 0,
              carrier: "Zmyślone Linie",
            },
          ],
          fareName: "Zmyślona",
        },
      });
      const pre = await (await POST(prebookRequest(body))).json();
      const session = (await getFlightSession(pre.sessionId))!;
      assert.equal(session.providerItinerary?.legs[0].originCode, "WAW");

      const { flightConfirmationInputFromSession } = await import("@/lib/email/send-flight-alerts");
      const mail = flightConfirmationInputFromSession(session, { bookingId: "bk_it", ticketingPending: true })!;
      assert.equal(mail.legs?.[0].originCode, "WAW", "mail pokazał trasę z przeglądarki");
      assert.equal(mail.legs?.[0].carrier, "Wizz Air");
      assert.equal(mail.legs?.[0].destinationCode, "BCN");
      // Taryfa: dostawca jej nie zwrócił, więc uzupełnia ją migawka — to jedyne
      // pole, w którym dane klienta wciąż mają prawo głosu.
      assert.equal(mail.fareName, "Zmyślona");
      // Kwota ZAWSZE z rekordu serwerowego.
      assert.equal(mail.price, 1918.34);
    } finally {
      teardown(restore);
    }
  });
});


// ── BEZPIECZEŃSTWO: CACHE IDEMPOTENCJI NIE JEST WYCIEKIEM `secretKey` ────────
//
// Odpowiedź prebooka niesie Stripe client secret. Cache był kluczowany samym
// nagłówkiem od klienta i czytany PRZED walidacją body, a front miał fallback
// `String(Date.now())` — czyli klucz dawał się zgadnąć. Wpis wydajemy teraz
// tylko żądaniu o tym samym odcisku (oferta + mail + kwota + waluta).

test("idem: zgadnięty Idempotency-Key + CUDZE żądanie → NIE oddaje zapisanego secretKey", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    let prebooks = 0;
    const restore = mockFetch(() => {
      prebooks += 1;
      return { status: 200, body: prebookOk(1918.34) };
    });
    try {
      const { POST } = await import("./prebook/route");
      const key = { "idempotency-key": "1756500000000" }; // znak czasu — zgadywalny

      const victim = await (await POST(prebookRequest(prebookBody(), key))).json();
      assert.equal(victim.secretKey, "pi_3Ab9XyZ0000001_secret_kLmNoPqRsTu");

      // Napastnik zna klucz, ale nie zna oferty/maila/kwoty ofiary.
      const attackerBody = prebookBody({ contact: { ...CONTACT, email: "napastnik@example.com" } });
      const attacker = await (await POST(prebookRequest(attackerBody, key))).json();

      assert.notEqual(attacker.sessionId, victim.sessionId, "napastnik dostał sesję ofiary");
      assert.equal(prebooks, 2, "cache oddał odpowiedź zamiast wykonać własny prebook");
    } finally {
      teardown(restore);
    }
  });
});

test("idem: TEN SAM klient z tym samym żądaniem dalej dostaje cache (double submit)", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    let prebooks = 0;
    const restore = mockFetch(() => {
      prebooks += 1;
      return { status: 200, body: prebookOk(1918.34) };
    });
    try {
      const { POST } = await import("./prebook/route");
      const key = { "idempotency-key": "idem-double-submit" };
      const a = await (await POST(prebookRequest(prebookBody(), key))).json();
      const b = await (await POST(prebookRequest(prebookBody(), key))).json();
      assert.equal(a.sessionId, b.sessionId);
      assert.equal(prebooks, 1, "double submit utworzył drugi lock taryfy u dostawcy");
    } finally {
      teardown(restore);
    }
  });
});

test("idem: zmiana KWOTY przy tym samym kluczu tworzy nowy prebook, nie oddaje starej kwoty", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    // Dostawca lockuje dokładnie tyle, ile klient zaakceptował (mock nie widzi
    // `acceptedTotal` — do LiteAPI idzie już przetworzone body — więc sterujemy
    // ceną z zewnątrz).
    let lockPrice = 1918.34;
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(lockPrice) }));
    try {
      const { POST } = await import("./prebook/route");
      const key = { "idempotency-key": "idem-same-key" };
      const first = await (await POST(prebookRequest(prebookBody(), key))).json();
      lockPrice = 2900;
      const second = await (await POST(prebookRequest(prebookBody({ acceptedTotal: 2900 }), key))).json();
      assert.equal(first.price, 1918.34);
      assert.equal(second.price, 2900, "cache oddał kwotę z poprzedniej zgody");
    } finally {
      teardown(restore);
    }
  });
});

// ── BEZPIECZEŃSTWO: CO WYCHODZI Z API ────────────────────────────────────────

test("prebook: odpowiedź NIE zawiera transactionId ani prebookId", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34) }));
    try {
      const { POST } = await import("./prebook/route");
      const raw = await (await POST(prebookRequest(prebookBody()))).text();
      assert.equal(raw.includes("tx_flight_1"), false);
      assert.equal(raw.includes("pb_flight_1"), false);
    } finally {
      teardown(restore);
    }
  });
});

test("GET booking: nigdy nie oddaje numeru dokumentu ani identyfikatorów płatności", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await seedPrebookedSession(redis, sessionId, {
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      bookingId: "bk_sec",
      passengerData: [{ firstName: "Jan", lastName: "Kowalski", type: "ADT", documentNumberMasked: "******567" }],
    });
    await redis.set(`flight:v1:bybooking:bk_sec`, sessionId);
    const restore = mockFetch(() => ({ status: 500, body: {} })); // live-GET pada — bierzemy Redis
    try {
      const { GET } = await import("./booking/[bookingId]/route");
      const res = await GET(new NextRequest("http://localhost/api/flights/booking/bk_sec"), {
        params: Promise.resolve({ bookingId: "bk_sec" }),
      });
      const raw = await res.text();
      assert.equal(res.status, 200);
      for (const secret of ["tx_1", "pb_1", "pi_3Ab9XyZ0000001", "AB1234567", "******567"]) {
        assert.equal(raw.includes(secret), false, `wyciek: ${secret}`);
      }
    } finally {
      teardown(restore);
    }
  });
});


test("return: STARY adres powrotu (failed) nie cofa sesji, która jest już w rezerwacji", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "12121212-1212-4121-8121-121212121212";
    // Klient zapłacił, book padł na 5xx → manual_review z nierozstrzygniętą
    // płatnością. Teraz wraca do historii przeglądarki i otwiera adres
    // z WCZEŚNIEJSZEJ, nieudanej próby.
    await seedPrebookedSession(redis, sessionId, {
      bookingStatus: "manual_review",
      paymentStatus: "processing",
      manualReviewReason: "book failed: PROVIDER_ERROR",
    });
    const restore = mockFetch(() => ({ status: 200, body: {} }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, {
        paymentIntentId: "pi_3Ab9XyZ0000001",
        redirectStatus: "failed",
      });
      // NIE mówimy „nie pobraliśmy środków" — tego nie wiemy.
      assert.equal(out.status, 202);
      assert.equal(out.body.error, "manual_review");
      const after = await getFlightSession(sessionId);
      assert.equal(after?.bookingStatus, "manual_review", "stan rezerwacji został nadpisany");
      assert.notEqual(after?.paymentStatus, "failed", "stary adres cofnął status płatności");
      // Dowód i tak zapisujemy — jest śladem audytowym.
      assert.equal(after?.paymentEvidence?.verdict, "rejected");
    } finally {
      teardown(restore);
    }
  });
});

test("return: stary adres NIE blokuje potwierdzonej rezerwacji (bramka `confirmed` jest pierwsza)", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "13131313-1313-4131-8131-131313131313";
    await seedPrebookedSession(redis, sessionId, {
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      bookingId: "bk_done",
    });
    const restore = mockFetch(() => ({ status: 200, body: {} }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { redirectStatus: "failed" });
      assert.equal(out.status, 200);
      assert.equal(out.body.bookingId, "bk_done");
      assert.equal(out.body.alreadyBooked, true);
      const after = await getFlightSession(sessionId);
      assert.equal(after?.paymentStatus, "paid");
      assert.equal(after?.bookingStatus, "confirmed");
    } finally {
      teardown(restore);
    }
  });
});

// ── KILL-SWITCH LOTÓW (`FLIGHTS_FLOW_MODE`) ──────────────────────────────────
//
// Hamulec ma zatrzymać NAPŁYW nowych transakcji, nie dokończenie tych, za które
// ktoś mógł już zapłacić. Drugi z tych warunków jest ważniejszy: odcięcie
// finalizacji człowiekowi, który ma obciążoną kartę, zamienia awarię w
// zabranie pieniędzy bez rezerwacji. Dlatego testujemy OBIE strony.

const KILLED_ENV: Record<string, string | undefined> = { ...LIVE_ENV, FLIGHTS_FLOW_MODE: "disabled" };

test("kill-switch: prebook odmawia 503 i NIE dotyka dostawcy ani storage", async () => {
  await withEnv(KILLED_ENV, async () => {
    const redis = await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody()));
      const json = await res.json();
      assert.equal(res.status, 503);
      assert.equal(json.error, "flights_disabled");
      // Bez `secretKey` — żadna sesja płatności nie powstała.
      assert.equal(json.secretKey, undefined);
      assert.equal(json.sessionId, undefined);
      // Dostawca nietknięty: ani locka taryfy, ani PaymentIntentu.
      assert.equal(fetchCalls.length, 0);
      // Storage nietknięty: nie ma nawet rekordu intencji.
      assert.equal(redis.store.size, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("kill-switch: sesja prebookowana przestaje być `payable` (widget się nie zamontuje)", async () => {
  await withEnv(KILLED_ENV, async () => {
    const redis = await setup();
    const sessionId = "33333333-3333-4333-8333-333333333333";
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      prebookId: "pb_kill_1",
      transactionId: "tx_kill_1",
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
      const res = await GET(new Request("http://x/api/flights/session/x"), {
        params: Promise.resolve({ sessionId }),
      });
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.equal(json.payable, false);
      // Front musi odróżnić „wyłączone" od „sesja wygasła" — inny komunikat.
      assert.equal(json.flightsDisabled, true);
      // Kwota nadal raportowana: rekord jest zdrowy, tylko ścieżka zamknięta.
      assert.equal(json.amount, 1918.34);
    } finally {
      teardown(restore);
    }
  });
});

test("kill-switch NIE odcina finalizacji — klient, który mógł zapłacić, dostaje rezerwację", async () => {
  await withEnv(KILLED_ENV, async () => {
    const redis = await setup();
    const sessionId = "44444444-4444-4444-8444-444444444444";
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      prebookId: "pb_kill_2",
      transactionId: "tx_kill_2",
      paymentStatus: "pending",
      bookingStatus: "prebooked",
      priceGatePassed: true,
      price: 1918.34,
      currency: "PLN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const restore = mockFetch(() => ({
      status: 200,
      body: { data: [{ booking: { bookingId: "bk_kill_2", status: "CONFIRMED" } }] },
    }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { redirectStatus: "succeeded" });
      // TO JEST NAJWAŻNIEJSZA ASERCJA W TYM PLIKU: hamulec nie może
      // zostawić opłaconego klienta bez rezerwacji.
      assert.equal(out.status, 200);
      assert.equal(out.body.bookingId, "bk_kill_2");
      assert.equal(out.body.bookingStatus, "confirmed");
      assert.equal(fetchCalls.filter((c) => c.url.includes("/flights/bookings")).length, 1);
      const after = await getFlightSession(sessionId);
      assert.equal(after?.paymentStatus, "paid");
    } finally {
      teardown(restore);
    }
  });
});

test("kill-switch NIE ukrywa istniejącego potwierdzenia", async () => {
  await withEnv(KILLED_ENV, async () => {
    const redis = await setup();
    const sessionId = "55555555-5555-4555-8555-555555555555";
    await redis.set(`flight:v1:bybooking:bk_kill_3`, sessionId);
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      prebookId: "pb_kill_3",
      transactionId: "tx_kill_3",
      paymentStatus: "paid",
      bookingStatus: "confirmed",
      bookingId: "bk_kill_3",
      price: 1918.34,
      currency: "PLN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const restore = mockFetch(() => ({
      status: 200,
      body: { data: [{ booking: { bookingId: "bk_kill_3", status: "CONFIRMED" } }] },
    }));
    try {
      const { GET } = await import("./booking/[bookingId]/route");
      const res = await GET(new NextRequest("http://x/api/flights/booking/bk_kill_3"), {
        params: Promise.resolve({ bookingId: "bk_kill_3" }),
      });
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.equal(json.bookingId, "bk_kill_3");
      assert.equal(json.bookingStatus, "confirmed");
    } finally {
      teardown(restore);
    }
  });
});

// ── KSZTAŁT ODPOWIEDZI DOSTAWCY (zmierzony na produkcji 2026-08-30) ──────────

test("finalizacja czyta status z data[0].booking — NIE udaje 'confirmed' przy PENDING", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666666";
    await redis.set(`flight:v1:session:${sessionId}`, {
      searchSessionId: sessionId,
      offerId: "OFFER_ABCDEFGH",
      prebookId: "pb_shape_1",
      transactionId: "tx_shape_1",
      paymentStatus: "pending",
      bookingStatus: "prebooked",
      priceGatePassed: true,
      price: 1918.34,
      currency: "PLN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // Zagnieżdżenie 1:1 ze zmierzonego payloadu produkcyjnego.
    const restore = mockFetch(() => ({
      status: 200,
      body: { data: [{ booking: { bookingId: "bk_shape_1", status: "PENDING" } }] },
    }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { redirectStatus: "succeeded" });
      assert.equal(out.status, 200);
      // Przed poprawką: `data[0].status` === undefined → mapBookingStatus →
      // "confirmed". Klient dostałby mail „potwierdzone" na rezerwację, której
      // dostawca nie potwierdził.
      assert.equal(out.body.bookingStatus, "pending_confirmation");
      // bookingId też siedzi poziom głębiej — bez tego podstawialiśmy prebookId.
      assert.equal(out.body.bookingId, "bk_shape_1");
    } finally {
      teardown(restore);
    }
  });
});
