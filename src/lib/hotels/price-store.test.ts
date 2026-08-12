// Magazyn cen w karcie przeglądarki. Testujemy dwie rzeczy, które w produkcji
// zawiodły:
//   • jedna nieudana paczka NIE MOŻE kasować cen, które już doszły (§16),
//   • „error" musi być stanem PONAWIALNYM, a ponowienie ma dotyczyć wyłącznie
//     nieudanego podzbioru — bez przeładowania strony (§19 i §21).

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  __resetBatcherForTests,
  __setSleepForTests,
  type SlimRate,
} from "./price-batcher";
import {
  ensurePrice,
  getPrice,
  retryFailedPrices,
  subscribe,
  __resetPriceStoreForTests,
} from "./price-store";

const RATE: SlimRate = { totalAmount: 999, currency: "PLN", offerId: "o", rateId: "r" };

const CTX = {
  checkin: "2026-09-15",
  checkout: "2026-09-17",
  adults: 2,
  children: [] as number[],
  rooms: 1,
  currency: "PLN",
};

const realFetch = globalThis.fetch;

beforeEach(() => {
  __resetPriceStoreForTests();
  __resetBatcherForTests();
  __setSleepForTests(async () => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetPriceStoreForTests();
  __resetBatcherForTests();
  __setSleepForTests(null);
});

/** Czeka, aż store przestanie mieć cokolwiek w stanie „loading". */
function poUstaniu(ids: string[]): Promise<void> {
  return new Promise((resolve) => {
    const sprawdz = () => {
      const gotowe = ids.every((id) => getPrice({ hotelId: id, ...CTX }) !== "loading");
      if (gotowe) {
        odepnij();
        resolve();
      }
    };
    const odepnij = subscribe(sprawdz);
    sprawdz();
  });
}

test("częściowa awaria: udane ceny zostają, nieudane są 'error' (nie null)", async () => {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { hotelIds: string[] };
    if (body.hotelIds.includes("zly")) return new Response("nope", { status: 503 });
    const rates: Record<string, SlimRate | null> = {};
    for (const id of body.hotelIds) rates[id] = RATE;
    return new Response(JSON.stringify({ rates }), { status: 200 });
  };

  // Osobne konteksty czasowe wymusiłyby osobne grupy, więc wszystko idzie
  // jedną paczką — dlatego dzielimy je jawnie na dwa wywołania w czasie.
  ensurePrice({ hotelId: "dobry", ...CTX });
  await poUstaniu(["dobry"]);
  assert.deepEqual(getPrice({ hotelId: "dobry", ...CTX }), RATE);

  ensurePrice({ hotelId: "zly", ...CTX });
  await poUstaniu(["zly"]);
  assert.equal(getPrice({ hotelId: "zly", ...CTX }), "error");
  // NAJWAŻNIEJSZE: awaria drugiego hotelu nie ruszyła ceny pierwszego.
  assert.deepEqual(getPrice({ hotelId: "dobry", ...CTX }), RATE);
});

test("retryFailedPrices ponawia WYŁĄCZNIE nieudane i nie kasuje dobrych cen", async () => {
  let padaj = true;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { hotelIds: string[] };
    if (padaj && body.hotelIds.includes("zly")) return new Response("nope", { status: 500 });
    const rates: Record<string, SlimRate | null> = {};
    for (const id of body.hotelIds) rates[id] = RATE;
    return new Response(JSON.stringify({ rates }), { status: 200 });
  };

  ensurePrice({ hotelId: "dobry", ...CTX });
  await poUstaniu(["dobry"]);
  ensurePrice({ hotelId: "zly", ...CTX });
  await poUstaniu(["zly"]);
  assert.equal(getPrice({ hotelId: "zly", ...CTX }), "error");

  padaj = false;
  const wziete = retryFailedPrices(["dobry", "zly"], CTX);
  assert.equal(wziete, 1, "do ponowienia idzie tylko hotel w stanie 'error'");
  // Dobra cena przetrwała samo wywołanie ponowienia.
  assert.deepEqual(getPrice({ hotelId: "dobry", ...CTX }), RATE);

  await poUstaniu(["zly"]);
  assert.deepEqual(getPrice({ hotelId: "zly", ...CTX }), RATE);
});

test("retryFailedPrices bez nieudanych hoteli nie robi nic", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String((init as RequestInit).body)) as { hotelIds: string[] };
    const rates: Record<string, SlimRate | null> = {};
    for (const id of body.hotelIds) rates[id] = RATE;
    return new Response(JSON.stringify({ rates }), { status: 200 });
  };
  ensurePrice({ hotelId: "a", ...CTX });
  await poUstaniu(["a"]);
  const przed = calls;
  assert.equal(retryFailedPrices(["a"], CTX), 0);
  assert.equal(calls, przed, "brak nieudanych = zero dodatkowego ruchu");
});

test("potwierdzony brak miejsc (null) NIE jest ponawiany", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ rates: { pusty: null } }), { status: 200 });
  ensurePrice({ hotelId: "pusty", ...CTX });
  await poUstaniu(["pusty"]);
  assert.equal(getPrice({ hotelId: "pusty", ...CTX }), null);
  assert.equal(retryFailedPrices(["pusty"], CTX), 0);
});
