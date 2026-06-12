// Zadanie 5 — Booking-style room/rate grouping. PRESENTATION-ONLY:
// identifiers (offerId, rateId) and the checkout payload are untouched;
// every option row still navigates with ITS OWN source offerId.
//
// Why grouping is by NAME (the brief's "fallback" is the real key): LiteAPI
// returns EVERY price variant as a separate roomType/offer — faza 0 measured
// 200 offers / 25 unique room names on one hotel, with `roomTypeId` unique
// PER OFFER ("superior double room" carried 19 different roomTypeIds), so
// roomTypeId cannot reunite duplicates. We therefore group by the NORMALIZED
// ORIGINAL (English) room name + maxOccupancy — never a translated label
// (zadanie-4-safe), and rooms with equal names but different capacity stay
// separate groups.
//
// Deduplication inside a group: options with identical guest-visible terms
// (board + cancellation policy/deadline day + maxOccupancy) collapse to the
// CHEAPEST one. Rates DO carry `commission` data (faza 0) — per the brief we
// still keep the cheapest for the user; margin optimisation is a separate
// conversation. The hotel's overall cheapest offer can never disappear:
// dedupe keeps group minima, so the global minimum always survives.

import type { LiteApiRate, LiteApiRoomType } from "@/lib/liteapi";

import { isFreeCancellation, rateCancellationDeadline, rateTotalMinor } from "./normalize";

export interface RoomOption {
  /** Bookable LiteAPI offer id of THIS option's source roomType. */
  offerId: string;
  rate: LiteApiRate;
  /** Minor units as BigInt (house money convention — see lib/money). */
  totalMinor: bigint | null;
  freeCancellation: boolean;
  /** ISO-ish datetime string from LiteAPI ("2026-07-13 04:00:00") or null. */
  cancellationDeadline: string | null;
  /** How many costlier, condition-identical offers were collapsed into this row. */
  collapsedCount: number;
  /** True on exactly one option — the hotel's globally cheapest priced offer. */
  cheapestOfHotel: boolean;
}

export interface RoomGroup {
  key: string;
  /** Original supplier (EN) name from the group's cheapest option. */
  name: string;
  maxOccupancy?: number;
  options: RoomOption[];
  cheapestMinor: bigint | null;
  /** Sum of collapsedCount across options (for the faza-3 report). */
  collapsedTotal: number;
}

export interface GroupRatesResult {
  groups: RoomGroup[];
  stats: {
    offersIn: number;
    optionsOut: number;
    collapsed: number;
    groups: number;
  };
}

const FALLBACK_NAME = "Pokój";

function normName(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function boardKey(rate: LiteApiRate): string {
  return normName(rate.boardName ?? rate.boardType) || "none";
}

function cancellationKey(option: { freeCancellation: boolean; cancellationDeadline: string | null }): string {
  if (!option.freeCancellation) return "nrf";
  // Day precision — "free until 13 Jul 04:00" vs "…08:00" reads identically
  // to the guest, so hour-level differences should not block deduplication.
  return `free:${(option.cancellationDeadline ?? "").slice(0, 10)}`;
}

/** Lower price wins; null prices lose to any priced option. */
function cheaperOf(a: RoomOption, b: RoomOption): RoomOption {
  if (a.totalMinor === null) return b;
  if (b.totalMinor === null) return a;
  return b.totalMinor < a.totalMinor ? b : a;
}

function compareByPrice(a: { totalMinor: bigint | null }, b: { totalMinor: bigint | null }): number {
  if (a.totalMinor === null && b.totalMinor === null) return 0;
  if (a.totalMinor === null) return 1;
  if (b.totalMinor === null) return -1;
  // BigInt-safe trichotomy (subtraction would coerce and throw).
  return a.totalMinor < b.totalMinor ? -1 : a.totalMinor > b.totalMinor ? 1 : 0;
}

export function groupRates(roomTypes: LiteApiRoomType[]): GroupRatesResult {
  // 1. Flatten offers → options (offerId travels with each row; in practice
  //    LiteAPI ships exactly 1 rate per roomType, but we iterate defensively).
  const flat: RoomOption[] = [];
  for (const rt of roomTypes) {
    for (const rate of rt.rates) {
      flat.push({
        offerId: rt.offerId,
        rate,
        totalMinor: rateTotalMinor(rate),
        freeCancellation: isFreeCancellation(rate),
        cancellationDeadline: rateCancellationDeadline(rate),
        collapsedCount: 0,
        cheapestOfHotel: false,
      });
    }
  }

  // 2. Group by normalized original name + capacity.
  const groupsByKey = new Map<string, RoomOption[]>();
  for (const opt of flat) {
    const key = `${normName(opt.rate.name) || normName(FALLBACK_NAME)}|${opt.rate.maxOccupancy ?? ""}`;
    const bucket = groupsByKey.get(key);
    if (bucket) bucket.push(opt);
    else groupsByKey.set(key, [opt]);
  }

  // 3. Deduplicate inside each group (identical terms → keep cheapest).
  const groups: RoomGroup[] = [];
  for (const [key, options] of groupsByKey) {
    const byCondition = new Map<string, RoomOption>();
    for (const opt of options) {
      const cond = `${boardKey(opt.rate)}|${cancellationKey(opt)}|${opt.rate.maxOccupancy ?? ""}`;
      const existing = byCondition.get(cond);
      if (!existing) {
        byCondition.set(cond, opt);
      } else {
        const winner = cheaperOf(existing, opt);
        winner.collapsedCount = existing.collapsedCount + opt.collapsedCount + 1;
        byCondition.set(cond, winner);
      }
    }
    const deduped = [...byCondition.values()].sort(compareByPrice);
    const cheapest = deduped[0];
    groups.push({
      key,
      name: cheapest?.rate.name?.trim() || FALLBACK_NAME,
      maxOccupancy: cheapest?.rate.maxOccupancy,
      options: deduped,
      cheapestMinor: cheapest?.totalMinor ?? null,
      collapsedTotal: deduped.reduce((s, o) => s + o.collapsedCount, 0),
    });
  }

  // 4. Sort groups by their cheapest option.
  groups.sort((a, b) => compareByPrice({ totalMinor: a.cheapestMinor }, { totalMinor: b.cheapestMinor }));

  // 5. Flag the hotel's single globally-cheapest option (badge "Najtańsza
  //    opcja" — exactly one, never per-group).
  let best: RoomOption | null = null;
  for (const g of groups) {
    for (const o of g.options) {
      if (o.totalMinor === null) continue;
      if (best === null || o.totalMinor < best.totalMinor!) best = o;
    }
  }
  if (best) best.cheapestOfHotel = true;

  const optionsOut = groups.reduce((s, g) => s + g.options.length, 0);
  return {
    groups,
    stats: {
      offersIn: flat.length,
      optionsOut,
      collapsed: flat.length - optionsOut,
      groups: groups.length,
    },
  };
}
