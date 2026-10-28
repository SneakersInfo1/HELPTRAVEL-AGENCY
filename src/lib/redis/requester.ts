// Własny „requester" dla SDK @upstash/redis — JEDYNA droga każdej komendy do
// Upstash (także komend `@upstash/ratelimit`, bo limiter dostaje ten sam
// klient). Tu, a nie w każdym module osobno, stoją:
//
//   • WYŁĄCZNIK OBWODU — przy otwartym komendy odpadają bez sieci;
//   • TIMEOUT na całe żądanie (AbortSignal: nawiązanie, odpowiedź i treść) —
//     domyślny HttpClient SDK nie miał żadnego, a przy błędach sieci ponawiał
//     5× z backoffem wykładniczym (50 ms … 2,7 s);
//   • PONOWIENIE tylko przy błędzie POŁĄCZENIA i tylko dla ODCZYTÓW. Zapis,
//     którego odpowiedź zginęła, mógł już się wykonać — jego powtórzenie po
//     100 ms potrafi nadpisać nowszą wartość innego żądania (sesja rezerwacji)
//     albo przesunąć TTL. Nigdy więc zapisy, skrypty (limiter), SET NX
//     (blokady crona), liczniki ani transakcje;
//   • ODPOWIEDZI BEZ base64 — domyślny HttpClient prosi serwer o kodowanie
//     każdej odpowiedzi w base64 (nagłówek `Upstash-Encoding`), co dokłada
//     ~33% do transferu każdego odczytu. Nasze wartości to JSON/UTF-8, więc
//     kodowanie niczego nie chroni, a płacimy za nie w limicie transferu;
//   • READ-YOUR-WRITES — token `upstash-sync-token` jak w domyślnym kliencie;
//   • SANITYZACJA BŁĘDÓW — HttpClient doklejał do komunikatu CAŁY payload
//     („command was: [[set, …, {holder, guests, secretKey…}]]"). Przy awarii
//     zapisu sesji rezerwacji te dane lądowałyby w logach Vercela. Tutaj
//     komunikat zawiera wyłącznie nazwy komend;
//   • POMIAR — bajty w obie strony i liczba komend, per próba.

import type { Requester, UpstashRequest, UpstashResponse } from "@upstash/redis";

import type { BreakerLease, CircuitBreaker, FailureKind } from "./breaker";
import { commandFamily, recordRequest, recordShortCircuit } from "./metrics";

export type RedisUnavailableReason = FailureKind | "circuit_open";

/** Magazyn niedostępny: awaria, limit planu, timeout albo otwarty wyłącznik. */
export class RedisUnavailableError extends Error {
  readonly reason: RedisUnavailableReason;
  constructor(reason: RedisUnavailableReason, detail?: string) {
    super(`Upstash niedostępny (${reason})${detail ? `: ${detail}` : ""}`);
    this.name = "RedisUnavailableError";
    this.reason = reason;
  }
}

/**
 * Błąd LOGICZNY komendy — serwer odpowiedział (WRONGTYPE, NOSCRIPT, zła
 * składnia, za duże żądanie). Nie jest awarią magazynu i nie otwiera
 * wyłącznika. Treść zachowuje kod błędu Redisa, bo `@upstash/ratelimit`
 * rozpoznaje po nim NOSCRIPT.
 */
export class RedisCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisCommandError";
  }
}

// LIMIT PLANU = wyczerpany budżet miesięczny albo dobowy. Tylko taki komunikat
// otwiera wyłącznik jako awarię TRWAŁĄ (od razu, na minutę i dłużej), więc
// lista jest celowo wąska — znane brzmienia, nie samo słowo „limit":
//   • zmierzone 2026-10-25: „ERR This database has reached current Fixed plan
//     limits. Please upgrade manually or enable auto upgrade…";
//   • warianty planów free/pay-as-you-go: „ERR max requests limit exceeded.
//     Limit: …, Usage: …", „ERR max daily request limit exceeded", limit
//     miesięcznej przepustowości (bandwidth).
// Wcześniej pasowało też gołe „limit exceeded" — więc zwykłe dławienie
// („rate limit exceeded", limit na sekundę) wyłączało magazyn na 60–600 s
// zamiast liczyć się jako porażka chwilowa.
const QUOTA_RE =
  /\bplan limits?\b|\bmax (?:daily|monthly) (?:requests?|commands?|bandwidth)\b|\bmax requests limit exceeded\b|\b(?:daily|monthly) (?:requests?|commands?|bandwidth) limit\b|\bbandwidth limit\b|\bquota\b/i;
// Dławienie chwilowe (na sekundę, połączenia równoległe, „rate limit") i limity
// rozmiaru POJEDYNCZEGO żądania albo wpisu — mimo słowa „limit" to nie jest
// wyczerpany plan. Pełna pamięć bazy też nie: odczyty dalej działają, więc
// zamykanie całego magazynu byłoby gorsze niż odrzucenie samego zapisu.
const NOT_QUOTA_RE = /per[- ]second|\/\s*s(?:ec)?\b|concurren|too many requests|rate[- ]?limit|\bsize\b/i;
const AUTH_RE = /unauthori[sz]ed|invalid (?:api )?token|wrongpass|noauth/i;
// Błąd SERWERA osadzony w pozycji potoku (HTTP 200, ale serwer nie wykonał
// komendy z powodu własnego stanu). Liczy się jak porażka chwilowa — w
// odróżnieniu od błędów logicznych (WRONGTYPE, NOSCRIPT, składnia), po których
// wiadomo, że magazyn działa. Tylko jednoznaczne stany serwera: prefiksy
// Redisa (LOADING, BUSY, CLUSTERDOWN, MASTERDOWN, TRYAGAIN) oraz „internal
// (server) error", „service unavailable", „timed out". NIE gołe „timeout":
// „ERR timeout is not a float or out of range" to błąd argumentu komendy.
const EMBEDDED_SERVER_RE =
  /^(?:ERR\s+)?(?:LOADING|BUSY|CLUSTERDOWN|MASTERDOWN|TRYAGAIN)\b|\binternal (?:server )?error\b|\bservice unavailable\b|\btimed out\b/i;

/** Czy komunikat oznacza wyczerpany limit planu (awaria trwała). */
export function isQuotaMessage(message: string): boolean {
  return QUOTA_RE.test(message) && !NOT_QUOTA_RE.test(message);
}

/**
 * Klasyfikacja odpowiedzi HTTP ≠ 2xx.
 *   • limit planu (po treści, patrz `isQuotaMessage`) → `quota` (trwałe);
 *   • 401/403 → `auth` (trwałe);
 *   • 404/405 → `config` (trwałe: zły adres bazy albo ścieżki);
 *   • 408 → `timeout`, 429 → `server` (dławienie, chwilowe);
 *   • 5xx → `server` (chwilowe);
 *   • pozostałe 4xx (400, 413, 422…) → `command`: tak Upstash zgłasza błędy
 *     samych komend Redisa, serwer działa.
 */
export function classifyHttpFailure(status: number, message: string): FailureKind | "command" {
  if (isQuotaMessage(message)) return "quota";
  if (status === 401 || status === 403 || AUTH_RE.test(message)) return "auth";
  if (status === 404 || status === 405) return "config";
  if (status === 408) return "timeout";
  if (status === 429 || status >= 500) return "server";
  return "command";
}

/** Komunikat bez payloadu i bez zbędnej długości. */
export function sanitizeUpstashMessage(raw: string): string {
  const head = raw.split(/,\s*command was:/i)[0] ?? raw;
  const oneLine = head.replace(/\s+/g, " ").trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
}

function extractErrorMessage(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {
    // treść nie-JSON — opisujemy samym statusem
  }
  return `HTTP ${status}`;
}

function isPipeline(req: UpstashRequest): boolean {
  return Array.isArray(req.path) && (req.path.includes("pipeline") || req.path.includes("multi-exec"));
}

function isTransaction(req: UpstashRequest): boolean {
  return Array.isArray(req.path) && req.path.includes("multi-exec");
}

function commandList(req: UpstashRequest): unknown[] {
  if (isPipeline(req) && Array.isArray(req.body)) return req.body as unknown[];
  return [req.body];
}

/** „set" / „pipeline: set×50" — WYŁĄCZNIE nazwy komend, nigdy argumenty. */
export function describeCommands(commands: unknown[], pipeline: boolean): string {
  const names = commands.map((c) => (Array.isArray(c) && c.length > 0 ? String(c[0]).toLowerCase() : "?"));
  if (!pipeline) return `cmd: ${names[0] ?? "?"}`;
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return `pipeline: ${[...counts].map(([n, k]) => (k > 1 ? `${n}×${k}` : n)).join(", ")}`;
}

/**
 * Komendy TYLKO DO ODCZYTU — jedyne, które wolno powtórzyć po zgubionej
 * odpowiedzi. Zapis (także zwykły SET z EX, DEL, HSET, EXPIRE) mógł się już
 * wykonać: powtórzony po 100 ms nadpisałby wartość zapisaną w międzyczasie
 * przez inne żądanie albo przesunąłby TTL, a jego odpowiedź (DEL: 0 zamiast 1)
 * kłamałaby o tym, co się stało.
 */
const RETRY_SAFE = new Set(["get", "mget", "hget", "hgetall", "hmget", "exists", "ttl", "pttl", "ping", "strlen"]);

/**
 * Czy żądanie wolno POWTÓRZYĆ, gdy połączenie padło i nie wiemy, czy serwer
 * je wykonał. Wyłącznie odczyty (także potok złożony z samych odczytów);
 * zapisy, skrypty, liczniki i transakcje — nigdy.
 */
export function isRetrySafe(commands: unknown[], transaction: boolean): boolean {
  if (transaction || commands.length === 0) return false;
  return commands.every((c) => Array.isArray(c) && c.length > 0 && RETRY_SAFE.has(String(c[0]).toLowerCase()));
}

/**
 * W potoku Upstash zwraca HTTP 200 i błędy per pozycja. Błąd LOGICZNY zostawia
 * SDK (rzuci go jako błąd komendy), ale limit planu, autoryzacja albo błąd
 * samego serwera wewnątrz potoku to awaria magazynu — musi liczyć się jako
 * porażka, a nie „uleczyć" wyłącznik.
 */
function embeddedOutage(body: unknown): { kind: FailureKind; message: string } | null {
  if (!Array.isArray(body)) return null;
  for (const entry of body) {
    const error = (entry as { error?: unknown } | null)?.error;
    if (typeof error !== "string") continue;
    if (isQuotaMessage(error)) return { kind: "quota", message: sanitizeUpstashMessage(error) };
    if (AUTH_RE.test(error)) return { kind: "auth", message: sanitizeUpstashMessage(error) };
    if (EMBEDDED_SERVER_RE.test(error)) return { kind: "server", message: sanitizeUpstashMessage(error) };
  }
  return null;
}

function byteLength(s: string): number {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(s, "utf8") : new TextEncoder().encode(s).length;
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ResilientRequesterOptions {
  url: string;
  token: string;
  /** Limit czasu CAŁEGO żądania (nawiązanie, odpowiedź, treść). */
  timeoutMs: number;
  breaker: CircuitBreaker;
  /** Ile razy ponowić przy błędzie POŁĄCZENIA komendę idempotentną. */
  networkRetries?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createResilientRequester(opts: ResilientRequesterOptions): Requester {
  const baseUrl = opts.url.replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = opts.now ?? Date.now;
  const networkRetries = Math.max(0, opts.networkRetries ?? 1);

  // READ-YOUR-WRITES jak w domyślnym HttpClient SDK: serwer zwraca nagłówek
  // `upstash-sync-token`, a kolejne żądania tego klienta go odsyłają. Przy
  // bazie z replikami odczytu gwarantuje to, że odczyt po zapisie (np. sesja
  // rezerwacji zapisana w prebooku i czytana chwilę później w tej samej
  // instancji) nie trafi na replikę sprzed zapisu.
  const requester: Requester = {
    readYourWrites: true,
    upstashSyncToken: "",
    request: async <TResult = unknown>(req: UpstashRequest): Promise<UpstashResponse<TResult>> => {
      if (req.isStreaming || req.onMessage) {
        throw new RedisCommandError("strumieniowanie (subscribe) nie jest obsługiwane");
      }
      const pipeline = isPipeline(req);
      const commands = commandList(req);
      const family = commandFamily(commands[0]);
      const what = describeCommands(commands, pipeline);

      const lease: BreakerLease | null = opts.breaker.tryAcquire();
      if (!lease) {
        recordShortCircuit(family, commands.length);
        throw new RedisUnavailableError("circuit_open", what);
      }

      let verdict = false; // czy wyłącznik dostał już wynik tego żądania
      const started = now();
      let payloadBytes = 0;
      let attempts = 0;
      let bytesIn = 0;
      const record = (outcome: Parameters<typeof recordRequest>[0]["outcome"]) =>
        recordRequest({
          family,
          // Każda fizyczna próba to osobne żądanie HTTP: wysłany payload
          // i potencjalnie wykonane komendy.
          attempts: Math.max(1, attempts),
          commands: commands.length * Math.max(1, attempts),
          bytesOut: payloadBytes * Math.max(1, attempts),
          bytesIn,
          ms: now() - started,
          outcome,
        });
      const unavailable = (kind: FailureKind, detail: string) => {
        verdict = true;
        opts.breaker.recordFailure(lease, kind);
        record(kind);
        return new RedisUnavailableError(kind, detail);
      };

      try {
        const payload = JSON.stringify(req.body);
        payloadBytes = byteLength(payload);
        const url = [baseUrl, ...(req.path ?? [])].join("/");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.token}`,
          ...(req.headers ?? {}),
        };
        if (requester.readYourWrites !== false && requester.upstashSyncToken) {
          headers["upstash-sync-token"] = requester.upstashSyncToken;
        }
        const retries = isRetrySafe(commands, isTransaction(req)) ? networkRetries : 0;

        let res: Response | null = null;
        while (res === null) {
          attempts += 1;
          try {
            res = await fetchImpl(url, {
              method: "POST",
              headers,
              body: payload,
              // `no-store` celowo: komendy Redisa (limiter, sesje rezerwacji)
              // NIGDY nie mogą trafić do cache'u danych Nexta. Strony, które
              // mają być ISR, czytają przez `cached-reads.ts` (unstable_cache).
              cache: "no-store",
              signal: AbortSignal.timeout(opts.timeoutMs),
            });
          } catch (err) {
            if (isTimeoutError(err)) throw unavailable("timeout", what);
            if (attempts > retries) throw unavailable("network", what);
            await sleep(100);
            // W czasie przerwy inne żądania mogły otworzyć obwód (albo zakończyć
            // próbę half-open). Wtedy kolejna próba NIE idzie do sieci — jej
            // wynik i tak byłby zignorowany, a komenda obciążyłaby magazyn,
            // o którym już wiadomo, że nie działa.
            if (!opts.breaker.isLeaseCurrent(lease)) throw unavailable("network", what);
          }
        }

        let text: string;
        try {
          text = await res.text();
        } catch (err) {
          throw unavailable(isTimeoutError(err) ? "timeout" : "network", what);
        }
        bytesIn = byteLength(text);
        const syncToken = res.headers.get("upstash-sync-token");
        if (syncToken) requester.upstashSyncToken = syncToken;

        if (!res.ok) {
          const message = sanitizeUpstashMessage(extractErrorMessage(text, res.status));
          const kind = classifyHttpFailure(res.status, message);
          if (kind === "command") {
            verdict = true;
            opts.breaker.recordSuccess(lease); // serwer odpowiedział — połączenie zdrowe
            record("command_error");
            throw new RedisCommandError(`${message} (${what})`);
          }
          throw unavailable(kind, `${message} (${what})`);
        }

        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          throw unavailable("server", `niepoprawny JSON w odpowiedzi (${what})`);
        }
        const outage = pipeline ? embeddedOutage(body) : null;
        if (outage) throw unavailable(outage.kind, `${outage.message} (${what})`);

        verdict = true;
        opts.breaker.recordSuccess(lease);
        record("ok");
        return body as UpstashResponse<TResult>;
      } finally {
        // Próba half-open nie może zawisnąć, gdy żądanie padło przed werdyktem
        // (np. nieserializowalny argument) — inaczej obwód odrzucałby wszystko.
        if (!verdict) opts.breaker.releaseProbe(lease);
      }
    },
  };
  return requester;
}
