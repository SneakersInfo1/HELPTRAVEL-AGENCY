// Best-effort cache ofert lotów (Upstash Redis). Wzorzec jak hotelowy
// src/lib/hotels/rate-cache.ts: KAŻDY błąd / brak env → traktowane jak miss.
// Cache MOŻE tylko pomóc, NIGDY nie wywala wyszukiwania.
//
// Przechowujemy CHUDE DisplayOffer[] (znormalizowane serwerowo, przycięte w
// route do ≤500) — od v2 GZIPOWANE (base64), bo 500 ofert ≈ 1,6 MB JSON
// przekraczałoby limit wartości Upstash; po gzipie ≈ 150-200 KB. TTL krótki,
// bo offerId i tak re-weryfikujemy przy wyborze (verify na /loty/dodatki).
//
// SKRÓT CENY (`flmin:v1`, od 2026-10-27). Obok każdej listy ofert zapisujemy
// kilkudziesięciobajtowy wpis z jej MINIMUM. Cron snapshotu konsjerża
// potrzebuje z całej listy wyłącznie najniższej ceny, a czytał pełny gzip
// (~200–270 KB) dla każdego z ~51 zadań co 30 minut — megabajty transferu
// na przebieg po jedną liczbę.

import { gunzipSync, gzipSync } from "node:zlib";

import { minTotalFromOffers } from "@/lib/prices/destination-price-snapshot";
import { getSharedRedis, warnRedisFallback } from "@/lib/redis/client";
import { recordCacheLookup } from "@/lib/redis/metrics";

import type { DisplayOffer } from "./display";
import type { FlightSearchInput } from "./types";

// v2 = wartości gzip+base64 (cap 500). Bump wersji zamiast czytać oba
// formaty: stare wpisy v1 mają TTL ≤10 min, po wdrożeniu same znikną.
const KEY_VERSION = "v2";
const SUMMARY_VERSION = "v1";
// TTL ofert podbite 180 → 600 s (2026-07-11, „maksymalnie przyśpiesz wyniki"):
// zimny call LiteAPI to ~6 s (zmierzone), a oferty realnie żyją >10 min. Dłuższe
// okno = więcej trafień dla drugiego/trzeciego użytkownika tej samej trasy.
// Ryzyko wygaśnięcia offerId pokrywa recovery (?fresh=1 → OFFER_UNAVAILABLE
// obsłużone w /loty/dodatki), więc trade-off jest bezpieczny.
const TTL_OFFERS_SECONDS = 600; // 10 min — oferty (on-demand)
// Cron prewarmingu pisze z DŁUŻSZYM TTL — wpis musi przeżyć cykl crona (30 min),
// żeby grzana trasa była CIEPŁA także tuż przed kolejnym runem (i gdy jeden run
// padnie). 40 min = 30 min cyklu + margines.
const TTL_WARM_SECONDS = 2400; // 40 min — wpisy z crona
const TTL_EMPTY_SECONDS = 600; // 10 min — negatywny cache martwych tras

/** Rodzaj wpisu do cache — steruje TTL. `on-demand` (użytkownik) vs `warm` (cron). */
export type FlightCacheKind = "on-demand" | "warm";

/** Skrót listy ofert: najniższa cena (pełne zł, floor) i liczba ofert. */
export interface FlightOffersSummary {
  /** `minTotalFromOffers` z zapisanej listy; null = lista bez wycenionych ofert. */
  min: number | null;
  count: number;
  /** Epoch ms zapisu. */
  at: number;
}

interface RedisTransaction {
  set(key: string, value: unknown, opts?: { ex?: number }): unknown;
  exec(): Promise<unknown>;
}

interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  /** Transakcja MULTI/EXEC (prawdziwy klient). Atrapy w testach mogą jej nie mieć. */
  multi?: () => RedisTransaction;
}

let injected: RedisLike | null | undefined;

// Wspólny klient (src/lib/redis/client.ts): timeout, wyłącznik obwodu, pomiar.
function getRedis(): RedisLike | null {
  if (injected !== undefined) return injected;
  return getSharedRedis() as unknown as RedisLike | null;
}

// Seam testowy (jak w flights/session.ts).
export function __setFlightRatesRedisForTests(client: RedisLike | null): void {
  injected = client;
}
export function __resetFlightRatesRedisForTests(): void {
  injected = undefined;
}

/** Deterministyczny klucz z legs (origin/destination/date) + pax + klasa + waluta. */
export function flightRatesCacheKey(input: FlightSearchInput): string {
  const legs = input.legs.map((l) => `${l.origin}-${l.destination}-${l.date}`).join("_");
  const pax = `${input.adults}.${input.children}.${input.infants}`;
  return `flrt:${KEY_VERSION}:${legs}:${pax}:${input.cabinClass}:${input.currency}`;
}

/** Klucz skrótu dla klucza listy ofert — ta sama trasa, daty, pax, klasa, waluta. */
export function flightSummaryKey(offersKey: string): string {
  const prefix = `flrt:${KEY_VERSION}:`;
  const suffix = offersKey.startsWith(prefix) ? offersKey.slice(prefix.length) : offersKey;
  return `flmin:${SUMMARY_VERSION}:${suffix}`;
}

/** gzip+base64 — wartości w Redis jako string (patrz nagłówek pliku). */
function packOffers(offers: DisplayOffer[]): string {
  return gzipSync(Buffer.from(JSON.stringify(offers), "utf8")).toString("base64");
}

function unpackOffers(value: unknown): DisplayOffer[] | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const json = gunzipSync(Buffer.from(value, "base64")).toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as DisplayOffer[]) : null;
  } catch {
    return null;
  }
}

function ttlFor(offers: DisplayOffer[], kind: FlightCacheKind): number {
  if (offers.length === 0) return TTL_EMPTY_SECONDS;
  return kind === "warm" ? TTL_WARM_SECONDS : TTL_OFFERS_SECONDS;
}

/** Odczyt. null = miss (brak env, błąd, brak wpisu). [] = trafiony negatywny cache. */
export async function getCachedFlightOffers(key: string): Promise<DisplayOffer[] | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const v = await client.get<string>(key);
    const offers = unpackOffers(v);
    recordCacheLookup("flrt", offers ? 1 : 0, offers ? 0 : 1);
    return offers;
  } catch (err) {
    warnRedisFallback("flights/rates-cache", err);
    return null;
  }
}

/**
 * Sam skrót ceny (bez pobierania listy ofert). null = miss.
 * `min: null` w trafieniu = trasa sprawdzona i bez wycenionej oferty.
 */
export async function getCachedFlightSummary(key: string): Promise<FlightOffersSummary | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const v = await client.get<FlightOffersSummary>(flightSummaryKey(key));
    const ok =
      v !== null &&
      typeof v === "object" &&
      typeof v.count === "number" &&
      (v.min === null || (typeof v.min === "number" && Number.isFinite(v.min) && v.min > 0));
    recordCacheLookup("flmin", ok ? 1 : 0, ok ? 0 : 1);
    return ok ? v : null;
  } catch (err) {
    warnRedisFallback("flights/rates-cache", err);
    return null;
  }
}

function summaryOf(offers: DisplayOffer[]): FlightOffersSummary {
  return { min: minTotalFromOffers(offers), count: offers.length, at: Date.now() };
}

/** Zapis (best-effort). Pusta lista → krótszy TTL (negatywny cache martwych tras).
 *  `kind="warm"` (cron) → dłuższy TTL, żeby grzana trasa przeżyła cykl crona.
 *  Razem z listą idzie jej skrót ceny (ten sam TTL) — w JEDNEJ transakcji
 *  MULTI/EXEC: skrót nie może przeżyć listy ani wskazywać ceny spoza niej
 *  (nowa lista + nieudany zapis skrótu zostawiłyby stare, niższe minimum). */
export async function setCachedFlightOffers(
  key: string,
  offers: DisplayOffer[],
  kind: FlightCacheKind = "on-demand",
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  const ex = ttlFor(offers, kind);
  try {
    if (typeof client.multi === "function") {
      const tx = client.multi();
      tx.set(key, packOffers(offers), { ex });
      tx.set(flightSummaryKey(key), summaryOf(offers), { ex });
      await tx.exec();
      return;
    }
    // Atrapa bez transakcji (testy): lista, potem skrót.
    await client.set(key, packOffers(offers), { ex });
  } catch (err) {
    warnRedisFallback("flights/rates-cache", err);
    return; // bez listy nie zapisujemy też skrótu — nie może wskazywać na nic
  }
  await setCachedFlightSummary(key, offers, kind);
}

/**
 * Zapis SAMEGO skrótu — dla wywołań, którym lista ofert nie jest potrzebna
 * nikomu innemu (cron konsjerża: terminy miesiące naprzód, każdy wraca po ~10 h).
 */
export async function setCachedFlightSummary(
  key: string,
  offers: DisplayOffer[],
  kind: FlightCacheKind = "on-demand",
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(flightSummaryKey(key), summaryOf(offers), { ex: ttlFor(offers, kind) });
  } catch (err) {
    warnRedisFallback("flights/rates-cache", err);
  }
}
