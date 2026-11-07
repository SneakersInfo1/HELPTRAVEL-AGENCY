// Stan crona /api/cron/warm-rates w Upstash.
//
//   warmrates:v1:state      punkt kontrolny rotacji tanich okien, licznik
//                           nieudanych przebiegów i znacznik TRWAJĄCEGO
//                           przebiegu. Znacznik zostawiony przez poprzedni
//                           przebieg = platforma go zabiła (timeout), bo
//                           normalny koniec zawsze go czyści.
//   warmrates:v1:ids:<id>   plan kierunku: lista hotelId i czas pobrania.
//
// Jeden odczyt na przebieg (MGET stanu i planów potrzebnych kierunków), zapis
// wyłącznie tego, co się zmieniło. Plan jest po kierunku, a nie jednym kluczem,
// bo przebieg potrzebuje ~31 z 46 list, a odświeża zwykle jedną: jeden duży
// klucz kosztowałby ~76 KB odczytu i zapisu transferu Upstash co 30 minut.
//
// Kontrakt błędów: odczyt zwraca `ok: false` (cron kończy przebieg bez pracy —
// bez magazynu i tak nie ma gdzie zapisać wyniku), zapis zwraca `false` i nie
// rzuca (przebieg już się odbył; najgorsze, co się stanie, to powtórka partii).

import { getSharedRedis } from "@/lib/redis/client";

export const WARM_STATE_KEY = "warmrates:v1:state";
const PLAN_PREFIX = "warmrates:v1:ids:";
const TTL_SECONDS = 7 * 24 * 3600;

export function warmPlanKey(destId: string): string {
  return `${PLAN_PREFIX}${destId}`;
}

export interface WarmRunState {
  /** Indeks kierunku, od którego zaczyna się następna partia tanich okien. */
  cursor: number;
  /** Nieudane przebiegi z rzędu (0 po udanym). */
  failStreak: number;
  /** Start trwającego przebiegu (epoch ms); `null` = żaden nie trwa. */
  runningSince: number | null;
  lastFinishedAt: number | null;
  lastStopReason: string | null;
}

export const EMPTY_WARM_STATE: Readonly<WarmRunState> = Object.freeze({
  cursor: 0,
  failStreak: 0,
  runningSince: null,
  lastFinishedAt: null,
  lastStopReason: null,
});

export interface WarmPlanEntry {
  ids: string[];
  /** Epoch ms pobrania listy od dostawcy. */
  at: number;
}

/** Zapis planu: identyfikatory sklejone przecinkiem (hotelId nie zawiera przecinka). */
interface StoredPlan {
  ids: string;
  at: number;
}

export type WarmStoreRead =
  | { ok: true; state: WarmRunState; plans: Map<string, WarmPlanEntry> }
  | { ok: false; error: unknown };

function finiteOr<T>(v: unknown, fallback: T): number | T {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseState(raw: unknown): WarmRunState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_WARM_STATE };
  const r = raw as Record<string, unknown>;
  return {
    cursor: Math.max(0, Math.trunc(finiteOr(r.cursor, 0))),
    failStreak: Math.max(0, Math.trunc(finiteOr(r.failStreak, 0))),
    runningSince: finiteOr(r.runningSince, null),
    lastFinishedAt: finiteOr(r.lastFinishedAt, null),
    lastStopReason: typeof r.lastStopReason === "string" ? r.lastStopReason : null,
  };
}

function parsePlan(raw: unknown): WarmPlanEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StoredPlan>;
  if (typeof r.ids !== "string" || typeof r.at !== "number" || !Number.isFinite(r.at)) return null;
  const ids = r.ids.split(",").filter(Boolean);
  return ids.length > 0 ? { ids, at: r.at } : null;
}

/**
 * Stan i plany wskazanych kierunków jednym MGET. Brak skonfigurowanego Redisa
 * = pusty stan (tryb lokalny bez magazynu); błąd magazynu = `ok: false`.
 */
export async function readWarmStore(destIds: readonly string[]): Promise<WarmStoreRead> {
  const client = getSharedRedis();
  if (!client) return { ok: true, state: { ...EMPTY_WARM_STATE }, plans: new Map() };
  try {
    const values = await client.mget<unknown[]>(WARM_STATE_KEY, ...destIds.map(warmPlanKey));
    const plans = new Map<string, WarmPlanEntry>();
    destIds.forEach((id, i) => {
      const plan = parsePlan(values[i + 1]);
      if (plan) plans.set(id, plan);
    });
    return { ok: true, state: parseState(values[0]), plans };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function writeWarmState(state: WarmRunState): Promise<boolean> {
  const client = getSharedRedis();
  if (!client) return false;
  try {
    await client.set(WARM_STATE_KEY, state, { ex: TTL_SECONDS });
    return true;
  } catch (err) {
    console.warn("[warm-state] zapis stanu nieudany:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Zapis odświeżonych planów jednym potokiem. */
export async function writeWarmPlans(entries: ReadonlyArray<readonly [string, WarmPlanEntry]>): Promise<boolean> {
  if (entries.length === 0) return true;
  const client = getSharedRedis();
  if (!client) return false;
  try {
    const pipeline = client.pipeline();
    for (const [destId, plan] of entries) {
      pipeline.set(warmPlanKey(destId), { ids: plan.ids.join(","), at: plan.at } satisfies StoredPlan, {
        ex: TTL_SECONDS,
      });
    }
    await pipeline.exec();
    return true;
  } catch (err) {
    console.warn("[warm-state] zapis planu nieudany:", err instanceof Error ? err.message : err);
    return false;
  }
}
