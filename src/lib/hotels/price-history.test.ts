// Historia cen 30 dni — reguła prawna zapisana jako testy.
//
// Dyrektywa Omnibus wymaga przy ogłoszeniu obniżki podania NAJNIŻSZEJ ceny
// z 30 dni PRZED obniżką. Poniższe przypadki pilnują trzech rzeczy, których
// pomyłka byłaby błędem wobec przepisu, a nie tylko wobec UX:
//   • okno to dokładnie 30 dni wstecz, nie „ostatnie wpisy",
//   • dzisiejszy wpis NIE liczy się jako historia,
//   • brak danych daje „nie wiemy", nigdy „nie było taniej".

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  __setRedisForTests,
  lowest30dNotice,
  lowestPrice30d,
  recordPrice,
} from "./price-history";

const CTX = {
  checkin: "2026-09-15",
  checkout: "2026-09-17",
  adults: 2,
  children: [] as number[],
  rooms: 1,
  currency: "PLN",
};

/** Atrapa Upstasha — tylko te trzy metody, których używa moduł. */
function fakeRedis(dane: Record<string, Record<string, number>> = {}) {
  const store: Record<string, Record<string, number>> = { ...dane };
  const wywolania: string[] = [];
  return {
    store,
    wywolania,
    redis: {
      hget: async (key: string, field: string) => store[key]?.[field] ?? null,
      hset: async (key: string, obj: Record<string, number>) => {
        wywolania.push(`hset ${key}`);
        store[key] = { ...(store[key] ?? {}), ...obj };
        return 1;
      },
      expire: async () => 1,
      hgetall: async (key: string) => store[key] ?? null,
    } as never,
  };
}

const DZIS = new Date("2026-08-20T10:00:00Z");

test("historia: brak Redisa → 'nie wiemy', nigdy wyjątek", async () => {
  __setRedisForTests(null);
  assert.equal(await lowestPrice30d("lp1", CTX), null);
  // Zapis też ma przejść bez śladu i bez błędu.
  await recordPrice("lp1", CTX, 500);
});

test("historia: zapisuje MINIMUM doby, nie ostatnią wartość", async () => {
  const f = fakeRedis();
  __setRedisForTests(f.redis);
  await recordPrice("lp1", CTX, 900, DZIS);
  await recordPrice("lp1", CTX, 700, DZIS); // taniej — nadpisuje
  await recordPrice("lp1", CTX, 850, DZIS); // drożej — NIE nadpisuje
  const key = Object.keys(f.store)[0];
  assert.equal(f.store[key]["2026-08-20"], 700);
  // Trzeci zapis nie poszedł do Redisa — zbędne zapisy przy każdym wejściu.
  assert.equal(f.wywolania.length, 2);
});

test("historia: DZISIEJSZY wpis nie liczy się jako historia", async () => {
  // Inaczej „najniższa cena z 30 dni" równałaby się cenie na ekranie.
  const f = fakeRedis({
    "phist:v1:lp1:2026-09-15:2026-09-17:2--1:PLN": { "2026-08-20": 500 },
  });
  __setRedisForTests(f.redis);
  assert.equal(await lowestPrice30d("lp1", CTX, DZIS), null);
});

test("historia: bierze minimum z okna 30 dni", async () => {
  const f = fakeRedis({
    "phist:v1:lp1:2026-09-15:2026-09-17:2--1:PLN": {
      "2026-08-19": 820,
      "2026-08-10": 640,
      "2026-07-30": 900,
      "2026-08-20": 300, // dzisiaj — pomijane
    },
  });
  __setRedisForTests(f.redis);
  assert.equal(await lowestPrice30d("lp1", CTX, DZIS), 640);
});

test("historia: wpis SPRZED okna 30 dni jest pomijany", async () => {
  const f = fakeRedis({
    "phist:v1:lp1:2026-09-15:2026-09-17:2--1:PLN": {
      "2026-07-01": 100, // ponad 30 dni temu
      "2026-08-15": 780,
    },
  });
  __setRedisForTests(f.redis);
  assert.equal(await lowestPrice30d("lp1", CTX, DZIS), 780);
});

test("historia: inne DATY POBYTU to inny produkt — osobny klucz", async () => {
  const f = fakeRedis();
  __setRedisForTests(f.redis);
  await recordPrice("lp1", CTX, 500, DZIS);
  await recordPrice("lp1", { ...CTX, checkin: "2026-10-01", checkout: "2026-10-03" }, 900, DZIS);
  assert.equal(Object.keys(f.store).length, 2);
});

test("historia: uszkodzone wartości nie psują wyniku", async () => {
  const f = fakeRedis({
    "phist:v1:lp1:2026-09-15:2026-09-17:2--1:PLN": {
      "2026-08-15": "nonsens" as unknown as number,
      "2026-08-16": 0,
      "2026-08-17": 710,
    },
  });
  __setRedisForTests(f.redis);
  assert.equal(await lowestPrice30d("lp1", CTX, DZIS), 710);
});

test("zdanie o cenie z 30 dni: identyczna kwota = cisza", () => {
  // „Najniższa cena z 30 dni: 829 zł" obok ceny 829 zł to szum, nie informacja.
  assert.equal(lowest30dNotice(829, 829), null);
  assert.equal(lowest30dNotice(null, 829), null);
  assert.equal(lowest30dNotice(760, 829), 760);
});
