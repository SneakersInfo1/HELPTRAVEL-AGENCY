// Odcisk oferty hotelowej: tożsamość oferty, która przeżywa kolejne zapytania.
//
// DLACZEGO NIE `offerId`: LiteAPI wydaje go jednorazowo. Zmierzone 2026-11-06
// (dwa zapytania o ten sam hotel i termin, 3 s odstępu): wspólnych `offerId`
// i `rateId` 0 ze 186. Po świeżym pobraniu ten sam pokój wraca więc pod NOWYM
// identyfikatorem i blokada po `offerId` niczego by nie zatrzymała.
//
// Odcisk obejmuje wszystko, co odróżnia ofertę dla gościa: dostawcę, pokój,
// wyżywienie, obsadę, cenę oraz pełne warunki anulacji i podatki. Ten zestaw jest
// stabilny między zapytaniami (zmierzone: 179 ze 179), a przy ubogim odcisku
// oferty różniące się tylko terminem anulacji uchodziły za tę samą.
//
// Liczony dla CAŁEJ oferty, bo przy kilku pokojach ma ona kilka taryf (zmierzone:
// 2 pokoje = 2 taryfy) i rezerwuje się ją w całości. Liczy go serwer na pełnych
// danych: `slimRoomTypesForClient` odcina część taryf, więc przeglądarka dostaje
// gotową wartość, a nie liczy własnej z okrojonej listy.
//
// Bez `node:crypto`, bo funkcja pomocnicza `groupRates` działa też w przeglądarce.
// To nie jest zabezpieczenie: podrobiony odcisk ukrywa ofertę tylko temu, kto sam
// otworzy taki link.

import type { LiteApiRate, LiteApiRoomType } from "@/lib/liteapi/types";

export const OFFER_FINGERPRINT_RE = /^[0-9a-f]{16}$/;

/** Górny limit odcisków w linku: tyle odmów pod rząd to już nie zwykły gość. */
export const MAX_REFUSED_OFFERS = 10;

function fnv1a32(text: string, offsetBasis: number): number {
  let hash = offsetBasis;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const hex8 = (n: number) => n.toString(16).padStart(8, "0");

function rateIdentity(rate: LiteApiRate): string {
  const total = rate.retailRate?.total?.[0];
  return [
    rate.name?.trim().replace(/\s+/g, " ").toLowerCase(),
    rate.boardType,
    rate.boardName,
    rate.occupancyNumber,
    rate.adultCount,
    rate.childCount,
    rate.maxOccupancy,
    total?.amount,
    total?.currency,
    rate.refundableTag,
    JSON.stringify(rate.cancellationPolicies ?? null),
    JSON.stringify(rate.retailRate?.taxesAndFees ?? null),
  ]
    .map((part) => part ?? "")
    .join("\u0001");
}

export function offerFingerprint(roomType: Pick<LiteApiRoomType, "supplier" | "rates">): string {
  const source = [roomType.supplier ?? "", ...roomType.rates.map(rateIdentity).sort()].join("\u0002");
  return hex8(fnv1a32(source, 0x811c9dc5)) + hex8(fnv1a32(source, 0x9747b28c));
}

/** Odciski z parametru `refused` linku powrotu. Wszystko inne jest ignorowane. */
export function parseRefusedOffers(value: unknown): ReadonlySet<string> {
  if (typeof value !== "string") return new Set();
  return new Set(
    value
      .split(",")
      .filter((part) => OFFER_FINGERPRINT_RE.test(part))
      .slice(0, MAX_REFUSED_OFFERS),
  );
}

export function dropRefusedOffers(
  roomTypes: LiteApiRoomType[],
  refused: ReadonlySet<string>,
): LiteApiRoomType[] {
  if (refused.size === 0) return roomTypes;
  return roomTypes.filter((roomType) => !refused.has(offerFingerprint(roomType)));
}
