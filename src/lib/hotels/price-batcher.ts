"use client";

// Client-side price batcher for progressive (Booking-style) loading of
// hotel prices on the results list. Each card calls fetchHotelPrice() on
// mount; this module coalesces the calls (per identical search context)
// into small parallel batches against /api/hotels/rates/batch so the page
// is interactive immediately and prices stream in.

export interface SlimRate {
  totalAmount: number;
  currency: string;
  boardName?: string;
  refundableTag?: string;
  cancellationDeadline?: string;
  offerId: string;
  rateId: string;
}

export interface PriceQuery {
  hotelId: string;
  checkin: string;
  checkout: string;
  adults: number;
  children: number[];
  rooms: number;
  currency: string;
}

// LiteAPI rates run ~1-2s/hotel, but the API itself happily handles
// hotelIds[] arrays much larger than 3 — the bottleneck was our batching,
// not the upstream. Audit 2026-05-26 showed that 30 hotels × BATCH_SIZE=3
// = 10 sequential batches × ~800ms LiteAPI latency was ~4× slower than a
// single batch of 12-15. Bumped to 12 (and concurrency lowered to 3 since
// each batch now does more work). The audit also raised the /api/hotels/
// rates/batch hotelIds cap to 30 so this isn't artificially clipped.
//
// If LiteAPI ever returns batch-size-related 4xx, drop this back to 8.
const BATCH_SIZE = 12;
const MAX_CONCURRENT = 3;
const WINDOW_MS = 60; // coalescing window

type Pending = {
  hotelId: string;
  resolve: (v: SlimRate | null) => void;
};

interface Group {
  ctx: Omit<PriceQuery, "hotelId">;
  queue: Pending[];
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: number;
}

const groups = new Map<string, Group>();

function groupKey(q: PriceQuery): string {
  return [q.checkin, q.checkout, q.adults, q.children.join("."), q.rooms, q.currency].join("|");
}

async function flush(key: string): Promise<void> {
  const g = groups.get(key);
  if (!g) return;
  g.timer = null;
  while (g.queue.length > 0 && g.inFlight < MAX_CONCURRENT) {
    const batch = g.queue.splice(0, BATCH_SIZE);
    g.inFlight += 1;
    void runBatch(g, batch).finally(() => {
      g.inFlight -= 1;
      if (g.queue.length > 0) void flush(key);
      else if (g.inFlight === 0) groups.delete(key);
    });
  }
}

async function runBatch(g: Group, batch: Pending[]): Promise<void> {
  const hotelIds = batch.map((b) => b.hotelId);
  try {
    const res = await fetch("/api/hotels/rates/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelIds, ...g.ctx }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates: Record<string, SlimRate | null> };
    for (const p of batch) p.resolve(data.rates?.[p.hotelId] ?? null);
  } catch {
    // Network/endpoint failure → resolve null so the card shows a
    // graceful "price unavailable" state instead of hanging.
    for (const p of batch) p.resolve(null);
  }
}

export function fetchHotelPrice(q: PriceQuery): Promise<SlimRate | null> {
  const key = groupKey(q);
  let g = groups.get(key);
  if (!g) {
    const { hotelId: _omit, ...ctx } = q;
    void _omit;
    g = { ctx, queue: [], timer: null, inFlight: 0 };
    groups.set(key, g);
  }
  return new Promise<SlimRate | null>((resolve) => {
    g!.queue.push({ hotelId: q.hotelId, resolve });
    if (g!.timer === null && g!.inFlight < MAX_CONCURRENT) {
      g!.timer = setTimeout(() => void flush(key), WINDOW_MS);
    }
  });
}
