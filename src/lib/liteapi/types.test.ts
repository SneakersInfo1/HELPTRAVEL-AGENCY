// FAZA 1 — regresja „martwych kierunków". Pojedynczy hotel z pustym/niepoprawnym
// `main_photo` ("") rzucał `invalid_format` na `z.string().url()`, a brak
// per-element catch na `data` wywracał parsowanie CAŁEGO miasta → kierunek
// martwy („niespodziewana odpowiedź dostawcy"). Zmierzone na prod: Sharm El
// Sheikh „Royal Naama Bay" (main_photo:"") wśród 754 hoteli. Te testy pilnują,
// że taki rekord NIE zabija wyniku.

import assert from "node:assert/strict";
import { test } from "node:test";

import { LiteApiHotelSchema, LiteApiHotelsListResponseSchema } from "./types";

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
