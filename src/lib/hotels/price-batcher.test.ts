// Rozróżnienie null vs "error" w batcherze cen jest fundamentem uczciwości
// listy wyników: null ukrywa hotel jako „potwierdzony brak miejsc", więc
// awaria sieci/endpointu NIE MOŻE się na null mapować (audyt 2026-07-03:
// padnięty /rates/batch wyświetlał „Brak dostępnych hoteli w tym terminie").
//
// Rozszerzone 2026-08-12 o wstrzykiwanie awarii (brief §23). Każdy przypadek
// odpowiada JEDNEJ udowodnionej dziurze w produkcji:
//   • brak timeoutu → zawieszony fetch blokował kolejkę NA ZAWSZE,
//   • jedna ponowka po stałych 800 ms → cała paczka 429 ponawiała się w tym
//     samym oknie limitera i skan kończył się zerem cen,
//   • `rates[id] ?? null` → brak klucza w odpowiedzi udawał brak miejsc.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  fetchHotelPrice,
  getBatcherStats,
  __resetBatcherForTests,
  __setRequestTimeoutForTests,
  __setSleepForTests,
  type PriceQuery,
  type SlimRate,
} from "./price-batcher";

const RATE: SlimRate = {
  totalAmount: 1234,
  currency: "PLN",
  offerId: "off-1",
  rateId: "rate-1",
};

function query(hotelId: string): PriceQuery {
  return {
    hotelId,
    checkin: "2026-07-17",
    checkout: "2026-07-19",
    adults: 2,
    children: [],
    rooms: 1,
    currency: "PLN",
  };
}

const realFetch = globalThis.fetch;
/** Zwłoki, o które batcher poprosił — pozwalają sprawdzić HARMONOGRAM ponowek. */
let zwloki: number[] = [];

beforeEach(() => {
  __resetBatcherForTests();
  zwloki = [];
  __setSleepForTests(async (ms) => {
    zwloki.push(ms);
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetBatcherForTests();
  __setSleepForTests(null);
  __setRequestTimeoutForTests(null);
});

function okResponse(rates: Record<string, SlimRate | null>): Response {
  return new Response(JSON.stringify({ rates }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response("nope", { status, headers });
}

// ── A. Ścieżka szczęśliwa ────────────────────────────────────────────────
test("A. 200 → cena trafia do wywołującego", async () => {
  globalThis.fetch = async () => okResponse({ h1: RATE });
  assert.deepEqual(await fetchHotelPrice(query("h1")), RATE);
  assert.equal(getBatcherStats().ok, 1);
});

// ── G. Potwierdzony brak miejsc ──────────────────────────────────────────
test("G. jawny null w odpowiedzi → null (potwierdzony brak miejsc)", async () => {
  globalThis.fetch = async () => okResponse({ h1: null });
  assert.equal(await fetchHotelPrice(query("h1")), null);
});

// ── F. Brak klucza ≠ brak miejsc ─────────────────────────────────────────
test("F. hotel NIEOBECNY w odpowiedzi → 'error', NIE null", async () => {
  // `resolveSlimRates` wpisuje klucz dla KAŻDEGO pytanego hotelu, więc jego
  // brak znaczy niekompletną odpowiedź — czyli awarię techniczną. Mapowanie
  // tego na null ukrywało hotel z listy jako wyprzedany.
  globalThis.fetch = async () => okResponse({ h1: RATE });
  const [jest, brak] = await Promise.all([
    fetchHotelPrice(query("h1")),
    fetchHotelPrice(query("h2")),
  ]);
  assert.deepEqual(jest, RATE);
  assert.equal(brak, "error");
  assert.equal(getBatcherStats().missingFromResponse, 1);
});

// ── B. 429 → ponowka → 200 ───────────────────────────────────────────────
test("B. 429 → ponowka → 200 (sukces), z uszanowaniem Retry-After", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return errResponse(429, { "Retry-After": "2" });
    return okResponse({ h1: RATE });
  };
  assert.deepEqual(await fetchHotelPrice(query("h1")), RATE);
  assert.equal(calls, 2);
  assert.equal(getBatcherStats().rateLimited, 1);
  assert.equal(zwloki.length, 1);
  // Retry-After: 2 s → co najmniej 2000 ms, plus jitter poniżej 350 ms.
  assert.ok(zwloki[0] >= 2000 && zwloki[0] < 2350, `zwłoka poza zakresem: ${zwloki[0]}`);
});

// ── C. 500 → ponowka → 200 ───────────────────────────────────────────────
test("C. 500 → ponowka → 200", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return errResponse(500);
    return okResponse({ h1: RATE });
  };
  assert.deepEqual(await fetchHotelPrice(query("h1")), RATE);
  assert.equal(calls, 2);
  assert.equal(getBatcherStats().serverErrors, 1);
});

test("429 bez Retry-After → rosnące odczekanie z rozrzutem, potem 'error'", async () => {
  globalThis.fetch = async () => errResponse(429);
  assert.equal(await fetchHotelPrice(query("h1")), "error");
  // Pierwsza próba + 2 ponowki = 3 żądania, 2 odczekania.
  assert.equal(getBatcherStats().requests, 3);
  assert.equal(zwloki.length, 2);
  assert.ok(zwloki[0] >= 900 && zwloki[0] < 1250, `1. zwłoka: ${zwloki[0]}`);
  assert.ok(zwloki[1] >= 1800 && zwloki[1] < 2150, `2. zwłoka: ${zwloki[1]}`);
  // Rozrzut MUSI istnieć: bez niego czterdzieści paczek jednego skanu
  // ponawia się w tej samej milisekundzie, wciąż w oknie limitera.
  assert.ok(zwloki[0] !== 900 || zwloki[1] !== 1800, "brak rozrzutu (jitter)");
});

// ── Brak ponowki dla błędów żądania ──────────────────────────────────────
test("400 NIE jest ponawiane — ten sam błędny ładunek dałby ten sam błąd", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return errResponse(400);
  };
  assert.equal(await fetchHotelPrice(query("h1")), "error");
  assert.equal(calls, 1, "błąd żądania nie ma prawa generować ponowek");
  assert.equal(zwloki.length, 0);
  assert.equal(getBatcherStats().clientErrors, 1);
});

test("403 NIE jest ponawiane", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return errResponse(403);
  };
  assert.equal(await fetchHotelPrice(query("h1")), "error");
  assert.equal(calls, 1);
});

// ── D. Timeout zwalnia slot, kolejka jedzie dalej ────────────────────────
test("D. zawieszone żądanie → timeout, kolejka NIE blokuje się na zawsze", async () => {
  __setRequestTimeoutForTests(40);
  let pierwszaPaczka = true;
  globalThis.fetch = async (_url, init) => {
    const signal = (init as RequestInit).signal;
    if (pierwszaPaczka) {
      pierwszaPaczka = false;
      // Żądanie, które NIGDY nie odpowiada — dokładnie ten przypadek zamrażał
      // `inFlight` i zatrzymywał skan przy „Sprawdzam cenę" bez końca.
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    return okResponse({});
  };

  // 350 hoteli = 7 paczek po 50 przy MAX_CONCURRENT 6 — kolejka MUSI
  // przepchnąć siódmą po zwolnieniu slotu przez timeout.
  const ids = Array.from({ length: 350 }, (_, i) => `h${i}`);
  const wyniki = await Promise.all(ids.map((id) => fetchHotelPrice(query(id))));

  assert.equal(wyniki.length, 350, "wszystkie obietnice muszą się rozstrzygnąć");
  assert.ok(getBatcherStats().timeouts >= 1, "timeout musi zostać policzony");
});

// ── E + K. Częściowa awaria: dobre ceny zostają ──────────────────────────
test("E/K. część paczek pada → udane ceny ZOSTAJĄ, nieudane dają 'error'", async () => {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { hotelIds: string[] };
    // Awaria przypięta do ZAWARTOŚCI paczki, nie do numeru wywołania: druga
    // paczka pada trwale, także w ponowkach. Pierwsza odpowiada normalnie.
    if (body.hotelIds.includes("h50")) return errResponse(429);
    const rates: Record<string, SlimRate | null> = {};
    for (const id of body.hotelIds) rates[id] = RATE;
    return okResponse(rates);
  };

  const ids = Array.from({ length: 100 }, (_, i) => `h${i}`);
  const wyniki = await Promise.all(ids.map((id) => fetchHotelPrice(query(id))));
  const wycenione = wyniki.filter((w) => w !== "error" && w !== null).length;
  const bledne = wyniki.filter((w) => w === "error").length;

  assert.equal(wycenione + bledne, 100);
  assert.ok(wycenione > 0, "poprawne ceny nie mogą przepaść przez awarię sąsiedniej paczki");
  assert.ok(bledne > 0, "nieudana paczka musi dać 'error'");
  // Kluczowe: żaden hotel nie dostał `null`, czyli nic nie zniknęło z listy
  // jako „wyprzedane" przez awarię techniczną.
  assert.equal(wyniki.filter((w) => w === null).length, 0);
});

// ── J. Wszystko pada → nic nie udaje sukcesu ─────────────────────────────
test("J. wszystkie paczki padają → wszystko 'error', ZERO null", async () => {
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  const ids = Array.from({ length: 60 }, (_, i) => `h${i}`);
  const wyniki = await Promise.all(ids.map((id) => fetchHotelPrice(query(id))));
  assert.ok(wyniki.every((w) => w === "error"));
  assert.equal(getBatcherStats().networkErrors, 6, "3 próby × 2 paczki");
  assert.equal(getBatcherStats().failedBatches, 2);
});

// ── H. „error" jest ponawialny w kolejnym skanie ─────────────────────────
test("H. po porażce kolejne wywołanie znów uderza do sieci", async () => {
  let tryb: "pad" | "ok" = "pad";
  globalThis.fetch = async () => {
    if (tryb === "pad") throw new Error("down");
    return okResponse({ h1: RATE });
  };
  assert.equal(await fetchHotelPrice(query("h1")), "error");
  tryb = "ok";
  assert.deepEqual(await fetchHotelPrice(query("h1")), RATE);
});

// ── I. Grupa nie może zniknąć spod czekających żądań ─────────────────────
test("I. żądanie dołączone tuż po opróżnieniu kolejki NADAL się rozstrzyga", async () => {
  // Wyścig z §18 briefu: grupa jest kasowana w `.finally` ostatniej paczki.
  // Gdyby skasowano ją, gdy ktoś zdążył już dopisać się do kolejki (albo gdy
  // czeka budzik), jego obietnica nie rozstrzygnęłaby się NIGDY — karta
  // zostawałaby w „Sprawdzam cenę" do końca sesji.
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String((init as RequestInit).body)) as { hotelIds: string[] };
    const rates: Record<string, SlimRate | null> = {};
    for (const id of body.hotelIds) rates[id] = RATE;
    return okResponse(rates);
  };

  const pierwszy = fetchHotelPrice(query("a"));
  await pierwszy;
  // Dokładnie po rozstrzygnięciu pierwszej paczki grupa jest zwalniana —
  // kolejne żądanie musi trafić na świeżą grupę i również się rozstrzygnąć.
  const drugi = await fetchHotelPrice(query("b"));
  assert.deepEqual(drugi, RATE);
  assert.equal(calls, 2);

  // Ten sam scenariusz, ale bez odczekania między żądaniami.
  const rownolegle = await Promise.all([
    fetchHotelPrice(query("c")),
    fetchHotelPrice(query("d")),
    fetchHotelPrice(query("e")),
  ]);
  assert.deepEqual(rownolegle, [RATE, RATE, RATE]);
});

test("timeout nie przecieka: udana odpowiedź nie zostawia wiszącego timera", async () => {
  __setRequestTimeoutForTests(30);
  globalThis.fetch = async () => okResponse({ h1: RATE });
  assert.deepEqual(await fetchHotelPrice(query("h1")), RATE);
  // Gdyby timer nie był czyszczony, proces node:test wisiałby do jego końca.
  assert.equal(getBatcherStats().timeouts, 0);
});
