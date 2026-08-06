// Normalize LiteAPI hotels-list + rates responses into the card shape the
// /hotele/szukaj UI consumes. All money in MINOR UNITS (bigint grosze) per
// master spec §16 #2 — UI layer formats at the boundary via fromMinor().

import { toMinor } from "@/lib/money";
import type {
  CurrencyCode,
  LiteApiHotel,
  LiteApiHotelRates,
  LiteApiRate,
  LiteApiRoomType,
  NormalizedHotelOffer,
} from "@/lib/liteapi";

interface CheapestPick {
  rate: LiteApiRate;
  offerId: string;
  roomTypeName?: string;
}

export function pickCheapestRate(roomTypes: LiteApiRoomType[]): CheapestPick | null {
  let best: CheapestPick | null = null;
  let bestMinor: bigint | null = null;
  for (const room of roomTypes ?? []) {
    for (const rate of room.rates ?? []) {
      const total = rateTotalMinor(rate);
      if (total === null) continue;
      if (bestMinor === null || total < bestMinor) {
        bestMinor = total;
        best = { rate, offerId: room.offerId, roomTypeName: rate.name };
      }
    }
  }
  return best;
}

export function rateTotalMinor(rate: LiteApiRate): bigint | null {
  const total = rate.retailRate?.total?.[0];
  if (!total || typeof total.amount !== "number") return null;
  return toMinor(total.amount);
}

export function rateCurrency(rate: LiteApiRate): CurrencyCode | null {
  return (rate.retailRate?.total?.[0]?.currency as CurrencyCode | undefined) ?? null;
}

export function rateCancellationDeadline(rate: LiteApiRate): string | null {
  const infos = rate.cancellationPolicies?.cancelPolicyInfos;
  if (!infos || infos.length === 0) return null;
  // Earliest free-cancellation cutoff (cancelTime is when zero-fee window ENDS).
  const free = infos.find((p) => p.amount === 0 && p.cancelTime);
  return free?.cancelTime ?? infos[0]?.cancelTime ?? null;
}

export function isFreeCancellation(rate: LiteApiRate): boolean {
  if (rate.refundableTag === "RFN") return true;
  const policy = rate.cancellationPolicies;
  if (policy?.refundableTag === "RFN") return true;
  return Boolean(policy?.cancelPolicyInfos?.some((p) => p.amount === 0 && p.cancelTime));
}

export function normalizeOffer(
  hotel: LiteApiHotel,
  rates: LiteApiHotelRates | undefined,
): NormalizedHotelOffer | null {
  if (!rates) return null;
  const cheapest = pickCheapestRate(rates.roomTypes ?? []);
  if (!cheapest) return null;
  const total = rateTotalMinor(cheapest.rate);
  const currency = rateCurrency(cheapest.rate);
  if (total === null || !currency) return null;
  return {
    hotelId: hotel.id,
    name: hotel.name,
    city: hotel.city,
    country: hotel.country,
    address: hotel.address,
    stars: hotel.stars ?? undefined,
    rating: hotel.rating ?? undefined,
    reviewCount: hotel.reviewCount ?? undefined,
    thumbnailUrl: hotel.main_photo ?? hotel.thumbnail,
    latitude: hotel.latitude ?? undefined,
    longitude: hotel.longitude ?? undefined,
    cheapestRate: {
      rateId: cheapest.rate.rateId,
      offerId: cheapest.offerId,
      boardName: cheapest.rate.boardName,
      // Oba poziomy — na drucie `rate.refundableTag` jest ZWYKLE undefined,
      // a prawda siedzi w `cancellationPolicies.refundableTag` ("NRFN"/"RFN").
      // Czytanie samego top-levelu dawało tu zawsze undefined, przez co
      // konsument tego pola nie wiedział nic o zwrotności oferty.
      // `resolve-slim-rates.ts` robi to poprawnie od dawna — to była
      // niespójność między dwiema ścieżkami tych samych danych.
      refundableTag: cheapest.rate.refundableTag ?? cheapest.rate.cancellationPolicies?.refundableTag,
      totalAmountMinor: total,
      currency,
      cancellationDeadline: rateCancellationDeadline(cheapest.rate) ?? undefined,
    },
  };
}

export function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(`${checkin}T00:00:00Z`).getTime();
  const b = new Date(`${checkout}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
