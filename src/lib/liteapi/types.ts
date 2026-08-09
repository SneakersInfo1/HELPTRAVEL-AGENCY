// LiteAPI v3 types + Zod schemas for boundary validation.
// Reference: https://docs.liteapi.travel/docs/
//
// Money rule (master spec Section 16 #2): all amounts stored as MINOR UNITS
// (grosze for PLN, cents for EUR/USD). LiteAPI returns floats — convert at the
// boundary via `toMinor()` from src/lib/money.ts.

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Money + currency

export const CurrencyCodeSchema = z.string().length(3).toUpperCase();
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const PriceAmountSchema = z.object({
  amount: z.number().nonnegative(),
  currency: CurrencyCodeSchema,
});
export type PriceAmount = z.infer<typeof PriceAmountSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Search / hotels list (`GET /data/hotels`)

// LiteAPI potrafi zwrócić `main_photo`/`thumbnail` jako PUSTY STRING ("") albo
// ścieżkę bez schematu URL. Sztywne `z.string().url()` rzucało wtedy
// `invalid_format`, a ponieważ `data` to tablica BEZ per-element catch, JEDEN
// taki hotel wywracał parsowanie CAŁEGO miasta. Zmierzone na żywo (prod):
// Sharm El Sheikh „Royal Naama Bay" (main_photo:"") → 754 hotele do kosza →
// „Otrzymaliśmy niespodziewaną odpowiedź od dostawcy" → martwy kierunek.
// To samo zabijało Hammamet, Rodos i dziesiątki innych kurortów.
// Rozwiązanie: złe/puste zdjęcie → undefined (hotel ZOSTAJE, karta pokazuje
// placeholder), zamiast wywracać cały wynik. „Każdy błąd to stracony ruch."
function toHttpUrlOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}
const OptionalPhotoUrl = z.preprocess(toHttpUrlOrUndefined, z.string().optional());

export const LiteApiHotelSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  // LiteAPI zwraca współrzędne raz top-level, raz ZAGNIEŻDŻONE w `location`
  // (tak jest na /data/hotel; na /data/hotels bywa różnie). Czytamy oba — UI
  // bierze `latitude ?? location.latitude`. Dotyczy mapy, JSON-LD geo i FAZY 7
  // (odległość od centrum/plaży) zarówno na szczegółach, jak i na karcie wyników.
  location: z
    .object({
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
    })
    .nullish()
    // Defensywnie: gdyby któryś hotel zwrócił `location` w innym kształcie,
    // NIE wywalamy parsowania całej listy (do 1000 hoteli) — to pole jest tylko
    // do odległości; brak/zły kształt → undefined (po prostu bez odległości).
    .catch(undefined),
  address: z.string().optional(),
  zip: z.string().optional(),
  stars: z.number().nullish(),
  rating: z.number().nullish(),
  reviewCount: z.number().nullish(),
  main_photo: OptionalPhotoUrl,
  thumbnail: OptionalPhotoUrl,
  // Marka hotelowa. Zwracane przez /data/hotels ORAZ /data/hotel ("Vincci
  // Hoteles" / 1114). Do filtra marki na liście wyników.
  chain: z.string().nullish(),
  chainId: z.number().nullish(),
  // Identyfikatory udogodnień (34 szt. na typowy hotel). To JEDYNE źródło
  // udogodnień na LIŚCIE — /data/hotels nie zwraca nazw, tylko ID. Bez tego
  // filtrowanie po udogodnieniach na liście jest niewykonalne.
  facilityIds: z.array(z.number()).nullish().catch(undefined),
  // Typ obiektu wprost od dostawcy (204 = Hotels, 201 = Apartments…).
  // Słownik 52 typów: `data/liteapi-reference.json` → `hotelTypes`.
  // Zwracane ZARÓWNO na liście, jak i na szczegółach — dlatego siedzi
  // w bazowym schemacie, a nie w rozszerzeniu.
  hotelTypeId: z.number().nullish(),
});
export type LiteApiHotel = z.infer<typeof LiteApiHotelSchema>;

export const LiteApiHotelsListResponseSchema = z.object({
  // Per-element odporność (siatka bezpieczeństwa). Najczęstszy sprawca (puste
  // main_photo) jest już neutralizowany w `OptionalPhotoUrl`, ale gdyby
  // POJEDYNCZY hotel miał inny nieoczekiwany kształt (np. null `name`/`city`),
  // wypada z listy — NIE wywraca całego kierunku. Lista to ≤1000 rekordów i jest
  // cache'owana, więc podwójny safeParse jest tani. Bez tego jeden trefny rekord
  // = cały kierunek martwy (= stracony ruch).
  data: z.preprocess(
    (val) => (Array.isArray(val) ? val.filter((item) => LiteApiHotelSchema.safeParse(item).success) : val),
    z.array(LiteApiHotelSchema),
  ),
  total: z.number().optional(),
  // LiteAPI przy 0 wynikach zwraca `hotelIds: ""` (pusty STRING zamiast tablicy
  // albo braku pola) — zmierzone na żywo (prod). Sztywne `z.array()` rzucało
  // `invalid_type`, więc KAŻDY pusty wynik (zła pisownia LUB realnie 0 hoteli na
  // dane daty) leciał jako błąd („niespodziewana odpowiedź dostawcy") zamiast
  // łagodnego ekranu „brak wyników, zmień daty/kierunek". Nie-tablica → undefined.
  hotelIds: z.preprocess((v) => (Array.isArray(v) ? v : undefined), z.array(z.string()).optional()),
});
export type LiteApiHotelsListResponse = z.infer<typeof LiteApiHotelsListResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Hotel detail (`GET /data/hotel`)

// Galeria zdjęć hotelu — `url` MUSI być poprawnym http(s) (inaczej pozycja
// wypada w preprocess powyżej), `urlHd` tolerancyjny (śmieci → undefined).
// `.passthrough()` na wszelki wypadek, gdyby dostawca dorzucił dodatkowe pola.
const HotelImageSchema = z
  .object({
    url: z.preprocess(toHttpUrlOrUndefined, z.string()),
    urlHd: OptionalPhotoUrl,
  })
  .passthrough();

// Zdjęcie POKOJU (rooms[].photos[]). Ta sama zasada co przy HotelImageSchema:
// `url` musi być poprawnym http(s) (inaczej pozycja wypada w preprocess niżej),
// `hd_url` tolerancyjny. Uwaga na nazewnictwo: tu dostawca używa snake_case
// `hd_url`, podczas gdy galeria hotelu ma camelCase `urlHd` — to NIE jest
// literówka, tak jest na drucie.
const RoomPhotoSchema = z
  .object({
    url: z.preprocess(toHttpUrlOrUndefined, z.string()),
    hd_url: OptionalPhotoUrl,
    imageDescription: z.string().nullish(),
    mainPhoto: z.boolean().nullish(),
    score: z.number().nullish(),
    imageClass1: z.string().nullish(),
    imageClass2: z.string().nullish(),
    classId: z.number().nullish(),
    classOrder: z.number().nullish(),
    failoverPhoto: z.string().nullish(),
  })
  .passthrough();

// Pojedynczy pokój z /data/hotel. To pole było przez Zod WYRZUCANE w całości
// (schemat go nie deklarował), przez co strona hotelu renderowała pokoje bez
// jednego zdjęcia, bez metrażu i bez łóżek — nie z braku danych u dostawcy,
// tylko dlatego, że nigdy nie przeszły przez walidację. Zmierzone: 21/21 pokoi
// ma po ~5 zdjęć (docs/hotel-redesign/02-data-contracts.md §2.2).
//
// `id` bywa liczbą (5677262) — trzymamy union, bo to klucz obcy dla
// `rate.mappedRoomId`, które również potrafi przyjść jako string.
const LiteApiRoomSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    roomName: z.string().nullish(),
    description: z.string().nullish(),
    roomSizeSquare: z.number().nullish(),
    roomSizeUnit: z.string().nullish(),
    maxAdults: z.number().nullish(),
    maxChildren: z.number().nullish(),
    maxOccupancy: z.number().nullish(),
    bedTypes: z
      .array(
        z
          .object({
            quantity: z.number().nullish(),
            bedType: z.string().nullish(),
            bedSize: z.string().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
    roomAmenities: z
      .array(
        z
          .object({
            amenitiesId: z.number().nullish(),
            name: z.string().nullish(),
            sort: z.number().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
    // Per-element filtr jak w hotelImages — jedno zepsute zdjęcie wypada,
    // pokój ZOSTAJE (z resztą zdjęć).
    photos: z.preprocess(
      (val) => (Array.isArray(val) ? val.filter((item) => RoomPhotoSchema.safeParse(item).success) : val),
      z.array(RoomPhotoSchema).nullish(),
    ),
    views: z.array(z.unknown()).nullish(),
    bedRelation: z.string().nullish(),
  })
  .passthrough();
export type LiteApiRoom = z.infer<typeof LiteApiRoomSchema>;

export const LiteApiHotelDetailSchema = LiteApiHotelSchema.extend({
  description: z.string().optional(),
  hotelDescription: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  // LiteAPI exposes the bulk of a property's REAL feature list under
  // `hotelFacilities` / `facilities`, NOT `amenities` (which is frequently
  // empty). Supplier shapes vary — plain strings for some, `{ name }` objects
  // for others — so we keep them as `unknown[]` and normalise defensively in
  // the UI (see lib/liteapi/facilities.ts). Parsing these away is exactly why
  // detail pages looked sparse: the richest, 100%-true data never reached the
  // page. (2026-06)
  hotelFacilities: z.array(z.unknown()).optional(),
  // KANONICZNE źródło udogodnień. Zmierzone: `facilities` to obiekty
  // `{ facilityId, name }` z nazwami PO POLSKU, a `hotelFacilities` to ta sama
  // lista po ANGIELSKU i BEZ ID. Deduplikacja musi iść po `facilityId`, bo
  // duplikaty pojęciowe pochodzą ze ŹRÓDŁA (47 „WiFi dostępne" + 107 „Darmowe
  // WiFi" to dwa różne rekordy), a tekst zmienia się z językiem.
  //
  // Zostaje `z.unknown()` CELOWO: kształty dostawców bywają różne (raz string,
  // raz obiekt), a typowane odczytanie należy do warstwy domenowej
  // (docs/hotel-redesign/07-decisions.md R5), nie do walidacji brzegowej.
  facilities: z.array(z.unknown()).optional(),
  // TA SAMA klasa błędu co Sharm na liście, ale na STRONIE HOTELU. Sztywne
  // `z.string().url()` na `url`/`urlHd` rzucało invalid_format gdy POJEDYNCZE
  // zdjęcie galerii miało pusty/bezschematowy URL → cała walidacja szczegółów
  // padała → getHotelDetail throw → catch→null→notFound() → 404 („czasami hotel
  // znika po kliknięciu"). Teraz: złe zdjęcie WYPADA (per-element filter, jak na
  // liście), urlHd toleruje śmieci → undefined. Hotel ZOSTAJE.
  hotelImages: z.preprocess(
    (val) =>
      Array.isArray(val) ? val.filter((item) => HotelImageSchema.safeParse(item).success) : val,
    z.array(HotelImageSchema).optional(),
  ),
  policies: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
  // Free-text "important information" block (check-in instructions, deposits,
  // mandatory fees…). Shape is usually a string but kept as unknown so an
  // array/object variant can never break the parse — coerced in the UI.
  hotelImportantInformation: z.unknown().optional(),
  // `location` (zagnieżdżone współrzędne) jest już w bazowym LiteApiHotelSchema.
  //
  // UWAGA — dostawca używa tu snake_case. Zmierzone na drucie:
  //   { checkin_start, checkin_end, checkout, instructions, special_instructions }
  // Zadeklarowane wcześniej `checkinStart`/`checkinEnd` NIGDY nie przechodziły
  // (przechodziło wyłącznie `checkout`), więc godzina zameldowania i instrukcje
  // zameldowania były wyrzucane. Warianty camelCase zostają — nic nie kosztują,
  // a gdyby dostawca kiedyś je odesłał, nadal je złapiemy.
  checkinCheckoutTimes: z
    .object({
      checkin: z.string().optional(),
      checkout: z.string().optional(),
      checkinStart: z.string().optional(),
      checkinEnd: z.string().optional(),
      checkin_start: z.string().nullish(),
      checkin_end: z.string().nullish(),
      // `z.unknown()`, NIE `z.string()`. Ta jedna linijka wywracała CAŁĄ stronę
      // hotelu (incydent 2026-08-08, Trianta Hotel Apartments `lp80e50`):
      // dostawca zwraca dla części obiektów listę OBIEKTÓW, a nie napisów.
      // Zod odrzucał wtedy całą odpowiedź `/data/hotel` → LITEAPI_VALIDATION →
      // `fetchDetailForPage` traktował to jako błąd przejściowy i rzucał dalej
      // → gość klikał ofertę z ceną i dostawał „Mamy chwilowy problem".
      //
      // Z punktu widzenia gościa to była druga odmiana „oferty widmo": lista
      // obiecuje hotel, a strona obiektu się nie otwiera.
      //
      // Tego pola NIGDZIE nie renderujemy — jego kształt to sprawa dostawcy.
      // Ta sama lekcja co przy `rooms: null` (patrz nota o polach `.nullish()`
      // wyżej): pole, którego nie pokazujemy, nie ma prawa zablokować strony.
      instructions: z.array(z.unknown()).nullish(),
      // To samo zabezpieczenie z tego samego powodu — pole nieużywane w UI.
      special_instructions: z.unknown().nullish(),
    })
    .optional(),
  currency: z.string().optional(),

  // ── Pola, które dostawca zwraca, a które Zod dotąd wyrzucał ──────────────
  // (audyt 2026-08-06, docs/hotel-redesign/02-data-contracts.md §2.1)

  // Standard hotelu. /data/hotels zwraca `stars`, ale /data/hotel zwraca
  // WYŁĄCZNIE `starRating` — dlatego `detail.stars` był zawsze undefined
  // i gwiazdki znikały po wejściu na stronę hotelu (razem z JSON-LD dla Google).
  // `stars` zostaje odziedziczone z bazowego schematu; konsumenci czytają
  // `starRating ?? stars`.
  starRating: z.number().nullish(),

  // Pokoje ze zdjęciami — patrz LiteApiRoomSchema. Per-element filtr: jeden
  // zepsuty pokój wypada, hotel zostaje (ta sama zasada co przy hotelImages).
  rooms: z.preprocess(
    (val) => (Array.isArray(val) ? val.filter((item) => LiteApiRoomSchema.safeParse(item).success) : val),
    z.array(LiteApiRoomSchema).nullish(),
  ),

  // Punkty zainteresowania z PRAWDZIWYMI odległościami (distanceKm). Dziś
  // odległości liczymy własną heurystyką geo; to jest dana od dostawcy.
  poi: z
    .array(
      z
        .object({
          name: z.string().nullish(),
          category: z.string().nullish(),
          distanceKm: z.number().nullish(),
          importance: z.string().nullish(),
        })
        .passthrough(),
    )
    .nullish(),

  // Analiza sentymentu recenzji wykonana przez AI DOSTAWCY (jest nawet
  // `sentiment_updated_at`). Źródło kategorii ocen („Cleanliness 10, Service 10")
  // i wyróżnień. Nazwy kategorii są ANGIELSKIE i ze skończonego zbioru →
  // tłumaczyć słownikiem po naszej stronie. Treści są generowane — w UI muszą
  // być oznaczone jako pochodzące od AI (patrz 07-decisions.md R11).
  sentiment_analysis: z
    .object({
      pros: z.array(z.string()).nullish(),
      cons: z.array(z.string()).nullish(),
      categories: z
        .array(
          z
            .object({
              name: z.string().nullish(),
              rating: z.number().nullish(),
              description: z.string().nullish(),
            })
            .passthrough(),
        )
        .nullish(),
    })
    .nullish(),
  sentiment_updated_at: z.string().nullish(),

  // Fakty do sekcji „Dobrze wiedzieć" / polityki obiektu.
  parking: z.string().nullish(),
  childAllowed: z.boolean().nullish(),
  petsAllowed: z.boolean().nullish(),
  hotelType: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
});
export type LiteApiHotelDetail = z.infer<typeof LiteApiHotelDetailSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Rates (`POST /hotels/rates`)

export const LiteApiCancellationPolicySchema = z.object({
  refundableTag: z.enum(["RFN", "NRFN", "PRP"]).optional(),
  cancelPolicyInfos: z
    .array(
      z.object({
        cancelTime: z.string().optional(), // ISO datetime
        amount: z.number().optional(),
        currency: CurrencyCodeSchema.optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
});
export type LiteApiCancellationPolicy = z.infer<typeof LiteApiCancellationPolicySchema>;

export const LiteApiRateSchema = z.object({
  rateId: z.string(),
  occupancyNumber: z.number().optional(),
  name: z.string().optional(),
  maxOccupancy: z.number().optional(),
  adultCount: z.number().optional(),
  childCount: z.number().optional(),
  boardType: z.string().optional(),
  boardName: z.string().optional(),
  refundableTag: z.string().optional(),
  retailRate: z
    .object({
      total: z.array(PriceAmountSchema),
      // UWAGA: to NIE jest nasza cena historyczna, tylko cena KONKURENTA —
      // na drucie ma pole `source` ("booking.com") i jest wyższa od `total`
      // na 100% zmierzonych taryf (400/400). NIE nadaje się na przekreśloną
      // cenę ani na „-X%" (decyzja D2 w docs/hotel-redesign/07-decisions.md:
      // nie pokazujemy jej w UI w ogóle).
      // `.extend({source}) + .passthrough()` jest CELOWE: bez tego Zod zjada
      // pole `source` ("booking.com"), a to ono jest dowodem, że mówimy o cenie
      // KONKURENTA, a nie o naszej cenie historycznej. Zachowanie go chroni
      // przed tym, że ktoś kiedyś weźmie to za bazę do przeceny.
      suggestedSellingPrice: z
        .array(PriceAmountSchema.extend({ source: z.string().nullish() }).passthrough())
        .nullish()
        .catch(undefined),
      // Zmierzone: initialPrice === total na 400/400 taryf. Dostawca NIE daje
      // własnej ceny bazowej, więc uczciwej przeceny nie da się z tego policzyć.
      // Trzymamy pole, żeby dało się to zweryfikować w kodzie, a nie zakładać.
      //
      // `.nullish()`, NIE `.optional()` — poprawka 2026-08-08. `.optional()`
      // dopuszcza wyłącznie BRAK klucza, a dostawca realnie przysyła
      // `initialPrice: null` (potwierdzone na surowej odpowiedzi prebooka
      // hotelu lp88f00). Przy `.optional()` taka wartość wywracała parsowanie
      // CAŁEGO `retailRate`, a razem z nim cenę i rozbicie podatkowe taryfy.
      // To ta sama klasa błędu co incydent z `LiteApiHotelDetailSchema`:
      // puste pola przychodzą jako `null`, nie jako brak pola.
      initialPrice: z.array(PriceAmountSchema).nullish(),
      // Rozbicie podatków i opłat. `included: false` znaczy, że pozycja NIE
      // jest w `total` — gość dopłaci ją w hotelu. Zmierzone: 209 z 400 taryf
      // ma taką pozycję (najczęściej VAT), podczas gdy UI bezwarunkowo pisze
      // „wł. podatków". To jest dana potrzebna, żeby przestać kłamać.
      //
      // `description` bywa TEKSTEM z kwotą w obcej walucie
      // ("$163.02 USD per room per stay") — nie próbować tego sumować.
      // `.nullish()` na polach i `.catch(undefined)` na tablicy są CELOWE:
      // dostawca potrafi przysłać `null` zamiast pominąć pole, a rozbicie
      // podatków jest daną POMOCNICZĄ — jej zły kształt nie może wywrócić
      // parsowania taryfy (bez taryfy nie ma czego sprzedać).
      taxesAndFees: z
        .array(
          z
            .object({
              included: z.boolean().nullish(),
              description: z.string().nullish(),
              amount: z.number().nullish(),
              currency: CurrencyCodeSchema.nullish(),
            })
            .passthrough(),
        )
        .nullish()
        .catch(undefined),
    })
    .optional(),
  cancellationPolicies: LiteApiCancellationPolicySchema.optional(),
  // Klucz obcy do `rooms[].id` z /data/hotel — pojawia się TYLKO gdy zapytanie
  // /hotels/rates ustawi `roomMapping: true` (patrz rates.ts). Dzięki niemu
  // taryfa dostaje zdjęcia, metraż i łóżka SWOJEGO pokoju, bez zgadywania po
  // nazwach. Zmierzone pokrycie: 31/31 taryf na 4 hotelach.
  //
  // PUŁAPKA: pole jest na poziomie TARYFY (rates[]), nie roomType — szukanie
  // go o poziom wyżej daje 0 trafień.
  mappedRoomId: z.union([z.number(), z.string()]).nullish(),
});
export type LiteApiRate = z.infer<typeof LiteApiRateSchema>;

export const LiteApiRoomTypeSchema = z.object({
  offerId: z.string(),
  supplier: z.string().optional(),
  rates: z.array(LiteApiRateSchema),
});
export type LiteApiRoomType = z.infer<typeof LiteApiRoomTypeSchema>;

export const LiteApiHotelRatesSchema = z.object({
  hotelId: z.string(),
  roomTypes: z.array(LiteApiRoomTypeSchema),
});
export type LiteApiHotelRates = z.infer<typeof LiteApiHotelRatesSchema>;

export const LiteApiRatesResponseSchema = z.object({
  // Batch, w którym ŻADEN hotel nie ma ofert (przy pełnej puli kierunku to
  // codzienność — głęboki ogon listy bywa w całości wyprzedany), wraca BEZ
  // pola `data` (zaobserwowane na żywo 2026-07-11: „expected array, received
  // undefined"). Sztywne z.array() wywalało wtedy CAŁY batch → 50 realnie
  // niedostępnych hoteli lądowało jako „error" zamiast „brak miejsc".
  // Brak pola → pusta lista (= żaden hotel z batcha nie ma stawek). Inne
  // nieoczekiwane kształty nadal failują walidację (nie maskujemy błędów).
  data: z.preprocess((v) => (v == null ? [] : v), z.array(LiteApiHotelRatesSchema)),
});
export type LiteApiRatesResponse = z.infer<typeof LiteApiRatesResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Prebook (`POST /rates/prebook` with `usePaymentSdk: true`)

/**
 * `roomTypes[]` w odpowiedzi PREBOOKA.
 *
 * Kształt jest TEN SAM co w `/hotels/rates` (zmierzone na żywej odpowiedzi
 * 2026-08-08), więc taryfy parsujemy istniejącym `LiteApiRateSchema` — dzięki
 * temu `retailRate.taxesAndFees` ma dokładnie jedną definicję w całym repo.
 *
 * DEFENSYWNIE: `offerId` jest `.optional()`, a cała tablica ma `.catch(undefined)`.
 * Powód jest twardy: rozbicie podatkowe to dana POMOCNICZA, a `prebookId` +
 * `price` to dane, bez których nie ma transakcji. Zły kształt podatków nie ma
 * prawa wywrócić parsowania prebooka i zablokować gościowi zakupu.
 */
const LiteApiPrebookRoomTypeSchema = z
  .object({
    offerId: z.string().optional(),
    rates: z.array(LiteApiRateSchema).optional(),
  })
  .passthrough();

export const LiteApiPrebookResponseSchema = z.object({
  data: z.object({
    prebookId: z.string(),
    transactionId: z.string().optional(), // returned when usePaymentSdk=true
    secretKey: z.string().optional(), // returned when usePaymentSdk=true
    hotelId: z.string().optional(),
    rateId: z.string().optional(),
    offerId: z.string().optional(),
    price: z.number().optional(),
    currency: CurrencyCodeSchema.optional(),
    cancellationPolicies: LiteApiCancellationPolicySchema.optional(),
    expiresAt: z.string().optional(),

    // ── Pola, które schemat DO 2026-08-08 po cichu wyrzucał ────────────────
    //
    // Schematy w tym repo są nie-strict, więc każde niezadeklarowane pole Zod
    // kasuje bez śladu. Skutek był realny i kosztowny: checkout nie miał
    // rozbicia podatkowego, więc pisał bezwarunkowe „wł. podatków i opłat"
    // — nieprawdziwe dla 14 315 z 17 776 zmierzonych taryf (80,5%), średnio
    // 352 zł nieujawnionej dopłaty. Pomiar i surowa odpowiedź prebooka:
    // `docs/hotel-redesign/price-integrity-audit.md`.
    //
    // Dostawca ODDAJE te dane. To my je wyrzucaliśmy.

    /** Taryfy z rozbiciem `retailRate.taxesAndFees` — źródło prawdy checkoutu. */
    roomTypes: z.array(LiteApiPrebookRoomTypeSchema).nullish().catch(undefined),
    /** Cena po stronie gościa; zmierzone: równa `price`. */
    sellingPriceToUser: z.number().nullish(),
    /** >0 = podrożało, <0 = staniało względem oferty z wyszukiwarki. */
    priceDifferencePercent: z.number().nullish(),
    /** Dostawca zmienił zasady anulacji między rates a prebook. */
    cancellationChanged: z.boolean().nullish(),
    /** Dostawca zmienił wyżywienie między rates a prebook. */
    boardChanged: z.boolean().nullish(),
    // LiteAPI flags whether THIS prebook (and its Stripe PaymentIntent) is
    // sandbox/test mode. Authoritative env signal for the payment widget —
    // see B6. Location varies (data.* or top-level), capture both.
    sandbox: z.boolean().optional(),
  }),
  sandbox: z.boolean().optional(),
});
export type LiteApiPrebookResponse = z.infer<typeof LiteApiPrebookResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Book (`POST /rates/book`)

export const LiteApiGuestSchema = z.object({
  occupancyNumber: z.number(),
  firstName: z.string().min(1).max(40),
  lastName: z.string().min(1).max(40),
  email: z.string().email().optional(),
  remarks: z.string().max(200).optional(),
});
export type LiteApiGuest = z.infer<typeof LiteApiGuestSchema>;

export const LiteApiHolderSchema = z.object({
  firstName: z.string().min(1).max(40),
  lastName: z.string().min(1).max(40),
  email: z.string().email(),
  phone: z.string().min(4).max(32),
});
export type LiteApiHolder = z.infer<typeof LiteApiHolderSchema>;

// Principled schema for `POST /v3.0/rates/book` 200 response — based on the
// canonical version LiteAPI support provided 2026-05-24 after the real
// on-wire shape was diagnosed against our previous strict schema.
//
// Design rules confirmed with LiteAPI:
//  1. ONLY `data.bookingId` is a true invariant — that's the canonical handle.
//  2. `status` is a STRING (not an enum). Documented values across endpoints
//     include "CONFIRMED", "CANCELED", "CANCELLED_WITH_CHARGES". Treat as
//     opaque; route layer interprets business meaning.
//  3. `holder.phone` may come back as "" (empty) — DO NOT enforce min length
//     here, that constraint belongs in the INPUT schema (where the user types).
//  4. `hotel.parentHotelId` appears on the wire but is not in the OpenAPI —
//     allow unknown keys via `.passthrough()` at every nested level.
//  5. `sandbox` is sometimes boolean, sometimes 0|1 across endpoints.
//
// This shape rejects no real success response we've seen from LiteAPI and
// stays forward-compatible.
const LiteApiBookingHolderResponseSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    // Lenient by design — LiteAPI returns "" here even when the input was a
    // valid phone. We do NOT enforce `min(4)` on the response.
    phone: z.string().optional().nullable(),
  })
  .passthrough();

const LiteApiBookingHotelResponseSchema = z
  .object({
    hotelId: z.string().optional(),
    name: z.string().optional(),
    parentHotelId: z.string().optional(), // observed on-wire, undocumented
  })
  .passthrough();

const LiteApiBookedRoomResponseSchema = z
  .object({
    // LiteAPI uses both camelCase and snake_case across responses — accept both.
    occupancy_number: z.number().int().optional(),
    occupancyNumber: z.number().int().optional(),
    room_id: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    roomType: z
      .object({ roomTypeId: z.string().optional(), name: z.string().optional() })
      .passthrough()
      .optional(),
    rate: z
      .object({
        rateId: z.string().optional(),
        // sub-shapes differ across endpoints — accept anything.
        retailRate: z.unknown().optional(),
        cancellationPolicies: z.unknown().optional(),
        maxOccupancy: z.number().optional(),
        remarks: z.string().optional(),
      })
      .passthrough()
      .optional(),
    guests: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const LiteApiBookingSchema = z
  .object({
    bookingId: z.string(),

    clientReference: z.string().optional(),
    supplierBookingId: z.string().optional(),
    supplierBookingName: z.string().optional(),
    supplier: z.string().optional(),
    supplierId: z.number().int().optional(),

    status: z.string().optional(),
    hotelConfirmationCode: z.string().optional(),

    checkin: z.string().optional(),
    checkout: z.string().optional(),

    hotel: LiteApiBookingHotelResponseSchema.optional(),
    holder: LiteApiBookingHolderResponseSchema.optional(),

    bookedRooms: z.array(LiteApiBookedRoomResponseSchema).optional(),
    // Some endpoints also expose a flat `rooms` array — accept either.
    rooms: z.array(z.unknown()).optional(),

    paymentStatus: z.string().optional(),
    paymentTransactionId: z.string().optional(),
    prebookId: z.string().optional(),

    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    refundedAt: z.string().nullable().optional(),
    cancelledAt: z.string().nullable().optional(),
    amountRefunded: z.number().optional(),
    refundType: z.string().optional(),

    remarks: z.string().optional(),
    currency: z.string().optional(),
    price: z.number().optional(),
    commission: z.number().optional(),
    cancellationPolicies: z.unknown().optional(),
  })
  .passthrough();
export type LiteApiBooking = z.infer<typeof LiteApiBookingSchema>;

// Top-level envelope. LiteAPI sometimes adds `guestLevel`, `sandbox`, and
// other meta fields at the top level alongside `data`. Allow them through.
export const LiteApiBookResponseSchema = z
  .object({
    data: LiteApiBookingSchema,
    guestLevel: z.number().int().optional(),
    sandbox: z.boolean().or(z.number().int()).optional(),
  })
  .passthrough();
export type LiteApiBookResponse = z.infer<typeof LiteApiBookResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Cancellation

export const LiteApiCancellationSchema = z.object({
  bookingId: z.string(),
  status: z.enum(["CANCELLED", "PENDING", "FAILED"]),
  refundAmount: z.number().optional(),
  currency: CurrencyCodeSchema.optional(),
  cancelledAt: z.string().optional(),
});
export type LiteApiCancellation = z.infer<typeof LiteApiCancellationSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Webhook payload (canonical envelope confirmed by LiteAPI support 2026-05-24)
//
// Every event share the same envelope:
//   - event_id      unique delivery ID (use for dedupe / idempotency)
//   - event_name    e.g. "booking.book", "booking.refund", "booking.cancel"
//   - request       stringified JSON of the original request body
//   - response      stringified JSON of LiteAPI's response body
//   - sandbox       boolean — true for sandbox, false for production
//
// Auth: `Authorization` header with the shared token configured in the LiteAPI
// dashboard (Developer tools → Webhooks). NOT HMAC-SHA256 — our previous
// implementation assumed HMAC and would have rejected every real event.
export const LiteApiWebhookEventSchema = z
  .object({
    event_id: z.string(),
    event_name: z.string(),
    // request + response are STRINGIFIED JSON. Caller must JSON.parse() before
    // working with them. Kept as strings here to match the on-wire shape exactly.
    request: z.string().optional(),
    response: z.string().optional(),
    sandbox: z.boolean().or(z.number().int()).optional(),
  })
  .passthrough();
export type LiteApiWebhookEvent = z.infer<typeof LiteApiWebhookEventSchema>;

// Helper to parse the embedded stringified JSON safely. Returns null on parse
// failure (caller decides what to do with malformed sub-payloads).
export function parseWebhookEmbeddedJson<T = unknown>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Search input (our normalized search params, not LiteAPI's raw shape)

export interface NormalizedHotelSearchInput {
  destination: { city: string; country: string };
  checkin: string; // ISO yyyy-MM-dd
  checkout: string;
  occupancies: Array<{ adults: number; children?: number[] /* ages */ }>;
  currency: CurrencyCode;
  language: string; // ISO-2 (e.g. "pl")
  radiusKm?: number;
  lat?: number;
  lng?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Display-side normalized hotel offer (what UI consumes)

export interface NormalizedHotelOffer {
  hotelId: string;
  name: string;
  city: string;
  country?: string;
  address?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
  latitude?: number;
  longitude?: number;
  cheapestRate: {
    rateId: string;
    offerId: string;
    boardName?: string;
    refundableTag?: string;
    totalAmountMinor: bigint; // grosze
    currency: CurrencyCode;
    cancellationDeadline?: string;
  };
}
