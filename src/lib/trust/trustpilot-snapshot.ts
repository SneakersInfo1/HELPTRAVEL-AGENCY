// Ocena Trustpilot (score + liczba opinii) do pasów zaufania — Upstash Redis,
// jeden klucz, wzorzec best-effort jak dstprice:v1: każdy błąd = miss, UI
// pokazuje wtedy sam link „Opinie na Trustpilot" bez liczby.
//
// UCZCIWOŚĆ: liczba w UI pochodzi WYŁĄCZNIE z odczytu strony profilu
// https://pl.trustpilot.com/review/helptravel.pl (JSON-LD AggregateRating).
// Nigdy nie hardkodujemy oceny w komponentach. Wpis starszy niż 14 dni jest
// traktowany jak brak (Trustpilot bywa za Cloudflare challenge — stąd dłuższe
// okno niż 48 h przy cenach; ocena i tak zmienia się wolno).
//
// Odświeżanie: cron warm-rates woła refreshTrustpilotSnapshot() przy każdym
// przebiegu (co 30 min), ale realny fetch idzie NAJWYŻEJ raz na 24 h
// (throttle po fetchedAt). Porażka fetcha/parsera → stary wpis zostaje.

import { Redis } from "@upstash/redis";

export interface TrustpilotEntry {
  /** Ocena 1-5 (np. 4.2). */
  score: number;
  /** Liczba opinii; null gdy źródło jej nie podało. */
  reviewCount: number | null;
  /** Epoch ms udanego odczytu ze strony Trustpilot. */
  fetchedAt: number;
}

const KEY = "trustpilot:v1";
// TTL klucza — 60 dni (ochrona przed wiecznym śmieciem); realną świeżość
// wymusza TRUSTPILOT_FRESH_MS przy odczycie.
const TTL_SECONDS = 60 * 24 * 3600;
export const TRUSTPILOT_FRESH_MS = 14 * 24 * 3600 * 1000;
const REFRESH_MIN_INTERVAL_MS = 24 * 3600 * 1000;

export const TRUSTPILOT_PROFILE_URL = "https://pl.trustpilot.com/review/helptravel.pl";

interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

let redis: RedisLike | null | undefined;
let injected: RedisLike | null | undefined;
let warnedMissingEnv = false;

function getRedis(): RedisLike | null {
  if (injected !== undefined) return injected;
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingEnv) {
      console.warn("[trustpilot] UPSTASH env brak — snapshot oceny WYŁĄCZONY (UI bez liczby).");
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }
  redis = new Redis({ url, token }) as unknown as RedisLike;
  return redis;
}

export function __setTrustpilotRedisForTests(client: RedisLike | null): void {
  injected = client;
}
export function __resetTrustpilotRedisForTests(): void {
  injected = undefined;
  redis = undefined;
}

function asScore(v: unknown): number | null {
  const n = typeof v === "string" ? Number.parseFloat(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}
function asCount(v: unknown): number | null {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Rekurencyjne szukanie obiektu aggregateRating w dowolnym JSON-LD. */
function findAggregateRating(node: unknown): { score: number; reviewCount: number | null } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findAggregateRating(item);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const agg = obj.aggregateRating as Record<string, unknown> | undefined;
  if (agg && typeof agg === "object") {
    const score = asScore(agg.ratingValue);
    if (score !== null) return { score, reviewCount: asCount(agg.reviewCount ?? agg.ratingCount) };
  }
  for (const v of Object.values(obj)) {
    const hit = findAggregateRating(v);
    if (hit) return hit;
  }
  return null;
}

/**
 * Parser HTML profilu Trustpilot → { score, reviewCount } | null.
 * Kolejność źródeł: (1) bloki JSON-LD (oficjalne dane strukturalne),
 * (2) osadzony JSON aplikacji (trustScore/numberOfReviews),
 * (3) tytuł strony („…z 4,2 / 5 na portalu Trustpilot”).
 * Challenge Cloudflare / brak danych → null.
 */
export function parseTrustpilotRating(html: string): { score: number; reviewCount: number | null } | null {
  if (!html) return null;

  const ldBlocks = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of ldBlocks) {
    try {
      const hit = findAggregateRating(JSON.parse(m[1]));
      if (hit) return hit;
    } catch {
      // zepsuty blok — próbujemy następnego
    }
  }

  const scoreM = html.match(/"trustScore"\s*:\s*([\d.]+)/);
  if (scoreM) {
    const score = asScore(scoreM[1]);
    if (score !== null) {
      const countM =
        html.match(/"numberOfReviews"\s*:\s*(\d+)/) ??
        html.match(/"numberOfReviews"\s*:\s*\{[^}]*"total"\s*:\s*(\d+)/);
      return { score, reviewCount: countM ? asCount(countM[1]) : null };
    }
  }

  const titleM = html.match(/z\s+(\d[.,]\d)\s*\/\s*5\s+na\s+portalu\s+Trustpilot/i);
  if (titleM) {
    const score = asScore(titleM[1]);
    if (score !== null) return { score, reviewCount: null };
  }

  return null;
}

/** Świeżość wpisu do WYŚWIETLANIA liczby (14 dni). */
export function isFreshTrustpilot(entry: TrustpilotEntry | undefined | null, now: number = Date.now()): boolean {
  if (!entry || !Number.isFinite(entry.fetchedAt)) return false;
  return now - entry.fetchedAt <= TRUSTPILOT_FRESH_MS;
}

/** Odczyt snapshotu. null = brak env / błąd / brak klucza (miss). */
export async function readTrustpilotSnapshot(): Promise<TrustpilotEntry | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const v = await client.get<TrustpilotEntry>(KEY);
    return v && typeof v === "object" && typeof v.score === "number" ? v : null;
  } catch (err) {
    console.warn("[trustpilot] read miss:", err instanceof Error ? err.message : err);
    return null;
  }
}

export type TrustpilotRefreshResult = "refreshed" | "skipped" | "failed";

/**
 * Best-effort odświeżenie (wołane z crona przy każdym przebiegu):
 * throttle 24 h po fetchedAt; porażka fetcha/parsera → stary wpis ZOSTAJE
 * (degrade-keep-old — nigdy nie kasujemy działającej wartości).
 */
export async function refreshTrustpilotSnapshot(
  fetchImpl: (url: string) => Promise<Response> = (url) =>
    fetch(url, {
      headers: {
        // Zwykły browserowy UA — bez niego Trustpilot odpowiada challenge'em częściej.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "pl-PL,pl;q=0.9",
      },
      cache: "no-store",
    }),
  now: number = Date.now(),
): Promise<TrustpilotRefreshResult> {
  const client = getRedis();
  if (!client) return "failed";

  const existing = await readTrustpilotSnapshot();
  if (existing && now - existing.fetchedAt < REFRESH_MIN_INTERVAL_MS) return "skipped";

  try {
    const res = await fetchImpl(TRUSTPILOT_PROFILE_URL);
    const html = await res.text();
    const parsed = parseTrustpilotRating(html);
    if (!parsed) {
      console.warn("[trustpilot] refresh: brak danych w odpowiedzi (challenge?) — zostaje stary wpis");
      return "failed";
    }
    const entry: TrustpilotEntry = { ...parsed, fetchedAt: now };
    await client.set(KEY, entry, { ex: TTL_SECONDS });
    return "refreshed";
  } catch (err) {
    console.warn("[trustpilot] refresh failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
