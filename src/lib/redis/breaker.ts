// Wyłącznik obwodu (circuit breaker) dla Upstash — jeden na instancję funkcji.
//
// INCYDENT 2026-10-25. Baza przekroczyła miesięczny limit transferu planu
// Fixed i od tej chwili KAŻDA komenda wraca z
//   `ERR This database has reached current Fixed plan limits…`
// po ~1,1 s (zmierzone w logach produkcji: cztery odczyty strony głównej
// rozłożone co ~1,1 s). Kod wołał Redis dalej przy każdym żądaniu, więc każda
// strona czytająca cache płaciła tę sekundę za każdą komendę, a limiter
// zapytań — rzucający wyjątkiem — wywracał trasy w 500.
//
// Wyłącznik zamienia „pytaj w kółko martwy serwis" na „zapytaj raz na jakiś
// czas": po wykryciu awarii komendy przez określony czas odpadają NATYCHMIAST
// (bez sieci), a potem przechodzi JEDNA próba. Udana zamyka obwód.
//
// Dwa rodzaje porażek, bo mają inną naturę:
//   • PRZEJŚCIOWE (sieć, timeout, 5xx, throttling 429) — mogą być chwilowe,
//     więc otwieramy dopiero po kilku z rzędu i na krótko;
//   • TRWAŁE (limit planu, zły token, zły adres) — nie miną same w ciągu
//     sekund, więc otwieramy od razu i na dłużej.
// Błąd LOGICZNY komendy (WRONGTYPE, NOSCRIPT, zła składnia) NIE jest awarią:
// serwer odpowiedział, więc taki wynik liczy się jako sukces połączenia.
// To ważne dla limitera — `@upstash/ratelimit` celowo łapie NOSCRIPT
// i ponawia przez EVAL.
//
// DZIERŻAWA (lease). Każde dopuszczenie żądania zwraca dzierżawę z numerem
// „pokolenia" obwodu. Wynik liczy się tylko wtedy, gdy pasuje do bieżącego
// stanu: spóźniona odpowiedź żądania wpuszczonego PRZED otwarciem nie może
// zamknąć obwodu, a spóźniona porażka nie może udawać nieudanej próby
// half-open ani zwolnić miejsca próby. O wyjściu z awarii decyduje wyłącznie
// wyznaczona próba.
//
// Stan jest per instancja (serverless). To wystarcza: każda instancja płaci
// za wykrycie awarii co najwyżej kilka żądań, a potem pyta raz na okno.

export type FailureKind = "quota" | "auth" | "config" | "timeout" | "network" | "server";

export type BreakerState = "closed" | "open" | "half_open";

/** Dzierżawa wydana przy dopuszczeniu żądania — wynik zgłasza się z nią. */
export interface BreakerLease {
  readonly kind: "allow" | "probe";
  readonly generation: number;
}

export interface BreakerOptions {
  /** Ile przejściowych porażek z rzędu otwiera obwód. */
  failureThreshold: number;
  /** Pierwsze otwarcie po porażkach przejściowych. */
  transientOpenMs: number;
  /** Sufit otwarcia po porażkach przejściowych (backoff wykładniczy). */
  transientMaxOpenMs: number;
  /** Pierwsze otwarcie po limicie planu / błędzie autoryzacji. */
  persistentOpenMs: number;
  /** Sufit otwarcia po limicie planu / błędzie autoryzacji. */
  persistentMaxOpenMs: number;
  now: () => number;
}

export const DEFAULT_BREAKER_OPTIONS: Omit<BreakerOptions, "now"> = {
  failureThreshold: 3,
  transientOpenMs: 10_000,
  transientMaxOpenMs: 120_000,
  // Limit planu nie zniknie w ciągu minut (miesięczny transfer), ale może
  // zniknąć po ręcznym podniesieniu planu — dlatego sufit 10 min, a nie godzina.
  persistentOpenMs: 60_000,
  persistentMaxOpenMs: 600_000,
};

export interface BreakerSnapshot {
  state: BreakerState;
  consecutiveFailures: number;
  /** Ile razy z rzędu obwód otwierał się bez udanej próby (do backoffu). */
  reopenStreak: number;
  openUntil: number | null;
  lastFailureKind: FailureKind | null;
  lastFailureAt: number | null;
  opens: number;
}

export function isPersistentFailure(kind: FailureKind): boolean {
  return kind === "quota" || kind === "auth" || kind === "config";
}

type TransitionListener = (
  from: BreakerState,
  to: BreakerState,
  info: { kind: FailureKind | null; openMs: number },
) => void;

export class CircuitBreaker {
  private state: BreakerState = "closed";
  /** Rośnie przy każdej zmianie stanu — unieważnia dzierżawy sprzed zmiany. */
  private generation = 0;
  private consecutiveFailures = 0;
  private reopenStreak = 0;
  private openUntil = 0;
  private probeInFlight = false;
  private lastFailureKind: FailureKind | null = null;
  private lastFailureAt: number | null = null;
  private opens = 0;
  private readonly opts: BreakerOptions;
  private readonly onTransition?: TransitionListener;

  constructor(opts: Partial<BreakerOptions> = {}, onTransition?: TransitionListener) {
    this.opts = { ...DEFAULT_BREAKER_OPTIONS, now: Date.now, ...opts };
    this.onTransition = onTransition;
  }

  /**
   * Decyzja przed wysłaniem komendy.
   *   • dzierżawa `allow` — obwód zamknięty, wysyłaj;
   *   • dzierżawa `probe` — okno minęło, to JEDYNA próba (wynik MUSI wrócić
   *     przez recordSuccess/recordFailure/releaseProbe z tą dzierżawą);
   *   • `null` — obwód otwarty albo próba już leci: odpadnij bez sieci.
   */
  tryAcquire(): BreakerLease | null {
    if (this.state === "closed") return { kind: "allow", generation: this.generation };
    const now = this.opts.now();
    if (this.state === "open") {
      if (now < this.openUntil) return null;
      this.transition("half_open", this.lastFailureKind, 0);
    }
    // half_open: przepuszczamy wyłącznie jedną próbę naraz.
    if (this.probeInFlight) return null;
    this.probeInFlight = true;
    return { kind: "probe", generation: this.generation };
  }

  /** Serwer odpowiedział (także błędem logicznym komendy). */
  recordSuccess(lease: BreakerLease): void {
    if (lease.generation !== this.generation) return; // spóźniony wynik sprzed zmiany stanu
    if (lease.kind === "probe") {
      if (this.state !== "half_open") return;
      this.probeInFlight = false;
      this.reopenStreak = 0;
      this.consecutiveFailures = 0;
      this.transition("closed", null, 0);
      return;
    }
    if (this.state === "closed") this.consecutiveFailures = 0;
  }

  recordFailure(lease: BreakerLease, kind: FailureKind): void {
    if (lease.generation !== this.generation) return;
    const now = this.opts.now();
    this.lastFailureKind = kind;
    this.lastFailureAt = now;
    if (lease.kind === "probe") {
      if (this.state !== "half_open") return;
      // Nieudana próba — z powrotem otwarty, na DŁUŻEJ niż poprzednio.
      this.probeInFlight = false;
      this.reopenStreak += 1;
      this.open(kind, now);
      return;
    }
    if (this.state !== "closed") return;
    this.consecutiveFailures += 1;
    if (isPersistentFailure(kind) || this.consecutiveFailures >= this.opts.failureThreshold) {
      this.open(kind, now);
    }
  }

  /**
   * Zwolnienie próby BEZ werdyktu — gdy żądanie nie wyszło z powodu, który nie
   * mówi nic o serwerze (np. błąd programisty przy serializacji). Bez tego
   * `probeInFlight` zostałoby ustawione na zawsze i obwód odrzucałby wszystko.
   */
  releaseProbe(lease: BreakerLease): void {
    if (lease.kind !== "probe" || lease.generation !== this.generation) return;
    this.probeInFlight = false;
  }

  /** Czy obwód teraz przepuściłby żądanie (bez zajmowania próby). */
  wouldAllow(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") return this.opts.now() >= this.openUntil;
    return !this.probeInFlight;
  }

  /** Czy obwód jest ZAMKNIĘTY (ostatnia odpowiedź serwera była poprawna). */
  isClosed(): boolean {
    return this.state === "closed";
  }

  snapshot(): BreakerSnapshot {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      reopenStreak: this.reopenStreak,
      openUntil: this.state === "open" ? this.openUntil : null,
      lastFailureKind: this.lastFailureKind,
      lastFailureAt: this.lastFailureAt,
      opens: this.opens,
    };
  }

  private open(kind: FailureKind, now: number): void {
    const persistent = isPersistentFailure(kind);
    const base = persistent ? this.opts.persistentOpenMs : this.opts.transientOpenMs;
    const max = persistent ? this.opts.persistentMaxOpenMs : this.opts.transientMaxOpenMs;
    const openMs = Math.min(max, base * 2 ** Math.min(this.reopenStreak, 10));
    this.openUntil = now + openMs;
    this.consecutiveFailures = 0;
    this.opens += 1;
    this.transition("open", kind, openMs);
  }

  private transition(to: BreakerState, kind: FailureKind | null, openMs: number): void {
    const from = this.state;
    this.state = to;
    this.generation += 1;
    if (from !== to || to === "open") this.onTransition?.(from, to, { kind, openMs });
  }
}
