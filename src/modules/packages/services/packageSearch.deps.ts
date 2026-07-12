// Produkcyjne zależności searchPackages — spina orkiestrację z REALNYMI,
// tracked funkcjami repo (zero untracked WIP). Warstwa I/O: typowana, ale nie
// unit-testowana (integracja weryfikowana realnym flow). Rozwiązywanie kierunku
// (miasto→IATA, miasto→kraj) reużywa istniejących słowników.
//
// UWAGA (§6/§8): to jest I/O interaktywnego wyszukiwania (po submit formularza),
// NIE landingu. Landingi/homepage czytają cache (snapshot), nie odpalają tego.

import { iataForCity } from "@/lib/flights/airports";
import { searchFlightOffers } from "@/lib/flights/search-offers";
import { getRates, type LiteApiRoomType } from "@/lib/liteapi";
import { fetchHotelsForDestination } from "@/lib/liteapi/search";
import { listAllDestinations } from "@/lib/mvp/destinations-seed";

import type { PackageHotelMeta, SearchPackagesDeps } from "./packageSearch";

const HOTEL_POOL_LIMIT = 40;
// >1: musimy zobaczyć taryfy ZWROTNE (najtańsza ogółem bywa bezzwrotna →
// pickCheapestRefundableRate potrzebuje kilku taryf na hotel). 6 = kompromis
// pokrycia vs payload (maxRatesPerHotel:1 dawałby 0,15 MB, ale gubił zwrotne).
const MAX_RATES_PER_HOTEL = 6;

/** Kraj (EN, dla LiteAPI) dla miasta — z katalogu seeda (city.en/pl → country.en). */
function resolveCountryForCity(city: string): string | undefined {
  const needle = city.trim().toLowerCase();
  const rec = listAllDestinations().find(
    (d) => d.city.en.toLowerCase() === needle || d.city.pl.toLowerCase() === needle,
  );
  return rec?.country.en;
}

/** Fabryka produkcyjnych deps (composition root: route interaktywnego wyszukiwania). */
export function createProductionDeps(): SearchPackagesDeps {
  return {
    resolveOriginAirport: (city) => iataForCity(city),
    resolveDestinationAirport: (city) => iataForCity(city),
    searchFlightOffers,

    fetchHotelPool: async ({ destination, limit }) => {
      const country = resolveCountryForCity(destination);
      const res = await fetchHotelsForDestination({
        city: destination,
        country: country ?? "",
        limit: Math.min(limit, HOTEL_POOL_LIMIT),
      });
      return (res.data ?? []).map(
        (h): PackageHotelMeta => ({
          id: h.id,
          name: h.name,
          ...(h.stars != null ? { stars: h.stars } : {}),
          ...(h.rating != null ? { rating: h.rating } : {}),
          ...(h.reviewCount != null ? { reviewCount: h.reviewCount } : {}),
          ...(h.main_photo || h.thumbnail ? { thumbnailUrl: h.main_photo ?? h.thumbnail } : {}),
        }),
      );
    },

    fetchHotelRates: async ({ hotelIds, checkin, checkout, occupancies }) => {
      const res = await getRates({
        hotelIds,
        checkin,
        checkout,
        currency: "PLN",
        occupancies: occupancies.map((o) => ({ adults: o.adults, children: o.children })),
        maxRatesPerHotel: MAX_RATES_PER_HOTEL,
      });
      const map = new Map<string, LiteApiRoomType[]>();
      for (const hr of res.data ?? []) map.set(hr.hotelId, hr.roomTypes ?? []);
      return map;
    },
  };
}
