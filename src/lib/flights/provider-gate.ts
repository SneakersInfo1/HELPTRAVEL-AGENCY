// Bramka dostawcy dla CRONÓW wyszukujących loty.
//
// ZMIERZONE NA PRODUKCJI. 2026-10-24 LiteAPI odpowiadało na wyszukiwania lotów
// z cronów masowo `HTTP 429` (25 z 40 zadań warm-flights, 33 z 48 zadań
// warm-flight-deals), a od 2026-10-25 KAŻDE wyszukiwanie dostaje `HTTP 403`
// (40/40 w każdym przebiegu). Mimo to każdy przebieg wysyłał komplet zapytań,
// a klient LiteAPI ponawiał 429 jeszcze dwa razy z backoffem — czyli przy
// limitowaniu wysyłaliśmy dostawcy do 3× więcej ruchu. Cztery crony to ~150
// wyszukiwań lotów co 30 minut.
//
// Bramka liczy KOLEJNE odmowy dostawcy (403/429) w jednym przebiegu i po
// progu zamyka resztę przebiegu: pozostałe zadania kończą się bez zapytania.
// Następny przebieg zaczyna od zera, więc gdy dostawca wróci, crony same
// wrócą do pracy. Na ścieżce UŻYTKOWNIKA bramki nie ma — tam każde
// wyszukiwanie jest pojedyncze i ma własną obsługę błędu.

/** Status HTTP z błędu klienta LiteAPI (LiteApiError / FlightApiError). */
function providerStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: unknown; liteApiStatus?: unknown; cause?: unknown };
  if (typeof e.status === "number") return e.status;
  if (typeof e.liteApiStatus === "number") return e.liteApiStatus;
  return e.cause ? providerStatus(e.cause) : undefined;
}

/** Odmowa dostawcy: brak dostępu albo przekroczony limit. */
export function isProviderRefusal(err: unknown): boolean {
  const status = providerStatus(err);
  return status === 403 || status === 429;
}

export interface ProviderGate {
  /** Czy wolno wysłać kolejne zapytanie w tym przebiegu. */
  readonly open: boolean;
  /** Ile zadań pominięto, bo bramka była zamknięta. */
  readonly skipped: number;
  /** Ostatni status odmowy (do logu przebiegu). */
  readonly lastRefusalStatus: number | null;
  onSuccess(): void;
  onFailure(err: unknown): void;
  /** Zadanie pominięte z powodu zamkniętej bramki. */
  noteSkip(): void;
}

export function createProviderGate(threshold = 3): ProviderGate {
  let consecutive = 0;
  let closed = false;
  let skipped = 0;
  let lastRefusalStatus: number | null = null;
  return {
    get open() {
      return !closed;
    },
    get skipped() {
      return skipped;
    },
    get lastRefusalStatus() {
      return lastRefusalStatus;
    },
    onSuccess() {
      consecutive = 0;
    },
    onFailure(err) {
      if (!isProviderRefusal(err)) {
        consecutive = 0;
        return;
      }
      lastRefusalStatus = providerStatus(err) ?? null;
      consecutive += 1;
      if (consecutive >= threshold) closed = true;
    },
    noteSkip() {
      skipped += 1;
    },
  };
}
