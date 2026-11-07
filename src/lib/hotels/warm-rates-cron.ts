// Przebieg crona /api/cron/warm-rates — wszystko poza autoryzacją i listą
// kierunków z seedu (ta zostaje w trasie, bo seed ma `import "server-only"`,
// którego nie da się załadować pod node:test). Dzięki temu cały przebieg —
// blokada, plan, stawki, snapshot, stan, alert — ma test integracyjny na
// atrapach (warm-rates-cron.test.ts).
//
// Grzejemy DOKŁADNIE tym samym helperem (resolveSlimRates) co lista wyników →
// identyczny klucz cache Redis. Stawki zawsze ŚWIEŻE: `forceRefresh` pomija
// Redis, a `skipDataCache` — Next Data Cache.
//
// INCYDENT 2026-11-06 („Task timed out after 300 seconds"): stawki szły przez
// Next Data Cache (revalidate 900 s, cron co 30 min = każdy wpis przeterminowany).
// Data Cache oddawał stare ceny od ręki (handler ~6 s), a dostawcę pytał w tle
// wszystkimi ~250 zadaniami naraz i BEZ sygnału przerwania. Funkcja czekała na
// to tło (`waitUntil`); jedno zapytanie zawisło na 298,7 s → limit platformy.
// Szczegóły i pomiary: docs/ops/RUNBOOK.md, sekcja „Cron warm-rates".

import { notify } from "@/lib/alerting/notify";
import { odpowiedzBezBlokady, zajmijBlokade } from "@/lib/cron/lock";
import { iataForCity } from "@/lib/flights/airports";
import { searchFlightRates } from "@/lib/flights/client";
import { normalizeRatesResponse } from "@/lib/flights/display";
import { createProviderGate } from "@/lib/flights/provider-gate";
import { isBackgroundFlightSearchEnabled } from "@/lib/flights/search-policy";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import { fetchHotelsForDestination } from "@/lib/liteapi";
// Tylko typ: moduł seedu ma `import "server-only"`, a import typu znika przy kompilacji.
import type { DestinationRecord } from "@/lib/mvp/destinations-seed";
import {
  computePackagePerPerson,
  destinationPriceKey,
  mergePriceSnapshot,
  minTotalFromOffers,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";
import { redisMayBeAvailable } from "@/lib/redis/client";
import { checkCronRedisBudget, flushRedisMetrics, usageMark, usageSince } from "@/lib/redis/metrics";
import { refreshTrustpilotSnapshot } from "@/lib/trust/trustpilot-snapshot";
import {
  computeSnapshotDateWindows,
  computeWarmDateWindows,
  SNAPSHOT_HOTELS_PER_DEST,
  WARM_ALERT_AFTER_FAILED_RUNS,
  WARM_CONCURRENCY,
  WARM_FLIGHTS_START_DEADLINE_MS,
  WARM_HARD_STOP_MS,
  WARM_HOTELS_PER_DEST,
  WARM_MAX_CONSECUTIVE_FAILURES,
  WARM_PLAN_BUDGET_MS,
  WARM_PLAN_CONCURRENCY,
  WARM_PLAN_MAX_AGE_MS,
  WARM_PLAN_REFRESH_PER_RUN,
  WARM_PLAN_TIMEOUT_MS,
  WARM_RATE_ATTEMPTS,
  WARM_RATE_TIMEOUT_MS,
  WARM_SNAPSHOT_DESTINATIONS_PER_RUN,
  WARM_TIME_BUDGET_MS,
} from "./warm-config";
import {
  buildWarmTasks,
  executeWarmTasks,
  isFailedWarmRun,
  nextRotationCursor,
  refreshHotelPlans,
  rotationSlice,
  runPool,
  shouldAlertWarmFailures,
  streakAtStart,
  type WarmDestination,
} from "./warm-runner";
import { readWarmStore, writeWarmPlans, writeWarmState, type WarmRunState } from "./warm-state";

/** Ile pierwszych błędów zadań trafia do logu (reszta tylko w licznikach). */
const MAX_FAILURE_LOGS = 3;

/** Kierunek crona: rekord seedu + grupa (core = bliskie okna co przebieg, snapshot = tylko tanie okna w rotacji). */
export interface WarmSeed {
  record: DestinationRecord;
  group: "core" | "snapshot";
}

/**
 * Jeden przebieg crona z blokadą rozproszoną (patrz src/lib/cron/lock.ts).
 * Nakładające się przebiegi dublowały koszt LiteAPI i gubiły aktualizacje
 * przy wzorcu odczyt-scal-zapis. Zajęte = 200 "skipped_locked", bo to sytuacja
 * normalna; 5xx wywołałoby ponawianie i pogorszyło sprawę.
 */
export async function runWarmRatesCron(seeds: readonly WarmSeed[]): Promise<Record<string, unknown>> {
  const blokada = await zajmijBlokade("warm-rates", 360);
  if (!blokada.zdobyta) return odpowiedzBezBlokady("warm-rates", blokada);
  try {
    return await warmRates(seeds);
  } finally {
    await blokada.zwolnij();
  }
}

async function warmRates(seeds: readonly WarmSeed[]): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const redisMark = usageMark();
  // Magazyn to jedyne wyjście tego crona — bez niego nie pytamy dostawcy wcale
  // (ten sam status co blokada przy trwałej awarii Redisa).
  const skipped = { ok: true, status: "skipped_store_unavailable" };
  if (!redisMayBeAvailable()) return skipped;

  const windows = computeWarmDateWindows();
  const cheapWindows = computeSnapshotDateWindows();
  const allIds = seeds.map((s) => s.record.id);
  const coreIds = seeds.filter((s) => s.group === "core").map((s) => s.record.id);

  // 1) Stan, potem plany. Partia tanich okien zależy od kursora ze stanu,
  // a dopiero partia mówi, czyje plany są potrzebne (core + partia ≤ 31
  // kluczy po ~1,6 KB). Dwa małe odczyty zamiast jednego dużego (46 planów).
  const stateRead = await readWarmStore([]);
  if (!stateRead.ok) {
    console.warn("[cron/warm-rates] odczyt stanu nieudany — przebieg pominięty:", errMessage(stateRead.error));
    return skipped;
  }
  const prev = stateRead.state;
  const slice = rotationSlice(allIds, prev.cursor, WARM_SNAPSHOT_DESTINATIONS_PER_RUN);
  const neededIds = [...new Set([...coreIds, ...slice.ids])];
  const store = await readWarmStore(neededIds);
  if (!store.ok) {
    console.warn("[cron/warm-rates] odczyt planu nieudany — przebieg pominięty:", errMessage(store.error));
    return skipped;
  }

  // Znacznik startu poprzedniego przebiegu, którego nikt nie wyczyścił =
  // platforma zabiła go przed końcem (np. limit 300 s). Seria rośnie już TU:
  // kolejne zabite przebiegi nie dochodzą do końcowego zapisu stanu.
  const { previousRunDied, failStreak: startStreak } = streakAtStart(prev);
  if (previousRunDied) {
    console.warn(
      `[cron/warm-rates] poprzedni przebieg (start ${new Date(prev.runningSince!).toISOString()}) nie dokończył pracy`,
    );
    if (shouldAlertWarmFailures(startStreak, WARM_ALERT_AFTER_FAILED_RUNS)) {
      await alertFailures(startStreak, { stopReason: "previous_run_killed", previousRunDied });
    }
  }
  // Bez znacznika startu nie wykrylibyśmy, że platforma zabiła TEN przebieg.
  // Magazyn, który nie przyjmuje ~150 B, i tak nie przyjmie wyników — pomijamy.
  if (!(await writeWarmState({ ...prev, failStreak: startStreak, runningSince: startedAt }))) {
    console.warn("[cron/warm-rates] zapis znacznika startu nieudany — przebieg pominięty");
    return skipped;
  }

  // Licznik REALNYCH zapytań HTTP do dostawcy (z próbami i łańcuchem
  // fallbacków metadanych) — Data Cache pominięty, więc nic tu nie jest odczytem.
  let providerRequests = 0;
  const countAttempt = () => {
    providerRequests++;
  };

  // 2) Plan hoteli: lista hotelId kierunku z Redisa; dostawca tylko dla
  // brakujących i najstarszych przeterminowanych (≤ 24 h).
  const seedById = new Map(seeds.map((s) => [s.record.id, s] as const));
  const needed = neededIds.map((id) => seedById.get(id)!).map((s) => ({ id: s.record.id, seed: s }));
  const plan = await refreshHotelPlans(needed, store.plans, {
    fetchIds: async ({ seed }, signal) => {
      const d = seed.record;
      const list = await fetchHotelsForDestination(
        {
          city: d.city.en,
          country: d.country.code ?? d.country.pl,
          lat: d.lat,
          lng: d.lng,
          limit: SNAPSHOT_HOTELS_PER_DEST,
        },
        { signal, timeoutMs: WARM_PLAN_TIMEOUT_MS, retries: 1, skipDataCache: true, onAttempt: countAttempt },
      );
      return (list.data ?? []).map((h) => h.id).slice(0, SNAPSHOT_HOTELS_PER_DEST);
    },
    now: Date.now,
    maxAgeMs: WARM_PLAN_MAX_AGE_MS,
    refreshCap: WARM_PLAN_REFRESH_PER_RUN,
    concurrency: WARM_PLAN_CONCURRENCY,
    budgetMs: WARM_PLAN_BUDGET_MS,
  });
  const planSaved = await writeWarmPlans(plan.updated);

  const dests: WarmDestination[] = [];
  for (const id of neededIds) {
    const s = seedById.get(id)!;
    const entry = plan.plans.get(id);
    if (!entry) continue;
    const d = s.record;
    dests.push({
      id: d.id,
      label: d.city.en,
      priceKey: destinationPriceKey(d.city.en, d.country.en),
      // IATA do ceny lotu: seed (airports[0], bywa kod metra jak ROM —
      // LiteAPI rozwija natywnie) z fallbackiem do słownika lotnisk.
      iata: d.airports?.[0] ?? iataForCity(d.city.en),
      group: s.group,
      hotelIds: entry.ids.slice(0, SNAPSHOT_HOTELS_PER_DEST),
    });
  }

  // 3) Zadania: bliskie okna core (zapis do cache wyników, co przebieg) + tanie
  // okna kierunków z partii (tylko snapshot „od X zł", bez zapisu do cache —
  // incydent transferu Upstash 2026-10-25).
  const tasks = buildWarmTasks({
    dests,
    nearWindows: windows,
    cheapWindows,
    sliceIds: slice.ids,
    nearHotels: WARM_HOTELS_PER_DEST,
    chunk: WARM_HOTELS_PER_DEST,
    deepWindowLabel: "tani-tydzien",
  });

  // 4) Wykonanie: pula o stałej równoległości, budżet czasu, twardy koniec,
  // bezpiecznik dostawcy. Każde zapytanie świeże, z limitem czasu, bez ponowień.
  let failureLogs = 0;
  const exec = await executeWarmTasks(tasks, {
    resolve: async (task, signal) => {
      const res = await resolveSlimRates(task.hotelIds, task.ctx, {
        forceRefresh: true,
        writeCache: task.writeCache,
        call: {
          signal,
          timeoutMs: WARM_RATE_TIMEOUT_MS,
          retries: WARM_RATE_ATTEMPTS,
          skipDataCache: true,
          onAttempt: countAttempt,
        },
      });
      return res.rates;
    },
    concurrency: WARM_CONCURRENCY,
    startedAt,
    budgetMs: WARM_TIME_BUDGET_MS,
    hardStopMs: WARM_HARD_STOP_MS,
    maxConsecutiveFailures: WARM_MAX_CONSECUTIVE_FAILURES,
    // Magazyn padł w trakcie (wyłącznik otwarty): wyniku i tak nie da się
    // zapisać — ani wpisów cache, ani snapshotu — więc nie palimy limitu LiteAPI.
    storeAvailable: redisMayBeAvailable,
    onFailure: (task, err) => {
      if (failureLogs++ < MAX_FAILURE_LOGS) {
        console.warn(`[cron/warm-rates] grzanie '${task.label}' nieudane:`, errMessage(err));
      }
    },
  });

  // Snapshot tylko z kierunków partii, które wykonały WSZYSTKIE zadania
  // z sukcesem: minimum z części okien mogłoby zawyżyć „od X zł" (wtedy
  // zostaje stary wpis, ważny 48 h). Przerwane i niezaczęte wracają pierwsze
  // w następnym przebiegu (kursor się na nich zatrzymuje); nieudane — w kolejnym
  // obiegu, bo kierunek, którego dostawca uparcie nie wycenia, zatrzymałby
  // rotację na zawsze. Kierunek bez listy hoteli też nie blokuje kursora
  // (np. miasto, dla którego dostawca nie ma hoteli).
  const incompleteKeys = new Set(
    dests
      .filter((d) => exec.unfinishedDestIds.has(d.id) || exec.failedDestIds.has(d.id))
      .map((d) => d.priceKey),
  );
  const bestPrice = new Map([...exec.bestPrice].filter(([key]) => !incompleteKeys.has(key)));
  const hotelByWindow = exec.hotelByWindow;
  let nextCursor = nextRotationCursor(allIds.length, slice, exec.unfinishedDestIds);

  // ── Loty (Faza 6): najtańszy lot w obie strony WAW→kierunek. Szukamy w OBU
  // tanich oknach (sobota-daleko 7 nocy ORAZ poniedziałek-środek tygodnia
  // 4 noce — wyloty poniedziałkowe bywają wyraźnie tańsze; właściciel
  // 2026-07-02: „niższe ceny lotów") i bierzemy minimum. Dopinamy TYLKO do
  // kierunków z wpisem cenowym hotelu (typ wymaga hotelFromPlnPerNight).
  // Concurrency 4 (nie WARM_CONCURRENCY): /flights/rates jest cięższy (~5-8 s).
  let flightCalls = 0;
  let flightPrices = 0;
  const flightByWindow = new Map<string, number>();
  const backgroundFlights = isBackgroundFlightSearchEnabled();
  const flightTasks: Array<{ label: string; priceKey: string; iata: string; w: (typeof cheapWindows)[number] }> = [];
  for (const dh of dests) {
    // Ceny lotów do kierunków tylko przy włączonych wyszukiwaniach w tle (search-policy.ts).
    if (!backgroundFlights || !dh.iata || !bestPrice.has(dh.priceKey)) continue;
    for (const w of cheapWindows) {
      flightTasks.push({ label: `${dh.label}/${w.label}`, priceKey: dh.priceKey, iata: dh.iata, w });
    }
  }
  // Bramka dostawcy: po kilku odmowach z rzędu (403/429) reszta wyszukiwań
  // tego przebiegu jest pomijana — patrz src/lib/flights/provider-gate.ts.
  const flightGate = createProviderGate();
  await runPool(flightTasks, 6, async (t) => {
    if (Date.now() - startedAt > WARM_FLIGHTS_START_DEADLINE_MS) return;
    if (!flightGate.open || !redisMayBeAvailable()) {
      flightGate.noteSkip();
      return;
    }
    try {
      const input = FlightSearchInputSchema.parse({
        legs: [
          { origin: "WAW", destination: t.iata, date: t.w.checkin, direction: "OUTBOUND" },
          { origin: t.iata, destination: "WAW", date: t.w.checkout, direction: "INBOUND" },
        ],
        adults: 1,
      });
      const res = await searchFlightRates(input, { source: "background" });
      flightGate.onSuccess();
      flightCalls++;
      const minTotal = minTotalFromOffers(normalizeRatesResponse(res));
      if (minTotal !== null) {
        const wk = `${t.priceKey}|${t.w.label}`;
        const prevW = flightByWindow.get(wk);
        if (prevW === undefined || minTotal < prevW) flightByWindow.set(wk, minTotal);
        const entry = bestPrice.get(t.priceKey)!;
        if (typeof entry.flightFromPln !== "number" || minTotal < entry.flightFromPln) {
          bestPrice.set(t.priceKey, {
            ...entry,
            flightFromPln: minTotal,
            flightDepart: t.w.checkin,
            flightReturn: t.w.checkout,
            flightComputedAt: Date.now(),
          });
        }
        flightPrices++;
      }
    } catch (err) {
      flightGate.onFailure(err);
      console.warn(`[cron/warm-rates] lot '${t.label}' nieudany:`, errMessage(err));
    }
  });

  // Pakiety „Cały wyjazd od X zł/os.": dla każdego kierunku minimum po tanich
  // oknach z pkg = lot(okno) + noce×hotel(okno)/2 — OBA składniki z tego
  // samego okna (uczciwe, rezerwowalne daty). Brak któregokolwiek → bez pkg.
  let pkgCount = 0;
  for (const [priceKey, entry] of bestPrice) {
    let best: { pkg: number; checkin: string; checkout: string } | null = null;
    for (const w of cheapWindows) {
      const wk = `${priceKey}|${w.label}`;
      const hotel = hotelByWindow.get(wk);
      const flight = flightByWindow.get(wk);
      if (hotel === undefined || flight === undefined) continue;
      const pkg = computePackagePerPerson(flight, hotel, w.checkin, w.checkout);
      if (pkg !== null && (best === null || pkg < best.pkg)) {
        best = { pkg, checkin: w.checkin, checkout: w.checkout };
      }
    }
    if (best) {
      bestPrice.set(priceKey, {
        ...entry,
        pkgPerPersonPln: best.pkg,
        pkgCheckin: best.checkin,
        pkgCheckout: best.checkout,
        pkgComputedAt: Date.now(),
      });
      pkgCount++;
    }
  }

  // Snapshot „Hotel od X zł/noc" dla homepage i /wyjazdy. Merge, nie replace:
  // kierunki spoza partii zachowują swój wpis (ważny 48 h). Nieudany zapis =
  // kursor zostaje na tej partii (następny przebieg ją powtórzy), a przebieg
  // liczy się jako nieudany — inaczej partia czekałaby pełny obieg ~3 h.
  let snapshotEntries = 0;
  let snapshotSaved = true;
  if (bestPrice.size > 0) {
    snapshotSaved = await mergePriceSnapshot(Object.fromEntries(bestPrice) as DestinationPriceSnapshot);
    if (snapshotSaved) snapshotEntries = bestPrice.size;
    else {
      console.warn("[cron/warm-rates] zapis snapshotu cen nieudany — partia zostaje do powtórki");
      nextCursor = slice.start;
    }
  }

  // Ocena Trustpilot do pasów zaufania — realny fetch max 1×/24 h (throttle
  // w module), porażka nie psuje crona ani nie kasuje starej wartości.
  // Bez magazynu nie ma sensu: throttle czyta datę z Redisa, a wynik i tak
  // nie miałby gdzie trafić.
  let trustpilot = "failed";
  if (redisMayBeAvailable()) {
    try {
      trustpilot = await refreshTrustpilotSnapshot();
    } catch (err) {
      console.warn("[cron/warm-rates] trustpilot refresh:", errMessage(err));
    }
  }

  // Stan: kursor rotacji, licznik nieudanych przebiegów, znacznik startu
  // wyczyszczony (= przebieg dokończony). `ok` mówi o TYM przebiegu; poprzedni,
  // zabity przez platformę, jest już wliczony w `startStreak`.
  const runFailed =
    !snapshotSaved ||
    isFailedWarmRun(exec, {
      tasks: tasks.length,
      neededPlans: neededIds.length,
      missingPlans: plan.missing,
    });
  const state: WarmRunState = {
    cursor: nextCursor,
    failStreak: runFailed ? startStreak + 1 : 0,
    runningSince: null,
    lastFinishedAt: Date.now(),
    lastStopReason: exec.stopReason,
  };
  // Druga próba: zostawiony znacznik startu następny przebieg uznałby za
  // przebieg zabity przez platformę.
  const stateSaved = (await writeWarmState(state)) || (await writeWarmState(state));

  const durationMs = Date.now() - startedAt;
  const summary = {
    ok: !runFailed,
    // Dlaczego przebieg się skończył: completed | time_budget | provider_refused
    // | provider_unavailable | store_lost.
    stopReason: exec.stopReason,
    destinations: dests.length,
    coreDests: dests.filter((d) => d.group === "core").length,
    rotation: { from: slice.start, size: slice.ids.length, of: allIds.length, next: nextCursor },
    windows: windows.length + cheapWindows.length,
    tasks: tasks.length,
    cacheWriteTasks: tasks.filter((t) => t.writeCache).length,
    // Zadania: wysłane / udane / nieudane (w tym limit czasu i odmowy) /
    // przerwane przez nas / niezaczęte (budżet albo zatrzymanie).
    rateCalls: exec.attempted,
    succeeded: exec.succeeded,
    failed: exec.failed,
    timedOut: exec.timedOut,
    refused: exec.refused,
    aborted: exec.aborted,
    skipped: exec.notStarted,
    // Wszystkie zapytania HTTP do LiteAPI w tym przebiegu (stawki + plany, z próbami).
    providerRequests,
    // Plan hoteli: z Redisa (trafienia) vs pobrane od dostawcy.
    plan: {
      hits: plan.hits,
      refreshed: plan.refreshed,
      failed: plan.failed,
      missing: plan.missing,
      saved: planSaved,
    },
    warmedHotels: exec.warmedHotels,
    previousRunDied,
    failStreak: state.failStreak,
    stateSaved,
    flightCalls,
    flightPrices,
    flightGateSkipped: flightGate.skipped,
    flightRefusal: flightGate.lastRefusalStatus,
    rateRefusal: exec.lastRefusalStatus,
    snapshotEntries,
    snapshotSaved,
    pkgCount,
    trustpilot,
    // Zużycie Upstash TEGO przebiegu (komendy, żądania, bajty) — do prognozy
    // miesięcznego transferu bez zgadywania (patrz src/lib/redis/metrics.ts).
    redis: usageSince(redisMark),
    durationMs,
  };
  (summary.ok ? console.log : console.warn)("[cron/warm-rates]", JSON.stringify(summary));
  checkCronRedisBudget("warm-rates", summary.redis);
  flushRedisMetrics("cron:warm-rates");

  if (runFailed && shouldAlertWarmFailures(state.failStreak, WARM_ALERT_AFTER_FAILED_RUNS)) {
    await alertFailures(state.failStreak, {
      stopReason: exec.stopReason,
      previousRunDied,
      attempted: exec.attempted,
      failed: exec.failed,
      timedOut: exec.timedOut,
      refused: exec.refused,
      snapshotSaved,
      durationMs,
    });
  }
  return summary;
}

/** Alert serii nieudanych przebiegów (best-effort, jak wszystkie alerty: linia `[alert]` w logu zawsze). */
async function alertFailures(failStreak: number, fields: Record<string, string | number | boolean>): Promise<void> {
  await notify({
    level: "warning",
    source: "cron",
    title: `Cron warm-rates: ${failStreak} nieudanych przebiegów z rzędu`,
    body:
      "Ceny „od X zł” i cache wyników przestają się odświeżać. Sprawdź logi [cron/warm-rates] " +
      "(stopReason) i dostępność LiteAPI. Wyłącznik: SET cron:v1:off:warm-rates 1 EX 3600.",
    fields,
  }).catch(() => {});
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
