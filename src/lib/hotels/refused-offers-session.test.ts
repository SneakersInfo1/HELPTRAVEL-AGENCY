// Pamięć odmów w karcie przeglądarki i link z listą odrzuconych ofert.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { MAX_REFUSED_OFFERS } from "./offer-fingerprint";
import { readRefusedOffers, rememberRefusedOffer, withRefusedOffers } from "./refused-offers-session";

const STAY = { hotelId: "lp1a2b", checkin: "2026-12-01", checkout: "2026-12-05" };
const FP_A = "000000000000000a";
const FP_B = "000000000000000b";

const realDateNow = Date.now;
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});
afterEach(() => {
  Date.now = realDateNow;
  Reflect.deleteProperty(globalThis, "sessionStorage");
});

test("odmowy zapisują się per hotel i termin, bez powtórzeń", () => {
  rememberRefusedOffer(STAY, FP_A);
  assert.deepEqual(rememberRefusedOffer(STAY, FP_B), [FP_A, FP_B]);
  assert.deepEqual(rememberRefusedOffer(STAY, FP_A), [FP_B, FP_A]);

  assert.deepEqual(readRefusedOffers(STAY), [FP_B, FP_A]);
  assert.deepEqual(readRefusedOffers({ ...STAY, checkin: "2026-12-02" }), []);
  assert.deepEqual(readRefusedOffers({ ...STAY, hotelId: "lp9f" }), []);
});

test("lista ma limit, a odpadają najstarsze odmowy", () => {
  const all = Array.from({ length: MAX_REFUSED_OFFERS + 3 }, (_, i) => i.toString(16).padStart(16, "0"));
  for (const fingerprint of all) rememberRefusedOffer(STAY, fingerprint);
  assert.deepEqual(readRefusedOffers(STAY), all.slice(-MAX_REFUSED_OFFERS));
});

test("odmowa wygasa po 30 min, żeby oferta, która wróciła, nie była ukrywana bez końca", () => {
  const start = realDateNow();
  Date.now = () => start;
  rememberRefusedOffer(STAY, FP_A);

  Date.now = () => start + 29 * 60 * 1000;
  assert.deepEqual(readRefusedOffers(STAY), [FP_A]);

  Date.now = () => start + 31 * 60 * 1000;
  assert.deepEqual(readRefusedOffers(STAY), []);
});

test("uszkodzone dane w pamięci nie wywracają strony", () => {
  store.set(`ht:refused-offers:${STAY.hotelId}:${STAY.checkin}:${STAY.checkout}`, "{nie-json");
  assert.deepEqual(readRefusedOffers(STAY), []);

  store.set(
    `ht:refused-offers:${STAY.hotelId}:${STAY.checkin}:${STAY.checkout}`,
    JSON.stringify([{ fingerprint: "<script>", at: Date.now() }, null, "x"]),
  );
  assert.deepEqual(readRefusedOffers(STAY), []);
});

test("brak dostępu do pamięci (tryb prywatny, webview): link powrotu i tak dostaje tę odmowę", () => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
  assert.deepEqual(readRefusedOffers(STAY), []);
  assert.deepEqual(rememberRefusedOffer(STAY, FP_A), [FP_A]);
});

test("withRefusedOffers: dokłada odciski, zostawia parametry i kotwicę", () => {
  const href = "/hotele/lp1a2b?checkin=2026-12-01&checkout=2026-12-05&adults=2&children=5%2C9#rooms";
  const url = new URL(withRefusedOffers(href, [FP_A, FP_B]), "http://t");

  assert.equal(url.pathname, "/hotele/lp1a2b");
  assert.equal(url.hash, "#rooms");
  assert.equal(url.searchParams.get("refused"), `${FP_A},${FP_B}`);
  assert.equal(url.searchParams.get("children"), "5,9");
  assert.equal(url.searchParams.get("adults"), "2");
});

test("withRefusedOffers: zastępuje poprzednią listę, a pusta lista nie zmienia adresu", () => {
  const first = withRefusedOffers("/hotele/lp1?checkin=2026-12-01", [FP_A]);
  assert.equal(new URL(withRefusedOffers(first, [FP_A, FP_B]), "http://t").searchParams.get("refused"), `${FP_A},${FP_B}`);

  const href = "/hotele/lp1?checkin=2026-12-01#rooms";
  assert.equal(withRefusedOffers(href, []), href);
});
