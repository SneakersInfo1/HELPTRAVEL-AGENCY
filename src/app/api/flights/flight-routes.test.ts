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

// ── BRAMKA DŁUGOŚCI IMIENIA I NAZWISKA (kod 53099, zmierzony 2026-08-30) ─────
//
// Dostawca odrzuca imiona i nazwiska krótsze niż 3 znaki — HTTP 500 z kodem
// 53099 w ciele. To jest walidacja DETERMINISTYCZNA przebrana za awarię
// serwera. Przed poprawką kończyło się to trzema wywołaniami u dostawcy,
// błędem 502 i komunikatem „Dostawca lotów zwrócił błąd. Spróbuj ponownie za
// chwilę” — czyli zachętą do powtarzania czegoś, co nigdy nie zadziała.

/** Ciało błędu dostawcy zmierzone sondą `probe:flight-name-gate`. */
function nameTooShortBody(opis: string) {
  return { error: { code: 53099, description: opis } };
}
const OPIS_KONTAKT_I_PAX1 =
  "Contact name is too short — must be at least 3 characters; Passenger 1 name is too short — must be at least 3 characters";

/** Wpisy dziennika błędów zapisane w (udawanym) Redisie. */
function errorLogs(redis: { store: Map<string, unknown> }): Array<Record<string, unknown>> {
  return [...redis.store.entries()]
    .filter(([k]) => k.includes(":errlog:"))
    .map(([, v]) => v as Record<string, unknown>);
}

test("D. serwer sam odrzuca nazwisko „Li” — dostawca NIE jest dotykany", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody({ passengers: [{ ...PASSENGER, lastName: "Li" }] })));
      const json = await res.json();
      assert.equal(res.status, 400);
      assert.equal(json.error, "invalid_body");
      // Front nie jest jedyną ochroną — to jest ta druga bramka.
      assert.equal(fetchCalls.length, 0, "poszło żądanie do dostawcy mimo złych danych");
    } finally {
      teardown(restore);
    }
  });
});

test("D. serwer odrzuca też za krótkie imię KONTAKTU", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: prebookOk(1918.34) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody({ contact: { ...CONTACT, firstName: "Ja" } })));
      assert.equal(res.status, 400);
      assert.equal(fetchCalls.length, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("E. 53099 od dostawcy → HTTP 422 VALIDATION, ZERO ponowień", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 500, body: nameTooShortBody(OPIS_KONTAKT_I_PAX1) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody()));
      const json = await res.json();

      assert.equal(res.status, 422);
      assert.equal(json.error, "VALIDATION");
      assert.equal(json.reason, "NAME_TOO_SHORT");
      // JEDNO wywołanie. Deterministycznej odmowy nie ma sensu powtarzać.
      const prebooks = fetchCalls.filter((c) => c.url.includes("/flights/prebooks"));
      assert.equal(prebooks.length, 1, `dostawca dotknięty ${prebooks.length}x zamiast raz`);
    } finally {
      teardown(restore);
    }
  });
});

test("E. odpowiedź wskazuje pola i podaje pomoc — bez kodu dostawcy i jego nazwy", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 500, body: nameTooShortBody(OPIS_KONTAKT_I_PAX1) }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody()));
      const json = await res.json();

      const sciezki = (json.issues as Array<{ path: unknown[] }>).map((i) => i.path.join("."));
      assert.deepEqual(sciezki, [
        "contact.firstName",
        "contact.lastName",
        "passengers.0.firstName",
        "passengers.0.lastName",
      ]);
      assert.match(json.message, /3 znaki/);
      assert.match(json.help, /skontaktuj się z HelpTravel/i);

      const cale = JSON.stringify(json);
      assert.equal(cale.includes("53099"), false, "kod dostawcy wyciekl do klienta");
      assert.equal(/liteapi/i.test(cale), false, "nazwa dostawcy wyciekla do klienta");
      assert.equal(/Dostawca lotów zwrócił błąd/.test(cale), false, "nadal udajemy awarie dostawcy");
    } finally {
      teardown(restore);
    }
  });
});

test("H. 53099 dla „Passenger 2” celuje w drugiego pasażera", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({
      status: 500,
      body: nameTooShortBody("Passenger 2 name is too short — must be at least 3 characters"),
    }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(
        prebookRequest(prebookBody({ passengers: [PASSENGER, { ...PASSENGER, firstName: "Anna" }] })),
      );
      const json = await res.json();
      const sciezki = (json.issues as Array<{ path: unknown[] }>).map((i) => i.path.join("."));
      assert.deepEqual(sciezki, ["passengers.1.firstName", "passengers.1.lastName"]);
      assert.equal(
        sciezki.some((s) => s.startsWith("passengers.0")),
        false,
        "obwiniony pasazer 1",
      );
    } finally {
      teardown(restore);
    }
  });
});

test("F. zwykła awaria 500 dostawcy zostaje awarią — 502 i ponowienia wg polityki", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({
      status: 500,
      body: { error: { code: 50000, description: "Internal server error" } },
    }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody()));
      const json = await res.json();

      assert.equal(res.status, 502);
      assert.equal(json.error, "PROVIDER_ERROR");
      // Polityka ponawiania NIE została wyłączona globalnie.
      const prebooks = fetchCalls.filter((c) => c.url.includes("/flights/prebooks"));
      assert.equal(prebooks.length, 3, `awaria przejsciowa ponowiona ${prebooks.length}x zamiast 3x`);
    } finally {
      teardown(restore);
    }
  });
});

test("G. dziennik błędu zapisuje FAKTY, a nie dane pasażera", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const restore = mockFetch(() => ({
      status: 500,
      body: nameTooShortBody(
        'Passenger 1 name "Li" is too short; contact jan@example.com; pi_3Ab9_secret_kLmNoPqRsTu',
      ),
    }));
    try {
      const { POST } = await import("./prebook/route");
      const res = await POST(prebookRequest(prebookBody()));
      await res.json();

      const logi = errorLogs(redis);
      assert.equal(logi.length, 1, "blad prebooka nie trafil do dziennika");
      const wpis = logi[0]!;
      assert.equal(wpis.stage, "prebook");
      assert.equal(wpis.httpStatus, 500);
      assert.equal(wpis.liteApiCode, 53099);
      assert.equal(wpis.classification, "VALIDATION");
      assert.equal(wpis.retryable, false);
      assert.equal(typeof wpis.sessionId, "string");

      const serial = JSON.stringify(wpis);
      for (const tajne of [
        "Kowalski", // nazwisko pasażera i kontaktu
        "jan@example.com", // e-mail kontaktu
        "AB1234567", // numer dokumentu
        "500600700", // telefon
        "kLmNoPqRsTu", // client secret Stripe'a
        "secret_",
        "prod_test_private", // klucz API
        "1990-05-04", // data urodzenia
      ]) {
        assert.equal(serial.includes(tajne), false, `dziennik zawiera ${tajne}`);
      }
      // Sam fakt „za krótkie” musi zostać — bez niego wpis jest bezużyteczny.
      assert.match(String(wpis.description), /too short/);
    } finally {
      teardown(restore);
    }
  });
});

test("G. dziennik notuje też awarię przejściową jako PONAWIALNĄ", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    const restore = mockFetch(() => ({
      status: 500,
      body: { error: { code: 50000, description: "Internal server error" } },
    }));
    try {
      const { POST } = await import("./prebook/route");
      await (await POST(prebookRequest(prebookBody()))).json();
      const wpis = errorLogs(redis)[0]!;
      assert.equal(wpis.classification, "PROVIDER_ERROR");
      assert.equal(wpis.retryable, true);
    } finally {
      teardown(restore);
    }
  });
});

// ── NIEZGODNY `payment_intent` — INCYDENT, NIE ODMOWA ────────────────────────
//
// Adres powrotu z CUDZYM `payment_intent` znaczy jedno: nie wiemy, co się stało
// z pieniędzmi tego klienta. Do 2026-08-30 kończyło się to zapisem
// `paymentStatus:"failed"`, odpowiedzią 402 i komunikatem „Rozpocznij
// rezerwację od nowa" — czyli twierdzeniem o cudzych pieniądzach, którego nikt
// nie sprawdził, plus zachętą do zapłacenia drugi raz. Bez alertu, bez rekordu,
// bez śladu dla człowieka.
//
// Teraz to jest incydent: trwały rekord, alert dokładnie raz, dane do recovery
// nietknięte i komunikat, który NIE każe płacić ponownie.

const ALERT_ENV = { ...LIVE_ENV, ALERT_WEBHOOK_URL: "https://hooks.example.test/alert" };

/** Alerty lecą fire-and-forget — daj im dojść do (udawanego) fetcha. */
async function przepuscAlerty() {
  await new Promise((r) => setTimeout(r, 30));
}
function alerty() {
  return fetchCalls.filter((c) => c.url.includes("hooks.example.test"));
}

test("mismatch: 202 manual_review zamiast 402 — i ANI SŁOWA o ponownej płatności", async () => {
  await withEnv(ALERT_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666661";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x", status: "CONFIRMED" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_cudze", redirectStatus: "succeeded" });

      assert.equal(out.status, 202);
      assert.equal(out.body.error, "manual_review");
      assert.equal(out.body.bookingStatus, "manual_review");
      assert.match(String(out.body.message), /Nie wykonuj płatności ponownie/);
      // Dostawca NIETKNIĘTY — nie bookujemy na niepotwierdzonej płatności.
      assert.equal(fetchCalls.filter((c) => c.url.includes("/flights/bookings")).length, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("mismatch: NIE twierdzimy, że płatność się nie udała", async () => {
  await withEnv(ALERT_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666662";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_cudze", redirectStatus: "succeeded" });
      const after = await getFlightSession(sessionId);
      // `failed` byłoby twierdzeniem o pieniądzach, którego nikt nie sprawdził.
      assert.notEqual(after?.paymentStatus, "failed");
      assert.notEqual(after?.paymentStatus, "paid");
      assert.equal(after?.paymentStatus, "processing");
      assert.equal(after?.bookingStatus, "manual_review");
      assert.equal(after?.manualReviewReason, "payment_verification_required");
    } finally {
      teardown(restore);
    }
  });
});

test("mismatch: trwały rekord incydentu + dane do recovery NIETKNIĘTE", async () => {
  await withEnv(ALERT_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666663";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_cudze", redirectStatus: "succeeded" });

      const failed = [...redis.store.entries()].filter(([k]) => k.includes(":failed:"));
      assert.equal(failed.length, 1, "brak trwałego rekordu incydentu");
      const rec = failed[0]![1] as Record<string, unknown>;
      assert.equal(rec.sessionId, sessionId);
      assert.equal(rec.manualReviewReason, "payment_verification_required");
      // Bez prebookId/transactionId nie da się dokończyć rezerwacji ręcznie.
      assert.equal(rec.prebookId, "pb_1");
      assert.equal(rec.transactionId, "tx_1");

      const after = await getFlightSession(sessionId);
      assert.equal(after?.prebookId, "pb_1", "skasowany prebookId — recovery niemożliwe");
      assert.equal(after?.transactionId, "tx_1", "skasowany transactionId — recovery niemożliwe");
      assert.equal(after?.paymentIntentId, "pi_3Ab9XyZ0000001", "skasowany paymentIntentId");
      // Ślad, CO przyszło w adresie powrotu — bez tego nikt tego nie odtworzy.
      assert.equal(
        (after?.paymentEvidence as Record<string, unknown> | undefined)?.returnedPaymentIntentId,
        "pi_cudze",
      );
    } finally {
      teardown(restore);
    }
  });
});

test("mismatch: alert leci DOKŁADNIE RAZ — odświeżenie strony nie alarmuje ponownie", async () => {
  await withEnv(ALERT_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666664";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const first = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_cudze", redirectStatus: "succeeded" });
      await przepuscAlerty();
      assert.equal(alerty().length, 1, `alertów po pierwszym wejściu: ${alerty().length}`);

      // Klient odświeża stronę powrotu (albo wraca z historii).
      const second = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_cudze", redirectStatus: "succeeded" });
      await przepuscAlerty();
      assert.equal(alerty().length, 1, `alert powtórzony: ${alerty().length}`);

      // Odpowiedź zostaje spójna — dalej „sprawdzamy", nigdy „zapłać jeszcze raz".
      assert.equal(first.status, 202);
      assert.equal(second.status, 202);
      assert.equal(second.body.error, "manual_review");
      assert.match(String(second.body.message), /nie ponawiaj|Nie wykonuj płatności ponownie/i);
      // Wciąż jeden rekord incydentu, nie dwa.
      assert.equal([...redis.store.keys()].filter((k) => k.includes(":failed:")).length, 1);
    } finally {
      teardown(restore);
    }
  });
});

test("mismatch: odpowiedź nie zdradza kodów technicznych ani dostawców", async () => {
  await withEnv(ALERT_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666665";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_cudze", redirectStatus: "succeeded" });
      const cale = JSON.stringify(out.body);
      for (const zakazane of ["payment_intent_mismatch", "pi_cudze", "pi_3Ab9", "LiteAPI", "liteapi", "Stripe", "stripe", "redirect_status"]) {
        assert.equal(cale.includes(zakazane), false, `odpowiedź zawiera „${zakazane}"`);
      }
    } finally {
      teardown(restore);
    }
  });
});

test("mismatch po ROZPOCZĘTEJ rezerwacji nie cofa jej do „nie zapłacono”", async () => {
  await withEnv(ALERT_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666666";
    await seedPrebookedSession(redis, sessionId, { bookingStatus: "booking", paymentStatus: "paid" });
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_cudze", redirectStatus: "succeeded" });
      assert.equal(out.status, 202);
      assert.equal(out.body.error, "manual_review");
      const after = await getFlightSession(sessionId);
      assert.equal(after?.paymentStatus, "paid", "cofnięto potwierdzoną płatność");
    } finally {
      teardown(restore);
    }
  });
});

test("redirect_status=failed NADAL mówi uczciwie, że pieniędzy nie pobraliśmy", async () => {
  // Regresja na drugą gałąź `rejected`: tu Stripe powiedział WPROST, że
  // płatność się nie udała. To jedyny wariant, w którym wolno zaprosić do
  // ponownej próby — i nie wolno go zamienić w incydent.
  await withEnv(ALERT_ENV, async () => {
    const redis = await setup();
    const sessionId = "66666666-6666-4666-8666-666666666667";
    await seedPrebookedSession(redis, sessionId);
    const restore = mockFetch(() => ({ status: 200, body: { data: [{ bookingId: "bk_x" }] } }));
    try {
      const { finalizeFlightBooking } = await import("@/lib/flights/finalize");
      const out = await finalizeFlightBooking(sessionId, { paymentIntentId: "pi_3Ab9XyZ0000001", redirectStatus: "failed" });
      await przepuscAlerty();
      assert.equal(out.status, 402);
      assert.equal((await getFlightSession(sessionId))?.paymentStatus, "failed");
      assert.equal([...redis.store.keys()].filter((k) => k.includes(":failed:")).length, 0);
      assert.equal(alerty().length, 0, "zwykła odmowa karty nie jest incydentem");
      // I tu też bez kodów technicznych.
      assert.equal(JSON.stringify(out.body).includes("redirect_failed"), false);
    } finally {
      teardown(restore);
    }
  });
});

// ── BEZPIECZEŃSTWO ODCZYTU REZERWACJI ────────────────────────────────────────
//
// Model autoryzacji: znajomość `bookingId` JEST uprawnieniem (capability URL) —
// tak samo jak przy hotelach. Identyfikator pochodzi od dostawcy; pomiar na
// produkcji (2026-08-30) pokazał UUID-a wersji 7, 36 znaków, kształt
// `019ec7ff-…` — 74 bity losowe. Zgadywanie nie jest realną drogą.
//
// Czego brakowało: żadnego SUFITU na liczbę prób. Endpoint oddaje imiona i
// nazwiska pasażerów, a nie miał limitera — więc skanowanie nic nie kosztowało
// i nie zostawiało śladu. To nie jest IDOR, ale jest to brak taniej warstwy.

/** Limiter, który zawsze odmawia — do sprawdzenia gałęzi 429. */
function odmawiajacyLimiter() {
  return {
    limit: async () => ({ success: false, limit: 30, remaining: 0, reset: Date.now() + 60_000 }),
  } as unknown as Parameters<typeof __setLimiterForTests>[1];
}

/** Wszystko, co w odpowiedzi mogłoby być danymi osobowymi. */
const PII_PROBKI = ["Jan", "Kowalski", "jan@example.com", "500600700", "AB1234567", "1990-05-04"];

test("nieznany bookingId → 404 i ZERO danych osobowych w odpowiedzi", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: { data: [] } }));
    try {
      const { GET } = await import("./booking/[bookingId]/route");
      const res = await GET(new NextRequest("http://localhost/api/flights/booking/019ec7ff-0000-7000-8000-000000000000"), {
        params: Promise.resolve({ bookingId: "019ec7ff-0000-7000-8000-000000000000" }),
      });
      const json = await res.json();
      assert.equal(res.status, 404);
      assert.equal(json.error, "not_found");
      const cale = JSON.stringify(json);
      for (const p of PII_PROBKI) assert.equal(cale.includes(p), false, `404 zawiera „${p}"`);
      // 404 nie rozróżnia „nigdy nie istniał" od „istnieje, ale nie Twój" —
      // nie ma z czego zbudować wyroczni.
      assert.equal(Object.keys(json).length, 1);
    } finally {
      teardown(restore);
    }
  });
});

test("bookingId ze śmieciami nie wywraca endpointu i nie ujawnia niczego", async () => {
  await withEnv(LIVE_ENV, async () => {
    await setup();
    const restore = mockFetch(() => ({ status: 200, body: { data: [] } }));
    try {
      const { GET } = await import("./booking/[bookingId]/route");
      for (const zly of ["../../etc/passwd", "'; DROP TABLE", "%00", "a".repeat(500), ""]) {
        const res = await GET(new NextRequest(`http://localhost/api/flights/booking/x`), {
          params: Promise.resolve({ bookingId: zly }),
        });
        const json = await res.json();
        assert.equal(res.status, 404, `nieoczekiwany status dla „${zly.slice(0, 20)}"`);
        const cale = JSON.stringify(json);
        for (const p of PII_PROBKI) assert.equal(cale.includes(p), false);
      }
    } finally {
      teardown(restore);
    }
  });
});

test("skanowanie ma sufit: limiter odcina 429 PRZED dotknięciem magazynu", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    // Prawdziwa rezerwacja w magazynie — gdyby limiter nie działał, poniższe
    // żądanie oddałoby imię i nazwisko.
    await redis.set(`flight:v1:bybooking:bk_real`, "sid_real");
    await redis.set(`flight:v1:session:sid_real`, {
      searchSessionId: "sid_real",
      bookingId: "bk_real",
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      passengerData: [{ firstName: "Jan", lastName: "Kowalski", type: "ADT" }],
      contactData: CONTACT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    __setLimiterForTests("booking-lookup", odmawiajacyLimiter());
    const restore = mockFetch(() => ({ status: 200, body: { data: [] } }));
    try {
      const { GET } = await import("./booking/[bookingId]/route");
      const res = await GET(new NextRequest("http://localhost/api/flights/booking/bk_real"), {
        params: Promise.resolve({ bookingId: "bk_real" }),
      });
      assert.equal(res.status, 429);
      const cale = JSON.stringify(await res.json());
      for (const p of PII_PROBKI) assert.equal(cale.includes(p), false, `429 zawiera „${p}"`);
      // Limiter stoi PRZED odczytem — dostawca też nietknięty.
      assert.equal(fetchCalls.length, 0);
    } finally {
      teardown(restore);
    }
  });
});

test("właściciel rezerwacji dalej dostaje swoje dane (limiter nie psuje ścieżki)", async () => {
  await withEnv(LIVE_ENV, async () => {
    const redis = await setup();
    await redis.set(`flight:v1:bybooking:bk_ok`, "sid_ok");
    await redis.set(`flight:v1:session:sid_ok`, {
      searchSessionId: "sid_ok",
      bookingId: "bk_ok",
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      price: 1918.34,
      currency: "PLN",
      passengerData: [
        { firstName: "Jan", lastName: "Kowalski", type: "ADT", documentNumberMasked: "******567", birthday: "1990-05-04" },
      ],
      contactData: CONTACT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const restore = mockFetch(() => ({ status: 200, body: { data: [] } }));
    try {
      const { GET } = await import("./booking/[bookingId]/route");
      const res = await GET(new NextRequest("http://localhost/api/flights/booking/bk_ok"), {
        params: Promise.resolve({ bookingId: "bk_ok" }),
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      // Pasażer widzi własne imię — to jest sens tej strony.
      assert.equal(json.passengers[0].firstName, "Jan");
      // Ale NIC ponad to, co potrzebne do potwierdzenia.
      const cale = JSON.stringify(json);
      for (const tajne of ["******567", "1990-05-04", "jan@example.com", "500600700", "tx_", "pb_", "pi_"]) {
        assert.equal(cale.includes(tajne), false, `odpowiedź zawiera „${tajne}"`);
      }
    } finally {
      teardown(restore);
    }
  });
});
