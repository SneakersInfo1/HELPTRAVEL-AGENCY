// INWARIANT KWOTY — jedna liczba przez cały lejek.
//
//   POKAZANA KWOTA = ZAAKCEPTOWANA = OBCIĄŻENIE = ZAREZERWOWANA = POTWIERDZENIE
//
// Ten plik jeździ tą liczbą przez PRAWDZIWY route prebooka, PRAWDZIWĄ
// finalizację, PRAWDZIWY endpoint kwoty i PRAWDZIWY szablon maila —
// zamockowany jest wyłącznie LiteAPI i Redis. Chodzi o to, żeby test nie
// potwierdzał własnych założeń, tylko realny przepływ.
//
// ── DLACZEGO NIE MIGRUJEMY NA GROSZE (integer minor units) ───────────────────
//
// Kanoniczna odpowiedź brzmi „pieniądze trzymaj w jednostkach minor", ale tutaj
// źródłem kwoty jest GDS, który oddaje `price: 629.9` jako liczbę JSON-ową.
// Konwersja do groszy musiałaby się odbyć u NAS, czyli dołożyłaby własne
// zaokrąglenie do łańcucha, w którym dziś nie ma ani jednego działania
// arytmetycznego na kwocie transakcyjnej: nie sumujemy jej, nie mnożymy i nie
// dzielimy — przenosimy ją i porównujemy. Jedyne dzielenie w lejku
// (`averagePerTraveller`) dotyczy liczby ORIENTACYJNEJ, opisanej jako średnia,
// i nigdy nie wraca do ścieżki płatności.
//
// Ryzyko float jest więc ograniczone do dwóch operacji i obie są tu zamknięte:
//   • PORÓWNANIE — przez `priceChanged` z progiem 1 grosza, nie przez `!==`,
//   • WYŚWIETLENIE — przez `Math.round(x*100)/100`, nie przez `toFixed` na
//     surowej wartości.
// Testy niżej pilnują obu. Migracja całego projektu na grosze dołożyłaby
// powierzchnię błędu (dwie reprezentacje, konwersje na każdej granicy) bez
// zamknięcia żadnego realnego wariantu awarii.

import assert from "node:assert/strict";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { renderFlightConfirmation } from "@/lib/email/templates/flight-confirmation";
import { __resetLimitersForTests, __setLimiterForTests } from "@/lib/rate-limit";

import { formatFlightPriceExact, PRICE_EPSILON, priceChanged, priceDelta } from "./money";
import { __resetFlightRedisForTests, __setFlightRedisForTests, getFlightSession } from "./session";

// ── Harness (ten sam kształt co flight-routes.test.ts) ───────────────────────

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

let bookCalls = 0;
function mockLiteApi(handler: (url: string, body: unknown) => { status: number; body: unknown }): () => void {
  const orig = globalThis.fetch;
  bookCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/flights/bookings")) bookCalls += 1;
    let body: unknown = null;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
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

const ENV: Record<string, string | undefined> = {
  LITEAPI_BASE_URL: "https://api.liteapi.travel/v3.0",
  LITEAPI_PROD_PRIVATE_KEY: "prod_test_private",
  LITEAPI_PROD_KEY: undefined,
  LITEAPI_SANDBOX_KEY: undefined,
  LITEAPI_SANDBOX_PRIVATE_KEY: undefined,
  LITEAPI_API_KEY: undefined,
  LITEAPI_ENV: "production",
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  // Inwarianty ceny opisują ścieżkę WŁĄCZONĄ. Zachowanie hamulca
  // (`FLIGHTS_FLOW_MODE`) ma własne testy w `flight-routes.test.ts`.
  FLIGHTS_FLOW_MODE: "live",
  RESEND_API_KEY: undefined,
  EMAIL_FROM: undefined,
  ALERT_WEBHOOK_URL: undefined,
};

const CONTACT = { firstName: "Jan", lastName: "Kowalski", email: "jan@example.com", phoneNumber: "500600700", phoneCountryCode: "48" };
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

function prebookReq(acceptedTotal: number, acceptedCurrency = "PLN") {
  return new NextRequest("http://localhost/api/flights/prebook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      offerId: "OFFER_ABCDEFGH",
      lastTravelDate: "2026-09-27",
      acceptedTotal,
      acceptedCurrency,
      contact: CONTACT,
      passengers: [PASSENGER],
    }),
  });
}

function prebookOk(price: number, currency = "PLN") {
  return {
    data: [
      {
        prebookId: "pb_inv",
        transactionId: "tx_inv",
        secretKey: "pi_3Inv0000000001_secret_abcdefghijk",
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
function teardown(restore: () => void) {
  restore();
  __resetFlightRedisForTests();
  __resetLimitersForTests();
}

/**
 * Przejeżdża CAŁY łańcuch dla zadanej pary (zaakceptowana, lock) i zwraca
 * kwotę z każdego ogniwa. Każde ogniwo czyta z tego, z czego czyta produkcja.
 */
async function traceChain(accepted: number, locked: number, currency = "PLN") {
  const restore = mockLiteApi((url) =>
    url.includes("/flights/bookings")
      ? { status: 200, body: { data: [{ bookingId: "bk_inv", status: "CONFIRMED", pnr: "ABC123" }] } }
      : { status: 200, body: prebookOk(locked, currency) },
  );
  try {
    const { POST } = await import("@/app/api/flights/prebook/route");
    const preRes = await POST(prebookReq(accepted, currency));
    const pre = await preRes.json();
    if (preRes.status !== 200) {
      return { blocked: true as const, status: preRes.status, error: pre.error as string, lockedTotal: pre.lockedTotal as number | undefined, bookCalls };
    }

    // Ogniwo „Do zapłaty" — dokładnie to, co czyta strona płatności.
    const { GET } = await import("@/app/api/flights/session/[sessionId]/route");
    const sesRes = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ sessionId: pre.sessionId }) });
    const ses = await sesRes.json();

    const { finalizeFlightBooking } = await import("./finalize");
    const fin = await finalizeFlightBooking(pre.sessionId, { paymentIntentId: "pi_3Inv0000000001", redirectStatus: "succeeded" });
    const after = await getFlightSession(pre.sessionId);

    // Ogniwo „mail" — przez ten sam szablon, który wychodzi do klienta.
    const mail = renderFlightConfirmation({
      bookingId: String(fin.body.bookingId),
      price: after?.price,
      currency: after?.currency,
      supportEmail: "pomoc@helptravel.pl",
    });

    return {
      blocked: false as const,
      prebookPrice: pre.price as number,
      widgetAmount: ses.amount as number, // kwota nad przyciskiem „Zapłać"
      storedPrice: after?.price,
      acceptedTrace: after?.acceptedTotal,
      bookedPrice: (await (async () => {
        const { getFlightCompleted } = await import("./session");
        return (await getFlightCompleted(String(fin.body.bookingId)))?.price;
      })()),
      mailHtml: mail.html,
      mailText: mail.text,
      status: fin.status,
      bookCalls,
    };
  } finally {
    teardown(restore);
  }
}

// ── 1. Kwota bez rozjazdu ────────────────────────────────────────────────────

test("INWARIANT: 1918,34 → ta sama liczba w każdym ogniwie łańcucha", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const c = await traceChain(1918.34, 1918.34);
    assert.equal(c.blocked, false);
    assert.equal(c.prebookPrice, 1918.34);
    assert.equal(c.widgetAmount, 1918.34);
    assert.equal(c.storedPrice, 1918.34);
    assert.equal(c.bookedPrice, 1918.34);
    // Mail: dokładnie „1918,34 zł" — nie 1918, nie 1918.34 PLN, nie 1918,3400.
    assert.ok(c.mailText.includes(formatFlightPriceExact(1918.34)), `mail: ${c.mailText.slice(0, 400)}`);
    assert.equal(/1918[.,]3399|1918,34\d/.test(c.mailText), false, "artefakt zmiennoprzecinkowy w mailu");
  });
});

// ── 2–4. Rozjazd lock vs akceptacja ──────────────────────────────────────────

test("INWARIANT: 2727 → dostawca 2728 → BRAK ZGODY = brak sesji płatności", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const c = await traceChain(2727, 2728);
    assert.equal(c.blocked, true);
    assert.equal(c.status, 409);
    assert.equal(c.error, "PRICE_CHANGED");
    assert.equal(c.lockedTotal, 2728);
    assert.equal(c.bookCalls, 0);
  });
});

test("INWARIANT: 2727 → dostawca 2728 → klient AKCEPTUJE 2728 → 2728 wszędzie", async () => {
  await withEnv(ENV, async () => {
    await setup();
    // Akceptacja = ponowny prebook z `acceptedTotal` równym nowej kwocie.
    const c = await traceChain(2728, 2728);
    assert.equal(c.blocked, false);
    assert.equal(c.widgetAmount, 2728);
    assert.equal(c.storedPrice, 2728);
    assert.equal(c.bookedPrice, 2728);
    assert.equal(c.acceptedTrace, 2728);
  });
});

test("INWARIANT: 2727 → dostawca 2900 → bez zgody 409; po zgodzie 2900 wszędzie", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const blocked = await traceChain(2727, 2900);
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.lockedTotal, 2900);

    await setup();
    const ok = await traceChain(2900, 2900);
    assert.equal(ok.widgetAmount, 2900);
    assert.equal(ok.bookedPrice, 2900);
    assert.ok(ok.mailText.includes(formatFlightPriceExact(2900)));
  });
});

test("INWARIANT: SPADEK ceny też wymaga zgody (2727 → 2500 = 409)", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const c = await traceChain(2727, 2500);
    assert.equal(c.blocked, true);
    assert.equal(c.error, "PRICE_CHANGED");
    assert.equal(c.lockedTotal, 2500);
    // Niższa kwota to nadal INNA kwota — nie wolno jej zaakceptować za klienta.
    assert.equal(c.bookCalls, 0);
  });
});

test("INWARIANT: różnica jednego grosza BLOKUJE, szum poniżej grosza nie", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const cent = await traceChain(1918.34, 1918.35);
    assert.equal(cent.blocked, true, "1 grosz musi zablokować");

    await setup();
    const noise = await traceChain(1918.34, 1918.3400000000001);
    assert.equal(noise.blocked, false, "artefakt IEEE-754 nie może blokować");
    assert.ok(noise.mailText.includes(formatFlightPriceExact(1918.34)));
  });
});

// ── 6. Waluta ────────────────────────────────────────────────────────────────

test("INWARIANT: inna waluta locka → 409 CURRENCY_MISMATCH, dostawca nietknięty", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const restore = mockLiteApi(() => ({ status: 200, body: prebookOk(1918.34, "EUR") }));
    try {
      const { POST } = await import("@/app/api/flights/prebook/route");
      const res = await POST(prebookReq(1918.34, "PLN"));
      const json = await res.json();
      assert.equal(res.status, 409);
      assert.equal(json.error, "CURRENCY_MISMATCH");
      assert.equal(json.secretKey, undefined);
      assert.equal(bookCalls, 0);
    } finally {
      teardown(restore);
    }
  });
});

// ── 7. Nieznana kwota ────────────────────────────────────────────────────────

test("INWARIANT: prebook bez ceny → 502, nie otwieramy płatności na nieznaną kwotę", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const restore = mockLiteApi(() => ({
      status: 200,
      body: { data: [{ prebookId: "pb_x", transactionId: "tx_x", secretKey: "pi_3X_secret_y", currency: "PLN" }] },
    }));
    try {
      const { POST } = await import("@/app/api/flights/prebook/route");
      const res = await POST(prebookReq(1918.34));
      const json = await res.json();
      assert.equal(res.status, 502);
      assert.equal(json.error, "prebook_no_price");
      assert.equal(json.secretKey, undefined);
    } finally {
      teardown(restore);
    }
  });
});

// ── 8–10. Podwójny submit, odświeżenie, cofnięcie ────────────────────────────

test("INWARIANT: podwójna finalizacja (odświeżenie / dwa kliknięcia) = JEDEN booking", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const restore = mockLiteApi((url) =>
      url.includes("/flights/bookings")
        ? { status: 200, body: { data: [{ bookingId: "bk_once", status: "CONFIRMED" }] } }
        : { status: 200, body: prebookOk(1918.34) },
    );
    try {
      const { POST } = await import("@/app/api/flights/prebook/route");
      const pre = await (await POST(prebookReq(1918.34))).json();
      const { finalizeFlightBooking } = await import("./finalize");
      const ret = { paymentIntentId: "pi_3Inv0000000001", redirectStatus: "succeeded" };

      const a = await finalizeFlightBooking(pre.sessionId, ret);
      const b = await finalizeFlightBooking(pre.sessionId, ret); // odświeżenie strony powrotu
      const c = await finalizeFlightBooking(pre.sessionId, ret); // cofnięcie i ponowne wejście

      assert.equal(a.body.bookingId, "bk_once");
      assert.equal(b.body.alreadyBooked, true);
      assert.equal(c.body.alreadyBooked, true);
      assert.equal(bookCalls, 1, "dostawca zawołany więcej niż raz");
      const after = await getFlightSession(pre.sessionId);
      assert.equal(after?.price, 1918.34, "kwota nie może się zmienić przy powtórzeniu");
    } finally {
      teardown(restore);
    }
  });
});

test("INWARIANT: powrót do płatności po finalizacji nie odblokowuje drugiego obciążenia", async () => {
  await withEnv(ENV, async () => {
    await setup();
    const restore = mockLiteApi((url) =>
      url.includes("/flights/bookings")
        ? { status: 200, body: { data: [{ bookingId: "bk_back", status: "CONFIRMED" }] } }
        : { status: 200, body: prebookOk(1918.34) },
    );
    try {
      const { POST } = await import("@/app/api/flights/prebook/route");
      const pre = await (await POST(prebookReq(1918.34))).json();
      const { finalizeFlightBooking } = await import("./finalize");
      await finalizeFlightBooking(pre.sessionId, { paymentIntentId: "pi_3Inv0000000001", redirectStatus: "succeeded" });

      // Klient wciska „wstecz" i ląduje na /loty/platnosc, które pyta o kwotę.
      const { GET } = await import("@/app/api/flights/session/[sessionId]/route");
      const ses = await (await GET(new Request("http://localhost/x"), { params: Promise.resolve({ sessionId: pre.sessionId }) })).json();
      assert.equal(ses.payable, false, "opłacona sesja nie może znów zamontować widgetu");
      assert.equal(ses.bookingStatus, "confirmed");
    } finally {
      teardown(restore);
    }
  });
});

// ── Reprezentacja kwoty ──────────────────────────────────────────────────────

test("porównanie kwot NIE używa `===` — próg to grosz, po obu stronach zera", () => {
  assert.equal(priceChanged(0.1 + 0.2, 0.3), false, "0.1+0.2 !== 0.3 nie może być zmianą ceny");
  assert.equal(priceChanged(1918.34, 1918.3400000000001), false);
  assert.equal(priceChanged(1918.34, 1918.35), true);
  assert.equal(priceChanged(1918.35, 1918.34), true, "próg musi działać symetrycznie");
  assert.equal(PRICE_EPSILON < 0.01, true, "próg musi być OSTRZEJSZY niż grosz");
});

test("formatowanie zaokrągla PRZED decyzją o groszach — żadnych 1918,3399 zł", () => {
  assert.equal(formatFlightPriceExact(1918.3400000000001), formatFlightPriceExact(1918.34));
  assert.equal(formatFlightPriceExact(2780.000000001).includes(","), false, "okrągła kwota bez „,00”");
  // 12 999 zł — separator tysięcy to niełamliwa spacja (Intl pl-PL).
  assert.equal(formatFlightPriceExact(12999).replace(/ /g, " "), "12 999 zł");
  assert.equal(formatFlightPriceExact(999.99).replace(/ /g, " "), "999,99 zł");
});

test("różnica cen zaokrąglana do grosza, nie do 13 miejsc", () => {
  assert.equal(priceDelta(2727, 2728.1), 1.1);
  assert.equal(priceDelta(0.3, 0.1 + 0.2), 0);
});

test("brak kwoty nigdy nie udaje zera", () => {
  assert.equal(formatFlightPriceExact(null), "—");
  assert.equal(formatFlightPriceExact(Number.NaN), "—");
  assert.equal(priceChanged(null, 100), false);
  assert.equal(priceChanged(undefined, undefined), false);
});
