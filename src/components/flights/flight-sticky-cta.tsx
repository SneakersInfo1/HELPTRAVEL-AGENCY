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
// Pasek stoi na `--z-sticky` (30), czyli PONIŻEJ banera zgód (z-40). To celowe:
// pasek nie może przykryć zgody na cookies. Konsjerż w lejku lotów nie
// występuje w ogóle (zasłaniał ceny taryf — patrz `concierge-launcher.tsx`).
//
// ALE „niżej" nie wystarcza. Playwright wykrył, że dopóki baner zgód wisi na
// dole ekranu, to ON przechwytuje kliknięcia w tym miejscu — czyli pasek jest
// widoczny, a mimo to NIE DA SIĘ go nacisnąć. Dla gościa, który trafia prosto
// w lejek lotów (link bezpośredni, tryb prywatny), oznaczałoby to checkout
// z niedostępnym przyciskiem. Dopóki zgoda nie jest rozstrzygnięta, paska
// po prostu nie ma — akcję niesie wtedy przycisk w treści formularza, który
// renderujemy zawsze. Po decyzji pasek wraca.
//
// Wysokość paska + safe-area oddajemy stronie przez `FLIGHT_STICKY_CTA_PAD`,
// żeby ostatni element formularza nie chował się pod paskiem.

import type { ReactNode } from "react";

import { useConsent } from "@/lib/consent/context";

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
  const { needsDecision, isSettingsOpen } = useConsent();
  if (needsDecision || isSettingsOpen) return null;

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
