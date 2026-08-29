import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRICE_EPSILON,
  averagePerTraveller,
  formatFlightPrice,
  formatFlightPriceExact,
  priceChangeDirection,
  priceChanged,
  priceDelta,
} from "./money";

// Intl pl-PL wstawia U+00A0 i jako separator tysięcy, i przed „zł".
// W asercjach zapisujemy to JAWNIE — dosłowna spacja niełamliwa w źródle jest
// nie do odróżnienia od zwykłej, a test, który nie odróżnia, niczego nie chroni.
const NBSP = " ";

test("formatFlightPriceExact: pokazuje grosze, gdy istnieją (kwota z prod verify)", () => {
  assert.equal(formatFlightPriceExact(1918.34), `1${NBSP}918,34${NBSP}zł`);
});

test("formatFlightPriceExact: kwota okrągła BEZ ,00 — nie robimy paragonu z ceny", () => {
  assert.equal(formatFlightPriceExact(2780), `2${NBSP}780${NBSP}zł`);
  assert.equal(formatFlightPriceExact(959), `959${NBSP}zł`);
});

test("formatFlightPriceExact: artefakt IEEE-754 nie wypuszcza 13 miejsc po przecinku", () => {
  // 1918.34 po podzieleniu i pomnożeniu potrafi wrócić jako …3400000000001.
  assert.equal(formatFlightPriceExact(1918.3400000000001), `1${NBSP}918,34${NBSP}zł`);
  // 0.1+0.2 = 0.30000000000000004 — klasyk; ma być 0,30 zł, nie 0,3000000000000000 zł.
  assert.equal(formatFlightPriceExact(0.1 + 0.2), `0,30${NBSP}zł`);
});

test("formatFlightPriceExact: kwota, która po zaokrągleniu do grosza jest okrągła", () => {
  assert.equal(formatFlightPriceExact(2779.999), `2${NBSP}780${NBSP}zł`);
});

test("formatFlightPrice: wersja orientacyjna zaokrągla do pełnych złotych", () => {
  assert.equal(formatFlightPrice(1918.34), `1${NBSP}918${NBSP}zł`);
  assert.equal(formatFlightPrice(959.6), `960${NBSP}zł`);
});

test("formatFlightPrice: grupuje tysiące (useGrouping:always) — inaczej 4 cyfry idą bez separatora", () => {
  assert.equal(formatFlightPrice(1137), `1${NBSP}137${NBSP}zł`);
});

test("oba formatery: null i NaN dają myślnik, nigdy „0 zł”", () => {
  assert.equal(formatFlightPrice(null), "—");
  assert.equal(formatFlightPriceExact(null), "—");
  assert.equal(formatFlightPriceExact(Number.NaN), "—");
  assert.equal(formatFlightPrice(Number.POSITIVE_INFINITY), "—");
});

test("formatery honorują walutę inną niż PLN (dostawca może oddać EUR)", () => {
  assert.ok(formatFlightPriceExact(120.5, "EUR").includes("120,50"));
});

test("averagePerTraveller: suma / liczba podróżnych", () => {
  assert.equal(averagePerTraveller(1918.34, 2), 959.17);
});

test("averagePerTraveller: zero i ujemna liczba podróżnych → null, nie dzielenie przez zero", () => {
  assert.equal(averagePerTraveller(1918.34, 0), null);
  assert.equal(averagePerTraveller(1918.34, -1), null);
});

test("averagePerTraveller: brak sumy → null (UI ma pokazać myślnik, nie „0 zł”)", () => {
  assert.equal(averagePerTraveller(null, 2), null);
});

test("priceChanged: różnica poniżej grosza to szum zmiennoprzecinkowy, nie zmiana ceny", () => {
  assert.equal(priceChanged(1918.34, 1918.34), false);
  assert.equal(priceChanged(1918.34, 1918.3400001), false);
  assert.equal(priceChanged(1918.34, 1918.34 + PRICE_EPSILON / 2), false);
});

test("priceChanged: +1 grosz JEST zmianą (scenariusz 2727 → 2727,01)", () => {
  assert.equal(priceChanged(2727, 2727.01), true);
});

test("priceChanged: +1 zł i duży wzrost", () => {
  assert.equal(priceChanged(2727, 2728), true);
  assert.equal(priceChanged(2727, 3500), true);
});

test("priceChanged: SPADEK ceny też jest zmianą — user musi ją zobaczyć", () => {
  assert.equal(priceChanged(2727, 2500), true);
});

test("priceChanged: brak którejkolwiek strony → brak porównania (nie zgadujemy)", () => {
  assert.equal(priceChanged(undefined, 2727), false);
  assert.equal(priceChanged(2727, undefined), false);
  assert.equal(priceChanged(null, null), false);
  assert.equal(priceChanged(Number.NaN, 2727), false);
});

test("priceDelta: zaokrąglone do grosza, dodatnie = drożej", () => {
  assert.equal(priceDelta(2727, 2728), 1);
  assert.equal(priceDelta(2727, 2500), -227);
  assert.equal(priceDelta(1918.34, 1920.5), 2.16);
});

test("priceChangeDirection: rozróżnia wzrost, spadek i brak zmiany", () => {
  assert.equal(priceChangeDirection(2727, 2728), "up");
  assert.equal(priceChangeDirection(2727, 2500), "down");
  assert.equal(priceChangeDirection(2727, 2727), "same");
});
