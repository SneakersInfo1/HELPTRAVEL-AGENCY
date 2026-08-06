// Pokoje i taryfy — mapowanie oraz POWIĄZANIE jednego z drugim.
//
// Kontekst: `/hotels/rates` i `/data/hotel` to dwa osobne wywołania bez
// wspólnego klucza w domyślnej konfiguracji (`roomTypeId` to base32 ~90 znaków,
// `rooms[].id` to liczba). Klucz obcy pojawia się dopiero, gdy zapytanie
// o stawki ustawi `roomMapping: true` — wtedy KAŻDA taryfa dostaje
// `mappedRoomId` wskazujący na `rooms[].id`.
//
// PUŁAPKA, która kosztowała pierwszą diagnozę: `mappedRoomId` jest na poziomie
// `rates[]`, NIE `roomTypes[]`. Szukanie go o poziom wyżej daje zero trafień
// i prowadzi do błędnego wniosku „nie da się powiązać".
//
// Zmierzone pokrycie: 31/31 taryf na 4 hotelach (100%).

import type { LiteApiHotelDetail, LiteApiRate, LiteApiRoomType } from "@/lib/liteapi";

import { isFreeCancellation, rateCancellationDeadline } from "../normalize";
import { buildPriceBreakdown } from "./price";
import { boardCategoryOf } from "./board";
import type { BedInfo, RateOffer, RoomPhoto, RoomProfile } from "./types";

function mapPhotos(room: NonNullable<LiteApiHotelDetail["rooms"]>[number]): RoomPhoto[] {
  const photos = room.photos;
  if (!Array.isArray(photos)) return [];
  return photos.map((p) => ({
    url: p.url,
    hdUrl: p.hd_url ?? null,
    description: p.imageDescription ?? null,
    isMain: p.mainPhoto === true,
  }));
  // Sortowanie po `mainPhoto`/`score` celowo pomijamy tutaj — kolejność
  // od dostawcy jest już sensowna, a stabilna kolejność ułatwia testy
  // wizualne. Wyróżnienie zdjęcia głównego robi warstwa widoku.
}

function mapBeds(room: NonNullable<LiteApiHotelDetail["rooms"]>[number]): BedInfo[] {
  const beds = room.bedTypes;
  if (!Array.isArray(beds)) return [];
  return beds.map((b) => ({
    quantity: b.quantity ?? null,
    type: b.bedType ?? null,
    size: b.bedSize ?? null,
  }));
}

/** Mapuje surowy pokój z `/data/hotel` na profil domenowy. */
export function toRoomProfile(room: NonNullable<LiteApiHotelDetail["rooms"]>[number]): RoomProfile {
  return {
    // `id` bywa liczbą — normalizujemy do stringa, bo tak samo trzeba będzie
    // porównać `mappedRoomId`, które również przychodzi w obu postaciach.
    id: String(room.id),
    name: room.roomName ?? null,
    description: room.description ?? null,
    // Dostawca podaje `roomSizeUnit` ("sqm"), ale bywa też "sq ft" — jednostkę
    // inną niż metry odrzucamy, zamiast pokazać mylącą liczbę.
    sizeSquareMeters:
      typeof room.roomSizeSquare === "number" && isSquareMeters(room.roomSizeUnit)
        ? room.roomSizeSquare
        : null,
    maxOccupancy: room.maxOccupancy ?? null,
    maxAdults: room.maxAdults ?? null,
    maxChildren: room.maxChildren ?? null,
    beds: mapBeds(room),
    amenities: Array.isArray(room.roomAmenities)
      ? room.roomAmenities.map((a) => a.name).filter((n): n is string => Boolean(n))
      : [],
    photos: mapPhotos(room),
  };
}

function isSquareMeters(unit: string | null | undefined): boolean {
  if (!unit) return false;
  const u = unit.trim().toLowerCase();
  return u === "sqm" || u === "m2" || u === "m²" || u === "sq m";
}

/** Indeks pokoi po `id` — do dopięcia taryf. */
export function indexRoomsById(detail: LiteApiHotelDetail | null | undefined): Map<string, RoomProfile> {
  const map = new Map<string, RoomProfile>();
  const rooms = detail?.rooms;
  if (!Array.isArray(rooms)) return map;
  for (const room of rooms) map.set(String(room.id), toRoomProfile(room));
  return map;
}

/**
 * Znajduje profil pokoju dla taryfy.
 *
 * Wyłącznie po `mappedRoomId` — ŻADNEGO dopasowywania po nazwie. Nazwy taryf
 * są angielskie ("Standard Room"), a nazwy pokoi bywają polskie ("Pokój
 * dwuosobowy"), więc zgadywanie po tekście podstawiałoby gościowi zdjęcia
 * innego pokoju niż ten, który kupuje.
 *
 * Brak powiązania → `null` → placeholder w UI (07-decisions.md R10).
 */
export function roomForRate(
  rate: LiteApiRate,
  roomsById: Map<string, RoomProfile>,
): RoomProfile | null {
  if (rate.mappedRoomId === null || rate.mappedRoomId === undefined) return null;
  return roomsById.get(String(rate.mappedRoomId)) ?? null;
}

/**
 * Buduje listę ofert dla strony hotelu: taryfy + dopięte profile pokoi.
 *
 * Nie grupuje i nie deduplikuje — to robi `lib/hotels/group-rates.ts`, które
 * zostaje bez zmian (jest sprawdzone i lepsze od tego, co pokazuje dostawca
 * w swoim white-labelu).
 */
export function buildRateOffers(
  roomTypes: LiteApiRoomType[],
  detail: LiteApiHotelDetail | null | undefined,
  nights: number,
): RateOffer[] {
  const roomsById = indexRoomsById(detail);
  const offers: RateOffer[] = [];
  for (const rt of roomTypes ?? []) {
    for (const rate of rt.rates ?? []) {
      const price = buildPriceBreakdown(rate, nights);
      if (!price) continue; // brak ceny = brak oferty do sprzedania
      offers.push({
        offerId: rt.offerId,
        rateId: rate.rateId,
        rawName: rate.name ?? null,
        board: {
          category: boardCategoryOf(rate.boardType, rate.boardName),
          rawLabel: rate.boardName ?? rate.boardType ?? null,
        },
        cancellation: {
          free: isFreeCancellation(rate),
          deadline: rateCancellationDeadline(rate),
        },
        price,
        maxOccupancy: rate.maxOccupancy ?? null,
        room: roomForRate(rate, roomsById),
      });
    }
  }
  return offers;
}

/** Ile taryf dostało zdjęcia swojego pokoju — do diagnostyki pokrycia. */
export function roomPhotoCoverage(offers: RateOffer[]): { withPhotos: number; total: number } {
  return {
    withPhotos: offers.filter((o) => (o.room?.photos.length ?? 0) > 0).length,
    total: offers.length,
  };
}
