// Wspólny klient Upstash dla całej aplikacji.
//
// Do 2026-10-27 każdy moduł (cache stawek, historia cen, snapshoty, limiter,
// blokady cronów, sesje rezerwacji) budował WŁASNY `new Redis({ url, token })`
// z domyślną konfiguracją SDK: bez timeoutu, z 5 ponowieniami przy błędzie
// sieci, z kodowaniem odpowiedzi w base64 i z komunikatami błędów zawierającymi
// cały payload. Dwanaście klientów to dwanaście miejsc, w których te same
// decyzje trzeba by podejmować osobno — i dwanaście sposobów, żeby o którymś
// zapomnieć.
//
// Teraz wszystkie idą przez `getSharedRedis()`, a więc przez jeden requester
// (./requester.ts) z jednym wyłącznikiem obwodu (./breaker.ts) i jednym
// pomiarem (./metrics.ts).
//
// KONTRAKT bez zmian: brak konfiguracji = `null` (moduły best-effort traktują
// to jak pudło, magazyny rezerwacji — jak niedostępność). Każda awaria to
// wyjątek `RedisUnavailableError` albo `RedisCommandError`, które moduły
// obsługują tak samo jak dotychczasowe błędy SDK.

import { Redis } from "@upstash/redis";

import { notify } from "@/lib/alerting/notify";
import { assertNoProductionStoreInTests } from "@/lib/testing/production-guard";

import { CircuitBreaker, isPersistentFailure, type BreakerSnapshot, type BreakerState, type FailureKind } from "./breaker";
import { createResilientRequester, RedisCommandError, RedisUnavailableError } from "./requester";

export { RedisCommandError, RedisUnavailableError } from "./requester";

/**
 * Domyślny limit czasu żądania. Typowe żądanie do Upstash z regionu funkcji to
 * ~100–300 ms, największe (paczka 50 zapisów albo gzip ofert lotów) < 1 s.
 * 2,5 s łapie zawieszenie, nie obcina poprawnych odpowiedzi.
 */
const DEFAULT_TIMEOUT_MS = 2_500;

let shared: Redis | null | undefined;
let override: Redis | null | undefined;
let warnedMissingEnv = false;

/**
 * Alert o TRWAŁEJ awarii (limit planu, autoryzacja) — najwyżej raz na 30 min
 * na instancję. Incydent z 2026-10-25 trwał dobę, zanim ktokolwiek się o nim
 * dowiedział: komunikat limitu był tylko jednym z tysięcy ostrzeżeń w logach.
 * Przez webhook (Slack/Discord, ALERT_WEBHOOK_URL) — tym samym kanałem co
 * awarie płatności. Bez kluczy, bez treści komend.
 */
const ALERT_MIN_INTERVAL_MS = 30 * 60 * 1000;
let lastOutageAlertAt = 0;

function alertPersistentOutage(kind: FailureKind, openMs: number): void {
  const now = Date.now();
  if (now - lastOutageAlertAt < ALERT_MIN_INTERVAL_MS) return;
  lastOutageAlertAt = now;
  void notify({
    level: "critical",
    source: "redis",
    title:
      kind === "quota"
        ? "Upstash: osiągnięty limit planu — serwis działa BEZ cache"
        : kind === "config"
          ? "Upstash: zły adres bazy (404/405) — serwis działa BEZ cache"
          : "Upstash: odmowa autoryzacji — serwis działa BEZ cache",
    body:
      "Wyłącznik obwodu odciął Redis. Strony i wyszukiwarka działają (ceny na żywo z LiteAPI), " +
      "ale crony prewarmingu są wstrzymane, a rezerwacje zwracają 503 do czasu przywrócenia magazynu.",
    fields: { reason: kind, retryInS: Math.round(openMs / 1000), region: process.env.VERCEL_REGION ?? null },
  }).catch(() => {});
}

function logTransition(from: BreakerState, to: BreakerState, info: { kind: FailureKind | null; openMs: number }): void {
  if (to === "open") {
    console.warn(
      `[redis] wyłącznik OTWARTY (${info.kind ?? "?"}) na ${Math.round(info.openMs / 1000)} s — ` +
        `komendy odpadają bez sieci, moduły przechodzą w tryb bez cache`,
    );
    if (info.kind && isPersistentFailure(info.kind)) alertPersistentOutage(info.kind, info.openMs);
  } else if (to === "closed" && from !== "closed") {
    console.info("[redis] wyłącznik ZAMKNIĘTY — Upstash znów odpowiada");
  }
}

let breaker = new CircuitBreaker({}, logTransition);

function configuredTimeoutMs(): number {
  const raw = Number(process.env.UPSTASH_REDIS_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 200 && raw <= 30_000 ? raw : DEFAULT_TIMEOUT_MS;
}

function isUsableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function readConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

/**
 * Wspólny klient albo `null`, gdy Upstash nie jest skonfigurowany (albo adres
 * jest niepoprawny — literówka w zmiennej na Vercelu nie może wywrócić strony).
 */
export function getSharedRedis(): Redis | null {
  if (override !== undefined) return override;
  if (shared !== undefined) return shared;

  const cfg = readConfig();
  if (!cfg) {
    if (!warnedMissingEnv) {
      console.warn("[redis] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN nie ustawione — cache i limity Redis WYŁĄCZONE");
      warnedMissingEnv = true;
    }
    shared = null;
    return null;
  }
  // Pod testem prawdziwy magazyn = głośny błąd, nie cichy zapis do produkcji.
  assertNoProductionStoreInTests("Upstash (wspólny klient)");
  if (!isUsableUrl(cfg.url)) {
    console.warn("[redis] UPSTASH_REDIS_REST_URL ma niepoprawny format — cache i limity Redis WYŁĄCZONE");
    shared = null;
    return null;
  }
  shared = new Redis(
    createResilientRequester({ url: cfg.url, token: cfg.token, timeoutMs: configuredTimeoutMs(), breaker }),
  );
  return shared;
}

/** Czy magazyn jest skonfigurowany i ma poprawny adres (bez budowania klienta). */
export function isRedisConfigured(): boolean {
  if (override !== undefined) return override !== null;
  const cfg = readConfig();
  return cfg !== null && isUsableUrl(cfg.url);
}

/**
 * Czy warto w ogóle próbować — skonfigurowany i wyłącznik nie jest otwarty.
 * Służy do decyzji „nie zaczynaj kosztownej pracy, której wyniku nie da się
 * zapisać" (crony) i „nie twórz prebooka u dostawcy, skoro sesji nie zapiszemy".
 */
export function redisMayBeAvailable(): boolean {
  return isRedisConfigured() && breaker.wouldAllow();
}

/**
 * Czy wyłącznik przepuściłby teraz żądanie — niezależnie od konfiguracji.
 * Dla kodu, który dostaje klienta skądinąd (np. limiter z atrapą w testach).
 */
export function redisCircuitAllows(): boolean {
  return breaker.wouldAllow();
}

export function redisBreakerSnapshot(): BreakerSnapshot {
  return breaker.snapshot();
}

export function isRedisUnavailableError(err: unknown): err is RedisUnavailableError {
  return err instanceof RedisUnavailableError;
}

/** Awaria magazynu albo błąd komendy — obie zwalniają z „operacja się udała". */
export function isRedisFailure(err: unknown): boolean {
  return err instanceof RedisUnavailableError || err instanceof RedisCommandError;
}

/**
 * Jeden wiersz ostrzeżenia przy przejściu w tryb bez cache.
 *
 * Przy otwartym wyłączniku NIE logujemy — przejście zalogował już sam
 * wyłącznik, a odrzucone komendy liczy `[redis-metrics]`. Bez tego każda
 * strona w czasie awarii dokładała po kilka identycznych linii (zmierzone
 * 2026-10-27: 4 ostrzeżenia na KAŻDE wejście na stronę główną).
 */
export function warnRedisFallback(scope: string, err: unknown): void {
  if (err instanceof RedisUnavailableError && err.reason === "circuit_open") return;
  console.warn(`[${scope}] Redis pominięty (tryb bez cache): ${err instanceof Error ? err.message : String(err)}`);
}

/**
 * Czy awaria jest TRWAŁA w skali sesji (limit planu, autoryzacja) albo obwód
 * jest już otwarty — wtedy nie ma sensu kontynuować pracy zależnej od zapisu.
 */
export function isPersistentRedisOutage(err: unknown): boolean {
  if (!(err instanceof RedisUnavailableError)) return false;
  return err.reason === "quota" || err.reason === "auth" || err.reason === "circuit_open";
}

// ── Szwy testowe ────────────────────────────────────────────────────────────

/** Podmienia wspólnego klienta (np. na klienta z atrapą requestera). `null` = brak magazynu. */
export function __setSharedRedisForTests(client: Redis | null): void {
  override = client;
}

/** Przywraca konfigurację z env i świeży wyłącznik. */
export function __resetSharedRedisForTests(): void {
  override = undefined;
  shared = undefined;
  warnedMissingEnv = false;
  breaker = new CircuitBreaker({}, logTransition);
}

/** Dostęp do wyłącznika dla testów, które budują własnego klienta na tym samym obwodzie. */
export function __getSharedBreakerForTests(): CircuitBreaker {
  return breaker;
}
