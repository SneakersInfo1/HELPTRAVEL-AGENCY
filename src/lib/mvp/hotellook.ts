// Klient Hotellook (Travelpayouts) — meta-search hoteli z realnymi cenami.
//
// Strategia rozwiazania locationId (od najpewniejszego do najslabszego):
//   1) IATA z lokalnej bazy destinations.ts -> lookup.json?query=IATA (najpewniej)
//   2) lookup.json?query=ENGLISH_NAME -> bierzemy locations[type=city] LUB
//      hotels[0].locationId (kazdy hotel ma id miasta)
//   3) lookup.json?query=ORIGINAL_NAME -> jw.
//
// Ten flow pokrywa praktycznie kazdy popularny kierunek bo:
//   - jesli miasto ma lotnisko, mamy IATA -> 100% sukces
//   - jesli miasto ma jakikolwiek hotel w bazie Hotellook -> wyciagamy locationId
//     z hotels[].locationId (nie polegamy na sztywnym `locations` array)

import { findDestinationProfile } from "./destinations";
import { getAffiliateConfig } from "./affiliate-config";
import type { NormalizedStayOffer, StaySearchResponse, StaySortMode } from "./types";

interface HotellookSearchInput {
  city: string;
  country: string;
  checkInDate: string;
  nights: number;
  guests: number;
  rooms: number;
  sortBy: StaySortMode;
}

interface HotellookCacheEntry {
  hotelId: number;
  hotelName: string;
  location?: {
    name?: string;
    country?: string;
    geo?: { lat?: number; lon?: number };
  };
  priceFrom?: number;
  priceAvg?: number;
  pricePercentile?: Record<string, number>;
  stars?: number;
  hotelStars?: number;
}

interface HotellookLookupLocation {
  id?: string | number;
  type?: string;
  cityName?: string;
  countryName?: string;
  iata?: string[];
}

interface HotellookLookupHotel {
  id?: string | number;
  fullName?: string;
  locationId?: string | number;
  locationName?: string;
  cityName?: string;
}

interface HotellookLookupResponse {
  status?: string;
  results?: {
    locations?: HotellookLookupLocation[];
    hotels?: HotellookLookupHotel[];
  };
}

const HOTELLOOK_LOOKUP_API = "https://engine.hotellook.com/api/v2/lookup.json";
const HOTELLOOK_CACHE_API = "https://engine.hotellook.com/api/v2/cache.json";
const HOTELLOOK_PHOTO_BASE = "https://photo.hotellook.com/image_v2/limit/h";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildBookingUrl(
  hotelId: number,
  checkIn: string,
  checkOut: string,
  guests: number,
  marker: string | null,
): string {
  const url = new URL("https://search.hotellook.com/hotels");
  url.searchParams.set("hotelId", String(hotelId));
  url.searchParams.set("checkIn", checkIn);
  url.searchParams.set("checkOut", checkOut);
  url.searchParams.set("adults", String(Math.max(1, guests)));
  if (marker) url.searchParams.set("marker", marker);
  return url.toString();
}

function emptyResponse(input: HotellookSearchInput, error?: string): StaySearchResponse {
  return {
    city: input.city,
    country: input.country,
    source: "hotellook",
    checkInDate: input.checkInDate,
    checkOutDate: addDays(input.checkInDate, Math.max(1, input.nights)),
    guests: input.guests,
    rooms: input.rooms,
    sortBy: input.sortBy,
    offers: [],
    fetchedAt: new Date().toISOString(),
    error,
  };
}

// Mapa polskich form -> angielskie nazwy miast Hotellook.
// Uzywana TYLKO jako fallback - glowna sciezka to IATA z bazy destinations.ts.
const PL_TO_EN_CITY: Record<string, string> = {
  rzym: "Rome",
  stambul: "Istanbul",
  istambul: "Istanbul",
  walencja: "Valencia",
  ateny: "Athens",
  lizbona: "Lisbon",
  wieden: "Vienna",
  praga: "Prague",
  budapeszt: "Budapest",
  kopenhaga: "Copenhagen",
  monachium: "Munich",
  florencja: "Florence",
  wenecja: "Venice",
  mediolan: "Milan",
  neapol: "Naples",
  marsylia: "Marseille",
  bruksela: "Brussels",
  zurych: "Zurich",
  saloniki: "Thessaloniki",
  parya: "Paris",
  paryz: "Paris",
  londyn: "London",
  berlin: "Berlin",
  madryt: "Madrid",
  malaga: "Malaga",
  porto: "Porto",
  dubaj: "Dubai",
  bangkok: "Bangkok",
  tokio: "Tokyo",
  pekin: "Beijing",
  szanghaj: "Shanghai",
  nicea: "Nice",
  sewilla: "Seville",
  funchal: "Funchal",
  reykjawik: "Reykjavik",
  helsinki: "Helsinki",
  oslo: "Oslo",
  sztokholm: "Stockholm",
  amsterdam: "Amsterdam",
  rotterdam: "Rotterdam",
  hamburg: "Hamburg",
  frankfurt: "Frankfurt",
  dublin: "Dublin",
  edynburg: "Edinburgh",
  bordeaux: "Bordeaux",
  lyon: "Lyon",
  bolonia: "Bologna",
  turyn: "Turin",
  bilbao: "Bilbao",
  alicante: "Alicante",
  palmademallorca: "Palma de Mallorca",
  ibiza: "Ibiza",
  larnaka: "Larnaca",
  nikozja: "Nicosia",
  tirana: "Tirana",
  bukareszt: "Bucharest",
  sofia: "Sofia",
  belgrad: "Belgrade",
  zagrzeb: "Zagreb",
  ljubljana: "Ljubljana",
  bratyslawa: "Bratislava",
  ryga: "Riga",
  wilno: "Vilnius",
  tallin: "Tallinn",
  reykiawik: "Reykjavik",
};

function normalizeCity(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/\s+/g, "")
    .trim();
}

function translateCityToEnglish(city: string): string | null {
  return PL_TO_EN_CITY[normalizeCity(city)] ?? null;
}

// Wyciaga locationId z odpowiedzi lookup. Patrzymy najpierw na locations (idealne),
// potem na hotels (kazdy hotel ma locationId = id miasta w Hotellook).
function extractLocationId(body: HotellookLookupResponse): string | null {
  const locations = body.results?.locations ?? [];

  // 1) Najlepsze: lokalizacja typu "city"
  const cityLoc = locations.find((loc) => loc.type === "city" && loc.id);
  if (cityLoc?.id) return String(cityLoc.id);

  // 2) Inny typ lokalizacji (destination/region) tez moze byc OK dla cache.json
  const anyLoc = locations.find((loc) => loc.id);
  if (anyLoc?.id) return String(anyLoc.id);

  // 3) Fallback: wyciagnij locationId z pierwszego hotelu (zawsze ma id miasta)
  const hotels = body.results?.hotels ?? [];
  const firstHotel = hotels.find((hotel) => hotel.locationId);
  if (firstHotel?.locationId) return String(firstHotel.locationId);

  return null;
}

async function lookupOnce(query: string, token: string): Promise<string | null> {
  const url = new URL(HOTELLOOK_LOOKUP_API);
  url.searchParams.set("query", query);
  url.searchParams.set("lang", "en");
  url.searchParams.set("lookFor", "both");
  url.searchParams.set("limit", "10");
  url.searchParams.set("token", token);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as HotellookLookupResponse;
    return extractLocationId(body);
  } catch {
    return null;
  }
}

// 3-warstwowa rezolucja: IATA z lokalnej bazy -> EN nazwa -> oryginalna nazwa.
async function resolveLocationId(
  city: string,
  country: string,
  token: string,
): Promise<string | null> {
  // Warstwa 1: IATA z destinations.ts (najszybsze i najpewniejsze)
  const profile = findDestinationProfile({ city, country });
  if (profile?.airportCode) {
    const fromIata = await lookupOnce(profile.airportCode, token);
    if (fromIata) return fromIata;
  }

  // Warstwa 2: angielska nazwa z mapy PL->EN
  const englishName = translateCityToEnglish(city);
  if (englishName && englishName.toLowerCase() !== city.toLowerCase()) {
    const fromEn = await lookupOnce(englishName, token);
    if (fromEn) return fromEn;
  }

  // Warstwa 3: oryginalna nazwa wpisana przez usera
  return lookupOnce(city, token);
}

function sortOffers(offers: NormalizedStayOffer[], sortBy: StaySortMode): NormalizedStayOffer[] {
  const sorted = [...offers];
  if (sortBy === "quality") {
    sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.total_amount - b.total_amount);
  } else if (sortBy === "value") {
    sorted.sort((a, b) => {
      const ra = (a.rating ?? 1) || 1;
      const rb = (b.rating ?? 1) || 1;
      return a.total_amount / ra - b.total_amount / rb;
    });
  } else {
    sorted.sort((a, b) => a.total_amount - b.total_amount);
  }
  return sorted;
}

export async function searchHotellookStays(input: HotellookSearchInput): Promise<StaySearchResponse> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN?.trim();
  if (!token) {
    return emptyResponse(input, "Brak TRAVELPAYOUTS_API_TOKEN.");
  }

  const checkOut = addDays(input.checkInDate, Math.max(1, input.nights));
  const { travelpayoutsMarker } = getAffiliateConfig();

  const locationId = await resolveLocationId(input.city, input.country, token);
  if (!locationId) {
    if (process.env.NODE_ENV !== "production") {
      // Loguj nieznajdowane miasta zeby dorzucac do mapy
      console.warn(`[hotellook] Nie udalo sie zresolvac locationId dla "${input.city}, ${input.country}".`);
    }
    return emptyResponse(input, `Nie znaleziono miasta "${input.city}" w bazie Hotellook.`);
  }

  const url = new URL(HOTELLOOK_CACHE_API);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("currency", "pln");
  url.searchParams.set("checkIn", input.checkInDate);
  url.searchParams.set("checkOut", checkOut);
  url.searchParams.set("adults", String(Math.max(1, input.guests)));
  url.searchParams.set("limit", "30");
  url.searchParams.set("token", token);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 600 },
    });
  } catch (error) {
    return emptyResponse(input, error instanceof Error ? error.message : "Hotellook fetch failed.");
  }

  if (!response.ok) {
    return emptyResponse(input, `Hotellook ${response.status}`);
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return emptyResponse(input, "Hotellook: nieprawidlowa odpowiedz JSON.");
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    return emptyResponse(input, "Brak ofert dla tego kierunku.");
  }

  const entries = raw as HotellookCacheEntry[];

  const offers: NormalizedStayOffer[] = entries
    .filter((entry) => typeof entry.hotelId === "number" && (entry.priceAvg || entry.priceFrom))
    .map((entry) => {
      const totalCandidate = entry.priceFrom ?? entry.priceAvg ?? 0;
      const total = Math.round(totalCandidate);
      return {
        searchResultId: `hotellook-${entry.hotelId}`,
        accommodationId: String(entry.hotelId),
        name: entry.hotelName ?? `Hotel ${entry.hotelId}`,
        rating: entry.stars ?? entry.hotelStars ?? null,
        reviewScore: null,
        total_amount: total,
        currency: "PLN",
        public_amount: null,
        public_currency: null,
        address: entry.location?.name ?? `${input.city}, ${input.country}`,
        city: input.city,
        country: input.country,
        latitude: entry.location?.geo?.lat ?? null,
        longitude: entry.location?.geo?.lon ?? null,
        imageUrl: `${HOTELLOOK_PHOTO_BASE}/${entry.hotelId}/800/520.auto`,
        description: undefined,
        rooms: input.rooms,
        bookingUrl: buildBookingUrl(
          entry.hotelId,
          input.checkInDate,
          checkOut,
          input.guests,
          travelpayoutsMarker,
        ),
      } satisfies NormalizedStayOffer;
    });

  return {
    city: input.city,
    country: input.country,
    source: "hotellook",
    checkInDate: input.checkInDate,
    checkOutDate: checkOut,
    guests: input.guests,
    rooms: input.rooms,
    sortBy: input.sortBy,
    offers: sortOffers(offers, input.sortBy),
    fetchedAt: new Date().toISOString(),
  };
}
