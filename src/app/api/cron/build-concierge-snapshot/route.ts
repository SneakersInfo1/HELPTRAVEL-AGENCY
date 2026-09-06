// /api/cron/build-concierge-snapshot — dedykowany build snapshotu konsjerża.
//
// DLACZEGO OSOBNY CRON, a nie rozbudowa `warm-rates` (§23). Tamten job robi
// dziś cztery rzeczy naraz (metadane hoteli, grzanie stawek, ceny lotów,
// składanie pakietów) i mieści się w 178–280 s przy limicie 300 s — czyli do
// 93% budżetu. Nie ma tam miejsca na ani jedno okno więcej. Rozdzielenie daje
// temu buildowi własne 300 s i własną blokadę, a przy okazji izoluje ryzyko:
// awaria snapshotu konsjerża nie może zabrać cen „od X zł" z homepage.
//
// `warm-rates` zostaje NIETKNIĘTY i dalej pisze `dstprice:v1` dla homepage
// i /wyjazdy. Ten cron pisze `csnap:v1` — inny kształt (rekord na kierunek ×
// wylot × okno zamiast jednego minimum na kierunek) i inny cykl życia
// (staging → walidacja → atomowy promote zamiast merge'a w miejscu).
//
// CARRY-FORWARD (§40) jest tu kluczowy, nie kosmetyczny: jeden przebieg
// odświeża JEDEN segment rotacji (~110 z 1020 zadań), więc publikowany
// snapshot to zawsze „poprzedni ACTIVE minus rekordy przeterminowane plus to,
// co właśnie policzyliśmy". Bez tego każda publikacja kasowałaby 90% pokrycia.

import { NextRequest, NextResponse } from "next/server";

import { zajmijBlokade } from "@/lib/cron/lock";
import { fetchHotelsForDestination } from "@/lib/liteapi";
import { searchFlightRates } from "@/lib/flights/client";
import { normalizeRatesResponse } from "@/lib/flights/display";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  setCachedFlightOffers,
} from "@/lib/flights/rates-cache";
import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import {
  computePackagePerPerson,
  minPerNightFromRates,
  minTotalFromOffers,
} from "@/lib/prices/destination-price-snapshot";
import { listAllDestinations } from "@/lib/mvp/destinations-seed";
import { travelNowMs, travelToday } from "@/lib/time/travel-now";
import { isBookableStart } from "@/lib/concierge/travel-dates";
import { computeCoverage, isUsableRecord } from "@/lib/snapshot/coverage";
import {
  CONCURRENCY,
  FLIGHT_ADULTS,
  HOTELS_PER_DEST,
  LOCK_TTL_SECONDS,
  RUN_INTERVAL_MS,
  SEGMENT_COUNT,
  TASK_BUDGET,
  TIER_B_WINDOWS,
  TIME_BUDGET_MS,
} from "@/lib/snapshot/config";
import { planRun, segmentForNow, type WarmTask } from "@/lib/snapshot/rotation";
import {
  publishSnapshot,
  readActiveSnapshot,
  writeStaging,
} from "@/lib/snapshot/store";
import {
  buildDestinationTiers,
  ORIGIN_TIER_A,
  ORIGIN_TIER_B,
  type TierSeedRecord,
} from "@/lib/snapshot/tiers";
import {
  SNAPSHOT_VERSION,
  snapshotRecordKey,
  type ConciergeSnapshot,
  type SnapshotRecord,
} from "@/lib/snapshot/types";
import { buildWindowMatrix, WINDOW_MONTHS_AHEAD, WINDOW_NIGHTS } from "@/lib/snapshot/windows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/** Pool współbieżności — jak w pozostałych cronach tego repo. */
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx]);
      }
    }),
  );
}

interface RunStats {
  processed: number;
  flightOk: number;
  flightMiss: number;
  flightCacheHit: number;
  hotelOk: number;
  hotelMiss: number;
  failed: number;
  timedOut: number;
  metadataCalls: number;
  liteApiCalls: number;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/build-concierge-snapshot] CRON_SECRET nie ustawiony — odmawiam.");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // §34: blokada z runId. Zajęte = 200 „skipped_locked" (sytuacja normalna;
  // 5xx wywołałoby ponawianie i pogorszyło sprawę).
  const blokada = await zajmijBlokade("build-concierge-snapshot", LOCK_TTL_SECONDS);
  if (!blokada.zdobyta) {
    console.info("[cron/build-concierge-snapshot] poprzedni przebieg wciąż trwa — pomijam");
    return NextResponse.json({ ok: true, status: "skipped_locked" });
  }

  const startedAt = Date.now();
  const nowMs = travelNowMs();
  const todayIso = travelToday(nowMs);
  const runId = `${todayIso}-${startedAt.toString(36)}`;

  try {
    // Parametry pozwalają zrobić mały przebieg próbny na Preview (§69) bez
    // czekania na pełny budżet. Poza tym zero wpływu na produkcyjny harmonogram.
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const taskBudget = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, TASK_BUDGET) : TASK_BUDGET;
    const dryRun = url.searchParams.get("dryRun") === "1";

    const seed = listAllDestinations() as unknown as TierSeedRecord[];
    const tiered = buildDestinationTiers(seed);
    const windows = buildWindowMatrix(todayIso);
    const segment = segmentForNow(nowMs, RUN_INTERVAL_MS, SEGMENT_COUNT);
    const tasks = planRun(tiered, windows, { tierA: ORIGIN_TIER_A, tierB: ORIGIN_TIER_B }, {
      segment,
      segmentCount: SEGMENT_COUNT,
      taskBudget,
      tierBWindows: TIER_B_WINDOWS,
    });

    const stats: RunStats = {
      processed: 0,
      flightOk: 0,
      flightMiss: 0,
      flightCacheHit: 0,
      hotelOk: 0,
      hotelMiss: 0,
      failed: 0,
      timedOut: 0,
      metadataCalls: 0,
      liteApiCalls: 0,
    };

    // Metadane hoteli per kierunek — RAZ na przebieg, bo są niezależne od okna.
    // Bez tego ten sam kierunek w ośmiu oknach płaciłby osiem razy za tę samą listę.
    const hotelIdsCache = new Map<string, string[]>();
    async function hotelIdsFor(task: WarmTask): Promise<string[]> {
      const cached = hotelIdsCache.get(task.dest.id);
      if (cached) return cached;
      try {
        stats.metadataCalls += 1;
        stats.liteApiCalls += 1;
        const list = await fetchHotelsForDestination({
          city: task.dest.cityEn,
          country: task.dest.countryCode ?? task.dest.countryEn,
          lat: task.dest.lat ?? undefined,
          lng: task.dest.lng ?? undefined,
          limit: HOTELS_PER_DEST,
        });
        const ids = (list.data ?? []).map((h) => h.id).slice(0, HOTELS_PER_DEST);
        hotelIdsCache.set(task.dest.id, ids);
        return ids;
      } catch (err) {
        console.warn(
          `[cron/build-concierge-snapshot] metadane '${task.dest.id}' nieudane:`,
          err instanceof Error ? err.message : err,
        );
        hotelIdsCache.set(task.dest.id, []);
        return [];
      }
    }

    const freshRecords = new Map<string, SnapshotRecord>();

    await runPool(tasks, CONCURRENCY, async (task) => {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        stats.timedOut += 1;
        return;
      }
      const { dest, window, origin } = task;
      if (!dest.iata) return;
      try {
        stats.processed += 1;

        // ── Lot. Najpierw cache `flrt:v2` (ten sam klucz co ścieżka
        // użytkownika), na miss live + zapis z kind="warm". Dzięki temu build
        // snapshotu PRZY OKAZJI grzeje cache realnych wyszukań (§41, §49).
        const input = FlightSearchInputSchema.parse({
          legs: [
            { origin, destination: dest.iata, date: window.checkin, direction: "OUTBOUND" },
            { origin: dest.iata, destination: origin, date: window.checkout, direction: "INBOUND" },
          ],
          adults: FLIGHT_ADULTS,
        });
        const cacheKey = flightRatesCacheKey(input);
        let offers = await getCachedFlightOffers(cacheKey);
        if (offers) {
          stats.flightCacheHit += 1;
        } else {
          stats.liteApiCalls += 1;
          offers = normalizeRatesResponse(await searchFlightRates(input));
          await setCachedFlightOffers(cacheKey, offers, "warm");
        }
        const flightTotal = minTotalFromOffers(offers);
        // Cena za osobę: `total` to kwota za CAŁĄ rezerwację (tak liczy
        // warm-rates), a pytamy o dwoje — więc dzielimy.
        const flightPln = flightTotal === null ? null : Math.floor(flightTotal / FLIGHT_ADULTS);
        if (flightPln === null) stats.flightMiss += 1;
        else stats.flightOk += 1;

        // ── Hotel. Ten sam helper co lista wyników → identyczny klucz cache.
        const ids = await hotelIdsFor(task);
        let hotelPlnPerNight: number | null = null;
        if (ids.length > 0) {
          stats.liteApiCalls += 1;
          const res = await resolveSlimRates(ids, {
            checkin: window.checkin,
            checkout: window.checkout,
            adults: 2,
            children: [],
            rooms: 1,
            currency: "PLN",
          });
          hotelPlnPerNight = minPerNightFromRates(res.rates, window.checkin, window.checkout);
        }
        if (hotelPlnPerNight === null) stats.hotelMiss += 1;
        else stats.hotelOk += 1;

        // Pakiet TYLKO gdy oba składniki pochodzą z TEGO SAMEGO okna — żadnego
        // sklejania minimów z różnych terminów (ta sama zasada co w warm-rates).
        const perPersonPln =
          flightPln !== null && hotelPlnPerNight !== null
            ? computePackagePerPerson(flightPln, hotelPlnPerNight, window.checkin, window.checkout)
            : null;

        const key = snapshotRecordKey(dest.id, origin, window.checkin, window.nights);
        freshRecords.set(key, {
          destId: dest.id,
          cityEn: dest.cityEn,
          cityPl: dest.cityPl,
          countryEn: dest.countryEn,
          countryPl: dest.countryPl,
          origin,
          destIata: dest.iata,
          checkin: window.checkin,
          checkout: window.checkout,
          month: window.month,
          year: window.year,
          nights: window.nights,
          flightPln,
          hotelPlnPerNight,
          perPersonPln,
          currency: "PLN",
          tier: dest.tier,
          pricedAt: Date.now(),
          carriedForward: false,
        });
      } catch (err) {
        stats.failed += 1;
        console.warn(
          `[cron/build-concierge-snapshot] zadanie '${dest.id}/${origin}/${window.label}' nieudane:`,
          err instanceof Error ? err.message : err,
        );
      }
    });

    // ── Złożenie snapshotu: carry-forward + świeże rekordy (§40).
    const active = await readActiveSnapshot();
    const merged = new Map<string, SnapshotRecord>();
    let carried = 0;
    let droppedExpired = 0;
    for (const [key, record] of Object.entries(active?.records ?? {})) {
      // Rekord z minionym terminem NIE jest przenoszony — to jest miejsce,
      // w którym przeszłość wypada ze snapshotu sama z siebie.
      if (!isBookableStart(record.checkin, todayIso)) {
        droppedExpired += 1;
        continue;
      }
      if (!isUsableRecord(record, todayIso, nowMs)) {
        droppedExpired += 1;
        continue;
      }
      merged.set(key, { ...record, carriedForward: true });
      carried += 1;
    }
    // Świeże nadpisują przeniesione — ale tylko te, które REALNIE coś wniosły.
    // Zadanie, które nie znalazło ani lotu, ani hotelu, nie może skasować
    // dobrego starszego wpisu (to jest sedno „keep good stale data").
    let replaced = 0;
    for (const [key, record] of freshRecords) {
      const previous = merged.get(key);
      if (record.perPersonPln === null && previous && previous.perPersonPln !== null) continue;
      if (previous) replaced += 1;
      merged.set(key, record);
    }

    const records = [...merged.values()];
    const coverage = computeCoverage(records, tiered, nowMs);
    const tierCounts = tiered.reduce(
      (acc, t) => {
        acc[t.tier] += 1;
        return acc;
      },
      { A: 0, B: 0, C: 0 } as Record<"A" | "B" | "C", number>,
    );

    const snapshot: ConciergeSnapshot = {
      meta: {
        version: SNAPSHOT_VERSION,
        runId,
        builtAt: Date.now(),
        windowConfig: {
          monthsAhead: WINDOW_MONTHS_AHEAD,
          nights: WINDOW_NIGHTS,
          labels: windows.map((w) => w.label),
        },
        originConfig: { tierA: ORIGIN_TIER_A, tierB: ORIGIN_TIER_B },
        destinationTierConfig: { a: tierCounts.A, b: tierCounts.B, c: tierCounts.C },
        coverage,
        segment,
        segmentCount: SEGMENT_COUNT,
      },
      records: Object.fromEntries(merged),
    };

    let published = false;
    let problems: string[] = [];
    if (!dryRun) {
      await writeStaging(snapshot);
      const result = await publishSnapshot(snapshot, nowMs);
      published = result.published;
      problems = result.problems;
    }

    const durationMs = Date.now() - startedAt;
    // §50: jeden wiersz, z którego da się odtworzyć cały przebieg. Bez PII.
    const summary = {
      ok: true,
      job: "build-concierge-snapshot",
      runId,
      segment,
      segmentCount: SEGMENT_COUNT,
      plannedTasks: tasks.length,
      ...stats,
      carried,
      replaced,
      droppedExpired,
      records: records.length,
      coverageBefore: active?.meta.coverage.futureUsableCoveragePct ?? 0,
      coverageAfter: coverage.futureUsableCoveragePct,
      weightedCoverage: coverage.weightedCoveragePct,
      tierACoverage: coverage.tierACoveragePct,
      futureUsableDestinations: coverage.futureUsableDestinations,
      monthsCovered: coverage.monthsCovered,
      originsCovered: coverage.originsCovered,
      fresh: coverage.fresh,
      staleButUsable: coverage.staleButUsable,
      published,
      problems,
      dryRun,
      durationMs,
      budgetUsedPct: Math.round((durationMs / (maxDuration * 1000)) * 100),
    };
    console.log("[cron/build-concierge-snapshot]", JSON.stringify(summary));
    return NextResponse.json(summary);
  } finally {
    // Blokada zwalniana ZAWSZE — także gdy build rzuci. Compare-and-delete
    // w `zwolnij` gwarantuje, że nie skasujemy cudzej blokady po przekroczeniu TTL.
    await blokada.zwolnij();
  }
}
