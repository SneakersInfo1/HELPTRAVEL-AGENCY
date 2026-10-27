// Własny „requester" dla SDK @upstash/redis — JEDYNA droga każdej komendy do
// Upstash (także komend `@upstash/ratelimit`, bo limiter dostaje ten sam
// klient). Tu, a nie w każdym module osobno, stoją:
//
//   • WYŁĄCZNIK OBWODU — przy otwartym komendy odpadają bez sieci;
//   • TIMEOUT na całe żądanie (AbortSignal: nawiązanie, odpowiedź i treść) —
//     domyślny HttpClient SDK nie miał żadnego, a przy błędach sieci ponawiał
//     5× z backoffem wykładniczym (50 ms … 2,7 s);
//   • PONOWIENIE tylko przy błędzie POŁĄCZENIA i tylko dla komend, których
//     powtórzenie niczego nie psuje (odczyty, zwykły SET/DEL/EXPIRE). Nigdy
//     skrypty (limiter), SET NX (blokady crona), liczniki ani transakcje;
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

// Komunikaty limitu planu, które Upstash zwraca (zmierzone 2026-10-25:
// „ERR This database has reached current Fixed plan limits…"), plus znane
// warianty dla planów pay-as-you-go/free („ERR max requests limit exceeded",
// „ERR max daily request limit exceeded", limit przepustowości).
const QUOTA_RE =
  /plan limits?|max (?:daily |monthly )?(?:requests?|commands?|bandwidth|data size)\b[^.]*\blimit|limit exceeded|exceeded[^.]*\blimit|quota/i;
const AUTH_RE = /unauthori[sz]ed|invalid (?:api )?token|wrongpass|noauth/i;

/**
 * Klasyfikacja odpowiedzi HTTP ≠ 2xx.
 *   • limit planu (po treści) → `quota` (trwałe);
 *   • 401/403 → `auth` (trwałe);
 *   • 404/405 → `config` (trwałe: zły adres bazy albo ścieżki);
 *   • 408 → `timeout`, 429 bez treści o limicie → `server` (throttling, chwilowe);
 *   • 5xx → `server` (chwilowe);
 *   • pozostałe 4xx (400, 413, 422…) → `command`: tak Upstash zgłasza błędy
 *     samych komend Redisa, serwer działa.
 */
export function classifyHttpFailure(status: number, message: string): FailureKind | "command" {
  if (QUOTA_RE.test(message)) return "quota";
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

/** Komendy, których powtórzenie po zgubionej odpowiedzi daje ten sam stan. */
const RETRY_SAFE = new Set([
  "get",
  "mget",
  "hget",
  "hgetall",
  "hmget",
  "exists",
  "ttl",
  "pttl",
  "ping",
  "del",
  "expire",
  "hset",
]);

/**
 * Czy żądanie wolno POWTÓRZYĆ, gdy połączenie padło i nie wiemy, czy serwer
 * je wykonał. SET tylko bez NX/XX/GET (zwykłe nadpisanie tą samą wartością);
 * skrypty, liczniki i transakcje — nigdy.
 */
export function isRetrySafe(commands: unknown[], transaction: boolean): boolean {
  if (transaction || commands.length === 0) return false;
  return commands.every((c) => {
    if (!Array.isArray(c) || c.length === 0) return false;
    const name = String(c[0]).toLowerCase();
    if (name === "set") {
      const flags = c.slice(3).map((x) => String(x).toLowerCase());
      return !flags.includes("nx") && !flags.includes("xx") && !flags.includes("get");
    }
    return RETRY_SAFE.has(name);
  });
}

/**
 * W potoku Upstash zwraca HTTP 200 i błędy per pozycja. Błąd LOGICZNY zostawia
 * SDK (rzuci go jako błąd komendy), ale limit planu albo autoryzacja wewnątrz
 * potoku to awaria magazynu — musi otworzyć wyłącznik, a nie go „uleczyć".
 */
function embeddedOutage(body: unknown): { kind: FailureKind; message: string } | null {
  if (!Array.isArray(body)) return null;
  for (const entry of body) {
    const error = (entry as { error?: unknown } | null)?.error;
    if (typeof error !== "string") continue;
    if (QUOTA_RE.test(error)) return { kind: "quota", message: sanitizeUpstashMessage(error) };
    if (AUTH_RE.test(error)) return { kind: "auth", message: sanitizeUpstashMessage(error) };
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
          // Każda fizyczna próba to wysłany payload i potencjalnie wykonane komendy.
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
