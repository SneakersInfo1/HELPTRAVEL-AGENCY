import assert from "node:assert/strict";
import { test } from "node:test";

import {
  __resetCronLockRedisForTests,
  __setCronLockRedisForTests,
  zajmijBlokade,
} from "./lock";

// Blokada powstała po audycie 2026-08-04: żaden cron nie był chroniony przed
// nakładającymi się przebiegami, a przy harmonogramie co 30 minut przebieg ma
// znacznie mniej luzu niż przy dwóch godzinach.

interface Zapis {
  key: string;
  value: unknown;
  opts?: { nx?: true; ex?: number };
}

function fakeRedis(opcje: { zajete?: boolean; rzucaj?: boolean } = {}) {
  const zapisy: Zapis[] = [];
  const evale: Array<{ keys: string[]; args: string[] }> = [];
  const magazyn = new Map<string, unknown>();
  return {
    zapisy,
    evale,
    magazyn,
    async set(key: string, value: unknown, opts?: { nx?: true; ex?: number }) {
      if (opcje.rzucaj) throw new Error("redis padl");
      zapisy.push({ key, value, opts });
      if (opts?.nx && (opcje.zajete || magazyn.has(key))) return null;
      magazyn.set(key, value);
      return "OK";
    },
    async eval(_script: string, keys: string[], args: string[]) {
      evale.push({ keys, args });
      if (magazyn.get(keys[0]) === args[0]) {
        magazyn.delete(keys[0]);
        return 1;
      }
      return 0;
    },
  };
}

test("pierwszy przebieg zdobywa blokadę, drugi jest odrzucany", async () => {
  const redis = fakeRedis();
  __setCronLockRedisForTests(redis);
  try {
    const pierwszy = await zajmijBlokade("warm-flight-deals", 360);
    assert.equal(pierwszy.zdobyta, true);

    const drugi = await zajmijBlokade("warm-flight-deals", 360);
    assert.equal(drugi.zdobyta, false, "nakładający się przebieg nie może wejść");

    assert.equal(redis.zapisy[0].key, "lock:warm-flight-deals");
    assert.equal(redis.zapisy[0].opts?.nx, true, "bez NX blokada nadpisywałaby cudzą");
    assert.equal(redis.zapisy[0].opts?.ex, 360, "TTL to bezpiecznik na ubity przebieg");
  } finally {
    __resetCronLockRedisForTests();
  }
});

test("po zwolnieniu kolejny przebieg wchodzi", async () => {
  const redis = fakeRedis();
  __setCronLockRedisForTests(redis);
  try {
    const pierwszy = await zajmijBlokade("warm-rates");
    await pierwszy.zwolnij();
    const drugi = await zajmijBlokade("warm-rates");
    assert.equal(drugi.zdobyta, true);
  } finally {
    __resetCronLockRedisForTests();
  }
});

test("zwolnienie NIE kasuje blokady przejętej przez inny przebieg", async () => {
  // Scenariusz: przebieg A przekracza TTL, blokadę przejmuje B, po czym A
  // kończy się i woła zwolnij(). Bez porównania właściciela A skasowałby
  // blokadę B i ochrona byłaby pozorna.
  const redis = fakeRedis();
  __setCronLockRedisForTests(redis);
  try {
    const a = await zajmijBlokade("warm-flights");
    redis.magazyn.set("lock:warm-flights", "wlasciciel-B");
    await a.zwolnij();
    assert.equal(
      redis.magazyn.get("lock:warm-flights"),
      "wlasciciel-B",
      "cudza blokada musi przetrwać zwolnienie przez spóźnialskiego",
    );
  } finally {
    __resetCronLockRedisForTests();
  }
});

test("brak Redisa nie blokuje crona", async () => {
  __setCronLockRedisForTests(null);
  try {
    const uchwyt = await zajmijBlokade("warm-featured-hotels");
    assert.equal(uchwyt.zdobyta, true, "bez Redisa job ma się wykonać, nie zatrzymać");
    await uchwyt.zwolnij();
  } finally {
    __resetCronLockRedisForTests();
  }
});

test("awaria Redisa przepuszcza przebieg zamiast go wywracać", async () => {
  __setCronLockRedisForTests(fakeRedis({ rzucaj: true }));
  try {
    const uchwyt = await zajmijBlokade("warm-rates");
    assert.equal(uchwyt.zdobyta, true, "aktualizacja ofert jest ważniejsza niż idealna ochrona");
  } finally {
    __resetCronLockRedisForTests();
  }
});

test("każdy przebieg dostaje inny identyfikator właściciela", async () => {
  const redis = fakeRedis();
  __setCronLockRedisForTests(redis);
  try {
    await zajmijBlokade("a");
    await zajmijBlokade("b");
    assert.notEqual(
      redis.zapisy[0].value,
      redis.zapisy[1].value,
      "wspólny identyfikator pozwoliłby skasować cudzą blokadę",
    );
  } finally {
    __resetCronLockRedisForTests();
  }
});
