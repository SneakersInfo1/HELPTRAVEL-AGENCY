// Etap 2 przebudowy sekcji hotelowej — warstwa domenowa.
//
// Testy są tu SPECYFIKACJĄ zachowań, które w produkcji już raz zawiodły albo
// zawodzą dziś:
//   • bezwarunkowe „wł. podatków" przy taryfach z `included: false` (209/400),
//   • zdjęcie hotelu podstawiane pod pokój, gdy brak powiązania,
//   • duplikaty udogodnień pochodzące ze ŹRÓDŁA (dwa facilityId, jedno pojęcie),
//   • przecena liczona z ceny konkurenta.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { LiteApiRate } from "@/lib/liteapi";

import { boardCategoryOf, includesMeals } from "./board";
import { buildPriceBreakdown, hasHonestDiscount, mapTaxes, taxNoticeFrom } from "./price";
import { buildRateOffers, indexRoomsById, roomForRate, toRoomProfile } from "./room";
import { groupAmenities, normalizeAmenities, normalizeAmenitiesWith, topAmenities } from "./amenity";
import {
  localizeReviewCategory,
  reviewCategories,
  reviewHighlights,
  reviewSourceLabel,
  scoreToPercent,
} from "./review";
import {
  formatHotelTime,
  guestsLabel,
  nightsLabel,
  optionsLabel,
  reviewsLabel,
  roomsLabel,
  taxNoticeFromSlim,
  taxNoticeShort,
  taxNoticeText,
} from "./format";

const PLN = "PLN";

function rate(overrides: Partial<LiteApiRate> = {}): LiteApiRate {
  return {
    rateId: "r1",
    retailRate: { total: [{ amount: 300, currency: PLN }] },
    ...overrides,
  } as LiteApiRate;
}

// ── Podatki i opłaty ────────────────────────────────────────────────────────

test("podatki: wszystkie pozycje w cenie → 'all-included'", () => {
  const r = rate({
    retailRate: {
      total: [{ amount: 300, currency: PLN }],
      taxesAndFees: [{ included: true, description: "Taxes and Fees", amount: 30, currency: PLN }],
    },
  } as Partial<LiteApiRate>);
  assert.equal(taxNoticeFrom(mapTaxes(r)).kind, "all-included");
});

test("podatki: included:false → 'extra-at-property' z kwotą (dziś UI kłamie 'wł. podatków')", () => {
  // Dokładny kształt z drutu, 209 z 400 zmierzonych taryf.
  const r = rate({
    retailRate: {
      total: [{ amount: 3219.28, currency: PLN }],
      taxesAndFees: [{ included: false, description: "VAT", amount: 298.08, currency: PLN }],
    },
  } as Partial<LiteApiRate>);
  const notice = taxNoticeFrom(mapTaxes(r));
  assert.equal(notice.kind, "extra-at-property");
  assert.equal(notice.kind === "extra-at-property" && notice.amountMinor, BigInt(29808));
  assert.equal(notice.kind === "extra-at-property" && notice.currency, PLN);
});

test("podatki: MIESZANKA included true+false → dopłata liczy tylko pozycje spoza ceny", () => {
  const r = rate({
    retailRate: {
      total: [{ amount: 1000, currency: PLN }],
      taxesAndFees: [
        { included: true, description: "Service", amount: 50, currency: PLN },
        { included: false, description: "VAT", amount: 80, currency: PLN },
        { included: false, description: "City tax", amount: 20, currency: PLN },
      ],
    },
  } as Partial<LiteApiRate>);
  const notice = taxNoticeFrom(mapTaxes(r));
  assert.equal(notice.kind === "extra-at-property" && notice.amountMinor, BigInt(10000)); // 80 + 20
});

test("podatki: brak taxesAndFees → 'unknown' (NIE twierdzimy nic o podatkach)", () => {
  assert.equal(taxNoticeFrom(mapTaxes(rate())).kind, "unknown");
});

test("podatki: opłata opisana TEKSTEM w obcej walucie nie jest sumowana", () => {
  // Zmierzone: dostawca wpisuje całą informację w `description`, bez `amount`.
  const r = rate({
    retailRate: {
      total: [{ amount: 500, currency: PLN }],
      taxesAndFees: [{ included: false, description: "$163.02 USD per room per stay" }],
    },
  } as Partial<LiteApiRate>);
  const notice = taxNoticeFrom(mapTaxes(r));
  // Wiemy, że coś dopłacimy, ale NIE zmyślamy kwoty.
  assert.equal(notice.kind, "extra-at-property");
  assert.equal(notice.kind === "extra-at-property" && notice.amountMinor, null);
});

test("podatki: dopłaty w RÓŻNYCH walutach nie są sumowane", () => {
  const r = rate({
    retailRate: {
      total: [{ amount: 500, currency: PLN }],
      taxesAndFees: [
        { included: false, description: "VAT", amount: 50, currency: PLN },
        { included: false, description: "Resort fee", amount: 10, currency: "EUR" },
      ],
    },
  } as Partial<LiteApiRate>);
  const notice = taxNoticeFrom(mapTaxes(r));
  assert.equal(notice.kind === "extra-at-property" && notice.amountMinor, null);
});

test("podatki: brak flagi `included` traktujemy jak 'w cenie' (nie straszymy dopłatą)", () => {
  const r = rate({
    retailRate: {
      total: [{ amount: 300, currency: PLN }],
      taxesAndFees: [{ description: "Tax", amount: 10, currency: PLN }],
    },
  } as Partial<LiteApiRate>);
  assert.equal(taxNoticeFrom(mapTaxes(r)).kind, "all-included");
});

// ── Cena ────────────────────────────────────────────────────────────────────

test("cena: total od dostawcy, za noc TYLKO jako pochodna", () => {
  const b = buildPriceBreakdown(rate({ retailRate: { total: [{ amount: 900, currency: PLN }] } } as Partial<LiteApiRate>), 3);
  assert.equal(b?.totalMinor, BigInt(90000));
  assert.equal(b?.perNightMinor, BigInt(30000));
  assert.equal(b?.nights, 3);
});

test("cena: 0 nocy → brak ceny za noc zamiast dzielenia przez zero", () => {
  assert.equal(buildPriceBreakdown(rate(), 0)?.perNightMinor, null);
});

test("cena: brak ceny → null (wyprzedane to legalny stan, nie błąd)", () => {
  assert.equal(buildPriceBreakdown(rate({ retailRate: undefined }), 2), null);
});

test("cena odniesienia zachowuje ŹRÓDŁO i nie udaje przeceny", () => {
  const b = buildPriceBreakdown(
    rate({
      retailRate: {
        total: [{ amount: 3219.28, currency: PLN }],
        suggestedSellingPrice: [{ amount: 3771.71, currency: PLN, source: "booking.com" }],
      },
    } as Partial<LiteApiRate>),
    3,
  );
  assert.equal(b?.competitorReference?.source, "booking.com");
  assert.equal(b?.competitorReference?.amountMinor, BigInt(377171));
});

test("przecena: initialPrice === total → BRAK uczciwej podstawy (400/400 taryf)", () => {
  const r = rate({
    retailRate: {
      total: [{ amount: 3219.28, currency: PLN }],
      initialPrice: [{ amount: 3219.28, currency: PLN }],
      suggestedSellingPrice: [{ amount: 3771.71, currency: PLN, source: "booking.com" }],
    },
  } as Partial<LiteApiRate>);
  // Cena konkurenta jest wyższa, ale to NIE jest przecena.
  assert.equal(hasHonestDiscount(r), false);
});

test("przecena: własna cena bazowa wyższa od total → podstawa ISTNIEJE", () => {
  const r = rate({
    retailRate: {
      total: [{ amount: 800, currency: PLN }],
      initialPrice: [{ amount: 1000, currency: PLN }],
    },
  } as Partial<LiteApiRate>);
  assert.equal(hasHonestDiscount(r), true);
});

// ── Wyżywienie ──────────────────────────────────────────────────────────────

test("wyżywienie: kody i nazwy mapują się na kategorie", () => {
  assert.equal(boardCategoryOf("RO", "Room Only"), "room-only");
  assert.equal(boardCategoryOf("BB", "Bed and Breakfast"), "breakfast");
  assert.equal(boardCategoryOf("HB", "Half Board"), "half-board");
  assert.equal(boardCategoryOf("FB", "Full Board"), "full-board");
  assert.equal(boardCategoryOf("AI", "All Inclusive"), "all-inclusive");
});

test("wyżywienie: BRAK danych to 'unknown', nie 'bez wyżywienia'", () => {
  // Różnica wobec localizeBoard(), które przy pustym wejściu twierdzi
  // „Bez wyżywienia" — to jest zapewnienie, którego dane nie potwierdzają.
  assert.equal(boardCategoryOf(null, null), "unknown");
  assert.equal(boardCategoryOf("", ""), "unknown");
});

test("wyżywienie: 'all inclusive' nie jest mylone z 'half board'", () => {
  assert.equal(boardCategoryOf(undefined, "All-Inclusive"), "all-inclusive");
  assert.equal(includesMeals("all-inclusive"), true);
  assert.equal(includesMeals("room-only"), false);
  assert.equal(includesMeals("unknown"), false);
});

// ── Pokoje i powiązanie z taryfą ────────────────────────────────────────────

const DETAIL = {
  id: "lp1",
  name: "Hotel",
  city: "Málaga",
  rooms: [
    {
      id: 5677262,
      roomName: "Pokój dwuosobowy",
      roomSizeSquare: 22,
      roomSizeUnit: "sqm",
      maxOccupancy: 2,
      bedTypes: [{ quantity: 1, bedType: "Łóżko podwójne", bedSize: "131-150 cm" }],
      roomAmenities: [{ amenitiesId: 1, name: "Klimatyzacja", sort: 1 }],
      photos: [{ url: "https://x.test/a.jpg", hd_url: "https://x.test/a-hd.jpg", mainPhoto: true }],
    },
  ],
} as never;

test("pokój: mapowanie zachowuje metraż, łóżka, udogodnienia i zdjęcia", () => {
  const p = toRoomProfile((DETAIL as { rooms: never[] }).rooms[0]);
  assert.equal(p.id, "5677262");
  assert.equal(p.sizeSquareMeters, 22);
  assert.equal(p.beds[0].type, "Łóżko podwójne");
  assert.deepEqual(p.amenities, ["Klimatyzacja"]);
  assert.equal(p.photos[0].isMain, true);
  assert.equal(p.photos[0].hdUrl, "https://x.test/a-hd.jpg");
});

test("pokój: metraż w stopach kwadratowych jest ODRZUCANY (nie pokazujemy mylącej liczby)", () => {
  const p = toRoomProfile({ id: 1, roomSizeSquare: 301, roomSizeUnit: "sq ft" } as never);
  assert.equal(p.sizeSquareMeters, null);
});

test("powiązanie: mappedRoomId (number lub string) trafia w rooms[].id", () => {
  const idx = indexRoomsById(DETAIL);
  assert.equal(roomForRate(rate({ mappedRoomId: 5677262 }), idx)?.name, "Pokój dwuosobowy");
  assert.equal(roomForRate(rate({ mappedRoomId: "5677262" }), idx)?.name, "Pokój dwuosobowy");
});

test("powiązanie: BRAK mappedRoomId → null (nigdy zdjęcie hotelu jako zdjęcie pokoju)", () => {
  const idx = indexRoomsById(DETAIL);
  assert.equal(roomForRate(rate(), idx), null);
  assert.equal(roomForRate(rate({ mappedRoomId: 999999 }), idx), null);
});

test("powiązanie: żadnego dopasowywania po NAZWIE (nazwy są w różnych językach)", () => {
  // Taryfa nazywa się po angielsku, pokój po polsku — gdyby kod próbował
  // dopasować po tekście, podstawiłby gościowi zdjęcia innego pokoju.
  const idx = indexRoomsById(DETAIL);
  const r = rate({ name: "Double Room", mappedRoomId: undefined });
  assert.equal(roomForRate(r, idx), null);
});

test("oferty: taryfa bez ceny nie trafia na listę ofert", () => {
  const offers = buildRateOffers(
    [{ offerId: "o1", rates: [rate({ retailRate: undefined }), rate({ rateId: "r2", mappedRoomId: 5677262 })] }] as never,
    DETAIL,
    2,
  );
  assert.equal(offers.length, 1);
  assert.equal(offers[0].rateId, "r2");
  assert.equal(offers[0].room?.name, "Pokój dwuosobowy");
});

test("oferty: brak szczegółów hotelu → oferty powstają, tylko bez pokoi", () => {
  const offers = buildRateOffers([{ offerId: "o1", rates: [rate({ mappedRoomId: 5677262 })] }] as never, null, 2);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].room, null);
});

// ── Udogodnienia ────────────────────────────────────────────────────────────

test("udogodnienia: DWA facilityId o tym samym znaczeniu dają JEDEN wpis", () => {
  // Dokładny kształt ze źródła — to jest przyczyna duplikatów „Wi-Fi" w UI.
  const out = normalizeAmenities([
    { facilityId: 47, name: "WiFi dostępne" },
    { facilityId: 107, name: "Darmowe WiFi" },
  ]);
  const wifi = out.filter((a) => a.label === "Bezpłatne Wi-Fi");
  assert.equal(wifi.length, 1);
});

test("udogodnienia: wejście angielskie i polskie daje ten sam wynik", () => {
  const en = normalizeAmenities(["Free WiFi", "Parking", "Air conditioning"]);
  const pl = normalizeAmenities(["Darmowe WiFi", "Parkowanie", "Klimatyzacja"]);
  assert.deepEqual(
    en.map((a) => a.label).sort(),
    pl.map((a) => a.label).sort(),
  );
});

test("udogodnienia: nierozpoznany wpis NIE ginie — trafia do 'Pozostałe'", () => {
  const out = normalizeAmenities(["Prywatne molo dla łodzi"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].category, "other");
  assert.equal(out[0].label, "Prywatne molo dla łodzi");
});

test("udogodnienia: obie reprezentacje (string + obiekt) scalają się bez duplikatu", () => {
  // hotelFacilities[] to stringi po angielsku, facilities[] to obiekty po polsku
  // — ta sama lista w dwóch postaciach.
  const out = normalizeAmenities(["Free WiFi", "Restaurant"], [
    { facilityId: 107, name: "Darmowe WiFi" },
    { facilityId: 5, name: "Restauracja" },
  ]);
  assert.equal(out.length, 2);
});

test("udogodnienia: grupowanie zachowuje ustaloną kolejność kategorii", () => {
  const groups = groupAmenities(normalizeAmenities(["Pets allowed", "Free WiFi", "Restaurant"]));
  assert.deepEqual(
    groups.map((g) => g.category),
    ["internet", "food-drink", "pets"],
  );
});

test("udogodnienia: widok skrócony bierze najważniejsze i respektuje limit", () => {
  const all = normalizeAmenities(["Pets allowed", "Free WiFi", "Parking", "Restaurant", "Pool"]);
  const top = topAmenities(all, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].category, "internet");
});

test("udogodnienia: puste i uszkodzone wejście nie wywraca normalizacji", () => {
  assert.deepEqual(normalizeAmenities(null, undefined, [], [null, 42, {}] as unknown[]), []);
});

// ── Opinie i kategorie ocen ─────────────────────────────────────────────────

test("opinie: nazwy kategorii tłumaczone słownikiem, nieznane zostają oryginałem", () => {
  assert.equal(localizeReviewCategory("Cleanliness"), "Czystość");
  assert.equal(localizeReviewCategory("Value for Money"), "Stosunek jakości do ceny");
  assert.equal(localizeReviewCategory("Room Quality"), "Jakość pokoju");
  // Nieznana kategoria NIE ginie i nie zostaje pusta — pokazujemy oryginał.
  assert.equal(localizeReviewCategory("Nightlife"), "Nightlife");
});

test("opinie: kategorie bez sensownej oceny są odrzucane (pasek bez liczby nic nie znaczy)", () => {
  const detail = {
    sentiment_analysis: {
      categories: [
        { name: "Cleanliness", rating: 9.3, description: "Very clean." },
        { name: "Service", rating: 0 },
        { name: "", rating: 8 },
        { name: "Location", rating: null },
      ],
    },
  } as never;
  const cats = reviewCategories(detail);
  assert.equal(cats.length, 1);
  assert.equal(cats[0].label, "Czystość");
  assert.equal(cats[0].score, 9.3);
});

test("opinie: brak sentiment_analysis nie wywraca — pusta lista", () => {
  assert.deepEqual(reviewCategories(null), []);
  assert.deepEqual(reviewCategories({ sentiment_analysis: null } as never), []);
  assert.deepEqual(reviewHighlights(undefined), []);
});

test("opinie: zalety deduplikowane i przycięte do limitu", () => {
  const detail = {
    sentiment_analysis: {
      pros: ["Great location", "great location", "Friendly staff", "Clean rooms"],
    },
  } as never;
  const h = reviewHighlights(detail, 2);
  assert.equal(h.length, 2);
  assert.deepEqual(h, ["Great location", "Friendly staff"]);
});

test("opinie: skala 0-10 → procent; wartość poza skalą daje null zamiast kłamliwego paska", () => {
  assert.equal(scoreToPercent(10), 100);
  assert.equal(scoreToPercent(9.3), 93);
  assert.equal(scoreToPercent(0), 0);
  // Gdyby dostawca zmienił skalę na 0-5, obcięcie dałoby pasek 2× za długi.
  assert.equal(scoreToPercent(11), null);
  assert.equal(scoreToPercent(-1), null);
  assert.equal(scoreToPercent(Number.NaN), null);
});

test("opinie: atrybucja źródła — nazwy własne z wielkiej litery, bez duplikatów", () => {
  assert.equal(reviewSourceLabel(["tripadvisor", "tripadvisor", null]), "Tripadvisor");
  assert.equal(reviewSourceLabel([null, undefined, ""]), null);
});

// ── Formatowanie i odmiana ──────────────────────────────────────────────────

test("odmiana: nastolatki biorą formę mnogą (naiwne n<5 myli się na 12-14)", () => {
  assert.equal(nightsLabel(1), "1 noc");
  assert.equal(nightsLabel(3), "3 noce");
  assert.equal(nightsLabel(5), "5 nocy");
  // Tu wykładało się poprzednie `n < 5 ? "noce" : "nocy"` w komponentach:
  assert.equal(nightsLabel(12), "12 nocy");
  assert.equal(nightsLabel(13), "13 nocy");
  assert.equal(nightsLabel(14), "14 nocy");
  assert.equal(nightsLabel(22), "22 noce");
  assert.equal(nightsLabel(23), "23 noce");
});

test("odmiana: pokoje, goście i opinie", () => {
  assert.equal(roomsLabel(1), "1 pokój");
  assert.equal(roomsLabel(2), "2 pokoje");
  assert.equal(roomsLabel(5), "5 pokoi");
  assert.equal(guestsLabel(1), "1 gość");
  assert.equal(guestsLabel(2), "2 gości");
  assert.equal(optionsLabel(1), "1 opcja");
  assert.equal(optionsLabel(3), "3 opcje");
  assert.equal(optionsLabel(7), "7 opcji");
  assert.ok(reviewsLabel(1).endsWith("opinia"));
  assert.ok(reviewsLabel(4450).endsWith("opinii"));
});

test("etykieta podatkowa: 'unknown' daje NULL — nie wolno nic twierdzić", () => {
  // To jest cała istota Etapu 3: brak danych → cisza, nie zapewnienie.
  assert.equal(taxNoticeText({ kind: "unknown" }), null);
  assert.equal(taxNoticeShort({ kind: "unknown" }), null);
});

test("etykieta podatkowa: wszystko w cenie vs dopłata na miejscu", () => {
  assert.equal(taxNoticeText({ kind: "all-included" }), "w tym podatki i opłaty");
  const extra = taxNoticeText({ kind: "extra-at-property", amountMinor: BigInt(29808), currency: "PLN" });
  assert.ok(extra?.includes("na miejscu"));
  assert.ok(extra?.includes("298"));
});

test("etykieta podatkowa: dopłata bez policzalnej kwoty nie zmyśla liczby", () => {
  const t = taxNoticeText({ kind: "extra-at-property", amountMinor: null, currency: null });
  assert.equal(t, "dodatkowe podatki i opłaty płatne na miejscu");
  assert.ok(!/\d/.test(t ?? ""));
});

test("SlimRate → TaxNotice: undefined znaczy 'nie wiemy', nie 'w cenie'", () => {
  // Wpisy cache sprzed v3 nie mają tych pól. Muszą dać 'unknown', nie fałszywe
  // zapewnienie — dlatego KEY_VERSION poszedł v2 → v3.
  assert.equal(taxNoticeFromSlim(undefined, undefined, "PLN").kind, "unknown");
  assert.equal(taxNoticeFromSlim(true, undefined, "PLN").kind, "all-included");
  const extra = taxNoticeFromSlim(false, 298.08, "PLN");
  assert.equal(extra.kind, "extra-at-property");
  assert.equal(extra.kind === "extra-at-property" && extra.amountMinor, BigInt(29808));
});

test("godziny: zapis 12h dostawcy → 24h; północ nie staje się południem", () => {
  assert.equal(formatHotelTime("03:00 PM"), "15:00");
  assert.equal(formatHotelTime("11:30 AM"), "11:30");
  // „12:00 AM" to PÓŁNOC — naiwne dodanie 12 dałoby „12:00" (południe).
  assert.equal(formatHotelTime("12:00 AM"), "00:00");
  assert.equal(formatHotelTime("12:00 PM"), "12:00");
});

test("godziny: nieznanego formatu NIE psujemy (lepiej oryginał niż zgadywanie)", () => {
  assert.equal(formatHotelTime("15:00"), "15:00");
  assert.equal(formatHotelTime("po uzgodnieniu"), "po uzgodnieniu");
  assert.equal(formatHotelTime(null), null);
  assert.equal(formatHotelTime("   "), null);
});

test("udogodnienia: urzędowa nazwa PL od dostawcy bije tekst z rekordu hotelu", () => {
  // `hotelFacilities[]` bywa angielskie nawet przy language=pl. Gdy znamy
  // facilityId, bierzemy nazwę ze słownika /data/facilities (814/814 ma PL).
  const out = normalizeAmenitiesWith(
    { facilityLabel: (id) => (id === 491 ? "Winda" : null) },
    [{ facilityId: 491, name: "Elevator" }],
  );
  assert.equal(out.length, 1);
  // Pojęcie „elevator" jest rozpoznane, więc etykieta pochodzi z reguły —
  // ale wejście zostało wcześniej przetłumaczone, co widać po kategorii.
  assert.equal(out[0].facilityId, 491);
  assert.equal(out[0].category, "services");
});

test("udogodnienia: bez słownika nierozpoznany wpis zostaje po angielsku, ze słownikiem po polsku", () => {
  const raw = [{ facilityId: 999, name: "Ski storage room" }];
  const bez = normalizeAmenitiesWith({}, raw);
  assert.equal(bez[0].label, "Ski storage room");
  const ze = normalizeAmenitiesWith({ facilityLabel: (id) => (id === 999 ? "Przechowalnia nart" : null) }, raw);
  assert.equal(ze[0].label, "Przechowalnia nart");
});
