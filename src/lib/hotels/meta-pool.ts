// Pula metadanych hoteli dla strony wyników — wspólny kontrakt serwera
// (page.tsx renderuje pierwszą stronę puli) i klienta (/api/hotels/meta
// dociąga kolejne strony w tle, aż użytkownik widzi WSZYSTKIE hotele
// kierunku, nie tylko top-300).
//
// Dlaczego stronami po 300: LiteAPI /data/hotels przy limit=1000 zwraca
// odpowiedź > 2 MB (Valencia 2,36 MB), a Next Data Cache odmawia wpisów
// ponad 2 MB — metadane wtedy NIGDY się nie cache'owały. Strona ~300
// rekordów ≈ 0,7 MB → każda strona (osobny URL fetcha) cache'uje się
// niezależnie na 24 h. Offset zweryfikowany żywym callem (2026-07-11):
// deterministyczny, działa też >1000 (Barcelona ~3000 hoteli).

import type { LiteApiHotel } from "@/lib/liteapi/types";

/** Chudy rekord hotelu dla listy wyników (bez opisów/zdjęć-galerii). */
export interface MetaOffer {
  hotelId: string;
  name: string;
  city: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
}

/** Rozmiar strony puli metadanych (serwer = strona 0, klient = kolejne). */
export const POOL_PAGE_SIZE = 300;

// Twardy sufit łącznej puli. 2000 pokrywa w całości praktycznie każdy
// kierunek poza megamiastami (Barcelona ~3000); wyżej rośnie już tylko koszt
// skanu stawek (2000 hoteli = 40 batchy po 50), a ogon list LiteAPI to
// obiekty bez ofert. Podbicie = zmiana tej stałej + limitu "stays-search"
// w lib/rate-limit.ts (patrz komentarz tam).
export const POOL_MAX_TOTAL = 2000;

/** Mapowanie rekordu LiteAPI → MetaOffer (jedno miejsce dla page.tsx i API). */
export function toMetaOffer(h: LiteApiHotel): MetaOffer {
  return {
    hotelId: h.id,
    name: h.name,
    city: h.city,
    country: h.country,
    countryCode: h.countryCode,
    latitude: h.latitude ?? h.location?.latitude ?? undefined,
    longitude: h.longitude ?? h.location?.longitude ?? undefined,
    stars: h.stars ?? undefined,
    rating: h.rating ?? undefined,
    reviewCount: h.reviewCount ?? undefined,
    thumbnailUrl: h.main_photo ?? h.thumbnail,
  };
}
