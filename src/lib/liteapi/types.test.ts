// FAZA 1 — regresja „martwych kierunków". Pojedynczy hotel z pustym/niepoprawnym
// `main_photo` ("") rzucał `invalid_format` na `z.string().url()`, a brak
// per-element catch na `data` wywracał parsowanie CAŁEGO miasta → kierunek
// martwy („niespodziewana odpowiedź dostawcy"). Zmierzone na prod: Sharm El
// Sheikh „Royal Naama Bay" (main_photo:"") wśród 754 hoteli. Te testy pilnują,
// że taki rekord NIE zabija wyniku.

import assert from "node:assert/strict";
import { test } from "node:test";

import { LiteApiHotelSchema, LiteApiHotelsListResponseSchema, LiteApiHotelDetailSchema } from "./types";

const GOOD_PHOTO = "https://static.cupid.travel/hotels/123.jpg";

function hotel(overrides: Record<string, unknown> = {}) {
  return {
    id: "lp1",
    name: "Test Hotel",
    city: "Sharm El Sheikh",
    main_photo: GOOD_PHOTO,
    thumbnail: GOOD_PHOTO,
    ...overrides,
  };
}

test("pusty main_photo ('') NIE wywraca parsowania — hotel zostaje, zdjęcie undefined", () => {
  const parsed = LiteApiHotelSchema.safeParse(hotel({ main_photo: "", thumbnail: undefined }));
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.main_photo, undefined);
  assert.equal(parsed.success && parsed.data.thumbnail, undefined);
  // Reszta danych hotelu nietknięta.
  assert.equal(parsed.success && parsed.data.name, "Test Hotel");
});

test("poprawny URL zdjęcia jest zachowany", () => {
  const parsed = LiteApiHotelSchema.safeParse(hotel());
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.main_photo, GOOD_PHOTO);
});

test("nie-URL (ścieżka względna) → undefined, nie błąd", () => {
  const parsed = LiteApiHotelSchema.safeParse(hotel({ main_photo: "/local/path.jpg" }));
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.main_photo, undefined);
});

test("JEDEN trefny hotel w liście nie zabija całego kierunku (regresja Sharm)", () => {
  const body = {
    data: [
      hotel({ id: "lpa", name: "Good A" }),
      hotel({ id: "lpaebe5", name: "Royal Naama Bay", main_photo: "", thumbnail: undefined }), // trefny w prod
      hotel({ id: "lpb", name: "Good B" }),
    ],
    total: 3,
  };
  const parsed = LiteApiHotelsListResponseSchema.safeParse(body);
  assert.equal(parsed.success, true);
  // Wszystkie trzy przechodzą (trefny tylko traci zdjęcie, nie wypada).
  assert.equal(parsed.success && parsed.data.data.length, 3);
});

test("rekord NIE do uratowania (null name) wypada z listy, reszta zostaje", () => {
  const body = {
    data: [
      hotel({ id: "lpa", name: "Good A" }),
      hotel({ id: "lpbad", name: null }), // brak nazwy — nieużywalny w UI → drop
      hotel({ id: "lpb", name: "Good B" }),
    ],
  };
  const parsed = LiteApiHotelsListResponseSchema.safeParse(body);
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.data.length, 2);
  assert.deepEqual(
    parsed.success && parsed.data.data.map((h) => h.id),
    ["lpa", "lpb"],
  );
});

test("pusta lista hoteli parsuje się poprawnie (0 wyników to nie błąd)", () => {
  const parsed = LiteApiHotelsListResponseSchema.safeParse({ data: [], total: 0 });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.data.length, 0);
});

test("0 wyników: hotelIds:'' (pusty string z LiteAPI) parsuje się jako brak wyników, nie błąd", () => {
  // Dokładny kształt z prod gdy LiteAPI nic nie znajdzie: hotelIds to PUSTY STRING.
  const parsed = LiteApiHotelsListResponseSchema.safeParse({ data: [], hotelIds: "", total: 0 });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.data.length, 0);
  assert.equal(parsed.success && parsed.data.hotelIds, undefined);
});

// ── /data/hotel (szczegóły) — ta sama klasa błędu co Sharm, ale na STRONIE
// HOTELU. Jedno złe URL w galerii (`hotelImages[].url`) rzucało invalid_format
// na sztywnym z.string().url() → cała walidacja hotelu padała → getHotelDetail
// throw → catch→null→notFound() → 404 („czasami hotel znika"). Te testy pilnują,
// że trefne zdjęcie wypada, a HOTEL ZOSTAJE.
const DETAIL_BASE = {
  id: "lp1",
  name: "Test Hotel",
  city: "Hurghada",
  main_photo: GOOD_PHOTO,
};

test("szczegóły: jedno złe URL w hotelImages NIE wywala hotelu — wypada tylko zła pozycja", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    hotelImages: [
      { url: GOOD_PHOTO, urlHd: GOOD_PHOTO },
      { url: "" }, // trefne — pusty string z dostawcy
      { url: "/relative/path.jpg" }, // trefne — bez schematu http
      { url: "https://static.cupid.travel/hotels/456.jpg" },
    ],
  });
  assert.equal(parsed.success, true);
  // Zostają tylko dwie poprawne pozycje.
  assert.equal(parsed.success && parsed.data.hotelImages?.length, 2);
  assert.equal(parsed.success && parsed.data.name, "Test Hotel");
});

test("szczegóły: złe urlHd → zachowujemy url, gubimy tylko urlHd (nie odrzucamy)", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    hotelImages: [{ url: GOOD_PHOTO, urlHd: "" }],
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.hotelImages?.length, 1);
  assert.equal(parsed.success && parsed.data.hotelImages?.[0].url, GOOD_PHOTO);
  assert.equal(parsed.success && parsed.data.hotelImages?.[0].urlHd, undefined);
});

test("szczegóły: brak hotelImages parsuje się (pole opcjonalne)", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({ ...DETAIL_BASE });
  assert.equal(parsed.success, true);
});

// 2026-07-11 (pełna pula kierunku) — batch stawek, w którym żaden hotel nie ma
// ofert, wraca BEZ pola `data`. Sztywne z.array() wywalało cały batch → 50
// realnie niedostępnych hoteli jako „error" zamiast „brak miejsc".
test("rates: odpowiedź bez `data` (batch samych wyprzedanych) → pusta lista, nie błąd", async () => {
  const { LiteApiRatesResponseSchema } = await import("./types");
  const parsed = LiteApiRatesResponseSchema.safeParse({});
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success && parsed.data.data, []);
});

test("rates: `data` w złym kształcie (string) nadal failuje walidację", async () => {
  const { LiteApiRatesResponseSchema } = await import("./types");
  const parsed = LiteApiRatesResponseSchema.safeParse({ data: "oops" });
  assert.equal(parsed.success, false);
});
