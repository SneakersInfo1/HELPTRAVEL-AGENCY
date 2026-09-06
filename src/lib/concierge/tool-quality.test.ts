// ZESTAW JAKOŚCIOWY NARZĘDZI (V2.1 §28). Każdy przypadek opisuje regułę, którą
// audyt uznał za nienaruszalną — i każdy najpierw ZAWIÓDŁ na kodzie sprzed
// V2.1. Testy są deterministyczne: snapshot i LiteAPI są wstrzyknięte, więc
// wynik nie zależy od tego, co akurat jest w Redisie.
//
//   A. tyle nocy, ile poprosił użytkownik
//   B. kraj + motyw — oba sygnały przeżywają
//   C. budżet 4000 nie daje ceny > 4000 bez jawnego ostrzeżenia
//   D. hotel=null + lot=null NIE jest sukcesem
//   E. sam hotel = PARTIAL
//   F. sam lot = PARTIAL
//   G. ranking PRZED przycięciem listy
//   H. dane nieświeże nigdy nie wygrywają ze świeżymi
//   I. kierunek wskazany przez użytkownika nie zostaje wyparty przez tańszy
//   J. brak dostępności nie generuje ceny

import assert from "node:assert/strict";
import { test } from "node:test";

import { destinationPriceKey, type DestinationPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import seedJson from "../../../data/destinations.json";
import { dispatchToolCall } from "./orchestrator";
import { createToolContext } from "./tool-context";
import { createToolExecutors, type CheapestFlight, type CheapestHotel, type ToolDeps } from "./tools";
import type { SeedDestinationLike, TripSearchCity } from "./trip-search";

const now = Date.UTC(2026, 6, 7);
const FRESH = now - 3_600_000; // 1 h temu
const STALE = now - 72 * 3_600_000; // 72 h temu — poza progiem 48 h

interface SeedDestRecord extends SeedDestinationLike {
  id: string;
  country: { code: string | null; en: string; pl: string };
  vibeTagsEn?: string[];
  popularity?: number;
}
const seed = (seedJson as { destinations: SeedDestRecord[] }).destinations;

function seedLookup(city: string, country?: string): SeedDestRecord | undefined {
  const targetCity = city.trim().toLowerCase();
  const targetCountry = country?.trim().toLowerCase();
  return seed.find((d) => {
    const matchCity = d.city.en.toLowerCase() === targetCity || d.city.pl.toLowerCase() === targetCity;
    if (!matchCity) return false;
    if (!targetCountry) return true;
    return (
      d.country.en.toLowerCase() === targetCountry ||
      d.country.pl.toLowerCase() === targetCountry ||
      d.country.code?.toLowerCase() === targetCountry
    );
  });
}

/** Kierunki kraju w KOLEJNOŚCI SEEDU — dokładnie jak listDestinationsInCountryLive. */
function countryCities(countryEn: string): TripSearchCity[] {
  return seed
    .filter((d) => d.country.en === countryEn)
    .map((d) => ({
      cityEn: d.city.en,
      countryEn: d.country.en,
      cityPl: d.city.pl,
      vibeTagsEn: d.vibeTagsEn,
      popularity: d.popularity,
    }));
}

function entry(opts: {
  hotelPerNight: number;
  flight: number;
  pkg: number;
  checkin?: string;
  checkout?: string;
  computedAt?: number;
}) {
  const checkin = opts.checkin ?? "2026-08-10";
  const checkout = opts.checkout ?? "2026-08-17";
  const at = opts.computedAt ?? FRESH;
  return {
    hotelFromPlnPerNight: opts.hotelPerNight,
    checkin,
    checkout,
    computedAt: at,
    flightFromPln: opts.flight,
    flightDepart: checkin,
    flightReturn: checkout,
    flightComputedAt: at,
    pkgPerPersonPln: opts.pkg,
    pkgCheckin: checkin,
    pkgCheckout: checkout,
    pkgComputedAt: at,
  };
}

const hotel: CheapestHotel = {
  hotelId: "h1",
  name: "Hotel Testowy",
  totalPln: 2800,
  mainPhotoUrl: null,
  rating: 8.4,
  stars: 4,
  reviewCount: 900,
  address: "ul. Testowa 1",
  roomName: "Double",
  boardName: "BB",
  refundableTag: "RFN",
  cancellationDeadline: null,
  freeCancellationDeadline: null,
};

const flight: CheapestFlight = {
  totalPln: 1800,
  carrierName: "Test Air",
  outboundDepartureTime: "2026-08-10T06:00:00Z",
  inboundDepartureTime: "2026-08-17T18:00:00Z",
  stops: 0,
  outboundDurationMinutes: 200,
  inboundDurationMinutes: 210,
  hasCarryOnBag: true,
  hasCheckedBag: null,
  destinationIata: "AGP",
};

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    readSnapshot: async () => null,
    resolveDest: seedLookup,
    listDestinationsInCountry: () => [],
    findCheapestHotel: async () => null,
    findCheapestFlight: async () => null,
    fetchHotelPhotoUrls: async () => [],
    now: () => now,
    ...overrides,
  };
}

function toolCall(name: string, args: Record<string, unknown>) {
  return { id: "t1", type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
}

// ── A. tyle nocy, ile poprosił użytkownik ────────────────────────────────────

test("A: nights=7 → kandydaci wyceniani i opisani na 7 nocy, nie na okno snapshotu", async () => {
  // Snapshot ma okno 4-nocne (tak wygląda produkcja: 33 z 45 kierunków).
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: entry({
      hotelPerNight: 300, flight: 900, pkg: 1500,
      checkin: "2026-08-10", checkout: "2026-08-14",
    }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({
      readSnapshot: async () => snap,
      listDestinationsInCountry: () => countryCities("Spain"),
    }),
  );
  const res = (await executeSearchTrips({
    country: "Spain", budgetPln: 5000, budgetKind: "per_person",
    adults: 2, nights: 7, wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ nights: number | null; perPersonPln: number | null }> };

  const malaga = res.candidates[0];
  assert.ok(malaga, "Malaga musi być kandydatem");
  assert.equal(malaga.nights, 7, "liczba nocy MUSI odpowiadać prośbie użytkownika");
  // lot 900 + 7 nocy × 300/2 = 900 + 1050 = 1950 (ceil) — liczone ze SKŁADOWYCH
  assert.equal(malaga.perPersonPln, 1950, "cena musi dotyczyć 7 nocy, nie 4 ze snapshotu");
});

// ── B. kraj + motyw: oba sygnały przeżywają ──────────────────────────────────

test("B: Hiszpania + góry → kierunek górski PRZED tańszym miejskim (motyw nie ginie)", async () => {
  // Barcelona jest TAŃSZA, ale to nie jest wyjazd „w góry". Teneryfa jest
  // ręcznie wybranym pickiem motywu `gory` i jako jedyna w Hiszpanii ma tag
  // `nature` — czyli dokładnie ten przypadek, w którym dane rozróżniają.
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Barcelona", "Spain")]: entry({ hotelPerNight: 200, flight: 700, pkg: 1000 }),
    [destinationPriceKey("Santa Cruz de Tenerife", "Spain")]: entry({ hotelPerNight: 260, flight: 900, pkg: 1400 }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Spain") }),
  );
  const res = (await executeSearchTrips({
    country: "Hiszpania", theme: "gory", budgetPln: 5000, budgetKind: "per_person",
    adults: 2, wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ cityEn: string; themeMatch: boolean | null }>; note?: string };

  const cities = res.candidates.map((c) => c.cityEn);
  assert.equal(cities[0], "Santa Cruz de Tenerife", `motyw musi wygrać z niższą ceną: ${cities.join(", ")}`);
  assert.ok(cities.includes("Barcelona"), "motyw to preferencja, nie filtr twardy — Barcelona zostaje");
  assert.equal(res.candidates[0].themeMatch, true);
  assert.equal(res.candidates[1].themeMatch, false, "model musi wiedzieć, że alternatywa ma inny charakter");
  assert.match(String(res.note), /themeMatch/, "nota musi opisywać PRAWDZIWĄ kolejność listy");
});

test("B2: bez motywu kolejność jest czysto cenowa, a nota tak właśnie mówi", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Barcelona", "Spain")]: entry({ hotelPerNight: 200, flight: 700, pkg: 1000 }),
    [destinationPriceKey("Santa Cruz de Tenerife", "Spain")]: entry({ hotelPerNight: 260, flight: 900, pkg: 1400 }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Spain") }),
  );
  const res = (await executeSearchTrips({
    country: "Hiszpania", budgetPln: 5000, budgetKind: "per_person",
    adults: 2, wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ cityEn: string; themeMatch: boolean | null }>; note?: string };

  assert.deepEqual(res.candidates.map((c) => c.cityEn), ["Barcelona", "Santa Cruz de Tenerife"]);
  assert.equal(res.candidates[0].themeMatch, null, "bez motywu nie udajemy dopasowania");
  assert.match(String(res.note), /od najtańszego/);
});

test("B3: GRANICA SYGNAŁU — w Grecji tag `beach` mają WSZYSTKIE kierunki, więc decyduje cena", async () => {
  // To nie jest życzenie, tylko zapis POMIARU (2026-09-06): osiem wygrzanych
  // kierunków w Grecji ma tag `beach`, więc „Grecja na plażę" nie ma czego
  // przestawiać i kolejność zostaje cenowa. Test istnieje po to, żeby nikt
  // nie „naprawiał" tego wymyślonym współczynnikiem — i żeby zmiana danych
  // seedu (gdyby tagi kiedyś zaczęły rozróżniać) była widoczna.
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Athens", "Greece")]: entry({ hotelPerNight: 200, flight: 700, pkg: 1000 }),
    [destinationPriceKey("Rhodes", "Greece")]: entry({ hotelPerNight: 260, flight: 900, pkg: 1400 }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Greece") }),
  );
  const res = (await executeSearchTrips({
    country: "Grecja", theme: "plaza", budgetPln: 5000, budgetKind: "per_person",
    adults: 2, wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ cityEn: string; themeMatch: boolean | null }> };

  assert.deepEqual(res.candidates.map((c) => c.cityEn), ["Athens", "Rhodes"]);
  for (const c of res.candidates) {
    assert.equal(c.themeMatch, true, `${c.cityEn}: seed uznaje ten kierunek za plażowy`);
  }
});

test("B4: kraj BEZ plaż + motyw plaża → model dostaje themeMatch=false, nie ciszę", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Vienna", "Austria")]: entry({ hotelPerNight: 200, flight: 700, pkg: 1000 }),
    [destinationPriceKey("Innsbruck", "Austria")]: entry({ hotelPerNight: 260, flight: 900, pkg: 1400 }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Austria") }),
  );
  const res = (await executeSearchTrips({
    country: "Austria", theme: "plaza", budgetPln: 5000, budgetKind: "per_person",
    adults: 2, wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ cityEn: string; themeMatch: boolean | null }> };

  assert.ok(res.candidates.length >= 2);
  for (const c of res.candidates) {
    assert.equal(c.themeMatch, false, `${c.cityEn} nie jest kierunkiem plażowym`);
  }
});

// ── C. budżet nie jest przekraczany po cichu ─────────────────────────────────

test("C: budżet 4000/os. — kandydat za 4200 nie wchodzi na listę", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: entry({ hotelPerNight: 300, flight: 900, pkg: 4200 }),
    [destinationPriceKey("Alicante", "Spain")]: entry({ hotelPerNight: 200, flight: 700, pkg: 3800 }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Spain") }),
  );
  const res = (await executeSearchTrips({
    country: "Spain", budgetPln: 4000, budgetKind: "per_person", adults: 2,
    wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ cityEn: string; perPersonPln: number | null; zapasPln: number | null }> };

  for (const c of res.candidates) {
    assert.ok((c.perPersonPln ?? 0) <= 4000, `${c.cityEn} = ${c.perPersonPln} zł przekracza budżet`);
    assert.ok((c.zapasPln ?? 0) >= 0, "zapas nie może być ujemny dla kandydata w budżecie");
  }
});

// ── D. hotel=null + lot=null NIE jest sukcesem ───────────────────────────────

test("D: brak hotelu I brak lotu → resultState 'unavailable', zero ceny", async () => {
  const { executeGetTripOffer } = createToolExecutors(makeDeps());
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17",
  });
  assert.equal(offer.hotel, null);
  assert.equal(offer.flight, null);
  assert.equal(offer.resultState, "unavailable");
  assert.equal(offer.totalPln, null);
  assert.equal(offer.totalPerPersonPln, null);
});

test("D2: pusta oferta NIE wraca jako karta — orkiestrator nie renderuje pustki", async () => {
  const executors = createToolExecutors(makeDeps());
  const { result, offer } = await dispatchToolCall(
    toolCall("get_trip_offer", {
      cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
      checkin: "2026-08-10", checkout: "2026-08-17",
    }),
    executors,
    createToolContext(),
  );
  assert.equal(offer, null, "pusta oferta nie może trafić do UI jako karta");
  const r = result as { resultState?: string; note?: string };
  assert.equal(r.resultState, "unavailable");
  assert.match(String(r.note ?? ""), /nie/i, "model musi dostać wprost, że oferty NIE MA");
});

test("D3: auto-oferta po search_trips bez hotelu i lotu → brak karty, lista zostaje", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: entry({ hotelPerNight: 300, flight: 900, pkg: 1500 }),
    [destinationPriceKey("Alicante", "Spain")]: entry({ hotelPerNight: 200, flight: 700, pkg: 1300 }),
  };
  const executors = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Spain") }),
  );
  const { result, offer } = await dispatchToolCall(
    toolCall("search_trips", {
      country: "Spain", budgetPln: 5000, budgetKind: "per_person", adults: 2,
      wantsFlight: true, wantsHotel: true,
    }),
    executors,
    createToolContext(),
  );
  assert.equal(offer, null, "karta pustej oferty nie może się pokazać");
  const r = result as { autoOffer?: unknown; candidates?: unknown[] };
  assert.equal(r.autoOffer, undefined, "pusta auto-oferta nie może trafić do modelu jako oferta");
  assert.ok((r.candidates?.length ?? 0) >= 2, "lista kandydatów musi zostać nietknięta");
});

// ── E/F. oferta częściowa ────────────────────────────────────────────────────

test("E: jest hotel, brak lotu → resultState 'partial', cena łączna null", async () => {
  const { executeGetTripOffer } = createToolExecutors(makeDeps({ findCheapestHotel: async () => hotel }));
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17",
  });
  assert.equal(offer.resultState, "partial");
  assert.equal(offer.hotel?.totalPln, 2800);
  assert.equal(offer.flight, null);
  assert.equal(offer.totalPerPersonPln, null, "brak chcianego składnika = brak ceny łącznej");
});

test("F: jest lot, brak hotelu → resultState 'partial'", async () => {
  const { executeGetTripOffer } = createToolExecutors(makeDeps({ findCheapestFlight: async () => flight }));
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17",
  });
  assert.equal(offer.resultState, "partial");
  assert.equal(offer.flight?.totalPln, 1800);
  assert.equal(offer.hotel, null);
  assert.equal(offer.totalPerPersonPln, null);
});

test("E2: sam hotel NA ŻYCZENIE (wantsFlight=false) to pełny wynik, nie częściowy", async () => {
  const { executeGetTripOffer } = createToolExecutors(makeDeps({ findCheapestHotel: async () => hotel }));
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17", wantsFlight: false,
  });
  assert.equal(offer.resultState, "valid");
  assert.equal(offer.totalPerPersonPln, 1400, "2800 zł hotelu na 2 osoby");
});

// ── G. ranking PRZED przycięciem ─────────────────────────────────────────────

test("G: kierunki z ceną spoza pierwszej szóstki seedu MUSZĄ trafić na listę", async () => {
  // Rodos (idx 6), Kos (idx 7), Zakynthos (idx 8) — dokładnie te, które
  // ścieżka `country` gubiła przez slice(0,6) PRZED rankingiem. Ateny (idx 0)
  // celowo droższe, żeby test nie przechodził „przypadkiem" po samej cenie.
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Athens", "Greece")]: entry({ hotelPerNight: 400, flight: 1400, pkg: 2800 }),
    [destinationPriceKey("Rhodes", "Greece")]: entry({ hotelPerNight: 200, flight: 700, pkg: 1100 }),
    [destinationPriceKey("Kos", "Greece")]: entry({ hotelPerNight: 210, flight: 750, pkg: 1200 }),
    [destinationPriceKey("Zakynthos", "Greece")]: entry({ hotelPerNight: 220, flight: 800, pkg: 1300 }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Greece") }),
  );
  const res = (await executeSearchTrips({
    country: "Grecja", budgetPln: 5000, budgetKind: "per_person", adults: 2,
    wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ cityEn: string }> };

  const cities = res.candidates.map((c) => c.cityEn);
  for (const expected of ["Rhodes", "Kos", "Zakynthos"]) {
    assert.ok(cities.includes(expected), `${expected} przepadło przed rankingiem: ${cities.join(", ")}`);
  }
  assert.equal(cities[0], "Rhodes", "najtańszy musi być pierwszy");
});

// ── H. świeżość ──────────────────────────────────────────────────────────────

test("H: wpis nieświeży (>48 h) nigdy nie wygrywa ze świeżym — nawet gdy tańszy", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Athens", "Greece")]: entry({ hotelPerNight: 100, flight: 300, pkg: 400, computedAt: STALE }),
    [destinationPriceKey("Rhodes", "Greece")]: entry({ hotelPerNight: 260, flight: 900, pkg: 1400 }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Greece") }),
  );
  const res = (await executeSearchTrips({
    country: "Grecja", budgetPln: 5000, budgetKind: "per_person", adults: 2,
    wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ cityEn: string }> };

  const cities = res.candidates.map((c) => c.cityEn);
  assert.ok(!cities.includes("Athens"), "nieświeża cena nie ma prawa się pokazać");
  assert.deepEqual(cities, ["Rhodes"]);
});

// ── I. kierunek użytkownika nie zostaje wyparty ──────────────────────────────

test("I: get_trip_offer dla wskazanego miasta zwraca TO miasto, nie tańsze inne", async () => {
  const { executeGetTripOffer } = createToolExecutors(
    makeDeps({ findCheapestHotel: async () => hotel, findCheapestFlight: async () => flight }),
  );
  const offer = await executeGetTripOffer({
    cityEn: "Rhodes", countryEn: "Greece", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17",
  });
  assert.equal(offer.cityEn, "Rhodes");
  assert.equal(offer.countryEn, "Greece");
  assert.equal(offer.resultState, "valid");
});

// ── J. brak dostępności nie generuje ceny ────────────────────────────────────

test("J: hotel bez taryfy → zero ceny hotelu w wyniku (żadnej liczby z powietrza)", async () => {
  const { executeGetTripOffer } = createToolExecutors(makeDeps({ findCheapestFlight: async () => flight }));
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17",
  });
  const serialized = JSON.stringify(offer);
  assert.equal(offer.hotel, null);
  assert.ok(!serialized.includes('"hotelTotalPln"'), "brak pola z ceną hotelu");
  assert.equal(offer.totalPln, null);
});

// ── §21: brak duplikatów pracy w JEDNEJ turze ────────────────────────────────

test("§21: search_trips + auto-oferta czytają snapshot RAZ, nie dwa razy", async () => {
  let reads = 0;
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: entry({ hotelPerNight: 300, flight: 900, pkg: 1500 }),
  };
  const executors = createToolExecutors(
    makeDeps({
      readSnapshot: async () => {
        reads += 1;
        return snap;
      },
      listDestinationsInCountry: () => countryCities("Spain"),
      findCheapestHotel: async () => hotel,
      findCheapestFlight: async () => flight,
    }),
  );
  await dispatchToolCall(
    toolCall("search_trips", {
      country: "Spain", budgetPln: 5000, budgetKind: "per_person", adults: 2,
      wantsFlight: true, wantsHotel: true,
    }),
    executors,
    createToolContext(),
  );
  assert.equal(reads, 1, `snapshot odczytany ${reads} razy w jednej turze`);
});

// ── §22: budżet czasu lotu wynika z TERMINU TURY, nie ze stałej ──────────────

test("§22: przy zdrowym budżecie lot dostaje pełny globalny budżet 23 s", async () => {
  let seenBudget: number | undefined;
  const { executeGetTripOffer } = createToolExecutors(
    makeDeps({
      findCheapestFlight: async (q) => {
        seenBudget = q.budgetMs;
        return flight;
      },
    }),
  );
  await executeGetTripOffer(
    { cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2, checkin: "2026-08-10", checkout: "2026-08-17" },
    createToolContext({ deadlineAt: now + 40_000 }),
  );
  assert.equal(seenBudget, 23_000);
});

test("§22: gdy tura się kończy, lot dostaje TYLE, ile zostało", async () => {
  let seenBudget: number | undefined;
  const { executeGetTripOffer } = createToolExecutors(
    makeDeps({
      findCheapestFlight: async (q) => {
        seenBudget = q.budgetMs;
        return flight;
      },
    }),
  );
  await executeGetTripOffer(
    { cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2, checkin: "2026-08-10", checkout: "2026-08-17" },
    createToolContext({ deadlineAt: now + 9_000 }),
  );
  assert.equal(seenBudget, 9_000, "limit musi kurczyć się razem z budżetem tury");
});

test("§20: hotel i lot lecą RÓWNOLEGLE, nie jeden po drugim", async () => {
  const started: string[] = [];
  let releaseHotel: (() => void) | null = null;
  const { executeGetTripOffer } = createToolExecutors(
    makeDeps({
      findCheapestHotel: async () => {
        started.push("hotel");
        await new Promise<void>((resolve) => {
          releaseHotel = resolve;
        });
        return hotel;
      },
      findCheapestFlight: async () => {
        started.push("flight");
        // Lot startuje MIMO że hotel jeszcze wisi — to jest cała teza testu.
        releaseHotel?.();
        return flight;
      },
    }),
  );
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17",
  });
  assert.deepEqual(started, ["hotel", "flight"]);
  assert.equal(offer.resultState, "valid");
});

// ── §30/§42: dopasowanie MIESIĄCA podane wprost, nie do wywnioskowania ───────

test("monthMatch=false gdy wycena pochodzi z innego miesiąca niż prośba", async () => {
  const snap: DestinationPriceSnapshot = {
    // Snapshot ma październik — użytkownik pyta o lipiec (7).
    [destinationPriceKey("Malaga", "Spain")]: entry({
      hotelPerNight: 300, flight: 900, pkg: 1500,
      checkin: "2026-10-19", checkout: "2026-10-23",
    }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Spain") }),
  );
  const res = (await executeSearchTrips({
    country: "Spain", month: 7, budgetPln: 5000, budgetKind: "per_person",
    adults: 2, wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ monthMatch: boolean | null }>; note?: string };

  assert.equal(res.candidates[0].monthMatch, false);
  assert.match(String(res.note), /monthMatch/, "nota musi kierować model na gotowe pole");
});

test("monthMatch=true gdy okno snapshotu trafia w miesiąc użytkownika", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: entry({
      hotelPerNight: 300, flight: 900, pkg: 1500,
      checkin: "2026-10-19", checkout: "2026-10-23",
    }),
  };
  const { executeSearchTrips } = createToolExecutors(
    makeDeps({ readSnapshot: async () => snap, listDestinationsInCountry: () => countryCities("Spain") }),
  );
  const res = (await executeSearchTrips({
    country: "Spain", month: 10, budgetPln: 5000, budgetKind: "per_person",
    adults: 2, wantsFlight: true, wantsHotel: true,
  })) as { candidates: Array<{ monthMatch: boolean | null }> };

  assert.equal(res.candidates[0].monthMatch, true);
});

// ── HOTFIX V2.1a: stan składników, narracja częściowa, jednostki ceny ───────
// Incydent produkcyjny 2026-09-06: przy ofercie bez lotu bot napisał „lot
// jeszcze się wczytuje — zaraz będzie dostępny w karcie" (NIEPRAWDA — żądanie
// padło na limicie i nikt go nie ponawia), nazwał 722 zł „na osobę za noc"
// (to była cena za CAŁY pobyt na osobę) i policzył zapas do budżetu od ceny
// samego hotelu, jakby to była kompletna oferta.

test("§4: brak lotu → flightStatus 'unavailable', nigdy stan sugerujący ładowanie", async () => {
  const { executeGetTripOffer } = createToolExecutors(makeDeps({ findCheapestHotel: async () => hotel }));
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17",
  });
  assert.equal(offer.flightStatus, "unavailable");
  assert.equal(offer.hotelStatus, "confirmed");
  assert.doesNotMatch(JSON.stringify(offer), /loading|wczytuj|ładuj|ladowan/i);
});

test("§4: oba składniki realne → oba 'confirmed'", async () => {
  const { executeGetTripOffer } = createToolExecutors(
    makeDeps({ findCheapestHotel: async () => hotel, findCheapestFlight: async () => flight }),
  );
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17",
  });
  assert.equal(offer.flightStatus, "confirmed");
  assert.equal(offer.hotelStatus, "confirmed");
});

test("§4: składnik, którego user NIE chciał → 'not_requested', nie 'unavailable'", async () => {
  const { executeGetTripOffer } = createToolExecutors(makeDeps({ findCheapestHotel: async () => hotel }));
  const offer = await executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
    checkin: "2026-08-10", checkout: "2026-08-17", wantsFlight: false,
  });
  assert.equal(offer.flightStatus, "not_requested");
  assert.equal(offer.resultState, "valid");
});

test("§4: nota dla modelu przy braku lotu MÓWI, że nic się już nie doczyta", async () => {
  const executors = createToolExecutors(makeDeps({ findCheapestHotel: async () => hotel }));
  const { result } = await dispatchToolCall(
    toolCall("get_trip_offer", {
      cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
      checkin: "2026-08-10", checkout: "2026-08-17", budgetPln: 3000, budgetKind: "per_person",
    }),
    executors,
    createToolContext(),
  );
  const note = String((result as { note?: string }).note ?? "");
  assert.match(note, /nie (jest|będzie) (już )?(wyszukiwan|szukan)/i, "nota musi zaprzeczyć ładowaniu w tle");
  assert.match(note, /nie uzupełni się sama|nie dopisze się/i, "nota musi zaprzeczyć samouzupełnieniu karty");
});

test("§5: oferta częściowa NIE dostaje ceny pakietu ani zapasu budżetu", async () => {
  const executors = createToolExecutors(makeDeps({ findCheapestHotel: async () => hotel }));
  const { result } = await dispatchToolCall(
    toolCall("get_trip_offer", {
      cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
      checkin: "2026-08-10", checkout: "2026-08-17", budgetPln: 3000, budgetKind: "per_person",
    }),
    executors,
    createToolContext(),
  );
  const r = result as Record<string, unknown>;
  assert.equal(r.totalPln, null, "brak lotu = brak ceny całego wyjazdu");
  assert.equal(r.totalPerPersonPln, null);
  assert.equal(r.budgetFit, undefined, "zapasu do budżetu NIE liczymy od samego hotelu");
  assert.match(String(r.note), /zapas|budżet/i, "nota musi wprost zakazać liczenia zapasu");
});

test("§6: model dostaje JEDNOZNACZNE jednostki ceny hotelu, nie musi ich zgadywać", async () => {
  // Dokładnie liczby z incydentu: 1445 zł, 7 nocy, 2 osoby.
  const incydent: CheapestHotel = { ...hotel, totalPln: 1445 };
  const executors = createToolExecutors(makeDeps({ findCheapestHotel: async () => incydent }));
  const { result } = await dispatchToolCall(
    toolCall("get_trip_offer", {
      cityEn: "Larnaca", countryEn: "Cyprus", origin: "WAW", adults: 2,
      checkin: "2026-10-19", checkout: "2026-10-26",
    }),
    executors,
    createToolContext(),
  );
  const pf = (result as { priceFacts?: Record<string, unknown> }).priceFacts;
  assert.ok(pf, "wynik musi nieść priceFacts");
  assert.equal(pf.hotelTotalPln, 1445, "cena za CAŁY pobyt, wszyscy goście");
  assert.equal(pf.hotelPerPersonPln, 723, "1445 / 2 osoby, w górę");
  assert.equal(pf.hotelPerNightPln, 206, "1445 / 7 nocy");
  assert.equal(pf.nights, 7);
  assert.equal(pf.pax, 2);
  assert.match(String(pf.note), /nie przeliczaj|nie licz/i, "nota musi zakazać własnych przeliczeń");
});

test("§6: bez znanej liczby nocy NIE podajemy ceny za noc (zamiast zgadywać)", async () => {
  const executors = createToolExecutors(
    makeDeps({ findCheapestHotel: async () => hotel, findCheapestFlight: async () => flight }),
  );
  const { result } = await dispatchToolCall(
    toolCall("get_trip_offer", {
      cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
      checkin: "2026-08-10", checkout: "2026-08-11",
    }),
    executors,
    createToolContext(),
  );
  const pf = (result as { priceFacts?: Record<string, unknown> }).priceFacts!;
  assert.equal(pf.nights, 1);
  assert.equal(pf.hotelPerNightPln, 2800, "1 noc → cena za noc = cały pobyt");
});
