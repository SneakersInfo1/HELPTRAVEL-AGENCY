// Slad jednej tury czatu (V2.1 §5/§6/§32): identyfikator tury + rozbicie czasu
// na KONKRETNE zaleznosci, a nie tylko „model vs narzedzia".
//
// PO CO: log `[concierge] turn` odpowiadal dotad na pytanie „ile trwalo",
// ale nie na „DLACZEGO trwalo 18 sekund". Przy pomiarze produkcyjnym
// (23 tury) tura z narzedziem miala p50 14,8 s, z czego ~7,8 s szlo na
// narzedzia — bez wiedzy, czy to Redis, lista hoteli, stawki hoteli czy loty,
// kazda optymalizacja bylaby zgadywaniem.
//
// HIGIENA: w sladzie trzymamy WYLACZNIE metryki techniczne — nazwy etapow,
// czasy, liczniki, flagi cache. Nigdy tresci rozmowy, nigdy argumentow od
// uzytkownika, nigdy pelnych wynikow narzedzi (patrz log-hygiene w lotach).

/** Wartosci dopuszczalne w `meta` — celowo waskie, zeby nie dalo sie wlozyc PII. */
export type SpanMetaValue = string | number | boolean | null;

export interface TraceSpan {
  /** Etap, np. "tool.get_trip_offer", "liteapi.flight", "redis.snapshot". */
  name: string;
  ms: number;
  meta?: Record<string, SpanMetaValue>;
}

export interface TurnTraceSummary {
  traceId: string;
  spans: TraceSpan[];
  /** Suma czasu per nazwa etapu (etap moze wystapic wielokrotnie w turze). */
  totals: Record<string, number>;
  /** Ile razy dany etap wystapil. */
  counts: Record<string, number>;
}

export interface TurnTrace {
  readonly traceId: string;
  /** Otwiera etap; zwrocona funkcja go zamyka (idempotentnie). */
  start(name: string, meta?: Record<string, SpanMetaValue>): (extra?: Record<string, SpanMetaValue>) => number;
  /** Mierzy `fn`; etap zapisuje sie takze, gdy `fn` rzuci (meta.failed=true). */
  measure<T>(name: string, fn: () => Promise<T>, meta?: Record<string, SpanMetaValue>): Promise<T>;
  /** Doklada gotowy pomiar (gdy czas zmierzyl ktos inny). */
  record(name: string, ms: number, meta?: Record<string, SpanMetaValue>): void;
  summary(): TurnTraceSummary;
}

/** Krotki, losowy identyfikator tury. BEZ danych uzytkownika — sama entropia. */
export function newTraceId(): string {
  const rnd = globalThis.crypto?.randomUUID?.();
  if (rnd) return rnd.replace(/-/g, "").slice(0, 12);
  return Math.random().toString(16).slice(2, 8) + Math.random().toString(16).slice(2, 8);
}

/** Ile etapow maksymalnie trzymamy — zabezpieczenie przed rozdeciem logu. */
const MAX_SPANS = 64;

export function createTurnTrace(opts: { traceId?: string; now?: () => number } = {}): TurnTrace {
  const now = opts.now ?? Date.now;
  const traceId = opts.traceId ?? newTraceId();
  const spans: TraceSpan[] = [];

  function push(name: string, ms: number, meta?: Record<string, SpanMetaValue>): void {
    if (spans.length >= MAX_SPANS) return;
    spans.push(meta && Object.keys(meta).length > 0 ? { name, ms, meta } : { name, ms });
  }

  return {
    traceId,
    start(name, meta) {
      const t0 = now();
      let closed = false;
      return (extra) => {
        const ms = now() - t0;
        if (closed) return ms;
        closed = true;
        push(name, ms, { ...meta, ...extra });
        return ms;
      };
    },
    async measure(name, fn, meta) {
      const t0 = now();
      try {
        const value = await fn();
        push(name, now() - t0, meta);
        return value;
      } catch (err) {
        push(name, now() - t0, { ...meta, failed: true });
        throw err;
      }
    },
    record(name, ms, meta) {
      push(name, ms, meta);
    },
    summary() {
      const totals: Record<string, number> = {};
      const counts: Record<string, number> = {};
      for (const span of spans) {
        totals[span.name] = (totals[span.name] ?? 0) + span.ms;
        counts[span.name] = (counts[span.name] ?? 0) + 1;
      }
      return { traceId, spans: [...spans], totals, counts };
    },
  };
}

/**
 * Slad „pusty" — wstrzykiwany tam, gdzie wolajacy nie chce nic mierzyc
 * (testy jednostkowe egzekutorow, sciezki poza tura czatu). Zero alokacji
 * tablicy, zero warunkow `if (trace)` rozsianych po kodzie.
 */
export const NOOP_TRACE: TurnTrace = {
  traceId: "noop",
  start: () => () => 0,
  measure: (_name, fn) => fn(),
  record: () => {},
  summary: () => ({ traceId: "noop", spans: [], totals: {}, counts: {} }),
};
