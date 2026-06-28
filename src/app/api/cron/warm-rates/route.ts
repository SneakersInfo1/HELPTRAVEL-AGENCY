// /api/cron/warm-rates — pre-warming cache cen (Vercel Cron, plan Pro).
//
// PROBLEM: /hotels/rates ma twardą podłogę ~3,3 s na zimny call (zmierzone na
// prod). Tej podłogi nie da się obejść kodem — jedyne wyjście to ciepły cache.
// TEN cron co 30 min proaktywnie odświeża Redis dla top kierunków × typowych
// terminów, więc realny użytkownik szukający np. „Barcelona, najbliższy weekend"
// dostaje ceny z cache w <300 ms zamiast czekać ~4 s.
//
// Grzejemy DOKŁADNIE tym samym helperem (resolveSlimRates) co lista wyników →
// identyczny klucz cache. `forceRefresh: true` → zawsze świeże stawki + reset TTL.
//
// Bezpieczeństwo: wymaga nagłówka `Authorization: Bearer ${CRON_SECRET}`. Vercel
// dołącza go automatycznie do wywołań crona, gdy zmienna CRON_SECRET jest
// ustawiona w projekcie. Bez sekretu endpoint odrzuca (żeby nikt z zewnątrz nie
// palił limitu LiteAPI).

import { NextRequest, NextResponse } from "next/server";

import { fetchHotelsForDestination } from "@/lib/liteapi";
import { getTopDestinations } from "@/lib/mvp/destinations-seed";
import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import type { RateCacheContext } from "@/lib/hotels/rate-cache";
import {
  computeWarmDateWindows,
  WARM_CONCURRENCY,
  WARM_DESTINATION_COUNT,
  WARM_HOTELS_PER_DEST,
  WARM_TIME_BUDGET_MS,
} from "@/lib/hotels/warm-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Vercel Pro: pozwala na funkcje do 300 s. Cron grzeje sekwencyjnie z
// współbieżnością, ale dajemy zapas; twardy budżet czasu pilnuje WARM_TIME_BUDGET_MS.
export const maxDuration = 300;

// Prosty pool współbieżności — odpala `worker` dla każdego elementu, max N naraz.
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

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/warm-rates] CRON_SECRET nie ustawiony — odmawiam (ustaw zmienną w Vercel).");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const windows = computeWarmDateWindows();
  const dests = getTopDestinations(WARM_DESTINATION_COUNT);

  // 1) Metadane (hotelId) na kierunek — raz. Przy okazji grzeje Next Data Cache
  // dla /data/hotels tego miasta. Błąd pojedynczego kierunku nie wywala crona.
  const destHotels: Array<{ id: string; label: string; hotelIds: string[] }> = [];
  for (const d of dests) {
    try {
      const list = await fetchHotelsForDestination({
        city: d.city.en,
        country: d.country.code ?? d.country.pl,
        lat: d.lat,
        lng: d.lng,
        limit: WARM_HOTELS_PER_DEST,
      });
      const ids = (list.data ?? []).map((h) => h.id).slice(0, WARM_HOTELS_PER_DEST);
      if (ids.length) destHotels.push({ id: d.id, label: d.city.en, hotelIds: ids });
    } catch (err) {
      console.warn(`[cron/warm-rates] metadane '${d.city.en}' nieudane:`, err instanceof Error ? err.message : err);
    }
  }

  // 2) Zadania = (kierunek × okno dat). Occupancy: 2 dorosłych, 1 pokój, PLN —
  // najczęstszy wariant (cache jest kluczowany po occupancy).
  const tasks: Array<{ label: string; hotelIds: string[]; ctx: RateCacheContext }> = [];
  for (const dh of destHotels) {
    for (const w of windows) {
      tasks.push({
        label: `${dh.label}/${w.label}`,
        hotelIds: dh.hotelIds,
        ctx: { checkin: w.checkin, checkout: w.checkout, adults: 2, children: [], rooms: 1, currency: "PLN" },
      });
    }
  }

  // 3) Grzanie z współbieżnością + budżetem czasu. Odporne: błąd jednego zadania
  // nie zatrzymuje reszty.
  let calls = 0;
  let warmedHotels = 0;
  let skipped = 0;
  await runPool(tasks, WARM_CONCURRENCY, async (t) => {
    if (Date.now() - startedAt > WARM_TIME_BUDGET_MS) {
      skipped++;
      return;
    }
    try {
      const res = await resolveSlimRates(t.hotelIds, t.ctx, { forceRefresh: true });
      calls++;
      warmedHotels += Object.values(res.rates).filter((r) => r !== null).length;
    } catch (err) {
      console.warn(`[cron/warm-rates] grzanie '${t.label}' nieudane:`, err instanceof Error ? err.message : err);
    }
  });

  const durationMs = Date.now() - startedAt;
  const summary = {
    ok: true,
    destinations: destHotels.length,
    windows: windows.length,
    tasks: tasks.length,
    rateCalls: calls,
    warmedHotels,
    skipped,
    durationMs,
  };
  console.log("[cron/warm-rates]", JSON.stringify(summary));
  return NextResponse.json(summary);
}
