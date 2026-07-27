// LiteAPI search — produces a list of hotelIds for a destination/dates query.
// Two-step model: this returns the list; rates.ts gets pricing.

import { z } from "zod";

import { liteApiRequest } from "./client";
import {
  LiteApiHotelsListResponseSchema,
  type LiteApiHotelsListResponse,
  type NormalizedHotelSearchInput,
} from "./types";

// Includes Polish localizations — Geoapify autocomplete is queried with
// `lang=pl` (see destination-suggestions.ts), so the country field on user-
// facing suggestions arrives as "Niemcy"/"Hiszpania"/etc. Without these
// aliases the Results page used to throw "Unknown country: Niemcy" and the
// global error.tsx took over, dropping the user on the "Mamy chwilowy
// problem" screen for any city sourced from Geoapify rather than the
// curated catalog.
// Mapa krajów przeniesiona do lib/mvp/countries.ts (pełne ISO 3166-1, nazwy
// PL + EN + aliasy). Powód: ta miała 73 wpisy i wyłącznie Europę + basen Morza
// Śródziemnego, więc `resolveCountryCode("Tajlandia")` zwracało null i użytkownik
// nie mógł dosięgnąć większości oferty LiteAPI nawet wpisując kraj ręcznie
// w URL. Re-eksport zostaje, bo importuje go liteapi/client.test.ts i kod lejka.
import { resolveCountryCode } from "@/lib/mvp/countries";

export { resolveCountryCode };

export interface HotelsListInput {
  city: string;
  country: string;
  limit?: number;
  /** Paginacja puli metadanych (ZWERYFIKOWANE żywym callem 2026-07-11:
   *  offset działa deterministycznie, także >1000 — Barcelona ~3000 hoteli).
   *  Każda strona = osobny URL fetcha = osobny wpis Next Data Cache, więc
   *  strony po ~300 rekordów mieszczą się w capie 2 MB, który wcześniej
   *  wymusił obcięcie puli do 300. */
  offset?: number;
}

// Default page size bumped 20 → 50 in Sesja C2 follow-up: user explicitly
// asked for more hotels per destination after we expanded the dataset.
// LiteAPI /data/hotels caps at 1000 per call and returns just metadata
// (no rate lookups), so 50 is cheap. The downstream rates fetch in
// rates.ts is what actually costs us — and that still limits to top-N
// after sorting.
const DEFAULT_HOTELS_LIMIT = 50;

export async function fetchHotelsList(input: HotelsListInput): Promise<LiteApiHotelsListResponse> {
  const countryCode = resolveCountryCode(input.country);
  if (!countryCode) {
    throw new Error(`Unknown country: "${input.country}"`);
  }
  return liteApiRequest({
    path: "/data/hotels",
    method: "GET",
    keyMode: "public",
    schema: LiteApiHotelsListResponseSchema,
    query: {
      countryCode,
      cityName: input.city,
      limit: input.limit ?? DEFAULT_HOTELS_LIMIT,
      offset: input.offset || undefined,
    },
    // Sesja C2 — server-side Data Cache via Next's fetch patches.
    // Hotels list (IDs + metadata) keyed by countryCode+cityName+limit;
    // doesn't change hourly so 24h TTL is safe. Rates with date-specific
    // pricing are cached separately in rates.ts (15 min TTL).
    //
    //   First request:    ~800-1500ms (LiteAPI round-trip)
    //   Repeat within 24h: ~5-20ms    (Next Data Cache hit at the fetch layer)
    //
    // Outside Next runtime (test runner, build script) the `next` fetch
    // option is silently ignored — behaves identical to no-store.
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-hotels-list"] },
  });
}

// Zadanie 2 — wyspy/regiony. /data/hotels przyjmuje placeId z /data/places
// (zweryfikowane empirycznie 2026-06-12: Majorka → 1000 hoteli, Gozo → 170).
// Bez countryCode/cityName — placeId sam definiuje obszar. Wyniki bywają
// szersze niż wyspa (sąsiednie wyspy w promieniu), więc strona wyników
// przycina je przez isInRegion() z lib/hotels/regions.
export async function fetchHotelsByPlaceId(input: {
  placeId: string;
  limit?: number;
  offset?: number;
}): Promise<LiteApiHotelsListResponse> {
  return liteApiRequest({
    path: "/data/hotels",
    method: "GET",
    keyMode: "public",
    schema: LiteApiHotelsListResponseSchema,
    query: {
      placeId: input.placeId,
      limit: input.limit ?? DEFAULT_HOTELS_LIMIT,
      offset: input.offset || undefined,
    },
    // Ten sam Next Data Cache co lista miejska (klucz = pełny URL fetcha,
    // czyli placeId+limit) — metadane nie zmieniają się godzinowo.
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-hotels-list"] },
  });
}

// FAZA 2 — wyszukiwanie po współrzędnych (fallback, gdy cityName daje 0).
// LiteAPI /data/hotels przyjmuje latitude/longitude/radius (metry, min 1000).
// Zweryfikowane na żywo (prod): Sharm 27.9158,34.33 r=15km → 722 hotele.
export async function fetchHotelsByCoords(input: {
  lat: number;
  lng: number;
  radius?: number;
  limit?: number;
  offset?: number;
}): Promise<LiteApiHotelsListResponse> {
  return liteApiRequest({
    path: "/data/hotels",
    method: "GET",
    keyMode: "public",
    schema: LiteApiHotelsListResponseSchema,
    query: {
      latitude: input.lat,
      longitude: input.lng,
      radius: input.radius ?? 25_000,
      limit: input.limit ?? DEFAULT_HOTELS_LIMIT,
      offset: input.offset || undefined,
    },
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-hotels-list"] },
  });
}

// /data/places — rozwiązanie luźnej/polskiej nazwy na placeId (Google Places
// pod spodem, więc znosi pisownię/język/literówki). Schemat luźny: liczy się
// tylko placeId; nieoczekiwany kształt rzuci LiteApiValidationError, który
// łańcuch fallbacków łapie i idzie dalej.
const LiteApiPlacesResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            placeId: z.string(),
            displayName: z.string().optional(),
            types: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

/** Wybór najlepszego placeId: preferuj lokalność (miasto/region), unikaj lotniska/POI. */
export function pickPlaceId(
  places: ReadonlyArray<{ placeId: string; types?: string[] }>,
): string | null {
  if (places.length === 0) return null;
  const isAirport = (t?: string[]) => t?.some((x) => x.includes("airport")) ?? false;
  const isLocality = (t?: string[]) =>
    t?.some((x) => x === "locality" || x === "administrative_area_level_2") ?? false;
  const locality = places.find((p) => isLocality(p.types) && !isAirport(p.types));
  if (locality) return locality.placeId;
  const nonAirport = places.find((p) => !isAirport(p.types));
  return (nonAirport ?? places[0]).placeId;
}

export async function resolvePlaceId(textQuery: string): Promise<string | null> {
  const res = await liteApiRequest({
    path: "/data/places",
    method: "GET",
    keyMode: "public",
    schema: LiteApiPlacesResponseSchema,
    query: { textQuery },
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-places"] },
  });
  return pickPlaceId(res.data ?? []);
}

// FAZA 2 — odporne wyszukiwanie hoteli dla kierunku. LiteAPI /data/hotels?cityName
// to DOKŁADNE dopasowanie stringa, więc polska nazwa albo inna pisownia = 0 hoteli
// mimo realnej oferty. Łańcuch fallbacków (każdy odpala TYLKO gdy poprzedni dał 0):
//   1) cityName (kanoniczny EN — najszersze pokrycie, gdy pisownia trafia),
//   2) lat/lng + radius (mamy współrzędne każdego kierunku z katalogu),
//   3) /data/places → placeId (gdy brak współrzędnych albo 1–2 dały 0).
// Normalny ruch (cityName trafia od razu) NIE płaci nic ekstra.
export async function fetchHotelsForDestination(input: {
  city: string; // najlepiej kanoniczny EN
  country: string;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
  /** Paginacja (strony puli >300 dociąga /api/hotels/meta). Offset stosowany
   *  do każdej strategii łańcucha — przy offset>0 strategia, która na stronie
   *  0 nic nie miała, przy wyższym offsecie też zwróci 0, więc łańcuch trafia
   *  w to samo źródło co strona pierwsza (konsument i tak dedupe'uje po id). */
  offset?: number;
}): Promise<LiteApiHotelsListResponse> {
  const limit = input.limit ?? DEFAULT_HOTELS_LIMIT;
  const offset = input.offset ?? 0;

  let byCity: LiteApiHotelsListResponse | null = null;
  try {
    byCity = await fetchHotelsList({ city: input.city, country: input.country, limit, offset });
    if ((byCity.data?.length ?? 0) > 0) return byCity;
  } catch {
    // Nieznany kraj / odrzucona nazwa → próbujemy współrzędnych/places.
  }

  if (typeof input.lat === "number" && typeof input.lng === "number") {
    try {
      const byCoords = await fetchHotelsByCoords({ lat: input.lat, lng: input.lng, limit, offset });
      if ((byCoords.data?.length ?? 0) > 0) return byCoords;
    } catch {
      // spadamy do places
    }
  }

  try {
    const query = input.country ? `${input.city}, ${input.country}` : input.city;
    const placeId = await resolvePlaceId(query);
    if (placeId) {
      const byPlace = await fetchHotelsByPlaceId({ placeId, limit, offset });
      if ((byPlace.data?.length ?? 0) > 0) return byPlace;
    }
  } catch {
    // wszystkie ścieżki puste → zwracamy pusty wynik (caller pokaże „brak wyników")
  }

  return byCity ?? { data: [] };
}

// Convenience wrapper that takes the higher-level NormalizedHotelSearchInput.
export async function searchHotels(input: NormalizedHotelSearchInput): Promise<LiteApiHotelsListResponse> {
  return fetchHotelsList({
    city: input.destination.city,
    country: input.destination.country,
    limit: DEFAULT_HOTELS_LIMIT,
  });
}
