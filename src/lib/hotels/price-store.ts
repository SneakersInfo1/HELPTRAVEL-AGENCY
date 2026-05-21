"use client";

// Persistent in-memory price store (per browser tab) layered over the
// request batcher. Why it exists: filtering/sorting re-renders (and even
// soft navigations) must NOT re-hit the network. Prices for a given
// (hotel, search context) are fetched once, kept here, and read
// synchronously forever after — so re-sorting by price or applying a
// price filter is instant. Redis (server) is the cross-session backstop;
// this is the in-tab one.

import { fetchHotelPrice, type PriceQuery, type SlimRate } from "./price-batcher";

export type PriceEntry = SlimRate | null | "loading";

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
  if (existing !== undefined) return; // already loading / resolved
  store.set(key, "loading");
  // Note: no emit() here — "loading" is the default the UI assumes.
  fetchHotelPrice(q)
    .then((rate) => {
      store.set(key, rate);
    })
    .catch(() => {
      store.set(key, null);
    })
    .finally(() => {
      emit();
    });
}
