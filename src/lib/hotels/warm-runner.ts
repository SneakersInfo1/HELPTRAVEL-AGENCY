// Rdzeń crona /api/cron/warm-rates — bez Nexta i bez sieci, więc testowalny
// z atrapą dostawcy: budowa zadań (z deduplikacją), rotacja tanich okien,
// plan hoteli, wykonanie z budżetem czasu, przerwaniem trwających zapytań
// i bezpiecznikiem dostawcy.
//
// Dlaczego to wszystko istnieje — incydent 2026-11-06 (Vercel: „Task timed
// out after 300 seconds"): handler kończył po ~6 s, a funkcja żyła dalej,
// bo stawki szły przez Next Data Cache. Po 900 s Data Cache oddaje STARĄ
// odpowiedź od ręki i pyta dostawcę w tle — wszystkimi zadaniami naraz i bez
// sygnału przerwania. Jedno z ~250 takich zapytań zawisło na 298,7 s.
// Teraz każde zapytanie idzie na pierwszym planie, z limitem czasu, przez
// pulę o stałej równoległości, a przebieg ma twardy koniec.

import { createProviderGate, isProviderRefusal } from "@/lib/flights/provider-gate";
import { LiteApiTimeoutError } from "@/lib/liteapi/errors";
import type { RateCacheContext, SlimRate } from "@/lib/hotels/rate-cache";
import { minPerNightFromRates, type DestinationPriceEntry } from "@/lib/prices/destination-price-snapshot";
import type { WarmWindow } from "./warm-config";
import type { WarmPlanEntry } from "./warm-state";

/** Prosty pool współbieżności — odpala `worker` dla każdego elementu, max N naraz. */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

// ── Rotacja ──────────────────────────────────────────────────────────────────

export interface RotationSlice {
  /** Indeks pierwszego elementu partii w pełnej liście. */
  start: number;
  ids: string[];
}

/** Partia `size` kolejnych identyfikatorów od `cursor`, z zawinięciem listy. */
export function rotationSlice(ids: readonly string[], cursor: number, size: number): RotationSlice {
  const n = ids.length;
  if (n === 0 || size <= 0) return { start: 0, ids: [] };
  const start = ((Math.trunc(cursor) % n) + n) % n;
  const out: string[] = [];
  for (let k = 0; k < Math.min(size, n); k++) out.push(ids[(start + k) % n]!);
  return { start, ids: out };
}

/**
 * Kursor następnego przebiegu: za ostatnim DOKOŃCZONYM kierunkiem partii.
 * Kierunek przerwany lub niezaczęty wraca jako pierwszy — tak przebieg
 * zatrzymany budżetem nie gubi ogona partii.
 */
export function nextRotationCursor(total: number, slice: RotationSlice, unfinished: ReadonlySet<string>): number {
  if (total === 0) return 0;
  const firstUnfinished = slice.ids.findIndex((id) => unfinished.has(id));
  const advance = firstUnfinished === -1 ? slice.ids.length : firstUnfinished;
  return (slice.start + advance) % total;
}

// ── Zadania ──────────────────────────────────────────────────────────────────

export interface WarmDestination {
  id: string;
  label: string;
  priceKey: string;
  iata: string | null;
  group: "core" | "snapshot";
  hotelIds: string[];
}

export interface WarmTaskTarget {
  destId: string;
  priceKey: string;
  /** Czy wynik zasila snapshot „od X zł" w TYM przebiegu (kierunek z partii). */
  snapshot: boolean;
}

export interface WarmTask {
  /** Klucz zapytania (daty × hotele) — jedno zapytanie na klucz w przebiegu. */
  key: string;
  label: string;
  hotelIds: string[];
  ctx: RateCacheContext;
  /** Tylko tanie okna — z nich liczone są składniki pakietu. */
  windowLabel?: string;
  writeCache: boolean;
  targets: WarmTaskTarget[];
}

export interface BuildWarmTasksInput {
  dests: readonly WarmDestination[];
  nearWindows: readonly WarmWindow[];
  cheapWindows: readonly WarmWindow[];
  /** Kierunki, których tanie okna idą w tym przebiegu (kolejność = priorytet). */
  sliceIds: readonly string[];
  /** Ile hoteli w bliskich oknach (1. strona wyników). */
  nearHotels: number;
  /** Ile hoteli w jednym zapytaniu (limit LiteAPI). */
  chunk: number;
  /** Tanie okno skanowane głęboko (cała lista); pozostałe płytko. */
  deepWindowLabel: string;
}

function rateCtx(w: WarmWindow): RateCacheContext {
  // Najczęstszy wariant (cache jest kluczowany po occupancy).
  return { checkin: w.checkin, checkout: w.checkout, adults: 2, children: [], rooms: 1, currency: "PLN" };
}

/**
 * Zadania przebiegu: najpierw bliskie okna kierunków „core" (cache wyników dla
 * użytkowników, co przebieg), potem tanie okna kierunków z partii rotacji.
 * Identyczne zapytanie (te same daty i hotele) idzie raz — duplikat dopisuje
 * się jako kolejny cel istniejącego zadania.
 */
export function buildWarmTasks(input: BuildWarmTasksInput): WarmTask[] {
  const tasks: WarmTask[] = [];
  const byKey = new Map<string, WarmTask>();
  const slice = new Set(input.sliceIds);
  const add = (
    dest: WarmDestination,
    w: WarmWindow,
    hotelIds: string[],
    label: string,
    extra: { windowLabel?: string; writeCache: boolean },
  ) => {
    if (hotelIds.length === 0) return;
    const key = `${w.checkin}|${w.checkout}|${hotelIds.join(",")}`;
    const target: WarmTaskTarget = { destId: dest.id, priceKey: dest.priceKey, snapshot: slice.has(dest.id) };
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.targets.some((t) => t.destId === dest.id)) existing.targets.push(target);
      existing.writeCache ||= extra.writeCache;
      return;
    }
    const task: WarmTask = { key, label, hotelIds, ctx: rateCtx(w), ...extra, targets: [target] };
    byKey.set(key, task);
    tasks.push(task);
  };

  for (const d of input.dests) {
    if (d.group !== "core") continue;
    for (const w of input.nearWindows) {
      add(d, w, d.hotelIds.slice(0, input.nearHotels), `${d.label}/${w.label}`, { writeCache: true });
    }
  }
  const byId = new Map(input.dests.map((d) => [d.id, d] as const));
  for (const id of input.sliceIds) {
    const d = byId.get(id);
    if (!d) continue;
    for (const w of input.cheapWindows) {
      // Głęboki skan (cała lista) tylko w pierwszym tanim oknie — lista jest
      // sortowana popularnością, a najtańsze bywają za pierwszą 50-tką.
      const depth = w.label === input.deepWindowLabel ? d.hotelIds.length : Math.min(d.hotelIds.length, input.nearHotels);
      for (let i = 0; i < depth; i += input.chunk) {
        add(d, w, d.hotelIds.slice(i, Math.min(i + input.chunk, depth)), `${d.label}/${w.label}/${i}-${i + input.chunk}`, {
          windowLabel: w.label,
          writeCache: false,
        });
      }
    }
  }
  return tasks;
}

// ── Wykonanie ────────────────────────────────────────────────────────────────

export type WarmStopReason =
  | "completed"
  /** Skończył się budżet czasu przebiegu. */
  | "time_budget"
  /** Dostawca odmawia (403/429) kilka razy z rzędu. */
  | "provider_refused"
  /** Kolejne zapytania kończą się błędem albo limitem czasu. */
  | "provider_unavailable"
  /** Redis padł w trakcie — wyniku i tak nie dałoby się zapisać. */
  | "store_lost";

export interface ExecuteWarmDeps {
  /** Jedno zapytanie o stawki. MUSI respektować `signal`. */
  resolve: (task: WarmTask, signal: AbortSignal) => Promise<Record<string, SlimRate | null>>;
  concurrency: number;
  /** Start przebiegu (epoch ms) — od niego liczony jest budżet. */
  startedAt: number;
  /** Po tym czasie od startu nie zaczynamy nowych zadań. */
  budgetMs: number;
  /** Po tym czasie od startu przerywamy trwające zapytania. */
  hardStopMs: number;
  maxConsecutiveFailures: number;
  storeAvailable: () => boolean;
  now?: () => number;
  /** Ile kolejnych odmów 403/429 zamyka przebieg (domyślnie 3). */
  refusalThreshold?: number;
  onFailure?: (task: WarmTask, err: unknown) => void;
}

export interface WarmExecution {
  stopReason: WarmStopReason;
  /** Zadania wysłane do dostawcy (= succeeded + failed + aborted). */
  attempted: number;
  succeeded: number;
  failed: number;
  /** Z `failed`: przekroczony limit czasu pojedynczego zapytania. */
  timedOut: number;
  /** Z `failed`: odmowy 403/429. */
  refused: number;
  /** Przerwane przez nas (twardy koniec / bezpiecznik) — wracają w kolejnym przebiegu. */
  aborted: number;
  /** Niezaczęte po zatrzymaniu przebiegu. */
  notStarted: number;
  warmedHotels: number;
  lastRefusalStatus: number | null;
  /** Najtańsza cena/noc per kierunek (tylko cele `snapshot`). */
  bestPrice: Map<string, DestinationPriceEntry>;
  /** Minimum per `${priceKey}|${windowLabel}` (tanie okna) — składnik pakietu. */
  hotelByWindow: Map<string, number>;
  /** Kierunki z zadaniem przerwanym albo niezaczętym — kursor rotacji na nich staje. */
  unfinishedDestIds: Set<string>;
  /**
   * Kierunki z zadaniem NIEUDANYM (błąd, limit czasu, odmowa). Ich minimum
   * z pozostałych okien mogłoby zawyżyć „od X zł", więc nie trafiają do
   * snapshotu (stary wpis zostaje, ważny 48 h). Kursor ich NIE blokuje:
   * kierunek, którego dostawca uparcie nie wycenia, zatrzymałby rotację na zawsze.
   */
  failedDestIds: Set<string>;
}

export async function executeWarmTasks(tasks: readonly WarmTask[], deps: ExecuteWarmDeps): Promise<WarmExecution> {
  const now = deps.now ?? Date.now;
  const gate = createProviderGate(deps.refusalThreshold ?? 3);
  const stop = new AbortController();
  const out: WarmExecution = {
    stopReason: "completed",
    attempted: 0,
    succeeded: 0,
    failed: 0,
    timedOut: 0,
    refused: 0,
    aborted: 0,
    notStarted: 0,
    warmedHotels: 0,
    lastRefusalStatus: null,
    bestPrice: new Map(),
    hotelByWindow: new Map(),
    unfinishedDestIds: new Set(),
    failedDestIds: new Set(),
  };
  let stopReason: WarmStopReason | null = null;
  let consecutiveFailures = 0;

  const halt = (reason: WarmStopReason, abortInFlight: boolean) => {
    stopReason ??= reason;
    if (abortInFlight && !stop.signal.aborted) stop.abort();
  };
  const unfinished = (task: WarmTask) => {
    for (const t of task.targets) out.unfinishedDestIds.add(t.destId);
  };
  const record = (task: WarmTask, rates: Record<string, SlimRate | null>) => {
    out.warmedHotels += Object.values(rates).filter((r) => r !== null).length;
    const pn = minPerNightFromRates(rates, task.ctx.checkin, task.ctx.checkout);
    if (pn === null) return;
    for (const t of task.targets) {
      if (!t.snapshot) continue;
      if (task.windowLabel) {
        const wk = `${t.priceKey}|${task.windowLabel}`;
        const prevW = out.hotelByWindow.get(wk);
        if (prevW === undefined || pn < prevW) out.hotelByWindow.set(wk, pn);
      }
      const prev = out.bestPrice.get(t.priceKey);
      if (!prev || pn < prev.hotelFromPlnPerNight) {
        out.bestPrice.set(t.priceKey, {
          hotelFromPlnPerNight: pn,
          checkin: task.ctx.checkin,
          checkout: task.ctx.checkout,
          computedAt: now(),
        });
      }
    }
  };

  // Twardy koniec niezależnie od tego, co robią zadania: przerywa trwające
  // zapytania (każde i tak ma własny limit, to druga linia obrony).
  const hardTimer = setTimeout(
    () => halt("time_budget", true),
    Math.max(0, deps.startedAt + deps.hardStopMs - now()),
  );

  try {
    await runPool(tasks, deps.concurrency, async (task) => {
      if (stopReason) {
        out.notStarted++;
        unfinished(task);
        return;
      }
      if (now() - deps.startedAt >= deps.budgetMs) {
        // Trwające zapytania kończą się same (limit czasu), nowych nie zaczynamy.
        halt("time_budget", false);
        out.notStarted++;
        unfinished(task);
        return;
      }
      if (!deps.storeAvailable()) {
        halt("store_lost", true);
        out.notStarted++;
        unfinished(task);
        return;
      }
      out.attempted++;
      try {
        const rates = await deps.resolve(task, stop.signal);
        out.succeeded++;
        consecutiveFailures = 0;
        gate.onSuccess();
        record(task, rates);
      } catch (err) {
        if (stop.signal.aborted) {
          out.aborted++;
          unfinished(task);
          return;
        }
        out.failed++;
        for (const t of task.targets) out.failedDestIds.add(t.destId);
        if (err instanceof LiteApiTimeoutError) out.timedOut++;
        if (isProviderRefusal(err)) out.refused++;
        gate.onFailure(err);
        consecutiveFailures++;
        deps.onFailure?.(task, err);
        if (!gate.open) halt("provider_refused", true);
        else if (consecutiveFailures >= deps.maxConsecutiveFailures) halt("provider_unavailable", true);
      }
    });
  } finally {
    clearTimeout(hardTimer);
  }

  out.stopReason = stopReason ?? "completed";
  out.lastRefusalStatus = gate.lastRefusalStatus;
  return out;
}

// ── Plan hoteli ──────────────────────────────────────────────────────────────

export interface PlanRefreshDeps<T extends { id: string }> {
  /** Lista hotelId kierunku od dostawcy. MUSI respektować `signal`. */
  fetchIds: (dest: T, signal: AbortSignal) => Promise<string[]>;
  now: () => number;
  maxAgeMs: number;
  /** Ile przeterminowanych planów odświeżyć (brakujące zawsze). */
  refreshCap: number;
  concurrency: number;
  /** Budżet całej fazy. */
  budgetMs: number;
  /** Sygnał przebiegu (np. twardy koniec). */
  signal?: AbortSignal;
}

export interface PlanRefreshResult {
  plans: Map<string, WarmPlanEntry>;
  /** Do zapisu: tylko świeżo pobrane. */
  updated: Array<[string, WarmPlanEntry]>;
  /** Kierunki obsłużone z zapisanego planu (bez dostawcy). */
  hits: number;
  refreshed: number;
  failed: number;
  /** Kierunki, które zostały bez listy hoteli (nie będą grzane w tym przebiegu). */
  missing: number;
}

/**
 * Uzupełnia plany potrzebnych kierunków. Brakujące pobiera zawsze, przeterminowane
 * najwyżej `refreshCap` najstarszych; nieudane odświeżenie zostawia stary plan.
 */
export async function refreshHotelPlans<T extends { id: string }>(
  needed: readonly T[],
  current: ReadonlyMap<string, WarmPlanEntry>,
  deps: PlanRefreshDeps<T>,
): Promise<PlanRefreshResult> {
  const now = deps.now();
  const plans = new Map(current);
  const missing = needed.filter((d) => !plans.has(d.id));
  const stale = needed
    .filter((d) => {
      const p = plans.get(d.id);
      return p !== undefined && now - p.at > deps.maxAgeMs;
    })
    .sort((a, b) => plans.get(a.id)!.at - plans.get(b.id)!.at)
    .slice(0, Math.max(0, deps.refreshCap));
  const toFetch = [...missing, ...stale];
  const result: PlanRefreshResult = {
    plans,
    updated: [],
    hits: needed.length - toFetch.length,
    refreshed: 0,
    failed: 0,
    missing: 0,
  };

  if (toFetch.length > 0) {
    const signals = [AbortSignal.timeout(deps.budgetMs)];
    if (deps.signal) signals.push(deps.signal);
    const phase = AbortSignal.any(signals);
    await runPool(toFetch, deps.concurrency, async (d) => {
      if (phase.aborted) {
        result.failed++;
        return;
      }
      try {
        const ids = await deps.fetchIds(d, phase);
        if (ids.length === 0) {
          result.failed++;
          return;
        }
        const entry: WarmPlanEntry = { ids, at: deps.now() };
        plans.set(d.id, entry);
        result.updated.push([d.id, entry]);
        result.refreshed++;
      } catch {
        result.failed++;
      }
    });
  }

  result.missing = needed.filter((d) => !plans.has(d.id)).length;
  return result;
}

// ── Ocena przebiegu ──────────────────────────────────────────────────────────

export interface WarmRunShape {
  /** Zadania zbudowane na ten przebieg. */
  tasks: number;
  /** Kierunki potrzebne w tym przebiegu i te, które zostały bez listy hoteli. */
  neededPlans: number;
  missingPlans: number;
}

/**
 * Czy TEN przebieg się nie udał: zatrzymany przed czasem, co najmniej połowa
 * zadań padła, albo nie było czego grzać (np. zimny start przy niedziałającym
 * /data/hotels — bez tego warunku taki przebieg kończyłby się „completed"
 * z zerem zapytań i nigdy nie podniósł alertu).
 */
export function isFailedWarmRun(exec: Pick<WarmExecution, "stopReason" | "attempted" | "failed">, shape: WarmRunShape): boolean {
  if (exec.stopReason !== "completed") return true;
  if (shape.tasks === 0) return true;
  if (shape.neededPlans > 0 && shape.missingPlans * 2 >= shape.neededPlans) return true;
  return exec.attempted > 0 && exec.failed * 2 >= exec.attempted;
}

/**
 * Seria nieudanych na STARCIE przebiegu. Znacznik startu zostawiony przez
 * poprzedni przebieg = platforma go zabiła, więc seria rośnie od razu — inaczej
 * kolejne zabite przebiegi (żaden nie dochodzi do końcowego zapisu) zostawiałyby
 * licznik w miejscu i alert nigdy by nie poszedł.
 */
export function streakAtStart(prev: { failStreak: number; runningSince: number | null }): {
  previousRunDied: boolean;
  failStreak: number;
} {
  const previousRunDied = prev.runningSince !== null;
  return { previousRunDied, failStreak: previousRunDied ? prev.failStreak + 1 : prev.failStreak };
}

/** Alert przy `threshold` nieudanych z rzędu, potem co 16 (≈ 8 h przy cronie co 30 min). */
export function shouldAlertWarmFailures(failStreak: number, threshold: number): boolean {
  if (failStreak < threshold) return false;
  return (failStreak - threshold) % 16 === 0;
}
