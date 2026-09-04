// Deterministyczne ToolDeps dla benchmarku (master prompt §10, §48).
//
// DLACZEGO NIE ŻYWE LiteAPI: benchmark porównuje MODELE, więc każdy model musi
// zobaczyć DOKŁADNIE te same dane narzędzi — inaczej porównujemy pogodę na
// LiteAPI, nie jakość modelu. Dodatkowo §48 zakazuje ruchu produkcyjnego,
// a limiter LiteAPI (zmierzony 325→429) i tak nie przepuściłby ~220 tur × 8 modeli.
//
// UZIEMIENIE W REALNYCH DANYCH: ceny bazowe pochodzą z PRODUKCYJNEGO snapshotu
// (fixtures/price-snapshot.json, zrzut dstprice:v1 — 46 kierunków z realnymi
// cenami hotelu/noc i lotu RT). Syntetyczny jest wyłącznie deterministyczny
// jitter per zapytanie. Kierunki spoza snapshotu dostają cenę wyprowadzoną
// z budgetTier seedu — też deterministycznie.
//
// UWAGA: część jitterowa tych liczb jest ZMYŚLONA i nie wolno jej nigdzie
// pokazać użytkownikowi. Ten moduł żyje wyłącznie w bench/ i nie jest
// importowany przez żaden kod produkcyjny.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  CheapestFlight,
  CheapestFlightQuery,
  CheapestHotel,
  CheapestHotelQuery,
  ToolDeps,
} from "../../src/lib/concierge/tools";
import type { DestinationPriceSnapshot } from "../../src/lib/prices/destination-price-snapshot";

// tsx w tym repo kompiluje do CJS (brak "type":"module"), więc ani
// import.meta.dirname, ani top-level await nie są dostępne. Skrypty bench
// uruchamiamy z katalogu repo — tak samo jak scripts/* w package.json.
const ROOT = process.cwd();
const HERE = join(ROOT, "bench/concierge");

interface SeedRecord {
  id: string;
  city: { en: string; pl: string };
  country: { code: string | null; en: string; pl: string };
  region: { en: string; pl: string };
  lat: number | null;
  lng: number | null;
  airports: string[];
  nearestPLHubs: Array<{ iata: string; km: number; minutes: number }>;
  popularity: number;
  vibeTagsEn: string[];
  vibeTagsPl: string[];
  climate: Record<string, "hot" | "mild" | "cold">;
  budgetTier: "low" | "mid" | "high";
  hotelCount: number;
  heroImage: string | null;
}

const seed: SeedRecord[] = (
  JSON.parse(readFileSync(join(ROOT, "data/destinations.json"), "utf8")) as {
    destinations: SeedRecord[];
  }
).destinations;

const snapshot: DestinationPriceSnapshot = JSON.parse(
  readFileSync(join(HERE, "fixtures/price-snapshot.json"), "utf8"),
) as DestinationPriceSnapshot;

/** Uproszczony odpowiednik foldText z produkcji (ASCII-fold + lowercase). */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .trim();
}

function snapKey(cityEn: string, countryEn: string): string {
  return fold(cityEn + "|" + countryEn);
}

/** FNV-1a — stabilny między uruchomieniami i procesami (Math.random NIE nadaje się). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministyczny współczynnik w [lo, hi] wyprowadzony z klucza. */
function jitter(key: string, lo: number, hi: number): number {
  return lo + ((hash32(key) % 10000) / 10000) * (hi - lo);
}

function nightsBetween(checkin: string, checkout: string): number {
  const a = Date.parse(checkin + "T00:00:00Z");
  const b = Date.parse(checkout + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function findSeed(cityEn: string, countryEn?: string): SeedRecord | undefined {
  const c = fold(cityEn);
  const k = countryEn ? fold(countryEn) : undefined;
  return seed.find((d) => {
    if (fold(d.city.en) !== c && fold(d.city.pl) !== c) return false;
    if (!k) return true;
    return fold(d.country.en) === k || fold(d.country.pl) === k || fold(d.country.code ?? "") === k;
  });
}

/** Ile zapytań trafiło w realny snapshot vs. wyprowadzenie z seedu vs. pudło. */
export const fixtureStats = {
  hotelSnapshot: 0,
  hotelSeed: 0,
  hotelMiss: 0,
  flightSnapshot: 0,
  flightSeed: 0,
  flightMiss: 0,
};

export function resetFixtureStats(): void {
  for (const k of Object.keys(fixtureStats) as Array<keyof typeof fixtureStats>) {
    fixtureStats[k] = 0;
  }
}

const TIER_PER_NIGHT: Record<SeedRecord["budgetTier"], number> = { low: 190, mid: 320, high: 520 };
const HOTEL_NAMES = [
  "Sunrise Beach Resort",
  "Hotel Marina Bay",
  "Aparthotel Centro",
  "Blue Bay Hotel",
  "Grand Plaza Hotel",
  "Seaside Palace",
  "City Garden Hotel",
  "Palm Residence",
];
const ROOMS = ["Double Room", "Standard Twin Room", "Superior Double Room", "Family Room"];
const BOARDS = ["Room Only", "Bed and Breakfast", "Half Board", "All Inclusive"];
const CARRIERS = [
  "Ryanair",
  "Wizz Air",
  "LOT Polish Airlines",
  "Lufthansa",
  "Turkish Airlines",
  "Vueling",
];

async function findCheapestHotel(q: CheapestHotelQuery): Promise<CheapestHotel | null> {
  const nights = nightsBetween(q.checkin, q.checkout);
  if (nights <= 0) return null;
  const rec = findSeed(q.cityEn, q.countryEn);
  const snap = snapshot[snapKey(q.cityEn, q.countryEn)];

  let perNight: number;
  if (snap && Number.isFinite(snap.hotelFromPlnPerNight)) {
    perNight = snap.hotelFromPlnPerNight;
    fixtureStats.hotelSnapshot++;
  } else if (rec) {
    perNight = TIER_PER_NIGHT[rec.budgetTier];
    fixtureStats.hotelSeed++;
  } else {
    // Miasto poza seedem — produkcja też najczęściej nic nie znajdzie.
    fixtureStats.hotelMiss++;
    return null;
  }

  const key = [fold(q.cityEn), q.checkin, q.checkout, q.adults, q.children].join("|");
  const guests = q.adults + q.children;
  // Pokój dla większej liczby gości drożeje — te same realia co LiteAPI.
  const occupancyFactor = guests <= 2 ? 1 : 1 + (guests - 2) * 0.28;
  const totalPln = Math.round(perNight * nights * occupancyFactor * jitter(key, 0.94, 1.34));
  const h = hash32(key);

  return {
    hotelId: "lp" + (h % 0xffffff).toString(16).padStart(6, "0"),
    name: HOTEL_NAMES[h % HOTEL_NAMES.length],
    totalPln,
    mainPhotoUrl: "https://static.cupid.travel/hotels/" + (h % 900000) + ".jpg",
    rating: Math.round(jitter("r" + key, 6.8, 9.4) * 10) / 10,
    stars: 3 + (h % 3),
    reviewCount: 40 + (h % 1800),
    address: (rec?.city.en ?? q.cityEn) + ", " + (rec?.country.en ?? q.countryEn),
    roomName: ROOMS[h % ROOMS.length],
    boardName: BOARDS[h % BOARDS.length],
    refundableTag: h % 2 === 0 ? "RFN" : "NRFN",
    cancellationDeadline: h % 2 === 0 ? q.checkin + "T12:00:00" : null,
    freeCancellationDeadline: h % 2 === 0 ? q.checkin + "T12:00:00" : null,
  };
}

async function findCheapestFlight(q: CheapestFlightQuery): Promise<CheapestFlight | null> {
  const rec = findSeed(q.cityEn, q.countryEn);
  const iata = rec?.airports?.[0];
  // Brak mapowania IATA → null, dokładnie jak produkcja (zero zgadywania lotniska).
  if (!rec || !iata) {
    fixtureStats.flightMiss++;
    return null;
  }

  const snap = snapshot[snapKey(q.cityEn, q.countryEn)];
  let perPerson: number;
  if (snap && typeof snap.flightFromPln === "number" && Number.isFinite(snap.flightFromPln)) {
    perPerson = snap.flightFromPln;
    fixtureStats.flightSnapshot++;
  } else {
    perPerson = TIER_PER_NIGHT[rec.budgetTier] * 2.1;
    fixtureStats.flightSeed++;
  }

  const key = [fold(q.cityEn), q.depart, q.returnDate, q.adults, q.children, q.originIata].join("|");
  const pax = q.adults + q.children;
  const h = hash32(key);
  const stops = h % 100 < 45 ? 0 : h % 100 < 85 ? 1 : 2;

  return {
    // total = suma za WSZYSTKICH pasażerów (semantyka DisplayOffer.total).
    totalPln: Math.round(perPerson * pax * jitter(key, 0.9, 1.45)),
    carrierName: CARRIERS[h % CARRIERS.length],
    outboundDepartureTime:
      q.depart + "T" + String(6 + (h % 14)).padStart(2, "0") + (h % 2 ? ":30:00" : ":05:00"),
    inboundDepartureTime:
      q.returnDate +
      "T" +
      String(7 + ((h >> 3) % 13)).padStart(2, "0") +
      (h % 2 ? ":15:00" : ":45:00"),
    stops,
    outboundDurationMinutes: 150 + stops * 210 + (h % 90),
    inboundDurationMinutes: 150 + stops * 200 + ((h >> 5) % 90),
    hasCarryOnBag: true,
    hasCheckedBag: h % 3 === 0 ? true : null,
    destinationIata: iata,
  };
}

function listDestinationsInCountry(
  country: string,
): Array<{ cityEn: string; countryEn: string; cityPl: string }> {
  const target = fold(country);
  if (!target) return [];
  return seed
    .filter(
      (d) =>
        fold(d.country.en) === target ||
        fold(d.country.pl) === target ||
        fold(d.country.code ?? "") === target,
    )
    .map((d) => ({ cityEn: d.city.en, countryEn: d.country.en, cityPl: d.city.pl }));
}

/** Te same kształty co buildProductionToolDeps, ale bez sieci i bez server-only. */
export function buildFixtureToolDeps(): ToolDeps {
  return {
    readSnapshot: async () => snapshot,
    resolveDest: ((city: string, country?: string) =>
      findSeed(city, country)) as ToolDeps["resolveDest"],
    listDestinationsInCountry,
    findCheapestHotel,
    findCheapestFlight,
    fetchHotelPhotoUrls: async (hotelId: string) => {
      const h = hash32(hotelId);
      return [0, 1, 2, 3].map(
        (i) => "https://static.cupid.travel/hotels/" + ((h + i) % 900000) + "_h.jpg",
      );
    },
  };
}

export const fixtureMeta = {
  seedDestinations: seed.length,
  snapshotDestinations: Object.keys(snapshot).length,
};
