// Testy egzekutorów narzędzi AI Concierge (Task 2.2). Wszystkie I/O idą przez
// WSTRZYKNIĘTE mocki (ToolDeps) — zero sieci, zero Redis, zero LiteAPI.
//
// Uczciwość pod testem: każda kwota w wyniku egzekutora musi być DOKŁADNIE
// wartością z mocka (snapshot / findCheapest*) — egzekutor nie ma prawa niczego
// doliczyć ani zgadnąć. Brak komponentu → null + partial:true, nigdy wymysł.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { DestinationPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import { destinationPriceKey } from "@/lib/prices/destination-price-snapshot";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import seedJson from "../../../data/destinations.json";
import { resolveThemeCities, type SeedDestinationLike } from "./trip-search";
import { createToolExecutors, type CheapestFlight, type CheapestHotel, type ToolDeps } from "./tools";

// Lookup seedu do wstrzyknięcia — ta sama semantyka co getDestinationByCityCountry
// z @/lib/mvp/destinations-seed (wzorzec z trip-search.test.ts; tamtego modułu
// nie importujemy wprost, bo `import "server-only"` wywala node:test).
interface SeedDestRecord extends SeedDestinationLike {
  country: { code: string | null; en: string; pl: string };
}
const seedDestinations = (seedJson as { destinations: SeedDestRecord[] }).destinations;
function seedLookup(city: string, country?: string): SeedDestRecord | undefined {
  const targetCity = city.trim().toLowerCase();
  const targetCountry = country?.trim().toLowerCase();
  return seedDestinations.find((d) => {
    const matchCity =
      d.city.en.toLowerCase() === targetCity || d.city.pl.toLowerCase() === targetCity;
    if (!matchCity) return false;
    if (!targetCountry) return true;
    return (
      d.country.en.toLowerCase() === targetCountry ||
      d.country.pl.toLowerCase() === targetCountry ||
      d.country.code?.toLowerCase() === targetCountry
    );
  });
}

const now = Date.UTC(2026, 6, 7);

function pkgEntry(pkg: number) {
  return {
    hotelFromPlnPerNight: 200, checkin: "2026-08-10", checkout: "2026-08-17", computedAt: now,
    flightFromPln: 900, flightDepart: "2026-08-10", flightReturn: "2026-08-17", flightComputedAt: now,
    pkgPerPersonPln: pkg, pkgCheckin: "2026-08-10", pkgCheckout: "2026-08-17", pkgComputedAt: now,
  };
}

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    readSnapshot: async () => null,
    resolveDest: seedLookup,
    listDestinationsInCountry: () => [],
    findCheapestHotel: async () => null,
    findCheapestFlight: async () => null,
    now: () => now,
    ...overrides,
  };
}

// Realny motyw + jego kierunki rozwiązane przez seed (jak w produkcji).
const THEME = TRAVEL_MOODS[0].slug;
const themeCities = resolveThemeCities(THEME, seedLookup);

const searchArgs = {
  theme: THEME, budgetPln: 2000, budgetKind: "per_person", month: 8,
  adults: 2, wantsFlight: true, wantsHotel: true,
};

// ── executeSearchTrips ───────────────────────────────────────────────────────

test("executeSearchTrips: tylko kierunki w budżecie, kwoty DOKŁADNIE ze snapshotu, brak pakietu → pomijany", async () => {
  assert.ok(themeCities.length >= 3, "fixture sanity: motyw ma ≥3 kierunki");
  const [c0, c1, c2] = themeCities;
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey(c0.cityEn, c0.countryEn)]: pkgEntry(1500), // w budżecie
    [destinationPriceKey(c1.cityEn, c1.countryEn)]: pkgEntry(2600), // ponad budżet
    // c2: wpis TYLKO z ceną hotelu, BEZ pól pkg* → kierunek musi zniknąć
    [destinationPriceKey(c2.cityEn, c2.countryEn)]: {
      hotelFromPlnPerNight: 150, checkin: "2026-08-10", checkout: "2026-08-17", computedAt: now,
    },
  };
  const exec = createToolExecutors(makeDeps({ readSnapshot: async () => snap }));

  const out = await exec.executeSearchTrips(searchArgs);
  assert.equal(out.candidates.length, 1);
  const cand = out.candidates[0];
  assert.equal(cand.cityEn, c0.cityEn);
  // Kwota pakietu 1:1 ze snapshotu — nic doliczonego, nic zgadniętego.
  assert.equal(cand.perPersonPln, 1500);
  assert.equal(cand.checkin, "2026-08-10");
  assert.equal(cand.checkout, "2026-08-17");
  // Kształt DLA MODELU: BEZ cen jednostkowych (lot/os., hotel/noc) — model
  // sumował je błędnie po swojemu (realny incydent z preview). Ma dostać
  // wyłącznie gotową cenę pakietu + notę interpretacyjną.
  assert.equal("hotelFromPlnPerNight" in cand, false);
  assert.equal("flightFromPln" in cand, false);
  assert.ok(typeof out.note === "string" && out.note.includes("ORIENTACYJNA"));
});

test("executeSearchTrips: BEZ budżetu → szuka bez limitu, od najtańszego + nota o dopytaniu", async () => {
  // Klient niekonkretny („najtaniej jak się da") — budżet nie może blokować
  // wyszukiwania; miesiąc/osoby nadal wymagane.
  assert.ok(themeCities.length >= 2, "fixture sanity");
  const [c0, c1] = themeCities;
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey(c0.cityEn, c0.countryEn)]: pkgEntry(4200),
    [destinationPriceKey(c1.cityEn, c1.countryEn)]: pkgEntry(1900),
  };
  const exec = createToolExecutors(makeDeps({ readSnapshot: async () => snap }));

  const noBudgetArgs = { theme: THEME, month: 8, adults: 2, wantsFlight: true, wantsHotel: true };
  const out = await exec.executeSearchTrips(noBudgetArgs);
  assert.equal(out.reason, undefined); // NIE blokujemy dopytywaniem o budżet
  assert.equal(out.candidates.length, 2);
  assert.equal(out.candidates[0].perPersonPln, 1900); // od najtańszego
  assert.ok(out.note!.includes("NIE podał budżetu"));

  // Kwota BEZ interpretacji (budgetKind) → nadal dopytanie (niejednoznaczne),
  // z anty-ankietową instrukcją formy.
  const ambiguous = await exec.executeSearchTrips({ ...noBudgetArgs, budgetPln: 3000 });
  assert.ok(ambiguous.reason && ambiguous.reason.includes("budgetKind"));
  assert.ok(ambiguous.reason.includes("Nigdy listą numerowaną"));
});

test("executeSearchTrips: budżet „łącznie” dzielony przez WSZYSTKICH (rodzina 2+1), nie przez 2", async () => {
  assert.ok(themeCities.length >= 2, "fixture sanity");
  const [c0, c1] = themeCities;
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey(c0.cityEn, c0.countryEn)]: pkgEntry(2242), // > 6000/3 → poza progiem
    [destinationPriceKey(c1.cityEn, c1.countryEn)]: pkgEntry(1900), // ≤ 2000 → w progu
  };
  const exec = createToolExecutors(makeDeps({ readSnapshot: async () => snap }));
  const out = await exec.executeSearchTrips({
    ...searchArgs, budgetPln: 6000, budgetKind: "total_two", adults: 2, children: 1,
  });
  assert.equal(out.candidates.length, 1);
  assert.equal(out.candidates[0].perPersonPln, 1900);
});

test("executeSearchTrips: zwraca maksymalnie 5 kandydatów", async () => {
  assert.ok(themeCities.length >= 6, "fixture sanity: motyw ma ≥6 kierunków");
  const snap: DestinationPriceSnapshot = Object.fromEntries(
    themeCities.map((c, i) => [destinationPriceKey(c.cityEn, c.countryEn), pkgEntry(1000 + i * 100)]),
  );
  const exec = createToolExecutors(makeDeps({ readSnapshot: async () => snap }));
  const out = await exec.executeSearchTrips({ ...searchArgs, budgetPln: 99_999 });
  assert.equal(out.candidates.length, 5);
  // Top 5 = najtańsze (rank sortuje rosnąco).
  assert.deepEqual(out.candidates.map((c) => c.perPersonPln), [1000, 1100, 1200, 1300, 1400]);
});

test("executeSearchTrips: pusty wynik → candidates:[] + niepusty reason", async () => {
  const [c0] = themeCities;
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey(c0.cityEn, c0.countryEn)]: pkgEntry(1500),
  };
  const exec = createToolExecutors(makeDeps({ readSnapshot: async () => snap }));

  // Budżet poniżej wszystkiego → pusto z powodem.
  const belowBudget = await exec.executeSearchTrips({ ...searchArgs, budgetPln: 100 });
  assert.deepEqual(belowBudget.candidates, []);
  assert.ok(typeof belowBudget.reason === "string" && belowBudget.reason.length > 0);

  // Snapshot niedostępny (null) → pusto z powodem, bez rzucania.
  const noSnap = await createToolExecutors(makeDeps()).executeSearchTrips(searchArgs);
  assert.deepEqual(noSnap.candidates, []);
  assert.ok(typeof noSnap.reason === "string" && noSnap.reason.length > 0);

  // Brak wymaganych pól (model nie dopytał) → pusto z powodem, bez rzucania.
  const missing = await exec.executeSearchTrips({ theme: THEME });
  assert.deepEqual(missing.candidates, []);
  assert.ok(typeof missing.reason === "string" && missing.reason.length > 0);
});

// ── executeGetTripOffer ──────────────────────────────────────────────────────

const HOTEL: CheapestHotel = {
  hotelId: "lp19abc", name: "Hotel Testowy", totalPln: 2400, mainPhotoUrl: null, rating: 8.7,
};
const FLIGHT: CheapestFlight = {
  totalPln: 1300, carrierName: "Ryanair", outboundDepartureTime: "2026-08-10T06:00:00",
  inboundDepartureTime: "2026-08-17T21:00:00", stops: 0, destinationIata: "AGP",
};
const offerArgs = {
  cityEn: "Malaga", countryEn: "Spain", checkin: "2026-08-10", checkout: "2026-08-17",
  origin: "WAW", adults: 2, children: 1,
};

test("executeGetTripOffer: oba komponenty → realne kwoty z mocków, per-osobę policzone, partial:false, URL-e z parametrami", async () => {
  const exec = createToolExecutors(makeDeps({
    resolveDest: () => ({ city: { en: "Malaga", pl: "Małaga" }, country: { en: "Spain" } }),
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  }));
  const offer = await exec.executeGetTripOffer(offerArgs);

  assert.equal(offer.partial, false);
  assert.equal(offer.cityPl, "Małaga");
  assert.equal(offer.originIata, "WAW");

  // Hotel: identyfikator i kwota 1:1 z mocka.
  assert.ok(offer.hotel);
  assert.equal(offer.hotel.hotelId, "lp19abc");
  assert.equal(offer.hotel.name, "Hotel Testowy");
  assert.equal(offer.hotel.totalPln, 2400);
  assert.equal(offer.hotel.rating, 8.7);
  // Handoff hotelu: kontrakt /hotele/[hotelId] (checkin/checkout/adults/rooms);
  // dzieci liczone jak dorośli downstream (decyzja produktowa mini-plannera) → adults=3.
  assert.ok(offer.hotel.url.startsWith("/hotele/lp19abc?"));
  for (const frag of ["checkin=2026-08-10", "checkout=2026-08-17", "adults=3", "rooms=1"]) {
    assert.ok(offer.hotel.url.includes(frag), `hotel.url zawiera ${frag}: ${offer.hotel.url}`);
  }

  // Lot: kwota 1:1 z mocka (total za WSZYSTKICH pasażerów).
  assert.ok(offer.flight);
  assert.equal(offer.flight.totalPln, 1300);
  assert.equal(offer.flight.carrierName, "Ryanair");
  assert.equal(offer.flight.stops, 0);
  // Handoff lotów: format buildResultsUrl (/loty/wyniki + origin/destination/depart/return/adults/children).
  assert.ok(offer.flight.url.startsWith("/loty/wyniki?"));
  for (const frag of ["origin=WAW", "destination=AGP", "depart=2026-08-10", "return=2026-08-17", "adults=2", "children=1"]) {
    assert.ok(offer.flight.url.includes(frag), `flight.url zawiera ${frag}: ${offer.flight.url}`);
  }

  // Per-osobę: ceil((hotel_total + lot_total) / (adults+children)) — konwencja
  // computePackagePerPerson uogólniona na realną liczbę osób. ceil(3700/3)=1234.
  assert.equal(offer.totalPerPersonPln, 1234);
});

test("executeGetTripOffer: awaria hotelu → hotel:null, lot zostaje, partial:true, per-osobę null", async () => {
  // Wariant 1: deps rzuca (Promise.allSettled — nie może zabić lotu).
  const execThrow = createToolExecutors(makeDeps({
    findCheapestHotel: async () => { throw new Error("LiteAPI down"); },
    findCheapestFlight: async () => FLIGHT,
  }));
  const offer = await execThrow.executeGetTripOffer(offerArgs);
  assert.equal(offer.hotel, null);
  assert.ok(offer.flight);
  assert.equal(offer.flight.totalPln, 1300);
  assert.equal(offer.partial, true);
  assert.equal(offer.totalPerPersonPln, null); // nie zgadujemy sumy bez obu składników

  // Wariant 2: deps uczciwie zwraca null (brak dostępności) — to samo zachowanie.
  const execNull = createToolExecutors(makeDeps({
    findCheapestHotel: async () => null,
    findCheapestFlight: async () => FLIGHT,
  }));
  const offer2 = await execNull.executeGetTripOffer(offerArgs);
  assert.equal(offer2.hotel, null);
  assert.ok(offer2.flight);
  assert.equal(offer2.partial, true);
  assert.equal(offer2.totalPerPersonPln, null);
});

test("executeGetTripOffer: brak lotniska (findCheapestFlight → null) → flight:null, hotel zostaje", async () => {
  const exec = createToolExecutors(makeDeps({
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => null, // uczciwe: miasto bez mapowania IATA
  }));
  const offer = await exec.executeGetTripOffer(offerArgs);
  assert.ok(offer.hotel);
  assert.equal(offer.flight, null);
  assert.equal(offer.partial, true);
  assert.equal(offer.totalPerPersonPln, null);
});

test("executeGetTripOffer: naprawdę nieprawidłowe argumenty → rzuca (nie zwraca zmyślonej oferty)", async () => {
  const exec = createToolExecutors(makeDeps({
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  }));
  await assert.rejects(() => exec.executeGetTripOffer({ ...offerArgs, cityEn: "" }));
  await assert.rejects(() => exec.executeGetTripOffer({ ...offerArgs, checkin: "10.08.2026" }));
  await assert.rejects(() => exec.executeGetTripOffer({ ...offerArgs, checkout: "2026-08-01" })); // checkout ≤ checkin
  await assert.rejects(() => exec.executeGetTripOffer({ ...offerArgs, origin: "Warszawa" }));
  await assert.rejects(() => exec.executeGetTripOffer({ ...offerArgs, adults: 0 }));
});

// ── executeListThemes ────────────────────────────────────────────────────────

test("executeListThemes: wszystkie slugi TRAVEL_MOODS z etykietami", () => {
  const exec = createToolExecutors(makeDeps());
  const out = exec.executeListThemes();
  assert.deepEqual(
    out.themes,
    TRAVEL_MOODS.map((m) => ({ slug: m.slug, label: m.label })),
  );
});

// ── Daty należą do NAS, nie do LLM (halucynacja roku z tekstu rozmowy) ───────
// Model potrafi odtworzyć daty z tekstu („12.09" → zgaduje 2024 = przeszłość).
// Kontrakt: daty z przeszłości/nieobecne → egzekutor bierze świeże daty
// pakietu ze snapshotu; brak świeżego pakietu → jasny błąd (nie zmyślamy).

test("executeGetTripOffer: checkin w przeszłości → daty ze snapshotu (nie z modelu)", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: pkgEntry(1500), // pkg 2026-08-10..17
  };
  const exec = createToolExecutors(makeDeps({
    readSnapshot: async () => snap,
    resolveDest: () => ({ city: { en: "Malaga", pl: "Małaga" }, country: { en: "Spain" } }),
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  }));
  const offer = await exec.executeGetTripOffer({
    ...offerArgs,
    checkin: "2024-09-12", // przeszłość vs now() fixture (2026-07-07)
    checkout: "2024-09-19",
  });
  assert.equal(offer.checkin, "2026-08-10");
  assert.equal(offer.checkout, "2026-08-17");
  assert.ok(offer.hotel!.url.includes("checkin=2026-08-10"));
  assert.ok(offer.flight!.url.includes("depart=2026-08-10"));
});

test("executeGetTripOffer: brak dat od modelu → daty ze snapshotu", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Malaga", "Spain")]: pkgEntry(1500),
  };
  const exec = createToolExecutors(makeDeps({
    readSnapshot: async () => snap,
    resolveDest: () => ({ city: { en: "Malaga", pl: "Małaga" }, country: { en: "Spain" } }),
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  }));
  const offer = await exec.executeGetTripOffer({
    cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2,
  });
  assert.equal(offer.checkin, "2026-08-10");
  assert.equal(offer.checkout, "2026-08-17");
});

test("executeGetTripOffer: month/nights użytkownika → daty w JEGO miesiącu (live, bez snapshotu)", async () => {
  const exec = createToolExecutors(makeDeps({
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  })); // readSnapshot → null: daty z month/nights NIE potrzebują snapshotu
  // now() fixture = 2026-07-07 → grudzień 2026 jest w przyszłości.
  const offer = await exec.executeGetTripOffer({
    cityEn: "Larnaca", countryEn: "Cyprus", origin: "WAW", adults: 2,
    month: 12, nights: 3,
  });
  assert.equal(offer.checkin, "2026-12-10");
  assert.equal(offer.checkout, "2026-12-13");
  assert.ok(offer.hotel!.url.includes("checkin=2026-12-10"));
  assert.ok(offer.flight!.url.includes("depart=2026-12-10"));
});

test("executeGetTripOffer: month = BIEŻĄCY miesiąc → najbliższy termin w TYM miesiącu, nie za rok", async () => {
  // Realny incydent: 10 lipca użytkownik prosi o „lipiec" → stara logika
  // skakała na lipiec NASTĘPNEGO roku (poza horyzontem sprzedaży lotów GDS
  // → karta bez lotu). now() fixture = 2026-07-07 → minStart = 2026-07-14.
  const exec = createToolExecutors(makeDeps({
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  }));
  const offer = await exec.executeGetTripOffer({
    cityEn: "Larnaca", countryEn: "Cyprus", origin: "WAW", adults: 2, month: 7, nights: 7,
  });
  assert.equal(offer.checkin, "2026-07-14");
  assert.equal(offer.checkout, "2026-07-21");
});

test("executeGetTripOffer: month już miniony w tym roku → następny rok (nie przeszłość)", async () => {
  const exec = createToolExecutors(makeDeps({
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  }));
  // now() fixture = 2026-07-07 → marzec 2026 minął → marzec 2027.
  const offer = await exec.executeGetTripOffer({
    cityEn: "Larnaca", countryEn: "Cyprus", origin: "WAW", adults: 2, month: 3,
  });
  assert.equal(offer.checkin, "2027-03-10");
  assert.equal(offer.checkout, "2027-03-17"); // domyślnie 7 nocy
});

test("executeGetTripOffer: brak dat i brak świeżego pakietu → błąd kierujący do search_trips", async () => {
  const exec = createToolExecutors(makeDeps({
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  })); // readSnapshot → null
  await assert.rejects(
    () => exec.executeGetTripOffer({ cityEn: "Malaga", countryEn: "Spain", origin: "WAW", adults: 2 }),
    /search_trips/,
  );
});

// ── Aliasy wysp (realny incydent: „A coś na Majorce?" → karta MADRYTU) ───────

test("executeGetTripOffer: wyspa od modelu (Majorka) → kanoniczne miasto seedu we WSZYSTKICH lookupach", async () => {
  const hotelQueries: Array<{ cityEn: string; countryEn: string }> = [];
  const flightQueries: Array<{ cityEn: string; countryEn: string }> = [];
  const exec = createToolExecutors(makeDeps({
    findCheapestHotel: async (q) => {
      hotelQueries.push({ cityEn: q.cityEn, countryEn: q.countryEn });
      return HOTEL;
    },
    findCheapestFlight: async (q) => {
      flightQueries.push({ cityEn: q.cityEn, countryEn: q.countryEn });
      return FLIGHT;
    },
  }));

  const offer = await exec.executeGetTripOffer({
    cityEn: "Majorka", countryEn: "Hiszpania", origin: "WAW", adults: 2, month: 10, nights: 5,
  });
  // Kanoniczne nazwy seedu (data/destinations.json: palma-spain) + polska etykieta.
  assert.equal(offer.cityEn, "Palma");
  assert.equal(offer.countryEn, "Spain");
  assert.equal(offer.cityPl, "Palma de Mallorca");
  // Lookupy LiteAPI dostają ZNORMALIZOWANE nazwy — nie surowe „Majorka".
  assert.deepEqual(hotelQueries[0], { cityEn: "Palma", countryEn: "Spain" });
  assert.deepEqual(flightQueries[0], { cityEn: "Palma", countryEn: "Spain" });
});

test("executeGetTripOffer: Kreta/Crete → Heraklion (Greece)", async () => {
  const exec = createToolExecutors(makeDeps({
    findCheapestHotel: async () => HOTEL,
    findCheapestFlight: async () => FLIGHT,
  }));
  for (const cityEn of ["Kreta", "Crete"]) {
    const offer = await exec.executeGetTripOffer({
      cityEn, countryEn: "Greece", origin: "WAW", adults: 2, month: 10,
    });
    assert.equal(offer.cityEn, "Heraklion");
    assert.equal(offer.countryEn, "Greece");
  }
});

// ── Wyszukiwanie po KRAJU (realny incydent: „chcę Grecję" → fałszywe „brak") ──

const GREEK_CITIES = [
  { cityEn: "Athens", countryEn: "Greece", cityPl: "Ateny" },
  { cityEn: "Heraklion", countryEn: "Greece", cityPl: "Heraklion" },
  { cityEn: "Rhodes", countryEn: "Greece", cityPl: "Rodos" },
  { cityEn: "Corfu", countryEn: "Greece", cityPl: "Korfu" },
];

test("executeSearchTrips: country ze snapshotem → kandydaci z tego kraju w budżecie", async () => {
  const snap: DestinationPriceSnapshot = {
    [destinationPriceKey("Athens", "Greece")]: pkgEntry(2100),
    [destinationPriceKey("Rhodes", "Greece")]: pkgEntry(9000), // ponad budżet
  };
  const exec = createToolExecutors(makeDeps({
    readSnapshot: async () => snap,
    listDestinationsInCountry: (c) => (c.toLowerCase() === "grecja" ? GREEK_CITIES : []),
  }));
  const out = await exec.executeSearchTrips({
    country: "Grecja", budgetPln: 5000, budgetKind: "total_two", month: 9,
    adults: 2, wantsFlight: true, wantsHotel: true,
  });
  assert.equal(out.candidates.length, 1);
  assert.equal(out.candidates[0].cityEn, "Athens");
  assert.equal(out.candidates[0].perPersonPln, 2100);
});

test("executeSearchTrips: country BEZ cen w snapshotcie → kandydaci bez cen (żywa oferta), nie odmowa", async () => {
  const exec = createToolExecutors(makeDeps({
    listDestinationsInCountry: (c) => (c.toLowerCase() === "grecja" ? GREEK_CITIES : []),
  })); // readSnapshot → null
  const out = await exec.executeSearchTrips({
    country: "Grecja", budgetPln: 5000, budgetKind: "total_two", month: 9,
    adults: 2, wantsFlight: true, wantsHotel: true,
  });
  assert.equal(out.reason, undefined); // NIE odmawiamy
  assert.equal(out.candidates.length, 3); // top-3 z seedu (kolejność popularności)
  assert.equal(out.candidates[0].cityEn, "Athens");
  assert.equal(out.candidates[0].perPersonPln, null);
  assert.ok(typeof out.note === "string" && out.note.includes("NIE podawaj"));
});

test("executeSearchTrips: country bez theme przechodzi walidację; nieznany kraj → reason", async () => {
  const exec = createToolExecutors(makeDeps({
    listDestinationsInCountry: () => [],
  }));
  const out = await exec.executeSearchTrips({
    country: "Narnia", budgetPln: 5000, budgetKind: "total_two", month: 9,
    adults: 2, wantsFlight: true, wantsHotel: true,
  });
  assert.deepEqual(out.candidates, []);
  assert.ok(out.reason && out.reason.includes("Narnia"));
});
