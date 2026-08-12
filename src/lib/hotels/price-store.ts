"use client";

// Persistent in-memory price store (per browser tab) layered over the
// request batcher. Why it exists: filtering/sorting re-renders (and even
// soft navigations) must NOT re-hit the network. Prices for a given
// (hotel, search context) are fetched once, kept here, and read
// synchronously forever after — so re-sorting by price or applying a
// price filter is instant. Redis (server) is the cross-session backstop;
// this is the in-tab one.

import { fetchHotelPrice, type PriceQuery, type SlimRate } from "./price-batcher";

// null = potwierdzony brak miejsc (LiteAPI odpowiedziało pustką),
// "error" = pobranie ceny padło (NIE wiemy, czy hotel jest dostępny).
export type PriceEntry = SlimRate | null | "loading" | "error";

/**
 * Jawny stan całego skanu cen dla listy wyników.
 *
 * Po co osobny typ: wcześniej „koniec skanu" znaczyło tylko tyle, że nic już
 * nie leci — a to jest PRAWDĄ ZARÓWNO wtedy, gdy wszystkie ceny doszły, jak
 * i wtedy, gdy wszystkie zapytania padły. Lista wyglądała wtedy na kompletną
 * mimo zera cen. Stan musi rozróżniać te przypadki, bo sterują innym
 * komunikatem i inną akcją.
 */
export type PipelineState = "loading" | "success" | "partial" | "failed";

function ctxKey(q: Omit<PriceQuery, "hotelId">): string {
  return [q.checkin, q.checkout, q.adults, [...q.children].sort((a, b) => a - b).join("."), q.rooms, q.currency].join("|");
}

function entryKey(q: PriceQuery): string {
  return `${ctxKey(q)}::${q.hotelId}`;
}

const store = new Map<string, PriceEntry>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Snapshot is a monotonic counter — cheap and stable for
// useSyncExternalStore; components re-read the store in render.
export function getVersion(): number {
  return version;
}

export function getPrice(q: PriceQuery): PriceEntry | undefined {
  return store.get(entryKey(q));
}

/**
 * Ensure a price is being (or has been) fetched. Safe to call on every
 * render — it dedupes via the store and the batcher. Resolves nothing;
 * subscribers are notified as values land.
 */
export function ensurePrice(q: PriceQuery): void {
  const key = entryKey(q);
  const existing = store.get(key);
  // "error" NIE jest stanem końcowym — kolejne ensurePrice (np. po powrocie
  // na listę albo zmianie strony) próbuje jeszcze raz.
  if (existing !== undefined && existing !== "error") return;
  store.set(key, "loading");
  // Note: no emit() here — "loading" is the default the UI assumes.
  fetchHotelPrice(q)
    .then((rate) => {
      store.set(key, rate);
    })
    .catch(() => {
      store.set(key, "error");
    })
    .finally(() => {
      emit();
    });
}

/**
 * Ponawia pobranie cen dla hoteli, których poprzednia próba padła.
 *
 * DLACZEGO ISTNIEJE. Jedyną drogą wyjścia z „części cen nie udało się
 * sprawdzić" było przeładowanie strony — czyli utrata przewinięcia, filtrów
 * i już pobranych cen po to, żeby powtórzyć kilka nieudanych zapytań.
 * Ponowienie samego PODZBIORU jest tańsze dla dostawcy i bezbolesne dla
 * gościa. Zwraca liczbę hoteli wziętych do ponowienia (0 = nie było czego).
 *
 * Ceny, które doszły poprawnie, NIE SĄ RUSZANE — jedna nieudana paczka nie
 * może kasować czterdziestu udanych.
 */
export function retryFailedPrices(hotelIds: string[], ctx: Omit<PriceQuery, "hotelId">): number {
  const prefix = ctxKey(ctx);
  const doPonowienia: string[] = [];
  for (const hotelId of hotelIds) {
    if (store.get(`${prefix}::${hotelId}`) === "error") doPonowienia.push(hotelId);
  }
  if (doPonowienia.length === 0) return 0;
  for (const hotelId of doPonowienia) store.delete(`${prefix}::${hotelId}`);
  emit(); // karty wracają do „Sprawdzam cenę", zanim polecą zapytania
  for (const hotelId of doPonowienia) ensurePrice({ hotelId, ...ctx });
  return doPonowienia.length;
}

/** Wyłącznie dla testów — store żyje w module i przeciekałby między przypadkami. */
export function __resetPriceStoreForTests(): void {
  store.clear();
  listeners.clear();
  version = 0;
}
