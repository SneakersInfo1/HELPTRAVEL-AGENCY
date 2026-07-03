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

// Wynik pobrania ceny. Rozróżnienie null vs "error" jest KRYTYCZNE dla
// uczciwości listy wyników: null = LiteAPI potwierdziło brak ofert dla dat
// (hotel wyprzedany), "error" = NIE WIEMY (padł fetch/endpoint). Audyt
// 2026-07-03: awaria /rates/batch mapowała się na null → cała lista
// pokazywała „Brak dostępnych hoteli w tym terminie", choć hotele były.
export type PriceResult = SlimRate | null | "error";

// LiteAPI rates run ~1-2s/hotel, but the API itself happily handles
// hotelIds[] arrays much larger than 3 — the bottleneck was our batching,
// not the upstream. Audit 2026-05-26 showed that 30 hotels × BATCH_SIZE=3
// = 10 sequential batches × ~800ms LiteAPI latency was ~4× slower than a
// single batch of 12-15. Bumped to 12 (and concurrency lowered to 3 since
// each batch now does more work). The audit also raised the /api/hotels/
// rates/batch hotelIds cap to 30 so this isn't artificially clipped.
//
// 2026-05-28 follow-up #1: results page ships the FULL meta pool (up to
// 1000 hotels). Bumped to BATCH_SIZE=24, MAX_CONCURRENT=5 → ~7s for a
// cold Barcelona-sized scan.
//
// 2026-06-27 KOREKTA (zmierzone na żywo, prod): wcześniejsze „~600-800 ms na
// batch" było BŁĘDNE. Realnie `/hotels/rates` ma TWARDĄ PODŁOGĘ ~3,3 s na call
// (zimno) niezależnie od rozmiaru batcha (batch 10 → 3,7 s, 50 → 5,9 s, 100 →
// 8,8 s). Tej podłogi NIE da się obejść — jedyne wyjście to cache (Redis +
// teraz Next Data Cache). Dwie zmiany, które realnie pomogły:
//   • Batch route woła getRates z `maxRatesPerHotel: 1` → payload 25 MB → 0,15 MB
//     (170×), call 6,8 s → 3,8 s, a 0,15 MB MIEŚCI się w cache (drugi user = hit).
//   • Pula metadanych 1000 → 300 → 6 batchy zamiast 20.
// Po fixie (zimno): wszystkie 6 batchy lecą równolegle → ~4 s na KOMPLET cen,
// ~80 KB/batch. Ciepły Redis: <300 ms (route nie woła LiteAPI w ogóle).
//
// BATCH_SIZE 50 / MAX_CONCURRENT 10 zostają: większe batche lepiej amortyzują
// podłogę 3,3 s (mniej round-tripów). Jak LiteAPI zwróci 4xx od rozmiaru —
// zejdź do 24.
const BATCH_SIZE = 50;
const MAX_CONCURRENT = 10;
const WINDOW_MS = 60; // coalescing window

type Pending = {
  hotelId: string;
  resolve: (v: PriceResult) => void;
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

// Pojedyncza ponowka po krótkiej pauzie — łapie przejściowe czknięcia
// (chwilowy 5xx, zerwane połączenie na mobile) bez lawiny requestów.
const RETRY_DELAY_MS = 800;

async function postBatch(g: Group, hotelIds: string[]): Promise<Record<string, SlimRate | null>> {
  const res = await fetch("/api/hotels/rates/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotelIds, ...g.ctx }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { rates: Record<string, SlimRate | null> };
  return data.rates ?? {};
}

async function runBatch(g: Group, batch: Pending[]): Promise<void> {
  const hotelIds = batch.map((b) => b.hotelId);
  try {
    const rates = await postBatch(g, hotelIds);
    for (const p of batch) p.resolve(rates[p.hotelId] ?? null);
  } catch {
    try {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      const rates = await postBatch(g, hotelIds);
      for (const p of batch) p.resolve(rates[p.hotelId] ?? null);
    } catch {
      // Dwukrotna porażka fetcha → "error", NIGDY null: null znaczy
      // „potwierdzony brak miejsc" i ukrywa hotel z listy.
      for (const p of batch) p.resolve("error");
    }
  }
}

export function fetchHotelPrice(q: PriceQuery): Promise<PriceResult> {
  const key = groupKey(q);
  let g = groups.get(key);
  if (!g) {
    const { hotelId: _omit, ...ctx } = q;
    void _omit;
    g = { ctx, queue: [], timer: null, inFlight: 0 };
    groups.set(key, g);
  }
  return new Promise<PriceResult>((resolve) => {
    g!.queue.push({ hotelId: q.hotelId, resolve });
    if (g!.timer === null && g!.inFlight < MAX_CONCURRENT) {
      g!.timer = setTimeout(() => void flush(key), WINDOW_MS);
    }
  });
}
