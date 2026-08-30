import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type LimiterKey =
  | "discovery"
  | "stays-search"
  | "stays-rates-batch"
  | "flights-search"
  | "activities-search"
  | "booking-prebook"
  | "booking-book"
  | "booking-lookup"
  | "admin-email-test"
  | "concierge"
  | "destination-suggest";

const LIMIT_PER_MINUTE = 20;

// Per-key overrides. Existing keys keep the default 20/min (no behavior change);
// booking endpoints are tighter per BOOKING_FLOW_PROMPT Phase 2 (10/min/IP).
// admin-email-test is even tighter — even an authenticated operator should
// not be able to spray arbitrary recipients via the test endpoint (defense
// in depth against credential leaks / shared screens).
//
// stays-search bumped 200 → 320/min (2026-07-11): /hotele/szukaj skanuje
// teraz PEŁNĄ pulę kierunku (do POOL_MAX_TOTAL = 2000 hoteli → do 40 batchy
// stawek po 50) + kilka stron metadanych z /api/hotels/meta na tym samym
// kluczu. Jeden świeży skan megamiasta ≈ 46 calli; 320/min pozwala na
// swobodne skakanie między kierunkami bez otwierania wektora nadużyć
// (endpointy read-only, LiteAPI i tak limituje nas upstream).
// stays-rates-batch WYDZIELONE Z `stays-search` 2026-08-12, na podstawie
// POMIARU, nie przeczucia.
//
// Zmierzone lokalnie na produkcyjnym buildzie:
//   • limiter przepuszcza 325 żądań, potem 429 z `Retry-After: 59`;
//   • jedna sesja na Rodos (10 wejść w hotel + „Wstecz") wysłała 41 zapytań
//     do `/api/hotels/meta` i 18 paczek stawek — czyli METADANE zjadały 2/3
//     wspólnego budżetu, z którego mają korzystać CENY;
//   • pełny skan największego możliwego kierunku to 2000 hoteli / 50 = 40
//     paczek stawek.
//
// Trzy fakty, które wymuszają osobny kubełek:
//   1. Klucz limitera to ADRES IP, a 90% ruchu tego serwisu to telefony —
//      czyli CGNAT operatora, gdzie dziesiątki gości dzielą jeden adres.
//   2. Skan cen jest z natury paczkowy: 40 żądań w kilka sekund to
//      NORMALNE zachowanie jednego gościa, nie nadużycie.
//   3. Gdy limiter odrzuci taką paczkę, gość nie widzi „zwolnij" tylko
//      „Nie udało się sprawdzić dostępności hoteli" — czyli wygląda to
//      jak brak ofert.
//
// 600/min/IP = 15 pełnych skanów najgrubszego kierunku na minutę: mieści
// kilku gości za wspólnym adresem, a nadal jest TWARDYM sufitem (endpoint
// wymaga POST-a z konkretnymi identyfikatorami hoteli, więc nie jest celem
// crawlerów, a scraper katalogu potrzebowałby rzędów wielkości więcej).
// Ochrona przed botami ZOSTAJE — zmienia się próg, nie jej istnienie.
const LIMIT_OVERRIDES: Partial<Record<LimiterKey, number>> = {
  "booking-prebook": 10,
  "booking-book": 10,
  // booking-lookup: odczyt strony potwierdzenia. Autoryzacją jest znajomość
  // `bookingId` — u lotów to UUID v7 od dostawcy (zmierzone na produkcji
  // 2026-08-30: 36 znaków, 74 bity losowe), więc zgadywanie nie jest realną
  // drogą. Ale endpoint oddaje imię i nazwisko pasażera, a do tej pory nie miał
  // ŻADNEGO sufitu: skanowanie nic nie kosztowało i nie zostawiało śladu.
  // 30/min/IP jest niewidoczne dla człowieka (strona pobiera dane RAZ przy
  // wejściu, bez odpytywania w pętli), mieści kilku gości za wspólnym CGNAT-em
  // i zamienia „bez ograniczeń" w mierzalny, widoczny w logach limit.
  "booking-lookup": 30,
  "admin-email-test": 5,
  "stays-search": 320,
  "stays-rates-batch": 600,
  // concierge: każdy request kosztuje tokeny LLM (OpenRouter) — ciasny limit
  // 10/min/IP chroni budżet przed jednym klientem spamującym czat.
  concierge: 10,
  // destination-suggest: normalnie odpowiada z lokalnego indeksu (0 kosztu),
  // ale przy braku pewnego trafienia dopytuje LiteAPI /data/places. Cache 24 h
  // chroni POWTÓRZONE zapytania — nie chroni serii UNIKALNYCH („aaa1", „aaa2"…),
  // bo każdy tekst to inny URL. 120/min/IP mieści zwykłe pisanie w polu
  // (debounce 150 ms ⇒ realnie kilkanaście zapytań na wyszukanie) i zamyka
  // wektor generowania kosztu przez unikalne ciągi. Znalezione w review.
  "destination-suggest": 120,
};

let warnedMissingEnv = false;
let redis: Redis | null | undefined;
const limiters = new Map<LimiterKey, Ratelimit>();

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warnedMissingEnv) {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting is DISABLED.",
      );
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

function getLimiter(key: LimiterKey): Ratelimit | null {
  const cached = limiters.get(key);
  if (cached) return cached;

  const client = getRedis();
  if (!client) return null;

  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(LIMIT_OVERRIDES[key] ?? LIMIT_PER_MINUTE, "1 m"),
    analytics: false,
    prefix: `helptravel:ratelimit:${key}`,
  });
  limiters.set(key, limiter);
  return limiter;
}

// Test-only seam (additive, no runtime behavior change): pre-seed or clear a
// limiter so route tests can assert 429 without a live Upstash instance.
export function __setLimiterForTests(key: LimiterKey, limiter: Ratelimit | null): void {
  if (limiter === null) limiters.delete(key);
  else limiters.set(key, limiter);
}
export function __resetLimitersForTests(): void {
  limiters.clear();
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export async function enforceRateLimit(
  request: NextRequest,
  key: LimiterKey,
): Promise<NextResponse | null> {
  const limiter = getLimiter(key);
  if (!limiter) return null;

  const ip = getClientIp(request);
  const result = await limiter.limit(ip);

  if (result.success) return null;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000),
  );

  return NextResponse.json(
    {
      error: "Too many requests. Please slow down and try again shortly.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
        "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
      },
    },
  );
}
