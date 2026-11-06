// Stan wyszukiwania lotów po wielu lotniskach wylotu („Warszawa — wszystkie
// lotniska”, „Polska — dowolne lotnisko”) — czysta logika dla /loty/wyniki.
//
// INCYDENT 2026-11-03. Lista wyników znała tylko dwa stany: „coś przyszło”
// albo „nic nie przyszło”. Lotnisko, które odpowiedziało pustą listą (WMI/RDO
// w GDS zwykle nie mają lotów), liczyło się jak udane wyszukiwanie — więc gdy
// główne lotnisko (WAW) dostało od dostawcy 429, gość widział „Brak lotów dla
// wybranych dat”, czyli nieprawdę. A przy błędzie wszystkich lotnisk nagłówek
// i tak pokazywał „0 ofert”. Tutaj każde lotnisko ma własny stan, a wynik
// całości rozróżnia: wyniki, prawdziwy brak lotów, wyniki częściowe i błąd.

export type OriginStatus =
  | { state: "pending" }
  | { state: "loading" }
  | { state: "ok"; count: number }
  | {
      state: "error";
      /** Nasza taksonomia z /api/flights/rates (np. PROVIDER_THROTTLED), nie kod dostawcy. */
      reason?: string;
      message: string;
      /** Epoch ms, od którego ponowienie ma sens (Retry-After). */
      retryAt?: number;
      /** Lotnisko pominięte, bo wcześniejsze dostało pauzę dostawcy — bez zapytania. */
      skipped?: boolean;
    };

export type FanoutOutcome = "loading" | "results" | "partial" | "empty" | "error";

export interface FanoutSummary {
  settled: boolean;
  outcome: FanoutOutcome;
  failed: string[];
  /** Pierwszy komunikat błędu (do nagłówka stanu błędu). */
  message: string | null;
  /** Najpóźniejszy moment, od którego ponowienie ma sens. */
  retryAt: number | null;
  /** Wszystkie błędy to odmowa dostępu u dostawcy — ponawianie nie pomoże. */
  providerDown: boolean;
  /** Czy ponowienie nieudanych lotnisk ma sens (nie: same złe dane albo odmowa dostępu). */
  retryable: boolean;
}

/** Powody, po których kolejne lotniska w tym przebiegu byłyby odrzucone tak samo (bez zapytania). */
export const STOP_REASONS = new Set([
  "PROVIDER_THROTTLED",
  "PROVIDER_ACCESS_DENIED",
  "PROVIDER_BUSY",
  "SEARCH_BUDGET_EXHAUSTED",
  "RATE_LIMITED",
]);

/**
 * Ile błędów Z RZĘDU (timeout, 5xx, sieć) przerywa przebieg. Te błędy nie
 * mówią „stop” tak wyraźnie jak pauza, ale dwa pod rząd to już awaria, a nie
 * kaprys jednego lotniska. Bez tego granicy „Polska — dowolne lotnisko” przy
 * awarii dostawcy to do 12 zapytań i 3 minuty czekania na jedną akcję.
 */
export const MAX_CONSECUTIVE_FAILURES = 2;

export interface FanoutRun {
  /** Wyszukanie jednego lotniska; błąd to stan, nie wyjątek. */
  search(origin: string): Promise<OriginStatus>;
  onStatuses(patch: Record<string, OriginStatus>): void;
  /** `false` po wyjściu ze strony — kolejka staje, reszta nie idzie do serwera. */
  isActive(): boolean;
}

/**
 * Jeden przebieg po lotniskach: PO KOLEI, w kolejności grupy (najpierw główne).
 * Dawniej szły naraz i dostawca odpowiadał na drugie i trzecie HTTP 429
 * (produkcja 2026-11-03 i 2026-11-04). Serwer i tak szereguje zapytania
 * (provider-slot.ts), ale kolejka w przeglądarce daje główne lotnisko jako
 * pierwsze, nie trzyma funkcji w czekaniu i po wyjściu ze strony nie wysyła reszty.
 */
export async function runOriginFanout(targets: readonly string[], run: FanoutRun): Promise<{ anyOk: boolean }> {
  run.onStatuses(Object.fromEntries(targets.map((o) => [o, { state: "pending" } as OriginStatus])));
  let anyOk = false;
  let failures = 0;
  for (let i = 0; i < targets.length && run.isActive(); i += 1) {
    const origin = targets[i];
    run.onStatuses({ [origin]: { state: "loading" } });
    const status = await run.search(origin);
    if (!run.isActive()) break;
    run.onStatuses({ [origin]: status });
    if (status.state !== "error") {
      anyOk = true;
      failures = 0;
      continue;
    }
    failures += 1;
    const stop =
      status.retryAt !== undefined ||
      (status.reason !== undefined && STOP_REASONS.has(status.reason)) ||
      failures >= MAX_CONSECUTIVE_FAILURES;
    if (stop) {
      // Reszta nie dostała ani jednego zapytania. Liczy się jako nieudana (nie
      // wiemy, czy są tam loty) i ma ten sam termin ponowienia.
      const skipped: OriginStatus = { ...status, skipped: true };
      run.onStatuses(Object.fromEntries(targets.slice(i + 1).map((o) => [o, skipped])));
      break;
    }
  }
  return { anyOk };
}

export function summarizeFanout(origins: readonly string[], statuses: Readonly<Record<string, OriginStatus>>, offersCount: number): FanoutSummary {
  const list = origins.map((o) => statuses[o] ?? ({ state: "pending" } as OriginStatus));
  const settled = list.every((s) => s.state === "ok" || s.state === "error");
  const failed = origins.filter((o) => statuses[o]?.state === "error");
  const errors = failed.map((o) => statuses[o]).filter((s): s is Extract<OriginStatus, { state: "error" }> => s?.state === "error");
  const retryAts = errors.map((e) => e.retryAt).filter((t): t is number => typeof t === "number");
  const providerDown = errors.length > 0 && errors.length === origins.length && errors.every((e) => e.reason === "PROVIDER_ACCESS_DENIED");

  let outcome: FanoutOutcome;
  if (!settled) outcome = "loading";
  else if (offersCount > 0) outcome = failed.length > 0 ? "partial" : "results";
  else outcome = failed.length > 0 ? "error" : "empty";

  return {
    settled,
    outcome,
    failed,
    message: errors.find((e) => !e.skipped)?.message ?? errors[0]?.message ?? null,
    retryAt: retryAts.length > 0 ? Math.max(...retryAts) : null,
    providerDown,
    retryable: errors.some((e) => e.reason !== "INVALID_SEARCH" && e.reason !== "PROVIDER_ACCESS_DENIED"),
  };
}

const GENERIC_ERROR = "Nie udało się pobrać ofert. Spróbuj ponownie.";
const RATE_LIMITED_MESSAGE = "Za dużo wyszukiwań w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.";
const INVALID_MESSAGE = "Tego wyszukiwania nie da się wykonać — sprawdź daty i lotnisko w wyszukiwarce powyżej.";
const OFFLINE_MESSAGE = "Brak połączenia z wyszukiwarką. Sprawdź internet i spróbuj ponownie.";

function retryAtFrom(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return now + Math.min(seconds, 3600) * 1000;
}

/**
 * Lista ofert z odpowiedzi 2xx; `null` = odpowiedź uszkodzona. Pusta tablica znaczy
 * „brak lotów”, a brak tablicy to awaria i nie może udawać jednego ani drugiego.
 */
export function offersFromBody<T>(json: unknown): T[] | null {
  const offers = (json as { offers?: unknown } | null)?.offers;
  return Array.isArray(offers) ? (offers as T[]) : null;
}

/** Odpowiedź /api/flights/rates (nie-2xx) → stan błędu lotniska po polsku. */
export function errorStatusFromResponse(
  httpStatus: number,
  json: { message?: unknown; reason?: unknown; error?: unknown },
  retryAfterHeader: string | null,
  now: number = Date.now(),
): Extract<OriginStatus, { state: "error" }> {
  const reason = typeof json.reason === "string" ? json.reason : undefined;
  const retryAt = retryAtFrom(retryAfterHeader, now);
  // Nasz limiter per adres (rate-limit.ts) — komunikat po angielsku, bez `reason`.
  if (httpStatus === 429) return { state: "error", reason: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE, retryAt };
  // 400 = nasza walidacja, 422 = odrzucone przez dostawcę: ten sam skutek, ponowienie
  // nic nie da. Tekst z serwera dotyczy rezerwacji („dane pasażera”), tu by mylił.
  if (httpStatus === 400 || httpStatus === 422) return { state: "error", reason: "INVALID_SEARCH", message: INVALID_MESSAGE };
  const message = typeof json.message === "string" && json.message.trim() ? json.message : GENERIC_ERROR;
  return { state: "error", reason, message, retryAt };
}

/** Wyjątek sieci (fetch odrzucony) → stan błędu lotniska. */
export function errorStatusFromNetwork(): Extract<OriginStatus, { state: "error" }> {
  return { state: "error", reason: "NETWORK", message: OFFLINE_MESSAGE };
}
