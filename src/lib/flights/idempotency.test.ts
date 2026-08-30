// Klucz idempotencji prebooka — MUSI być nieprzewidywalny.
//
// Ten klucz identyfikuje wpis w cache'u prebooka, a ten cache zwraca
// `secretKey` (Stripe client secret). Wcześniejszy fallback `String(Date.now())`
// był znakiem czasu w milisekundach — czyli wartością, którą da się zgadnąć,
// a więc ścieżką do cudzego poświadczenia płatności. Serwer domknął tę dziurę
// od swojej strony (odcisk żądania musi się zgadzać), ale klucz i tak nie ma
// prawa być przewidywalny.

import assert from "node:assert/strict";
import { test } from "node:test";

import { newIdempotencyKey } from "./idempotency";

/** Podstawia `crypto` widziane przez moduł i sprząta po sobie. */
function zCrypto<T>(fake: unknown, fn: () => T): T {
  const orig = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: fake, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (orig) Object.defineProperty(globalThis, "crypto", orig);
    else delete (globalThis as { crypto?: unknown }).crypto;
  }
}

test("gdy jest randomUUID — używamy go", () => {
  const key = zCrypto({ randomUUID: () => "11111111-2222-4333-8444-555555555555" }, newIdempotencyKey);
  assert.equal(key, "11111111-2222-4333-8444-555555555555");
});

test("bez randomUUID spada na getRandomValues, nie na zegar", () => {
  const key = zCrypto(
    {
      getRandomValues: (a: Uint8Array) => {
        a.fill(0xab);
        return a;
      },
    },
    newIdempotencyKey,
  );
  assert.equal(key, "ab".repeat(16));
  assert.equal(key.length, 32);
});

test("bez ŻADNEGO źródła losowości NIE wymyślamy klucza", () => {
  // Pusty string = front pomija nagłówek. Dwa submity zrobią wtedy dwa locki
  // taryfy — koszt świadomy i akceptowalny. Klucz zgadywalny byłby gorszy:
  // oddawałby cudzy `secretKey`.
  assert.equal(zCrypto({}, newIdempotencyKey), "");
  assert.equal(zCrypto(undefined, newIdempotencyKey), "");
});

test("klucz NIGDY nie jest znacznikiem czasu", () => {
  const realistyczny = zCrypto(
    { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) % 256; return a; } },
    newIdempotencyKey,
  );
  // Gdyby wróciło `String(Date.now())`, byłoby to 13 cyfr dziesiętnych.
  assert.equal(/^\d{10,14}$/.test(realistyczny), false, "klucz wygląda jak Date.now()");
  assert.equal(realistyczny.length >= 32, true);
});

test("dwa kolejne klucze się różnią", () => {
  let n = 0;
  const gen = () =>
    zCrypto(
      { getRandomValues: (a: Uint8Array) => { a.fill(n); n += 1; return a; } },
      newIdempotencyKey,
    );
  assert.notEqual(gen(), gen());
});
