// FAZA 1 — regresja „martwych kierunków". Pojedynczy hotel z pustym/niepoprawnym
// `main_photo` ("") rzucał `invalid_format` na `z.string().url()`, a brak
// per-element catch na `data` wywracał parsowanie CAŁEGO miasta → kierunek
// martwy („niespodziewana odpowiedź dostawcy"). Zmierzone na prod: Sharm El
// Sheikh „Royal Naama Bay" (main_photo:"") wśród 754 hoteli. Te testy pilnują,
// że taki rekord NIE zabija wyniku.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LiteApiHotelDetailSchema,
  LiteApiHotelSchema,
  LiteApiHotelsListResponseSchema,
  LiteApiRateSchema,
} from "./types";

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

// ────────────────────────────────────────────────────────────────────────────
// ETAP 1 przebudowy sekcji hotelowej (2026-08-06) — pola, które dostawca
// zwraca, a które schemat dotąd po cichu WYRZUCAŁ. Kształty zmierzone sondą
// `pnpm probe:hotel-contract`, udokumentowane w
// docs/hotel-redesign/02-data-contracts.md. Te testy pilnują dwóch rzeczy:
//   1. że dane faktycznie przechodzą (regresja „znowu wyrzucamy"),
//   2. że nowe pola NIE mogą wywrócić parsowania hotelu (ta sama zasada
//      degradacji co przy hotelImages — zły element wypada, hotel zostaje).

test("szczegóły: starRating jest parsowany (na /data/hotel NIE MA pola `stars`)", () => {
  // Dokładny kształt z drutu: /data/hotels zwraca `stars`, a /data/hotel
  // wyłącznie `starRating`. Dopóki schemat znał tylko `stars`, gwiazdki
  // znikały po wejściu na stronę hotelu — razem z JSON-LD dla Google.
  const parsed = LiteApiHotelDetailSchema.safeParse({ ...DETAIL_BASE, starRating: 4 });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.starRating, 4);
  assert.equal(parsed.success && parsed.data.stars, undefined);
});

test("szczegóły: checkinCheckoutTimes w snake_case przechodzi (godzina zameldowania)", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    checkinCheckoutTimes: {
      checkin_start: "03:00 PM",
      checkin_end: "12:00 AM",
      checkout: "12:00 PM",
      instructions: [],
      special_instructions: "",
    },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.checkinCheckoutTimes?.checkin_start, "03:00 PM");
  assert.equal(parsed.success && parsed.data.checkinCheckoutTimes?.checkout, "12:00 PM");
});

test("szczegóły: instructions jako OBIEKTY nie wywracają strony hotelu", () => {
  // INCYDENT 2026-08-08 (Trianta Hotel Apartments, lp80e50). Schemat deklarował
  // `instructions: z.array(z.string())`, a dostawca zwrócił listę obiektów.
  // Zod odrzucał wtedy CAŁĄ odpowiedź `/data/hotel`, więc gość, który kliknął
  // ofertę z ceną na liście, dostawał ekran „Mamy chwilowy problem".
  // Pola nigdzie nie renderujemy — nie ma prawa blokować strony.
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    checkinCheckoutTimes: {
      checkin_start: "03:00 PM",
      checkout: "11:00 AM",
      instructions: [{ text: "Zameldowanie w recepcji", type: "checkin" }],
      special_instructions: { note: "Kontakt telefoniczny przed przyjazdem" },
    },
  });
  assert.equal(parsed.success, true);
  // Godziny, które NAPRAWDĘ pokazujemy, mają przejść nietknięte.
  assert.equal(parsed.success && parsed.data.checkinCheckoutTimes?.checkin_start, "03:00 PM");
  assert.equal(parsed.success && parsed.data.checkinCheckoutTimes?.checkout, "11:00 AM");
});

test("szczegóły: rooms z pełnym kształtem — zdjęcia, metraż, łóżka", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    rooms: [
      {
        id: 5677262,
        roomName: "Pokój dwuosobowy",
        roomSizeSquare: 22,
        roomSizeUnit: "sqm",
        maxOccupancy: 2,
        bedTypes: [{ quantity: 1, bedType: "Łóżko podwójne", bedSize: "131-150 cm szerokości" }],
        roomAmenities: [{ amenitiesId: 1, name: "Klimatyzacja", sort: 1 }],
        photos: [{ url: GOOD_PHOTO, hd_url: GOOD_PHOTO, mainPhoto: true }],
      },
    ],
  });
  assert.equal(parsed.success, true);
  const room = parsed.success ? parsed.data.rooms?.[0] : undefined;
  assert.equal(room?.id, 5677262);
  assert.equal(room?.roomSizeSquare, 22);
  assert.equal(room?.photos?.length, 1);
  assert.equal(room?.bedTypes?.length, 1);
});

test("szczegóły: jedno złe zdjęcie POKOJU wypada, pokój zostaje z resztą", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    rooms: [
      {
        id: 1,
        roomName: "Standard",
        photos: [
          { url: GOOD_PHOTO },
          { url: "" }, // trefne — pusty string, ta sama klasa co Sharm
          { url: "/relative.jpg" }, // trefne — bez schematu http
          { url: "https://static.cupid.travel/hotels/9.jpg" },
        ],
      },
    ],
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.rooms?.length, 1);
  assert.equal(parsed.success && parsed.data.rooms?.[0].photos?.length, 2);
});

test("szczegóły: JEDEN nieużywalny pokój (brak id) wypada, pozostałe zostają", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    rooms: [{ id: 1, roomName: "A" }, { roomName: "Bez id" }, { id: 3, roomName: "C" }],
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.rooms?.length, 2);
});

test("szczegóły: rooms:null NIE wywraca parsowania (hotele 'sparse')", () => {
  // Regresja incydentu LITEAPI_VALIDATION — obiekty o ubogich danych nullują
  // puste pola zamiast je pomijać.
  const parsed = LiteApiHotelDetailSchema.safeParse({ ...DETAIL_BASE, rooms: null });
  assert.equal(parsed.success, true);
});

test("szczegóły: komplet nowych pól ustawionych na null przechodzi walidację", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    starRating: null,
    rooms: null,
    poi: null,
    sentiment_analysis: null,
    sentiment_updated_at: null,
    chain: null,
    chainId: null,
    parking: null,
    childAllowed: null,
    petsAllowed: null,
    hotelType: null,
    phone: null,
    email: null,
    checkinCheckoutTimes: {
      checkin_start: null,
      checkin_end: null,
      instructions: null,
      special_instructions: null,
    },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.name, "Test Hotel");
});

test("szczegóły: poi, sentiment_analysis i facilities są parsowane", () => {
  const parsed = LiteApiHotelDetailSchema.safeParse({
    ...DETAIL_BASE,
    poi: [{ name: "Alcazaba", category: "landmark", distanceKm: 0.5, importance: "iconic" }],
    sentiment_analysis: {
      pros: ["Excellent customer service"],
      cons: [],
      categories: [{ name: "Cleanliness", rating: 10, description: "Rooms were great" }],
    },
    facilities: [
      { facilityId: 47, name: "WiFi dostępne" },
      { facilityId: 107, name: "Darmowe WiFi" }, // duplikat POJĘCIOWY ze źródła
    ],
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.poi?.[0].distanceKm, 0.5);
  assert.equal(parsed.success && parsed.data.sentiment_analysis?.categories?.[0].rating, 10);
  // Oba wpisy MUSZĄ przejść — deduplikacja pojęciowa to zadanie warstwy
  // domenowej (po facilityId), nie schematu.
  assert.equal(parsed.success && parsed.data.facilities?.length, 2);
});

test("lista: facilityIds i chain są parsowane (filtry marki i udogodnień)", () => {
  const parsed = LiteApiHotelSchema.safeParse(
    hotel({ facilityIds: [47, 107, 2], chain: "Vincci Hoteles", chainId: 1114 }),
  );
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.facilityIds?.length, 3);
  assert.equal(parsed.success && parsed.data.chain, "Vincci Hoteles");
});

test("lista: facilityIds w złym kształcie NIE wywraca hotelu (pole tylko do filtrów)", () => {
  // `facilityIds` służy WYŁĄCZNIE filtrom. Gdyby dostawca przysłał je w innym
  // kształcie (np. jako CSV zamiast tablicy), hotel musi przejść bez filtrów —
  // a nie wypaść z listy. Ta sama zasada co przy `location` powyżej: pole
  // pomocnicze nigdy nie wywraca rekordu. Bez `.catch(undefined)` w schemacie
  // ten hotel zniknąłby z wyników.
  const parsed = LiteApiHotelSchema.safeParse(hotel({ facilityIds: "47,107" }));
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.facilityIds, undefined);
  assert.equal(parsed.success && parsed.data.name, "Test Hotel");
});

test("rates: taxesAndFees z included:false jest parsowane (podatek POZA ceną)", () => {
  const parsed = LiteApiRateSchema.safeParse({
    rateId: "r1",
    retailRate: {
      total: [{ amount: 3219.28, currency: "PLN" }],
      initialPrice: [{ amount: 3219.28, currency: "PLN" }],
      suggestedSellingPrice: [{ amount: 3771.71, currency: "PLN", source: "booking.com" }],
      taxesAndFees: [{ included: false, description: "VAT", amount: 298.08, currency: "PLN" }],
    },
  });
  assert.equal(parsed.success, true);
  const rr = parsed.success ? parsed.data.retailRate : undefined;
  assert.equal(rr?.taxesAndFees?.[0].included, false);
  assert.equal(rr?.taxesAndFees?.[0].amount, 298.08);
  // `source` MUSI przetrwać walidację — to jedyny dowód w danych, że ta cena
  // pochodzi od KONKURENTA, a nie jest naszą ceną historyczną. Gdy Zod ją
  // zje, zostaje sama „wyższa kwota", którą łatwo wziąć za bazę do przeceny
  // (a przeceny z tych danych zrobić nie wolno — patrz 07-decisions.md D2).
  assert.equal(rr?.suggestedSellingPrice?.[0].source, "booking.com");
  // initialPrice === total → brak podstawy do jakiejkolwiek przeceny.
  assert.equal(rr?.initialPrice?.[0].amount, rr?.total?.[0].amount);
});

test("rates: opłata opisana TEKSTEM z kwotą w obcej walucie nie wywraca parsowania", () => {
  const parsed = LiteApiRateSchema.safeParse({
    rateId: "r1",
    retailRate: {
      total: [{ amount: 100, currency: "PLN" }],
      taxesAndFees: [{ included: true, description: "$163.02 USD per room per stay" }],
    },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.retailRate?.taxesAndFees?.[0].amount, undefined);
});

test("rates: mappedRoomId przechodzi jako number i jako string", () => {
  const asNumber = LiteApiRateSchema.safeParse({ rateId: "r1", mappedRoomId: 1459368038 });
  const asString = LiteApiRateSchema.safeParse({ rateId: "r1", mappedRoomId: "1459368038" });
  assert.equal(asNumber.success, true);
  assert.equal(asNumber.success && asNumber.data.mappedRoomId, 1459368038);
  assert.equal(asString.success, true);
  assert.equal(asString.success && asString.data.mappedRoomId, "1459368038");
});

test("rates: brak mappedRoomId (zapytanie bez roomMapping) nadal parsuje się poprawnie", () => {
  const parsed = LiteApiRateSchema.safeParse({ rateId: "r1", boardType: "RO" });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.mappedRoomId, undefined);
});
