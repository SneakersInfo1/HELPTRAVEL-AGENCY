// /api/cron/warm-flights — prewarming cache ofert lotów (Vercel Cron, plan Pro).
//
// PROBLEM: /flights/rates ma zimną podłogę ~6 s (zmierzone na prod 2026-07-11),
// a loty — inaczej niż hotele — nie miały prewarmingu. TEN cron co 30 min grzeje
// Redis (`flrt:v2`) dla popularnych tras WAW/KRK→kierunek × typowe okna dat, więc
// realny użytkownik szukający np. „WAW→Barcelona, najbliższy weekend" dostaje
// oferty z cache w <300 ms zamiast czekać 6 s.
//
// Grzejemy DOKŁADNIE tym samym helperem (searchFlightOffers) i kluczem
// (flightRatesCacheKey) co route /api/flights/rates → gwarancja cache-hitu.
// Zapis z kind="warm" (dłuższy TTL, wpis przeżywa cykl crona).
//
// Bezpieczeństwo: wymaga `Authorization: Bearer ${CRON_SECRET}` (jak warm-rates).
// Vercel dołącza nagłówek automatycznie do wywołań crona.

import { NextRequest, NextResponse } from "next/server";
import { zajmijBlokade } from "@/lib/cron/lock";

import { searchFlightOffers } from "@/lib/flights/search-offers";
import { flightRatesCacheKey, setCachedFlightOffers } from "@/lib/flights/rates-cache";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import {
  computeWarmDateWindows,
  WARM_FLIGHT_ADULTS,
  WARM_FLIGHT_CONCURRENCY,
  WARM_FLIGHT_DEST_IATAS,
  WARM_FLIGHT_KRK_TOP,
  WARM_FLIGHT_ORIGINS,
  WARM_FLIGHT_TIME_BUDGET_MS,
} from "@/lib/hotels/warm-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

interface FlightWarmTask {
  origin: string;
  destination: string;
  depart: string;
  ret: string;
  label: string;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/warm-flights] CRON_SECRET nie ustawiony — odmawiam (ustaw zmienną w Vercel).");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Blokada rozproszona — patrz src/lib/cron/lock.ts. Nakladajace sie
  // przebiegi dublowaly koszt LiteAPI i gubily aktualizacje przy
  // wzorcu odczyt-scal-zapis. Zajete = 200 "skipped_locked", bo to
  // sytuacja normalna; 5xx wywolaloby ponawianie i pogorszylo sprawe.
  const blokada = await zajmijBlokade("warm-flights", 360);
  if (!blokada.zdobyta) {
    console.info("[cron/warm-flights] poprzedni przebieg wciaz trwa — pomijam");
    return NextResponse.json({ ok: true, status: "skipped_locked" });
  }

  const startedAt = Date.now();
  // Grzejemy dwa dominujące wzorce leisure: najbliższy weekend (2 noce) i
  // tydzień wakacji (7 nocy). weekend-2 pomijamy, by trzymać wolumen calli.
  const allWindows = computeWarmDateWindows();
  const windows = allWindows.filter((w) => w.label === "weekend-1" || w.label === "tydzien-1");

  // Budowa zadań: WAW grzeje wszystkie kierunki, KRK tylko top-N.
  const tasks: FlightWarmTask[] = [];
  for (const origin of WARM_FLIGHT_ORIGINS) {
    const dests = origin === "WAW" ? WARM_FLIGHT_DEST_IATAS : WARM_FLIGHT_DEST_IATAS.slice(0, WARM_FLIGHT_KRK_TOP);
    // origins i dests to rozłączne zbiory (WAW/KRK vs cele wakacyjne) — bez
    // sprawdzania origin===destination (byłoby martwe, TS słusznie to flaguje).
    for (const destination of dests) {
      for (const w of windows) {
        tasks.push({
          origin,
          destination,
          depart: w.checkin,
          ret: w.checkout,
          label: `${origin}-${destination}/${w.label}`,
        });
      }
    }
  }

  let warmed = 0;
  let empty = 0;
  let failed = 0;
  let skipped = 0;

  await runPool(tasks, WARM_FLIGHT_CONCURRENCY, async (t) => {
    if (Date.now() - startedAt > WARM_FLIGHT_TIME_BUDGET_MS) {
      skipped++;
      return;
    }
    try {
      // Ten sam kształt wejścia co żądanie użytkownika (round trip, 2 dorosłych,
      // ECONOMY/PLN z domyślnych schematu) → identyczny klucz cache.
      const input = FlightSearchInputSchema.parse({
        legs: [
          { origin: t.origin, destination: t.destination, date: t.depart, direction: "OUTBOUND" },
          { origin: t.destination, destination: t.origin, date: t.ret, direction: "INBOUND" },
        ],
        adults: WARM_FLIGHT_ADULTS,
      });
      const offers = await searchFlightOffers(input);
      await setCachedFlightOffers(flightRatesCacheKey(input), offers, "warm");
      if (offers.length > 0) warmed++;
      else empty++;
    } catch (err) {
      failed++;
      console.warn(`[cron/warm-flights] '${t.label}' nieudany:`, err instanceof Error ? err.message : err);
    }
  });

  const summary = {
    ok: true,
    origins: WARM_FLIGHT_ORIGINS.length,
    windows: windows.length,
    tasks: tasks.length,
    warmed,
    empty,
    failed,
    skipped,
    durationMs: Date.now() - startedAt,
  };
  console.log("[cron/warm-flights]", JSON.stringify(summary));
  await blokada.zwolnij();
  return NextResponse.json(summary);
}
