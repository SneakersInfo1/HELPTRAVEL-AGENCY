"use client";

// Client-side price batcher for progressive (Booking-style) loading of
// hotel prices on the results list. Each card calls fetchHotelPrice() on
// mount; this module coalesces the calls (per identical search context)
// into small parallel batches against /api/hotels/rates/batch so the page
// is interactive immediately and prices stream in.

export interface SlimRate {
  totalAmount: number;
  currency: string;
  boardName?: string;
  refundableTag?: string;
  cancellationDeadline?: string;
  offerId: string;
  rateId: string;
  /** Patrz komentarz przy SlimRate w rate-cache.ts — `undefined` = brak danych. */
  taxesIncluded?: boolean;
  taxExtraAmount?: number;
}

export interface PriceQuery {
  hotelId: string;
  checkin: string;
  checkout: string;
  adults: number;
  children: number[];
  rooms: number;
  currency: string;
}

// Wynik pobrania ceny. Rozróżnienie null vs "error" jest KRYTYCZNE dla
// uczciwości listy wyników: null = LiteAPI potwierdziło brak ofert dla dat
// (hotel wyprzedany), "error" = NIE WIEMY (padł fetch/endpoint). Audyt
// 2026-07-03: awaria /rates/batch mapowała się na null → cała lista
// pokazywała „Brak dostępnych hoteli w tym terminie".
export type PriceResult = SlimRate | null | "error";

// LiteAPI rates run ~1-2s/hotel, but the API itself happily handles
// hotelIds[] arrays much larger than 3 — the bottleneck was our batching,
// not the upstream. Audit 2026-05-26 showed that 30 hotels × BATCH_SIZE=3
// = 10 sequential batches × ~800ms LiteAPI latency was ~4× slower than a
// single batch of 12-15. Bumped to 12 (and concurrency lowered to 3 since
// each batch now does more work). The audit also raised the /api/hotels/
// rates/batch hotelIds cap to 30 so this isn't artificially clipped.
//
// 2026-05-28 follow-up #1: results page ships the FULL meta pool (up to
// 1000 hotels). Bumped to BATCH_SIZE=24, MAX_CONCURRENT=5 → ~7s for a
// cold Barcelona-sized scan.
//
// 2026-06-27 KOREKTA (zmierzone na żywo, prod): wcześniejsze „~600-800 ms na
// batch" było BŁĘDNE. Realnie `/hotels/rates` ma TWARDĄ PODŁOGĘ ~3,3 s na call
// (zimno) niezależnie od rozmiaru batcha (batch 10 → 3,7 s, 50 → 5,9 s, 100 →
// 8,8 s). Tej podłogi NIE da się obejść — jedyne wyjście to cache (Redis +
// teraz Next Data Cache). Dwie zmiany, które realnie pomogły:
//   • Batch route woła getRates z `maxRatesPerHotel: 1` → payload 25 MB → 0,15 MB
//     (170×), call 6,8 s → 3,8 s, a 0,15 MB MIEŚCI się w cache (drugi user = hit).
//   • Pula metadanych 1000 → 300 → 6 batchy zamiast 20.
//
// 2026-08-11 STABILNOŚĆ (ta sesja). BATCH_SIZE zostaje 50 — to sufit trasy
// i najlepszy stosunek liczby round-tripów do podłogi 3,3 s. MAX_CONCURRENT
// zeszło 10 → 6, bo zmierzony pełny skan dużego kierunku to do 40 batchy na
// jednym kluczu limitera `stays-search`; przy 10 równoległych cała paczka
// uderzała w limiter w jednej sekundzie i CAŁY skan wracał 429 naraz. Przy 6
// przepustowość jest praktycznie ta sama (podłoga LiteAPI, nie nasza kolejka,
// wyznacza czas), a rozkład w czasie mieści się w oknie limitera.
const BATCH_SIZE = 50;
const MAX_CONCURRENT = 6;
const WINDOW_MS = 60; // coalescing window

// ── Odporność pojedynczego batcha ────────────────────────────────────────
//
// TIMEOUT jest OBOWIĄZKOWY, nie kosmetyczny. Bez niego zawieszony fetch
// (typowe na mobile przy przełączaniu sieci) NIGDY nie zmniejszał `inFlight`,
// więc kolejka skanu zatrzymywała się na zawsze: karty zostawały w stanie
// „Sprawdzam cenę", a podtytuł w „Szukamy najlepszych ofert…" bez końca.
//
// 18 s dobrane z realnych czasów: podłoga `/hotels/rates` to ~3,3 s, batch 50
// zimno ~5-6 s, a trasa dokłada odczyt i zapis Redisa. Trzykrotny zapas nad
// najgorszym zmierzonym przebiegiem — timeout ma łapać ZAWIESZENIE, nie
// wolną odpowiedź.
const REQUEST_TIMEOUT_MS = 18_000;
/** Pierwsza próba + 2 ponowki. Więcej = bombardowanie API bez zysku. */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 900;
const MAX_BACKOFF_MS = 8_000;
const JITTER_MS = 350;

type Pending = {
  hotelId: string;
  resolve: (v: PriceResult) => void;
};

interface Group {
  ctx: Omit<PriceQuery, "hotelId">;
  queue: Pending[];
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: number;
}

const groups = new Map<string, Group>();

function groupKey(q: PriceQuery): string {
  return [q.checkin, q.checkout, q.adults, q.children.join("."), q.rooms, q.currency].join("|");
}

// ── Telemetria ───────────────────────────────────────────────────────────
//
// Nie jest ozdobą: bez niej „ceny czasem nie dochodzą" pozostaje anegdotą.
// Testy i pomiar E2E czytają stąd liczbę 429, 5xx, timeoutów i ponowek,
// więc każda zmiana progu limitera albo współbieżności ma twardy dowód.
export interface BatcherStats {
  /** Wysłane żądania HTTP (łącznie z ponowkami). */
  requests: number;
  ok: number;
  rateLimited: number;
  serverErrors: number;
  clientErrors: number;
  timeouts: number;
  networkErrors: number;
  retries: number;
  /** Batche, które po wszystkich próbach oddały „error". */
  failedBatches: number;
  /** Hotele, których nie było w odpowiedzi mimo poprawnego 200. */
  missingFromResponse: number;
}

const stats: BatcherStats = {
  requests: 0,
  ok: 0,
  rateLimited: 0,
  serverErrors: 0,
  clientErrors: 0,
  timeouts: 0,
  networkErrors: 0,
  retries: 0,
  failedBatches: 0,
  missingFromResponse: 0,
};

export function getBatcherStats(): BatcherStats {
  return { ...stats };
}

/** Wyłącznie dla testów — stan żyje w module i przeciekałby między przypadkami. */
export function __resetBatcherForTests(): void {
  for (const g of groups.values()) {
    if (g.timer !== null) clearTimeout(g.timer);
  }
  groups.clear();
  for (const k of Object.keys(stats) as Array<keyof BatcherStats>) stats[k] = 0;
  sleep = realSleep;
  requestTimeoutMs = REQUEST_TIMEOUT_MS;
}

// Seam czasu: testy podmieniają uśpienie na zapis żądanej zwłoki, dzięki
// czemu HARMONOGRAM ponowek (backoff, Retry-After, jitter) jest sprawdzalny
// bez czekania kilku sekund na przypadek testowy.
const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
let sleep: (ms: number) => Promise<void> = realSleep;
export function __setSleepForTests(fn: ((ms: number) => Promise<void>) | null): void {
  sleep = fn ?? realSleep;
}

// Ten sam powód co wyżej: test zawieszonego żądania musi trwać milisekundy,
// a nie osiemnaście sekund.
let requestTimeoutMs: number = REQUEST_TIMEOUT_MS;
export function __setRequestTimeoutForTests(ms: number | null): void {
  requestTimeoutMs = ms ?? REQUEST_TIMEOUT_MS;
}

// ── Klasyfikacja porażek ─────────────────────────────────────────────────
//
// Ponawiamy WYŁĄCZNIE awarie przejściowe. 400/401/403/422 to błąd żądania —
// ponowka wysłałaby dokładnie ten sam błędny ładunek i tylko dołożyła ruchu.
type BatchFailure =
  | { kind: "http"; status: number; retryAfterMs: number | null }
  | { kind: "timeout" }
  | { kind: "network" };

class BatchError extends Error {
  constructor(readonly info: BatchFailure) {
    super(info.kind === "http" ? `HTTP ${info.status}` : info.kind);
    this.name = "BatchError";
  }
}

function retryable(f: BatchFailure): boolean {
  if (f.kind === "timeout" || f.kind === "network") return true;
  return f.status === 408 || f.status === 429 || f.status >= 500;
}

/** `Retry-After` w sekundach albo jako data HTTP. Nagłówek jest opcjonalny. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_BACKOFF_MS, seconds * 1000);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.min(MAX_BACKOFF_MS, at - Date.now()));
}

/**
 * Zwłoka przed ponowką.
 *
 * JITTER JEST KONIECZNY, nie ozdobny. Pełny skan dużego kierunku to do 40
 * batchy; gdy limiter odrzuci całą paczkę naraz, STAŁE 800 ms sprawiało, że
 * wszystkie 40 ponawiały się w tej samej milisekundzie, wciąż w tym samym
 * oknie limitera — i cały skan kończył się zerem cen. Rozrzut rozkłada
 * ponowki po oknie.
 */
function backoffMs(attempt: number, f: BatchFailure): number {
  const jitter = Math.floor(Math.random() * JITTER_MS);
  if (f.kind === "http" && f.retryAfterMs !== null) {
    return Math.min(MAX_BACKOFF_MS, f.retryAfterMs) + jitter;
  }
  const base = BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(MAX_BACKOFF_MS, base) + jitter;
}

async function postBatch(g: Group, hotelIds: string[]): Promise<Record<string, SlimRate | null>> {
  // AbortController + własny timer zamiast `AbortSignal.timeout`: ten drugi
  // trzyma timer do końca odliczania nawet po udanej odpowiedzi, a my
  // wysyłamy ich do 40 na skan.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);

  stats.requests += 1;
  try {
    const res = await fetch("/api/hotels/rates/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelIds, ...g.ctx }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 429) stats.rateLimited += 1;
      else if (res.status >= 500) stats.serverErrors += 1;
      else stats.clientErrors += 1;
      throw new BatchError({
        kind: "http",
        status: res.status,
        retryAfterMs: parseRetryAfter(res.headers.get("Retry-After")),
      });
    }
    const data = (await res.json()) as { rates?: Record<string, SlimRate | null> };
    stats.ok += 1;
    return data.rates ?? {};
  } catch (err) {
    if (err instanceof BatchError) throw err;
    if (timedOut) {
      stats.timeouts += 1;
      throw new BatchError({ kind: "timeout" });
    }
    stats.networkErrors += 1;
    throw new BatchError({ kind: "network" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rozdanie wyniku batcha.
 *
 * BRAK KLUCZA ≠ BRAK MIEJSC. `resolveSlimRates` wpisuje klucz dla KAŻDEGO
 * pytanego hotelu (także `null` = potwierdzona pustka), więc nieobecność
 * klucza znaczy, że odpowiedź jest niekompletna — czyli awaria techniczna.
 * Mapowanie tego na `null` ukrywało hotel z listy jako „wyprzedany".
 */
function rozdajWynik(batch: Pending[], rates: Record<string, SlimRate | null>): void {
  for (const p of batch) {
    if (Object.prototype.hasOwnProperty.call(rates, p.hotelId)) {
      p.resolve(rates[p.hotelId]);
    } else {
      stats.missingFromResponse += 1;
      p.resolve("error");
    }
  }
}

async function runBatch(g: Group, batch: Pending[]): Promise<void> {
  const hotelIds = batch.map((b) => b.hotelId);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rates = await postBatch(g, hotelIds);
      rozdajWynik(batch, rates);
      return;
    } catch (err) {
      const info = err instanceof BatchError ? err.info : ({ kind: "network" } as BatchFailure);
      const ostatnia = attempt === MAX_ATTEMPTS;
      if (ostatnia || !retryable(info)) break;
      stats.retries += 1;
      await sleep(backoffMs(attempt, info));
    }
  }
  // Wyczerpane próby → "error", NIGDY null: null znaczy „potwierdzony brak
  // miejsc" i ukrywa hotel z listy.
  stats.failedBatches += 1;
  for (const p of batch) p.resolve("error");
}

/** Grupę wolno usunąć dopiero, gdy nic w niej nie czeka ANI nie leci. */
function releaseGroup(key: string, g: Group): void {
  if (g.queue.length > 0 || g.inFlight > 0 || g.timer !== null) return;
  if (groups.get(key) === g) groups.delete(key);
}

function flush(key: string, g: Group): void {
  // Tożsamość, nie sam klucz: gdyby grupa została w międzyczasie zastąpiona,
  // opróżnianie starej kolejki obsługiwałoby żądania, których nikt nie czeka.
  if (groups.get(key) !== g) return;
  while (g.queue.length > 0 && g.inFlight < MAX_CONCURRENT) {
    const batch = g.queue.splice(0, BATCH_SIZE);
    g.inFlight += 1;
    // `runBatch` sam rozstrzyga wszystkie obietnice i nigdy nie odrzuca —
    // `.finally` zwalnia slot niezależnie od wyniku, więc kolejka nie może
    // się zablokować na wiszącym żądaniu.
    void runBatch(g, batch).finally(() => {
      g.inFlight -= 1;
      if (g.queue.length > 0) flush(key, g);
      else releaseGroup(key, g);
    });
  }
}

function scheduleFlush(key: string, g: Group): void {
  if (g.timer !== null) return;
  // Przy pełnym obłożeniu nie ustawiamy budzika: slot zwolni się w `.finally`
  // działającego batcha i ono samo dokończy kolejkę.
  if (g.inFlight >= MAX_CONCURRENT) return;
  g.timer = setTimeout(() => {
    g.timer = null;
    flush(key, g);
  }, WINDOW_MS);
}

export function fetchHotelPrice(q: PriceQuery): Promise<PriceResult> {
  const key = groupKey(q);
  let g = groups.get(key);
  if (!g) {
    const { hotelId: _omit, ...ctx } = q;
    void _omit;
    g = { ctx, queue: [], timer: null, inFlight: 0 };
    groups.set(key, g);
  }
  const grupa = g;
  return new Promise<PriceResult>((resolve) => {
    grupa.queue.push({ hotelId: q.hotelId, resolve });
    scheduleFlush(key, grupa);
  });
}
