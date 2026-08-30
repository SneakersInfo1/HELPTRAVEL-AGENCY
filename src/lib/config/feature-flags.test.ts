// Kill-switch lotów — `FLIGHTS_FLOW_MODE`.
//
// Ten przełącznik ma jeden cel: po wykryciu awarii na produkcji operator
// zatrzymuje NAPŁYW nowych płatności jednym ustawieniem env, bez wdrożenia
// kodu. Testy pilnują dwóch rzeczy: że domyślna wartość jest bezpieczna
// (wyłączone) i że tylko dokładnie jedna wartość włącza ścieżkę.

import assert from "node:assert/strict";
import { test } from "node:test";

import { getFlightsFlowMode, isFlightsLive } from "./featureFlags";

async function withEnv(value: string | undefined, fn: () => void): Promise<void> {
  const prev = process.env.FLIGHTS_FLOW_MODE;
  if (value === undefined) delete process.env.FLIGHTS_FLOW_MODE;
  else process.env.FLIGHTS_FLOW_MODE = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.FLIGHTS_FLOW_MODE;
    else process.env.FLIGHTS_FLOW_MODE = prev;
  }
}

test("brak zmiennej → 'disabled' (fail-safe: nie startujemy płatności przez zapomnienie)", async () => {
  await withEnv(undefined, () => {
    assert.equal(getFlightsFlowMode(), "disabled");
    assert.equal(isFlightsLive(), false);
  });
});

test("'live' włącza, wielkość liter i spacje bez znaczenia", async () => {
  for (const v of ["live", "LIVE", "  Live  "]) {
    await withEnv(v, () => {
      assert.equal(getFlightsFlowMode(), "live", `wartość ${JSON.stringify(v)}`);
      assert.equal(isFlightsLive(), true);
    });
  }
});

test("wszystko inne wyłącza — także literówka i wartości „prawie włączone”", async () => {
  for (const v of ["disabled", "true", "1", "yes", "liv", "live!", "", "production"]) {
    await withEnv(v, () => {
      assert.equal(getFlightsFlowMode(), "disabled", `wartość ${JSON.stringify(v)}`);
      assert.equal(isFlightsLive(), false);
    });
  }
});

test("kill-switch lotów jest NIEZALEŻNY od hotelowego BOOKING_FLOW_MODE", async () => {
  const prevHotel = process.env.BOOKING_FLOW_MODE;
  process.env.BOOKING_FLOW_MODE = "live";
  try {
    await withEnv(undefined, () => {
      // Hotele włączone, loty nadal wyłączone — o to chodzi w „nie wyłączaj
      // hotelowego lejka razem z lotniczym".
      assert.equal(isFlightsLive(), false);
    });
    await withEnv("live", () => {
      assert.equal(isFlightsLive(), true);
    });
  } finally {
    if (prevHotel === undefined) delete process.env.BOOKING_FLOW_MODE;
    else process.env.BOOKING_FLOW_MODE = prevHotel;
  }
});
