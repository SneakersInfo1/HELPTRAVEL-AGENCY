// Gubernator wyszukiwań lotów u dostawcy (LiteAPI `/flights/rates`).
//
// Po blokadzie konta (40301, ~10 000 wyszukiwań dziennie z cronów) LiteAPI
// przywróciło dostęp z NIEZNANYM limitem wyszukiwań, a pierwsze przebiegi
// cronów dostawały `HTTP 429`. Ten moduł pilnuje, żeby żadne źródło nie mogło
// znowu zalać dostawcy:
//
//   • pauza po odmowie dostawcy — 429 (z `Retry-After`, jeśli przyszedł) i
//     401/403/40301 zatrzymują WSZYSTKIE wyszukiwania na czas pauzy, na
//     wszystkich instancjach (Redis) i w tej instancji (pamięć — działa też
//     przy niedostępnym magazynie). Bez ponawiania w pauzie: brak retry storm;
//   • dzienny budżet (doba UTC) osobno dla użytkowników i dla tła —
//     konfigurowalny (`FLIGHTS_SEARCH_DAILY_LIMIT`, domyślnie 500 — zmierzony
//     ruch użytkowników to kilka wyszukiwań dziennie; `FLIGHTS_BACKGROUND_DAILY_LIMIT`,
//     domyślnie 50). Bez magazynu: użytkownik przechodzi (licznik procesu jako
//     hamulec), tło nie;
//   • liczniki wyników (ok / 429 / odmowa / błąd) i alerty raz na okres:
//     50% i 80% budżetu, wyczerpany budżet, pauza;
//   • `singleFlight` — identyczne zapytania w locie w tej instancji idą do
//     dostawcy raz.
//
// Klucze `flgov:v1:*` są malutkie (liczby, krótkie napisy) — transfer Upstash
// pomijalny przy kilku wyszukiwaniach dziennie.

import { notify, type AlertInput } from "@/lib/alerting/notify";
import { getSharedRedis, redisMayBeAvailable } from "@/lib/redis/client";

import type { FlightSearchSource } from "./search-policy";

const PREFIX = "flgov:v1";
const DAY_TTL_SECONDS = 3 * 24 * 3600;

export interface GovernorLimits {
  /** Wyszukiwania użytkowników i czatu na dobę UTC. */
  daily: number;
  /** Wyszukiwania w tle na dobę UTC (gdy w ogóle włączone — search-policy.ts). */
  backgroundDaily: number;
}

function intEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function governorLimits(env: Record<string, string | undefined> = process.env): GovernorLimits {
  return {
    daily: intEnv(env.FLIGHTS_SEARCH_DAILY_LIMIT, 500),
    backgroundDaily: intEnv(env.FLIGHTS_BACKGROUND_DAILY_LIMIT, 50),
  };
}

/** Doba UTC jako `YYYYMMDD`. */
export function utcDay(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
}

function redis() {
  return redisMayBeAvailable() ? getSharedRedis() : null;
}

// ── Alerty raz na okres ──────────────────────────────────────────────────────

const localAlerts = new Map<string, number>();

async function alertOnce(name: string, ttlSeconds: number, input: AlertInput): Promise<void> {
  const now = Date.now();
  if ((localAlerts.get(name) ?? 0) > now) return;
  localAlerts.set(name, now + ttlSeconds * 1000);
  const r = redis();
  if (r) {
    try {
      const first = await r.set(`${PREFIX}:alert:${name}`, "1", { nx: true, ex: ttlSeconds });
      if (first === null) return; // inna instancja już zgłosiła
    } catch {
      // magazyn padł — zgłaszamy z pamięci procesu (najwyżej raz na instancję)
    }
  }
  await notify({ source: "flights", ...input }).catch(() => {});
}

// ── Pauza po odmowie dostawcy ────────────────────────────────────────────────

export type PauseReason = "throttled" | "access_denied";
export interface ProviderPause {
  reason: PauseReason;
  untilMs: number;
}

const THROTTLE_DEFAULT_MS = 60_000;
const THROTTLE_MIN_MS = 15_000;
const THROTTLE_MAX_MS = 15 * 60_000;
const DENIED_PAUSE_MS = 15 * 60_000;

let localPause: ProviderPause | null = null;

function parsePause(value: unknown): ProviderPause | null {
  if (typeof value !== "string") return null;
  const [reason, until] = value.split("|");
  const untilMs = Number(until);
  if ((reason !== "throttled" && reason !== "access_denied") || !Number.isFinite(untilMs)) return null;
  return { reason, untilMs };
}

/** Aktywna pauza (najpierw pamięć procesu, potem magazyn); awaria magazynu nie blokuje. */
export async function activePause(now: number = Date.now()): Promise<ProviderPause | null> {
  if (localPause && localPause.untilMs > now) return localPause;
  const r = redis();
  if (!r) return null;
  try {
    const pause = parsePause(await r.get<string>(`${PREFIX}:pause`));
    if (pause && pause.untilMs > now) {
      localPause = pause;
      return pause;
    }
  } catch {
    // brak odczytu = brak pauzy (pamięć procesu i tak pilnuje tej instancji)
  }
  return null;
}

/** Odmowa dostawcy → pauza dla wszystkich wyszukiwań (429: `Retry-After` w granicach 15 s – 15 min). */
export async function pauseProvider(reason: PauseReason, retryAfterMs?: number, now: number = Date.now()): Promise<ProviderPause> {
  const ms =
    reason === "access_denied"
      ? DENIED_PAUSE_MS
      : Math.min(Math.max(retryAfterMs ?? THROTTLE_DEFAULT_MS, THROTTLE_MIN_MS), THROTTLE_MAX_MS);
  const untilMs = Math.max(now + ms, localPause?.untilMs ?? 0);
  localPause = { reason, untilMs };
  const r = redis();
  if (r) {
    try {
      await r.set(`${PREFIX}:pause`, `${reason}|${untilMs}`, { ex: Math.max(1, Math.ceil((untilMs - now) / 1000)) });
    } catch {
      // pauza i tak działa w tej instancji
    }
  }
  console.warn(`[flights][governor] pauza wyszukiwań: ${reason}, ${Math.round((untilMs - now) / 1000)} s`);
  await alertOnce(`pause-${reason}`, 3600, {
    level: reason === "access_denied" ? "critical" : "warning",
    title:
      reason === "access_denied"
        ? "LiteAPI Flights: odmowa dostępu (401/403/40301) — wyszukiwania lotów wstrzymane"
        : "LiteAPI Flights: limit zapytań (429) — wyszukiwania lotów wstrzymane",
    body: "Pauza obejmuje wszystkie wyszukiwania lotów (użytkownicy dostają komunikat „spróbuj za chwilę” albo wynik z cache). Sprawdź liczniki: GET /api/cron/flights-usage.",
    fields: { reason, pauseSeconds: Math.round((untilMs - now) / 1000) },
  });
  return localPause;
}

// ── Dzienny budżet ───────────────────────────────────────────────────────────

export type BudgetVerdict =
  | { ok: true; used: number; limit: number }
  | { ok: false; reason: "daily_limit" | "background_limit"; used: number; limit: number };

const localCounts = new Map<string, number>();

function bucketOf(source: FlightSearchSource): "fg" | "bg" {
  return source === "background" ? "bg" : "fg";
}

/** Rezerwuje jedno wyszukiwanie w budżecie doby; odmowa = bez zapytania do dostawcy. */
export async function reserveSearch(
  source: FlightSearchSource,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): Promise<BudgetVerdict> {
  const limits = governorLimits(env);
  const bucket = bucketOf(source);
  const limit = bucket === "bg" ? limits.backgroundDaily : limits.daily;
  const reason = bucket === "bg" ? "background_limit" : "daily_limit";
  const day = utcDay(now);

  let used: number | null = null;
  const r = redis();
  if (r) {
    try {
      const key = `${PREFIX}:n:${day}:${bucket}`;
      used = await r.incr(key);
      if (used === 1) await r.expire(key, DAY_TTL_SECONDS);
    } catch {
      used = null;
    }
  }
  if (used === null) {
    // Bez magazynu nie policzymy globalnie: tło stoi, użytkownik przechodzi
    // z licznikiem tej instancji jako hamulcem.
    if (bucket === "bg") return { ok: false, reason, used: 0, limit };
    const localKey = `${day}:${bucket}`;
    used = (localCounts.get(localKey) ?? 0) + 1;
    localCounts.set(localKey, used);
  }

  if (used > limit) {
    await alertOnce(`limit-${bucket}-${day}`, 26 * 3600, {
      level: "critical",
      title: `LiteAPI Flights: dzienny budżet wyszukiwań wyczerpany (${bucket === "bg" ? "tło" : "użytkownicy"})`,
      body: "Kolejne wyszukiwania do końca doby UTC dostają wynik z cache albo komunikat o chwilowej niedostępności. Nietypowy wzrost — sprawdź boty i źródła ruchu.",
      fields: { used, limit, day },
    });
    return { ok: false, reason, used, limit };
  }
  for (const pct of [50, 80]) {
    if (limit > 0 && used === Math.ceil((limit * pct) / 100)) {
      await alertOnce(`threshold-${bucket}-${pct}-${day}`, 26 * 3600, {
        level: "warning",
        title: `LiteAPI Flights: ${pct}% dziennego budżetu wyszukiwań (${bucket === "bg" ? "tło" : "użytkownicy"})`,
        fields: { used, limit, day },
      });
    }
  }
  return { ok: true, used, limit };
}

// ── Liczniki wyników ─────────────────────────────────────────────────────────

export type SearchOutcome = "ok" | "throttled" | "denied" | "error";

const pendingWrites = new Set<Promise<void>>();

/** Best-effort: licznik wyniku doby (do monitoringu); nigdy nie rzuca. Wołający nie musi czekać. */
export function recordOutcome(outcome: SearchOutcome, now: number = Date.now()): Promise<void> {
  const p: Promise<void> = writeOutcome(outcome, now).finally(() => pendingWrites.delete(p));
  pendingWrites.add(p);
  return p;
}

async function writeOutcome(outcome: SearchOutcome, now: number): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    const key = `${PREFIX}:o:${utcDay(now)}:${outcome}`;
    if ((await r.incr(key)) === 1) await r.expire(key, DAY_TTL_SECONDS);
  } catch {
    // monitoring nie może psuć wyszukiwania
  }
}

export interface GovernorSnapshot {
  day: string;
  limits: GovernorLimits;
  used: { user: number; background: number };
  outcomes: Record<SearchOutcome, number>;
  pause: ProviderPause | null;
  storeAvailable: boolean;
}

/** Stan doby do monitoringu (cron-owy endpoint `/api/cron/flights-usage`). */
export async function governorSnapshot(now: number = Date.now()): Promise<GovernorSnapshot> {
  const day = utcDay(now);
  const outcomes: Record<SearchOutcome, number> = { ok: 0, throttled: 0, denied: 0, error: 0 };
  const snapshot: GovernorSnapshot = {
    day,
    limits: governorLimits(),
    used: { user: 0, background: 0 },
    outcomes,
    pause: await activePause(now),
    storeAvailable: false,
  };
  const r = redis();
  if (!r) return snapshot;
  try {
    const keys = [`${PREFIX}:n:${day}:fg`, `${PREFIX}:n:${day}:bg`, ...(["ok", "throttled", "denied", "error"] as const).map((o) => `${PREFIX}:o:${day}:${o}`)];
    const values = await r.mget<(string | number | null)[]>(...keys);
    const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
    snapshot.used = { user: num(values[0]), background: num(values[1]) };
    (["ok", "throttled", "denied", "error"] as const).forEach((o, i) => (outcomes[o] = num(values[2 + i])));
    snapshot.storeAvailable = true;
  } catch {
    // zostaje storeAvailable=false
  }
  return snapshot;
}

// ── Deduplikacja zapytań w locie ─────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();

/** Identyczne zapytania w locie (ta instancja) dzielą jedno wywołanie dostawcy. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function __flushGovernorWritesForTests(): Promise<void> {
  await Promise.all([...pendingWrites]);
}

export function __resetGovernorForTests(): void {
  localPause = null;
  localCounts.clear();
  localAlerts.clear();
  inflight.clear();
}
