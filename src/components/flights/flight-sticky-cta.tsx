"use client";

// Mobilny pasek „kwota + akcja" przyklejony do dolnej krawędzi.
//
// ── DLACZEGO ─────────────────────────────────────────────────────────────────
// Pomiar przed zmianą (Playwright, 390×844, 2 podróżnych):
//   /loty/pasazerowie — kwota „Razem" pojawiała się dopiero na 2 047 px scrolla,
//                       a przycisk „Przejdź do płatności" na 2 579 px.
//   /loty/dodatki     — CTA poza pierwszym ekranem na 375/390/412 px.
// Czyli: przez cały czas wypełniania formularza dokumentów użytkownik nie
// widział ani kwoty, ani wyjścia. To jest dokładnie ten rodzaj tarcia, przez
// który ludzie odpadają w checkoutcie — i to jest wzorzec, który mają wszystkie
// serwisy z §12 briefu (Booking, Kiwi).
//
// ── KOLIZJE ──────────────────────────────────────────────────────────────────
// Pasek stoi na `--z-sticky` (30), czyli PONIŻEJ dymka konsjerża (z-40) i
// banera zgód (z-40). To celowe: pasek nie może przykryć zgody na cookies.
// Za to konsjerż musi ustąpić W PIONIE — robi to `ConciergeLauncher`, który na
// trasach lejka lotów jedzie wyżej. Zależność jest OBUSTRONNA i dlatego opisana
// po obu stronach; zmiana wysokości tego paska wymaga sprawdzenia tamtej.
//
// Wysokość paska + safe-area oddajemy stronie przez `FLIGHT_STICKY_CTA_PAD`,
// żeby ostatni element formularza nie chował się pod paskiem.

import type { ReactNode } from "react";

/** Dopełnienie dolne dla kontenera strony, która renderuje ten pasek. */
export const FLIGHT_STICKY_CTA_PAD = "pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0";

interface Props {
  /** Sformatowana kwota — pasek nie formatuje, żeby nie było drugiego miejsca z regułą. */
  amount: string;
  /** Podpis pod kwotą, np. „za 2 podróżnych, wł. opłat". */
  amountNote?: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  /** Treść nad paskiem (np. komunikat błędu) — pokazywana w tym samym bloku. */
  children?: ReactNode;
}

export function FlightStickyCta({ amount, amountNote, actionLabel, onAction, disabled = false, children }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] lg:hidden">
      {children}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold leading-tight text-accent">{amount}</div>
          {amountNote && <div className="truncate text-xs leading-tight text-ink-muted">{amountNote}</div>}
        </div>
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-brand px-5 font-bold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          {/* Rozmiar pisma na spanie — `text-sm` na <button> w tym repo nie działa
              (reset `button { font-size: inherit }` stoi poza warstwami CSS). */}
          <span className="text-sm">{actionLabel}</span>
        </button>
      </div>
    </div>
  );
}
