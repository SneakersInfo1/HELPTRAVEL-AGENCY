// Pomiar ruchu do Upstash — per instancja funkcji, bez kluczy i bez wartości.
//
// PO CO. Incydent z 2026-10-25 (50 GB transferu w miesiącu, ~16 mln komend)
// dało się zdiagnozować wyłącznie z arytmetyki: liczba zadań crona × rozmiar
// wpisu. Nikt nie widział, ILE bajtów faktycznie płynie, bo żaden moduł tego
// nie liczył. Ten moduł liczy to w jednym miejscu — w requesterze, przez który
// przechodzi KAŻDA komenda — i wypisuje skrót co najwyżej raz na minutę.
//
// HIGIENA (jak w logach lotów): w liczniku lądują wyłącznie RODZINY kluczy
// (prefiks z listy niżej), nigdy klucz, wartość, adres IP ani identyfikator.
// Liczba rodzin jest stała, więc kardynalność metryk nie rośnie z ruchem.

import { notify } from "@/lib/alerting/notify";

const KNOWN_FAMILIES = new Set([
  "htr", // stawki hoteli (lista wyników)
  "phist", // historia cen 30 dni (Omnibus)
  "flrt", // oferty lotów (gzip)
  "flmin", // minimum ceny lotu (skrót dla crona konsjerża)
  "dstprice", // „od X zł" kierunków
  "hotfeat", // polecane hotele
  "fltdeal", // tanie loty na homepage
  "trustpilot",
  "csnap", // snapshot konsjerża
  "lock", // blokady cronów
  "booking", // sesje i rekordy rezerwacji hoteli
  "flight", // sesje i rekordy rezerwacji lotów
  "ratelimit",
  "access",
  "ht",
]);

/** Rodzina klucza: pierwszy segment przed „:", spoza listy → `other`. */
export function keyFamily(key: unknown): string {
  if (typeof key !== "string" || key.length === 0) return "meta";
  if (key.startsWith("helptravel:ratelimit")) return "ratelimit";
  const head = key.split(":", 1)[0] ?? "";
  return KNOWN_FAMILIES.has(head) ? head : "other";
}

/**
 * Rodzina komendy. Klucz jest zwykle drugim elementem, ale EVAL/EVALSHA mają
 * układ `[cmd, skrypt|sha, liczbaKluczy, klucz1, …]`.
 */
export function commandFamily(command: unknown): string {
  if (!Array.isArray(command) || command.length === 0) return "meta";
  const name = String(command[0]).toLowerCase();
  if (name === "eval" || name === "evalsha" || name === "eval_ro" || name === "evalsha_ro") {
    return Number(command[2]) > 0 ? keyFamily(command[3]) : "meta";
  }
  if (name === "ping" || name === "script" || name === "time" || name === "dbsize") return "meta";
  return keyFamily(command[1]);
}

export type RequestOutcome = "ok" | "command_error" | "quota" | "auth" | "config" | "timeout" | "network" | "server";

interface FamilyCounters {
  commands: number;
  requests: number;
  bytesOut: number;
  bytesIn: number;
  errors: number;
  shortCircuited: number;
}

interface CacheCounters {
  hits: number;
  misses: number;
}

const LATENCY_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500] as const;

interface Totals {
  commands: number;
  requests: number;
  bytesOut: number;
  bytesIn: number;
  shortCircuited: number;
}

interface WindowState {
  startedAt: number;
  totals: Totals;
  errors: Record<Exclude<RequestOutcome, "ok">, number>;
  latency: number[]; // liczniki dla LATENCY_BUCKETS_MS + ostatni kubełek „powyżej"
  families: Map<string, FamilyCounters>;
  caches: Map<string, CacheCounters>;
}

function emptyWindow(now: number): WindowState {
  return {
    startedAt: now,
    totals: { commands: 0, requests: 0, bytesOut: 0, bytesIn: 0, shortCircuited: 0 },
    errors: { command_error: 0, quota: 0, auth: 0, config: 0, timeout: 0, network: 0, server: 0 },
    latency: new Array(LATENCY_BUCKETS_MS.length + 1).fill(0),
    families: new Map(),
    caches: new Map(),
  };
}

const FLUSH_INTERVAL_MS = 60_000;

let clock: () => number = Date.now;
let windowState: WindowState = emptyWindow(clock());
/** Liczniki od startu instancji — nie są zerowane przy wypisaniu okna. */
const lifetime: Totals = { commands: 0, requests: 0, bytesOut: 0, bytesIn: 0, shortCircuited: 0 };
let sink: (line: string) => void = (line) => console.log(line);

function familyCounters(family: string): FamilyCounters {
  let c = windowState.families.get(family);
  if (!c) {
    c = { commands: 0, requests: 0, bytesOut: 0, bytesIn: 0, errors: 0, shortCircuited: 0 };
    windowState.families.set(family, c);
  }
  return c;
}

export interface RequestRecord {
  family: string;
  /** Fizyczne żądania HTTP tej operacji (ponowienie = kolejne żądanie). Domyślnie 1. */
  attempts?: number;
  commands: number;
  bytesOut: number;
  bytesIn: number;
  ms: number;
  outcome: RequestOutcome;
}

export function recordRequest(r: RequestRecord): void {
  const requests = Math.max(1, Math.trunc(r.attempts ?? 1));
  const t = windowState.totals;
  t.commands += r.commands;
  t.requests += requests;
  t.bytesOut += r.bytesOut;
  t.bytesIn += r.bytesIn;
  lifetime.commands += r.commands;
  lifetime.requests += requests;
  lifetime.bytesOut += r.bytesOut;
  lifetime.bytesIn += r.bytesIn;
  if (r.outcome !== "ok") windowState.errors[r.outcome] += 1;
  let bucket = LATENCY_BUCKETS_MS.findIndex((limit) => r.ms < limit);
  if (bucket < 0) bucket = LATENCY_BUCKETS_MS.length;
  windowState.latency[bucket] += 1;
  const f = familyCounters(r.family);
  f.commands += r.commands;
  f.requests += requests;
  f.bytesOut += r.bytesOut;
  f.bytesIn += r.bytesIn;
  if (r.outcome !== "ok" && r.outcome !== "command_error") f.errors += 1;
  maybeFlush();
}

/** Komendy odrzucone przez wyłącznik — nie poszły do sieci, nie kosztowały transferu. */
export function recordShortCircuit(family: string, commands: number): void {
  windowState.totals.shortCircuited += commands;
  lifetime.shortCircuited += commands;
  familyCounters(family).shortCircuited += commands;
  maybeFlush();
}

/** Trafienia i pudła warstwy cache (nazwa = rodzina klucza). */
export function recordCacheLookup(cache: string, hits: number, misses: number): void {
  const name = KNOWN_FAMILIES.has(cache) ? cache : "other";
  let c = windowState.caches.get(name);
  if (!c) {
    c = { hits: 0, misses: 0 };
    windowState.caches.set(name, c);
  }
  c.hits += Math.max(0, hits);
  c.misses += Math.max(0, misses);
}

export interface UsageMark {
  commands: number;
  requests: number;
  bytesOut: number;
  bytesIn: number;
  shortCircuited: number;
}

/** Punkt odniesienia do policzenia zużycia jednego przebiegu (cron). */
export function usageMark(): UsageMark {
  return { ...lifetime };
}

/**
 * Zużycie od `mark`. Liczone na poziomie instancji, więc przy równoległych
 * żądaniach w tej samej instancji obejmuje też ich ruch — dla cronów (jeden
 * przebieg naraz dzięki blokadzie) to wystarczająco dokładne.
 */
export function usageSince(mark: UsageMark): UsageMark & { kb: number } {
  const d = {
    commands: lifetime.commands - mark.commands,
    requests: lifetime.requests - mark.requests,
    bytesOut: lifetime.bytesOut - mark.bytesOut,
    bytesIn: lifetime.bytesIn - mark.bytesIn,
    shortCircuited: lifetime.shortCircuited - mark.shortCircuited,
  };
  return { ...d, kb: round1((d.bytesOut + d.bytesIn) / 1024) };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * BUDŻET TRANSFERU NA PRZEBIEG CRONA — wczesne ostrzeganie przed powrotem
 * problemu z 2026-10-25 (ktoś dokłada pole do wpisu cache, zwiększa liczbę
 * zadań, wraca zapis dużych list…). Budżety to kilkukrotność zmierzonego
 * zużycia PO naprawie (scripts/redis/bench-transfer.ts):
 *   warm-rates ~0,7 MB · snapshot konsjerża ~0,1 MB · warm-flights ~7 MB
 *   (gdy dostawca odpowiada) · okazje lotnicze ~1,5 MB · polecane hotele ~0,1 MB.
 * Przekroczenie = ostrzeżenie w logu; trzykrotne przekroczenie = alert na
 * webhook (najwyżej raz na 6 h na zadanie i instancję).
 */
export const CRON_REDIS_BUDGET_KB: Record<string, number> = {
  "warm-rates": 2_048,
  "build-concierge-snapshot": 1_024,
  "warm-flights": 12_288,
  "warm-flight-deals": 4_096,
  "warm-featured-hotels": 1_024,
};

const BUDGET_ALERT_INTERVAL_MS = 6 * 3600 * 1000;
const lastBudgetAlert = new Map<string, number>();

/** Sprawdza zużycie przebiegu względem budżetu. Zwraca `true`, gdy w budżecie. */
export function checkCronRedisBudget(job: string, usage: UsageMark & { kb: number }): boolean {
  const budget = CRON_REDIS_BUDGET_KB[job];
  if (budget === undefined || usage.kb <= budget) return true;
  console.warn(
    `[redis-budget] '${job}' zużył ${usage.kb} KB transferu Upstash w jednym przebiegu (budżet ${budget} KB, ` +
      `komendy ${usage.commands}) — sprawdź, co zaczęło pisać/czytać więcej`,
  );
  if (usage.kb > budget * 3) {
    const now = clock();
    if (now - (lastBudgetAlert.get(job) ?? 0) >= BUDGET_ALERT_INTERVAL_MS) {
      lastBudgetAlert.set(job, now);
      void notify({
        level: "warning",
        source: "redis",
        title: `Upstash: cron '${job}' przekroczył budżet transferu ${Math.round(usage.kb / budget)}×`,
        body: "Przy tym tempie miesięczny limit transferu planu może zostać wyczerpany przed końcem cyklu.",
        fields: { job, kb: usage.kb, budgetKb: budget, commands: usage.commands },
      }).catch(() => {});
    }
  }
  return false;
}

function hasActivity(w: WindowState): boolean {
  return w.totals.requests > 0 || w.totals.shortCircuited > 0 || w.caches.size > 0;
}

export interface MetricsSummary {
  windowSeconds: number;
  commands: number;
  requests: number;
  outKb: number;
  inKb: number;
  shortCircuited: number;
  errors: Partial<Record<Exclude<RequestOutcome, "ok">, number>>;
  latencyMs: Record<string, number>;
  families: Record<string, { cmd: number; req: number; outKb: number; inKb: number; err: number; short: number }>;
  cache: Record<string, { hit: number; miss: number; hitRatio: number | null }>;
}

export function metricsSummary(now: number = clock()): MetricsSummary {
  const w = windowState;
  const errors: MetricsSummary["errors"] = {};
  for (const [k, v] of Object.entries(w.errors)) if (v > 0) errors[k as keyof typeof w.errors] = v;
  const latencyMs: Record<string, number> = {};
  LATENCY_BUCKETS_MS.forEach((limit, i) => {
    if (w.latency[i] > 0) latencyMs[`lt${limit}`] = w.latency[i];
  });
  const over = w.latency[LATENCY_BUCKETS_MS.length];
  if (over > 0) latencyMs[`ge${LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1]}`] = over;
  const families: MetricsSummary["families"] = {};
  for (const [name, f] of w.families) {
    families[name] = {
      cmd: f.commands,
      req: f.requests,
      outKb: round1(f.bytesOut / 1024),
      inKb: round1(f.bytesIn / 1024),
      err: f.errors,
      short: f.shortCircuited,
    };
  }
  const cache: MetricsSummary["cache"] = {};
  for (const [name, c] of w.caches) {
    const total = c.hits + c.misses;
    cache[name] = { hit: c.hits, miss: c.misses, hitRatio: total > 0 ? round1((c.hits / total) * 100) / 100 : null };
  }
  return {
    windowSeconds: Math.round((now - w.startedAt) / 1000),
    commands: w.totals.commands,
    requests: w.totals.requests,
    outKb: round1(w.totals.bytesOut / 1024),
    inKb: round1(w.totals.bytesIn / 1024),
    shortCircuited: w.totals.shortCircuited,
    errors,
    latencyMs,
    families,
    cache,
  };
}

/**
 * Wypisuje okno i zaczyna nowe. `reason` trafia do linii (np. nazwa crona),
 * żeby dało się przypisać zużycie do przebiegu bez szukania po czasie.
 */
export function flushRedisMetrics(reason = "interval", extra?: Record<string, unknown>): void {
  const now = clock();
  if (hasActivity(windowState)) {
    sink(`[redis-metrics] ${JSON.stringify({ reason, ...metricsSummary(now), ...(extra ?? {}) })}`);
  }
  windowState = emptyWindow(now);
}

function maybeFlush(): void {
  if (clock() - windowState.startedAt >= FLUSH_INTERVAL_MS) flushRedisMetrics("interval");
}

// ── Szwy testowe ────────────────────────────────────────────────────────────

export function __resetRedisMetricsForTests(opts: { now?: () => number; sink?: (line: string) => void } = {}): void {
  clock = opts.now ?? Date.now;
  sink = opts.sink ?? ((line) => console.log(line));
  windowState = emptyWindow(clock());
  lastBudgetAlert.clear();
  lifetime.commands = 0;
  lifetime.requests = 0;
  lifetime.bytesOut = 0;
  lifetime.bytesIn = 0;
  lifetime.shortCircuited = 0;
}
