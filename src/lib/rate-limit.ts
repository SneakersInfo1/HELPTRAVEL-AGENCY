import { Ratelimit } from "@upstash/ratelimit";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSharedRedis, redisCircuitAllows } from "@/lib/redis/client";

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

/**
 * DOBOWY sufit na adres IP (§34 audytu V2.1). Limit minutowy chroni przed
 * burstem, ale NIE przed powolnym, wytrwałym spalaniem budżetu: przy 10/min
 * jeden adres mógł wysłać ~14 400 zapytań na dobę, a każde z nich kosztuje
 * tokeny OpenRoutera.
 *
 * 200/doba dla czatu wzięte z realnej skali, nie z sufitu: cały serwis ma
 * ~240 rozmów MIESIĘCZNIE (≈8 dziennie), a jedna rozmowa to kilkanaście tur.
 * 200 zapytań z JEDNEGO adresu to więc ~25× dzienny ruch całego serwisu —
 * normalny użytkownik (także kilku za wspólnym CGNAT-em operatora, a 90%
 * ruchu to telefony) tego nie dotknie, a koszt nadużycia z jednego adresu
 * spada z rzędu tysięcy złotych na dobę do kilku złotych.
 *
 * Klucze bez wpisu NIE mają dobowego sufitu — zachowanie bez zmian.
 */
const DAILY_LIMITS: Partial<Record<LimiterKey, number>> = {
  concierge: 200,
};

/**
 * Limit czasu odpowiedzi limitera. `@upstash/ratelimit` ma domyślnie 5 s,
 * a po nich przepuszcza żądanie po cichu (`reason: "timeout"`) — czyli każde
 * żądanie API mogło czekać 5 s na martwy Redis. 1,5 s to kilkukrotny zapas
 * nad typowym czasem odpowiedzi Upstash.
 */
const LIMITER_TIMEOUT_MS = 1500;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 3600 * 1000;

const limiters = new Map<LimiterKey, Ratelimit>();
const dailyLimiters = new Map<LimiterKey, Ratelimit>();

function getLimiter(key: LimiterKey): Ratelimit | null {
  const cached = limiters.get(key);
  if (cached) return cached;

  // Wspólny klient: timeout, wyłącznik obwodu i pomiar dotyczą też limitera.
  const client = getSharedRedis();
  if (!client) return null;

  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(LIMIT_OVERRIDES[key] ?? LIMIT_PER_MINUTE, "1 m"),
    analytics: false,
    timeout: LIMITER_TIMEOUT_MS,
    prefix: `helptravel:ratelimit:${key}`,
  });
  limiters.set(key, limiter);
  return limiter;
}

/** Limiter dobowy — tylko dla kluczy wymienionych w DAILY_LIMITS. */
function getDailyLimiter(key: LimiterKey): Ratelimit | null {
  const perDay = DAILY_LIMITS[key];
  if (perDay === undefined) return null;
  const cached = dailyLimiters.get(key);
  if (cached) return cached;

  const client = getSharedRedis();
  if (!client) return null;

  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(perDay, "24 h"),
    analytics: false,
    timeout: LIMITER_TIMEOUT_MS,
    prefix: `helptravel:ratelimit-day:${key}`,
  });
  dailyLimiters.set(key, limiter);
  return limiter;
}

// ── Limit ZASTĘPCZY, gdy Redis nie odpowiada (incydent 2026-10-25) ─────────
//
// Do tej pory awaria Redisa miała dwa możliwe skutki i oba były złe:
//   • błąd komendy → `limiter.limit()` RZUCAŁ, a wyjątek wywracał trasę w 500
//     (zmierzone na produkcji: /api/hotels/rates/batch, /api/flights/rates,
//     /api/hotels/meta, czat i podpowiedzi kierunków — „nie udało się
//     sprawdzić dostępności" zamiast cen);
//   • zawieszenie → po 5 s timeoutu biblioteka przepuszczała wszystko.
//
// Teraz w obu przypadkach decyduje POLITYKA klucza (`DEGRADED_POLICY`):
//
//   • domyślnie limit LOKALNY: ten sam próg, to samo okno, licznik w pamięci
//     instancji funkcji. Ochrona przed zalewem z jednego adresu zostaje, znika
//     współdzielenie licznika między instancjami — przy N instancjach jeden
//     adres może wysłać do N × próg. Dopuszczalne tam, gdzie żądanie nie
//     kosztuje pieniędzy i niczego nie otwiera (wyszukiwanie i ceny z LiteAPI
//     — odczyty bez opłat za wywołanie; podgląd rezerwacji po losowym id);
//   • „closed" — 503 bez wykonania trasy. Dla kluczy, przy których mnożnik
//     N jest nie do przyjęcia, bo nie ma go czym ograniczyć: na Vercelu liczba
//     instancji rośnie razem z ruchem, a bez Redisa nie istnieje globalny
//     licznik. Patrz komentarz przy `DEGRADED_POLICY`.

/**
 * Klucze, które przy niedostępnym Redisie odpowiadają 503 zamiast liczyć
 * limit lokalnie.
 *
 *   • `concierge` — każde żądanie to płatne wywołania modelu (OpenRouter).
 *     Lokalny licznik per instancja nie daje żadnego GLOBALNEGO sufitu kosztu
 *     (instancji przybywa wraz z ruchem), więc awaria magazynu nie może
 *     otwierać czatu szerzej niż działający limiter. Czat wraca sam, gdy
 *     Redis odpowie; reszta serwisu działa bez zmian.
 *   • `booking-prebook` — zaczyna NOWĄ transakcję (blokada taryfy u dostawcy,
 *     sesja płatności). Sesji i tak nie da się zapisać bez magazynu, więc 503
 *     tutaj niczego nie odbiera, a zamyka drogę do prebooków ponad próg.
 *   • `admin-email-test` — narzędzia operatora wysyłające e-maile (test na
 *     dowolny adres, ponowne potwierdzenie rezerwacji). Próg 5/min to obrona
 *     na wypadek wycieku sekretu operatora; mnożnik N instancji ją rozmywa,
 *     a bez magazynu i tak nie ma czego ponownie potwierdzać.
 *
 * Celowo NIE ma tu `booking-book`: to dokończenie transakcji, za którą gość
 * mógł już zapłacić. Odcięcie go przez awarię limitera zamieniłoby przerwę
 * techniczną w zapłaconą, niezrealizowaną rezerwację — tam zostaje limit
 * lokalny (powtórzeniom zapobiega idempotencja sesji, nie limiter).
 */
const DEGRADED_POLICY: Partial<Record<LimiterKey, "closed">> = {
  concierge: "closed",
  "booking-prebook": "closed",
  "admin-email-test": "closed",
};

/** Treść 503 dla klucza zamkniętego przy awarii — bez szczegółów infrastruktury. */
const CLOSED_MESSAGE: Partial<Record<LimiterKey, string>> = {
  concierge: "Czat jest chwilowo niedostępny z powodu przerwy technicznej. Spróbuj ponownie za kilka minut.",
  "booking-prebook":
    "Rezerwacje są chwilowo wstrzymane z powodu przerwy technicznej po naszej stronie. Nic nie zostało zarezerwowane ani pobrane — spróbuj ponownie za jakiś czas.",
};

/** Polityka klucza przy niedostępnym Redisie — do asercji w testach i do raportu. */
export function degradedPolicyFor(key: LimiterKey): "local" | "closed" {
  return DEGRADED_POLICY[key] ?? "local";
}

interface LimitOutcome {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

interface WindowBucket {
  start: number;
  prev: number;
  curr: number;
}

/**
 * Okno przesuwne w pamięci — ten sam algorytm co `Ratelimit.slidingWindow`
 * (poprzednie okno ważone ułamkiem, który jeszcze się z nim nakłada).
 *
 * PAMIĘĆ OGRANICZONA, KOSZT O(1) NA ŻĄDANIE — dwie generacje map (wzorzec
 * „quick-lru"). Adres trafia do generacji bieżącej; użycie adresu ze starszej
 * przenosi go do bieżącej. Gdy bieżąca dojdzie do połowy limitu wpisów,
 * staje się starszą, a dotychczasowa starsza wypada W CAŁOŚCI — bez
 * przeglądania czegokolwiek.
 *
 * Dlaczego nie jedna mapa jako LRU: pierwsza wersja przeglądała przy pełnej
 * mapie wszystkie 10 000 wpisów dla każdego NOWEGO adresu, a druga (usuwanie
 * najstarszego przez `keys().next()`) też nie była O(1) — V8 zostawia po
 * usuniętych wpisach dziury, które iterator przeskakuje do najbliższego
 * przebudowania tablicy (zmierzone: 200 tys. nowych adresów 2,3 s, przyrost
 * szybszy niż liniowy). Zalanie unikalnymi adresami zamieniało limiter
 * w pętlę zjadającą CPU instancji.
 *
 * Adres, który właśnie przekracza próg, nie wypadnie: każda jego próba —
 * także odrzucona — przenosi go do generacji bieżącej. Wypaść może tylko
 * adres, który zamilkł na czas co najmniej połowy limitu wpisów (5 000)
 * innych adresów; jeśli wraca potem z nowym licznikiem, zyskuje tyle, ile
 * dałaby mu zmiana adresu — a do wyparcia potrzebował tysięcy innych.
 */
export class LocalSlidingWindow {
  private current = new Map<string, WindowBucket>();
  private previous = new Map<string, WindowBucket>();
  private readonly generationSize: number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    maxEntries = 10_000,
  ) {
    this.generationSize = Math.max(1, Math.floor(maxEntries / 2));
  }

  hit(id: string, now: number = Date.now()): LimitOutcome {
    const start = Math.floor(now / this.windowMs) * this.windowMs;
    const b = this.bucket(id, start);
    if (b.start !== start) {
      b.prev = start - b.start === this.windowMs ? b.curr : 0;
      b.curr = 0;
      b.start = start;
    }
    const overlap = 1 - (now - start) / this.windowMs;
    const used = b.prev * overlap + b.curr;
    const reset = start + this.windowMs;
    if (used >= this.limit) return { success: false, limit: this.limit, remaining: 0, reset };
    b.curr += 1;
    return { success: true, limit: this.limit, remaining: Math.max(0, Math.floor(this.limit - used - 1)), reset };
  }

  /** Licznik adresu w generacji bieżącej (przeniesiony ze starszej albo nowy). */
  private bucket(id: string, start: number): WindowBucket {
    const hot = this.current.get(id);
    if (hot) return hot;
    let b = this.previous.get(id);
    if (b) this.previous.delete(id);
    else b = { start, prev: 0, curr: 0 };
    this.current.set(id, b);
    if (this.current.size >= this.generationSize) {
      this.previous = this.current;
      this.current = new Map();
    }
    return b;
  }

  /** Liczba śledzonych adresów (do testów i diagnostyki). */
  get size(): number {
    return this.current.size + this.previous.size;
  }
}

const localMinute = new Map<LimiterKey, LocalSlidingWindow>();
const localDaily = new Map<LimiterKey, LocalSlidingWindow>();

function localMinuteFor(key: LimiterKey): LocalSlidingWindow {
  let l = localMinute.get(key);
  if (!l) {
    l = new LocalSlidingWindow(LIMIT_OVERRIDES[key] ?? LIMIT_PER_MINUTE, MINUTE_MS);
    localMinute.set(key, l);
  }
  return l;
}

function localDailyFor(key: LimiterKey, perDay: number): LocalSlidingWindow {
  let l = localDaily.get(key);
  if (!l) {
    l = new LocalSlidingWindow(perDay, DAY_MS);
    localDaily.set(key, l);
  }
  return l;
}

const lastDegradedLog = new Map<LimiterKey, number>();

function noteDegraded(key: LimiterKey, why: string): void {
  const now = Date.now();
  if (now - (lastDegradedLog.get(key) ?? 0) < MINUTE_MS) return; // jedna linia na minutę na klucz
  lastDegradedLog.set(key, now);
  const action = degradedPolicyFor(key) === "closed" ? "żądania odrzucane (503)" : "limit lokalny per instancja";
  console.warn(`[rate-limit] '${key}' Redis niedostępny (${why}) — ${action}`);
}

type Consulted = { degraded: false; result: LimitOutcome } | { degraded: true; why: string };

/** Pytanie Upstash o limit — albo powód, dla którego odpowiedzi nie ma. */
async function consultRedis(limiter: Ratelimit | null, ip: string): Promise<Consulted> {
  if (!limiter) return { degraded: true, why: "brak konfiguracji Upstash" };
  // Otwarty wyłącznik: nie ma sensu nawet próbować.
  if (!redisCircuitAllows()) return { degraded: true, why: "wyłącznik otwarty" };
  try {
    const result = await limiter.limit(ip);
    return result.reason === "timeout" ? { degraded: true, why: "timeout" } : { degraded: false, result };
  } catch (err) {
    return { degraded: true, why: err instanceof Error ? err.name : "błąd" };
  }
}

/**
 * Wynik limitu: z Redisa, a gdy go nie ma — według polityki klucza: licznik
 * lokalny albo „closed" (trasa ma odpowiedzieć 503).
 */
async function limitWithFallback(
  limiter: Ratelimit | null,
  local: LocalSlidingWindow,
  key: LimiterKey,
  ip: string,
): Promise<LimitOutcome | "closed"> {
  const consulted = await consultRedis(limiter, ip);
  if (!consulted.degraded) return consulted.result;
  noteDegraded(key, consulted.why);
  return degradedPolicyFor(key) === "closed" ? "closed" : local.hit(ip);
}

/** 503 klucza zamkniętego przy niedostępnym Redisie — bez szczegółów awarii. */
function closedWhileDegraded(key: LimiterKey): NextResponse {
  return NextResponse.json(
    {
      error: "TEMPORARILY_UNAVAILABLE",
      message:
        CLOSED_MESSAGE[key] ?? "Ta funkcja jest chwilowo niedostępna z powodu przerwy technicznej. Spróbuj ponownie za kilka minut.",
    },
    { status: 503, headers: { "Retry-After": "60" } },
  );
}

// Test-only seam (additive, no runtime behavior change): pre-seed or clear a
// limiter so route tests can assert 429 without a live Upstash instance.
export function __setLimiterForTests(key: LimiterKey, limiter: Ratelimit | null): void {
  if (limiter === null) limiters.delete(key);
  else limiters.set(key, limiter);
}
export function __setDailyLimiterForTests(key: LimiterKey, limiter: Ratelimit | null): void {
  if (limiter === null) dailyLimiters.delete(key);
  else dailyLimiters.set(key, limiter);
}
export function __resetLimitersForTests(): void {
  limiters.clear();
  dailyLimiters.clear();
  localMinute.clear();
  localDaily.clear();
  lastDegradedLog.clear();
}

/** Limity dobowe — do asercji w testach i do raportu. */
export function dailyLimitFor(key: LimiterKey): number | undefined {
  return DAILY_LIMITS[key];
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
  const ip = getClientIp(request);
  // Brak klienta Redisa: lokalnie (dev, testy) bez limitów — jak dotąd. Na
  // wdrożeniu Vercela to awaria konfiguracji (pusta albo zła zmienna), a nie
  // tryb pracy — wtedy polityka awaryjna klucza (limit lokalny albo 503)
  // zamiast braku jakiejkolwiek ochrony.
  const deployed = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
  if (!limiter && !deployed) return null;

  const result = await limitWithFallback(limiter, localMinuteFor(key), key, ip);
  if (result === "closed") return closedWhileDegraded(key);

  // Sufit minutowy przechodzi → sprawdzamy jeszcze dobowy (jeśli klucz go ma).
  // Kolejność ma znaczenie: burst odcinamy TANIEJ, zanim dołożymy drugi
  // round-trip do Redisa.
  if (result.success) {
    const perDay = DAILY_LIMITS[key];
    if (perDay === undefined) return null;
    const daily = getDailyLimiter(key);
    // Limiter minutowy jest (Redis albo wstrzyknięty w teście), a dobowego nie
    // da się zbudować — zachowanie jak dotąd: bez sufitu dobowego.
    if (!daily && limiter) return null;
    const dailyResult = await limitWithFallback(daily, localDailyFor(key, perDay), key, ip);
    if (dailyResult === "closed") return closedWhileDegraded(key);
    if (dailyResult.success) return null;
    console.warn(`[rate-limit] dobowy sufit '${key}' wyczerpany dla jednego adresu`);
    return NextResponse.json(
      { error: "Daily limit reached. Please try again tomorrow." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((dailyResult.reset - Date.now()) / 1000))),
          "X-RateLimit-Limit": String(dailyResult.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(dailyResult.reset / 1000)),
        },
      },
    );
  }

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
