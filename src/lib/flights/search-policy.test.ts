import assert from "node:assert/strict";
import { test } from "node:test";

import { searchFlightRates } from "./client";
import { FlightSearchInputSchema } from "./types";
import { isBackgroundFlightSearchEnabled } from "./search-policy";

const INPUT = FlightSearchInputSchema.parse({
  legs: [
    { origin: "WAW", destination: "BCN", date: "2031-07-15", direction: "OUTBOUND" as const },
    { origin: "BCN", destination: "WAW", date: "2031-07-22", direction: "INBOUND" as const },
  ],
  adults: 1,
  children: 0,
  infants: 0,
  cabinClass: "ECONOMY" as const,
  currency: "PLN",
  country: "PL",
});

test("wyszukiwania w tle: domyślnie WYŁĄCZONE, włącza tylko jawne „on”", () => {
  assert.equal(isBackgroundFlightSearchEnabled({}), false);
  assert.equal(isBackgroundFlightSearchEnabled({ FLIGHTS_BACKGROUND_SEARCH: "" }), false);
  assert.equal(isBackgroundFlightSearchEnabled({ FLIGHTS_BACKGROUND_SEARCH: "true" }), false);
  assert.equal(isBackgroundFlightSearchEnabled({ FLIGHTS_BACKGROUND_SEARCH: "off" }), false);
  assert.equal(isBackgroundFlightSearchEnabled({ FLIGHTS_BACKGROUND_SEARCH: "on" }), true);
  assert.equal(isBackgroundFlightSearchEnabled({ FLIGHTS_BACKGROUND_SEARCH: " ON " }), true);
});

test("wyszukiwanie w tle przy wyłączonym przełączniku NIE wysyła żądania do dostawcy", async () => {
  const prevFetch = globalThis.fetch;
  const prevFlag = process.env.FLIGHTS_BACKGROUND_SEARCH;
  delete process.env.FLIGHTS_BACKGROUND_SEARCH;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(searchFlightRates(INPUT, { source: "background" }), (err: unknown) => {
      const e = err as { reason?: string; retryable?: boolean };
      assert.equal(e.reason, "BACKGROUND_DISABLED");
      assert.equal(e.retryable, false);
      return true;
    });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevFlag === undefined) delete process.env.FLIGHTS_BACKGROUND_SEARCH;
    else process.env.FLIGHTS_BACKGROUND_SEARCH = prevFlag;
  }
});

test("429 od dostawcy przy wyszukiwaniu NIE jest ponawiany (limitowanie nie może się mnożyć)", async () => {
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.LITEAPI_PROD_PRIVATE_KEY;
  const prevMode = process.env.LITEAPI_ENV;
  process.env.LITEAPI_PROD_PRIVATE_KEY = "prod_test_private";
  process.env.LITEAPI_ENV = "production";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { code: 429, message: "too many requests" } }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "30" },
    });
  }) as typeof fetch;
  try {
    await assert.rejects(searchFlightRates(INPUT, { source: "user" }));
    assert.equal(calls, 1, "jedno zapytanie, bez ponowień przy 429");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.LITEAPI_PROD_PRIVATE_KEY;
    else process.env.LITEAPI_PROD_PRIVATE_KEY = prevKey;
    if (prevMode === undefined) delete process.env.LITEAPI_ENV;
    else process.env.LITEAPI_ENV = prevMode;
  }
});
