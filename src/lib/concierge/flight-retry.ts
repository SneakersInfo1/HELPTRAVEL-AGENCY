// Ponawianie wyszukania lotu pod GLOBALNYM budżetem czasu (hotfix V2.1a).
//
// DLACZEGO ISTNIEJE. V2.1 zeszło z `retries: 3` na `retries: 1` przy limicie
// 20 s, żeby uciąć ogon (dawne 3 × 30 s = teoretyczne 90 s przy budżecie tury
// 50 s). Pomiar produkcyjny 2026-09-06 pokazał koszt tej decyzji: 6 z 72
// wywołań padło DOKŁADNIE na limicie i zamieniło ofertę VALID w PARTIAL,
// mimo że KOLEJNE żądanie tej samej trasy wracało w 1216–1845 ms. Czyli
// zablokowana bywa POJEDYNCZA próba, nie trasa.
//
// Rozwiązanie: dwie próby, ale pod jednym twardym terminem. Druga dostaje
// WYŁĄCZNIE to, co zostało — więc suma nigdy nie rośnie ponad budżet, a
// zablokowany pierwszy strzał ma szansę na odbicie.
//
// Moduł jest CZYSTY (zegar i funkcja szukająca wstrzykiwane), bo produkcyjne
// wiązanie żyje w tool-deps.ts, którego `import "server-only"` nie da się
// uruchomić pod node:test.

import {
  LiteApiError,
  LiteApiNetworkError,
  LiteApiRateLimitError,
  LiteApiTimeoutError,
} from "@/lib/liteapi/errors";

/**
 * Czy powtórzenie TEGO SAMEGO żądania ma szansę zadziałać.
 *
 * Przejściowe: przekroczony czas (także HTTP 408), błąd sieci i 5xx
 * (`liteApiErrorFromResponse` mapuje każde 5xx na LiteApiNetworkError),
 * oraz 429. Wszystko inne — walidacja, wygasła oferta, brak autoryzacji,
 * nieznane 4xx, błędy spoza LiteAPI — jest deterministyczne: druga próba
 * dałaby ten sam wynik, a kosztowałaby użytkownika kolejne sekundy.
 */
export function isTransientFlightError(err: unknown): boolean {
  if (!(err instanceof LiteApiError)) return false;
  return (
    err instanceof LiteApiTimeoutError ||
    err instanceof LiteApiNetworkError ||
    err instanceof LiteApiRateLimitError
  );
}

export type FlightRetryOutcome =
  /** Mamy wynik. */
  | "ok"
  /** Wszystkie dozwolone próby wyczerpane, wciąż błąd przejściowy. */
  | "exhausted"
  /** Błąd, którego ponawianie nie naprawi — zatrzymaliśmy się od razu. */
  | "deterministic"
  /** Zabrakło budżetu na kolejną (albo jakąkolwiek) próbę. */
  | "no-budget";

export interface FlightRetryResult<T> {
  value: T | null;
  /** Ile razy realnie odpytaliśmy dostawcę (0–2). */
  attempts: number;
  outcome: FlightRetryOutcome;
  lastError?: unknown;
}

export interface FlightRetryOptions {
  /** Epoch ms, po którym nie wolno już nic zaczynać ani czekać. */
  deadlineAt: number;
  /** Limit PIERWSZEJ próby (przycinany budżetem, jeśli ten jest mniejszy). */
  firstAttemptMs: number;
  /** Poniżej tylu ms nie ma sensu startować próby — oddajemy wynik częściowy. */
  minAttemptMs: number;
  now?: () => number;
}

/** Maksymalna liczba odpytań dostawcy. Dwa: jedno odbicie, zero pętli. */
export const MAX_FLIGHT_ATTEMPTS = 2;

/**
 * Woła `search` do skutku albo do wyczerpania budżetu — maksymalnie
 * MAX_FLIGHT_ATTEMPTS razy. Każda próba dostaje własny limit czasu wyliczony
 * z tego, ile ZOSTAŁO do terminu, więc suma prób nigdy go nie przekracza.
 */
export async function searchWithDeadline<T>(
  search: (opts: { timeoutMs: number; attempt: number }) => Promise<T>,
  opts: FlightRetryOptions,
): Promise<FlightRetryResult<T>> {
  const now = opts.now ?? Date.now;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_FLIGHT_ATTEMPTS; attempt++) {
    const left = opts.deadlineAt - now();
    if (left < opts.minAttemptMs) {
      return { value: null, attempts: attempt - 1, outcome: "no-budget", lastError };
    }
    // Pierwsza próba ma własny, krótszy limit — żeby po niej ZOSTAŁO coś na
    // drugą. Druga bierze całą resztę, bo trzeciej już nie będzie.
    const timeoutMs = attempt === 1 ? Math.min(opts.firstAttemptMs, left) : left;

    try {
      return { value: await search({ timeoutMs, attempt }), attempts: attempt, outcome: "ok" };
    } catch (err) {
      lastError = err;
      if (!isTransientFlightError(err)) {
        return { value: null, attempts: attempt, outcome: "deterministic", lastError };
      }
    }
  }

  return { value: null, attempts: MAX_FLIGHT_ATTEMPTS, outcome: "exhausted", lastError };
}
