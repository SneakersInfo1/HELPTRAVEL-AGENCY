import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEAL_FRESH_MS,
  DEAL_MAX,
  DEAL_MIN_SAMPLES,
  DEAL_ROTATION_MS,
  __resetFlightDealsRedisForTests,
  __setFlightDealsRedisForTests,
  hasMeaningfulSpread,
  isDisplayableDeal,
  median,
  mergeFlightDeals,
  pickFreshDeals,
  qualifiesAsDeal,
  readFlightDeals,
  savingPercent,
  type FlightDeal,
} from "./flight-deals";
import { DEAL_MAX_PRICE_PLN } from "./deals-config";

const NOW = Date.parse("2026-08-02T10:00:00Z");

function deal(overrides: Partial<FlightDeal> = {}): FlightDeal {
  return {
    routeKey: "WAW-BCN",
    originIata: "WAW",
    originCityLabel: "Warszawa",
    destinationIata: "BCN",
    destinationId: "barcelona-spain",
    cityLabel: "Barcelona",
    countryLabel: "Hiszpania",
    depart: "2026-09-10",
    returnDate: "2026-09-17",
    nights: 7,
    pricePln: 600,
    typicalPln: 900,
    savingPercent: 33,
    sampleCount: DEAL_MIN_SAMPLES,
    airlineName: "Test Air",
    airlineCode: "TA",
    airlineLogo: "https://example.com/ta.svg",
    stops: 0,
    durationMinutes: 160,
    computedAt: NOW,
    ...overrides,
  };
}

test("mediana obsługuje pustą, nieparzystą i parzystą próbkę", () => {
  assert.equal(median([]), null);
  assert.equal(median([900, 500, 700]), 700);
  assert.equal(median([100, 201, 300, 400]), 251);
});

test("procent oszczędności jest zaokrąglony i nie schodzi poniżej zera", () => {
  assert.equal(savingPercent(700, 1_000), 30);
  assert.equal(savingPercent(666, 1_000), 33);
  assert.equal(savingPercent(1_000, 1_000), 0);
  assert.equal(savingPercent(1_100, 1_000), 0);
  assert.equal(savingPercent(100, 0), 0);
});

// REGUŁA ZMIENIONA 2026-08-02: o wejściu do sekcji decyduje CENA, nie wielkość
// różnicy między terminami. Powód w komentarzu przy `qualifiesAsDeal` — karty
// pokazywały „−34%" na locie za 2 828 zł, a właściciel poprosił o oferty do
// 900 zł. Różnica terminów żyje dalej, ale w `hasMeaningfulSpread`.
test("na kartę wchodzi lot PONIŻEJ sufitu ceny, niezależnie od różnicy terminów", () => {
  assert.equal(qualifiesAsDeal(600, 900, DEAL_MIN_SAMPLES - 1), false, "za mało próbek");
  assert.equal(qualifiesAsDeal(DEAL_MAX_PRICE_PLN + 1, 4_000, DEAL_MIN_SAMPLES), false, "nad sufitem");
  assert.equal(qualifiesAsDeal(DEAL_MAX_PRICE_PLN, 4_000, DEAL_MIN_SAMPLES), true, "dokładnie na sufcie");
  // Tania trasa BEZ rozrzutu cen musi przejść — inaczej najtańszy kierunek
  // z całej sondy (Oslo, wszystkie terminy po 627 zł) nigdy by się nie pokazał.
  assert.equal(qualifiesAsDeal(627, 627, DEAL_MIN_SAMPLES), true, "brak różnicy to nie dyskwalifikacja");
  assert.equal(qualifiesAsDeal(2_828, 4_281, DEAL_MIN_SAMPLES), false, "drogi lot mimo dużej różnicy");
});

test("wiersz odniesienia pojawia się tylko przy realnej różnicy terminów", () => {
  assert.equal(hasMeaningfulSpread(700, 1_000), true);
  assert.equal(hasMeaningfulSpread(850, 1_000), false, "za mały procent");
  assert.equal(hasMeaningfulSpread(200, 300), false, "za mała kwota bezwzględna");
  assert.equal(hasMeaningfulSpread(627, 627), false, "brak różnicy");
  assert.equal(hasMeaningfulSpread(0, 1_000), false);
});

test("karta musi mieć komplet pól i poprawne daty", () => {
  assert.equal(isDisplayableDeal(deal()), true);
  assert.equal(isDisplayableDeal({ ...deal(), airlineName: undefined }), false);
  // Cena RÓWNA medianie jest poprawna: to trasa o jednolitym cenniku, a nie
  // uszkodzony wpis. Odrzucenie takiego wpisu wycinało najtańsze kierunki.
  assert.equal(isDisplayableDeal(deal({ pricePln: 900, typicalPln: 900, savingPercent: 0 })), true);
  // Cena WYŻSZA od mediany to już sprzeczność — minimum nie może przekroczyć
  // mediany tych samych próbek.
  assert.equal(isDisplayableDeal(deal({ pricePln: 950, typicalPln: 900 })), false);
  assert.equal(isDisplayableDeal(deal({ depart: "10.09.2026" })), false);
});

test("pusty snapshot i mniej niż trzy poprawne karty nie renderują sekcji", () => {
  assert.deepEqual(pickFreshDeals(null, NOW), []);
  assert.deepEqual(pickFreshDeals({}, NOW), []);
  assert.deepEqual(
    pickFreshDeals({ a: deal({ routeKey: "a" }), b: deal({ routeKey: "b" }) }, NOW),
    [],
  );
});

// Klucz Redis przeżywa wdrożenie, więc po zmianie reguły w bazie leżą jeszcze
// wpisy zapisane starą (droższą). Gdyby sufit obowiązywał tylko przy zapisie,
// podtytuł „wszystkie poniżej 900 zł" byłby przez kilkanaście godzin nieprawdą.
test("wpis nad sufitem ceny nie renderuje się, nawet gdy jest świeży", () => {
  const snapshot = {
    drogi: deal({ routeKey: "drogi", pricePln: DEAL_MAX_PRICE_PLN + 1, typicalPln: 4_000 }),
    a: deal({ routeKey: "a", pricePln: 600 }),
    b: deal({ routeKey: "b", pricePln: 700 }),
    c: deal({ routeKey: "c", pricePln: 800 }),
  };
  const widoczne = pickFreshDeals(snapshot, NOW).map((d) => d.routeKey);
  assert.ok(!widoczne.includes("drogi"), "wpis nad sufitem musi zniknąć przy odczycie");
  assert.deepEqual(widoczne, ["a", "b", "c"]);
});

test("wpis przeterminowany oraz wylot dzisiaj lub w przeszłości odpadają osobno", () => {
  const snapshot = {
    expired: deal({ routeKey: "expired", computedAt: NOW - DEAL_FRESH_MS - 1 }),
    today: deal({ routeKey: "today", depart: "2026-08-02" }),
    past: deal({ routeKey: "past", depart: "2026-08-01" }),
    one: deal({ routeKey: "one", savingPercent: 40 }),
    two: deal({ routeKey: "two", savingPercent: 35 }),
    three: deal({ routeKey: "three", savingPercent: 30 }),
  };
  assert.deepEqual(
    pickFreshDeals(snapshot, NOW).map((item) => item.routeKey),
    ["one", "two", "three"],
  );
});

// Sekcja nazywa się „Tanie loty", więc pierwsza karta ma być NAJTAŃSZA.
// Wcześniej rządził procent i na górze lądował lot za 2 828 zł z efektownym
// „−34%" — dokładnie to, co właściciel zakwestionował.
test("karty sortują się po cenie rosnąco, a przy remisie po różnicy terminów", () => {
  const snapshot = {
    sredni: deal({ routeKey: "sredni", savingPercent: 25, pricePln: 500 }),
    drogi: deal({ routeKey: "drogi", savingPercent: 40, pricePln: 700 }),
    tani: deal({ routeKey: "tani", savingPercent: 40, pricePln: 450 }),
  };
  assert.deepEqual(
    pickFreshDeals(snapshot, NOW).map((item) => item.routeKey),
    ["tani", "sredni", "drogi"],
  );
});

test("kolejne okna rotacji dają różne zestawy, każdy ponownie posortowany", () => {
  const boundary = Math.floor(NOW / DEAL_ROTATION_MS) * DEAL_ROTATION_MS;
  const snapshot = Object.fromEntries(
    Array.from({ length: DEAL_MAX + 4 }, (_, index) => {
      const item = deal({
        routeKey: `route-${index}`,
        destinationIata: `D${String(index).padStart(2, "0")}`,
        savingPercent: 60 - index,
        pricePln: 500 + index,
        computedAt: boundary,
      });
      return [item.routeKey, item];
    }),
  );

  const first = pickFreshDeals(snapshot, boundary);
  const second = pickFreshDeals(snapshot, boundary + DEAL_ROTATION_MS);
  assert.equal(first.length, DEAL_MAX);
  assert.equal(second.length, DEAL_MAX);
  assert.notDeepEqual(
    new Set(first.map((item) => item.routeKey)),
    new Set(second.map((item) => item.routeKey)),
  );
  for (const selected of [first, second]) {
    assert.deepEqual(
      selected.map((item) => item.savingPercent),
      selected.map((item) => item.savingPercent).sort((a, b) => b - a),
    );
  }
});

test("odczyt i merge działają na wstrzykniętym Redisie oraz zachowują inne trasy", async () => {
  let stored: unknown = { "WAW-AGP": deal({ routeKey: "WAW-AGP", destinationIata: "AGP" }) };
  let ttl: number | undefined;
  const fake = {
    async get<T>(): Promise<T | null> {
      return stored as T;
    },
    async set(key: string, value: unknown, options?: { ex?: number }): Promise<"OK"> {
      void key;
      stored = value;
      ttl = options?.ex;
      return "OK";
    },
  };
  __setFlightDealsRedisForTests(fake);
  try {
    assert.deepEqual(await readFlightDeals(), stored);
    await mergeFlightDeals({
      "WAW-BCN": deal(),
      invalid: deal({ routeKey: "invalid", pricePln: 0 }),
    });
    const snapshot = stored as Record<string, FlightDeal>;
    assert.ok(snapshot["WAW-AGP"], "merge nie może skasować trasy z poprzedniego przebiegu");
    assert.ok(snapshot["WAW-BCN"]);
    assert.equal(snapshot.invalid, undefined);
    assert.equal(ttl, 3 * 24 * 3600);
  } finally {
    __resetFlightDealsRedisForTests();
  }
});

// To jest test UCZCIWOŚCI, nie porządkowania danych. Bez usuwania trasa, która
// przestała być okazją, wisiałaby na stronie ze starą, korzystniejszą ceną aż
// do wygaśnięcia świeżości — czyli serwis pokazywałby ofertę, której nie ma.
test("trasa sprawdzona bez okazji ZNIKA, ale nietknięte trasy zostają", async () => {
  let stored: unknown = {
    "WAW-BCN": deal({ routeKey: "WAW-BCN" }),
    "WAW-AGP": deal({ routeKey: "WAW-AGP", destinationIata: "AGP" }),
    "KRK-NCE": deal({ routeKey: "KRK-NCE", destinationIata: "NCE" }),
  };
  const fake = {
    async get<T>(): Promise<T | null> {
      return stored as T;
    },
    async set(key: string, value: unknown): Promise<"OK"> {
      void key;
      stored = value;
      return "OK";
    },
  };
  __setFlightDealsRedisForTests(fake);
  try {
    await mergeFlightDeals({}, ["WAW-BCN"]);
    const snapshot = stored as Record<string, FlightDeal>;
    assert.equal(snapshot["WAW-BCN"], undefined, "trasa bez okazji musi zniknąć z klucza");
    assert.ok(snapshot["WAW-AGP"], "trasa niesprawdzana w tym przebiegu zostaje");
    assert.ok(snapshot["KRK-NCE"]);
  } finally {
    __resetFlightDealsRedisForTests();
  }
});

test("świeży wpis wygrywa z listą usunięć dla tej samej trasy", async () => {
  // Zabezpieczenie przed pomyłką po stronie crona: gdyby ta sama trasa trafiła
  // naraz do wyniku i do listy „bez okazji", kasowanie skasowałoby dane,
  // które przed chwilą policzyliśmy.
  let stored: unknown = {};
  const fake = {
    async get<T>(): Promise<T | null> {
      return stored as T;
    },
    async set(key: string, value: unknown): Promise<"OK"> {
      void key;
      stored = value;
      return "OK";
    },
  };
  __setFlightDealsRedisForTests(fake);
  try {
    await mergeFlightDeals({ "WAW-BCN": deal({ routeKey: "WAW-BCN" }) }, ["WAW-BCN"]);
    assert.ok((stored as Record<string, FlightDeal>)["WAW-BCN"]);
  } finally {
    __resetFlightDealsRedisForTests();
  }
});

test("błąd Redisa jest cichym missem i nie odrzuca zapisu", async () => {
  const broken = {
    async get<T>(): Promise<T | null> {
      throw new Error("redis offline");
    },
    async set(): Promise<unknown> {
      throw new Error("redis offline");
    },
  };
  __setFlightDealsRedisForTests(broken);
  try {
    assert.equal(await readFlightDeals(), null);
    await assert.doesNotReject(() => mergeFlightDeals({ "WAW-BCN": deal() }));
  } finally {
    __resetFlightDealsRedisForTests();
  }
});
