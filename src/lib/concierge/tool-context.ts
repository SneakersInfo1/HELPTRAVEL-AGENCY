// Kontekst JEDNEJ tury narzędzi (V2.1 §6/§21/§22).
//
// Trzy rzeczy, których nie da się sensownie trzymać ani w globalnych deps
// (są singletonem na proces — przeciekałyby między requestami), ani w
// argumentach narzędzia (pochodzą od modelu):
//
//   1. ślad tury — traceId + etapy do logu,
//   2. pamięć na jedną turę — snapshot cen czytany RAZ, nie raz na narzędzie
//      (search_trips czytał go, a chwilę później auto-oferta czytała ponownie:
//      dwa round-tripy do Redisa na coś, co w tej samej turze się nie zmienia),
//   3. termin — moment, po którym narzędzie ma przestać czekać, żeby cała tura
//      zmieściła się w budżecie route'a zamiast oddać użytkownikowi 504.

import type { DestinationPriceSnapshot } from "@/lib/prices/destination-price-snapshot";

import { createTurnTrace, NOOP_TRACE, type TurnTrace } from "./trace";

export interface ToolContext {
  readonly trace: TurnTrace;
  /**
   * Odczyt snapshotu rozpoczęty w tej turze. Trzymamy PROMISE, nie wartość —
   * dzięki temu dwa równoległe narzędzia dzielą jeden lot do Redisa, a nie
   * czekają jedno na drugie.
   */
  snapshot?: Promise<DestinationPriceSnapshot | null>;
  /**
   * Epoch ms, po którym narzędzia mają się poddać. `null` = bez terminu
   * (testy, benchmark). Orkiestrator ustawia go z pozostałego budżetu tury.
   */
  deadlineAt: number | null;
}

export function createToolContext(
  opts: { trace?: TurnTrace; deadlineAt?: number | null } = {},
): ToolContext {
  return {
    trace: opts.trace ?? createTurnTrace(),
    deadlineAt: opts.deadlineAt ?? null,
  };
}

/**
 * Kontekst bez śladu i bez terminu — dla wołających, którzy nic nie mierzą.
 *
 * FUNKCJA, nie stała. Współdzielona stała była BŁĘDEM: kontekst niesie memo
 * snapshotu, więc jeden obiekt na moduł oznaczałby, że pierwszy odczyt
 * zapisuje się w nim NA ZAWSZE i wyciekaja między turami (a na serwerze —
 * między requestami różnych użytkowników). Złapał to test świeżości: drugi
 * przypadek dostawał snapshot pierwszego. `NOOP_TRACE` można współdzielić,
 * bo jest bezstanowy.
 */
export function noopToolContext(): ToolContext {
  return { trace: NOOP_TRACE, deadlineAt: null };
}

/**
 * Ile milisekund zostało do terminu tury, przycięte do [min, max].
 * Bez terminu → `max`. Wynik nigdy nie jest mniejszy niż `min`: narzędzie ma
 * dostać uczciwą szansę albo w ogóle nie ruszać, a nie startować z 12 ms.
 */
export function budgetFor(
  ctx: ToolContext,
  bounds: { min: number; max: number },
  now: number = Date.now(),
): number {
  if (ctx.deadlineAt === null) return bounds.max;
  const left = ctx.deadlineAt - now;
  return Math.min(bounds.max, Math.max(bounds.min, left));
}
