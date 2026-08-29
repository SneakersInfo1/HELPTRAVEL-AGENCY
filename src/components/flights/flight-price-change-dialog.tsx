"use client";

// Modal „cena się zmieniła" — JEDEN komponent dla dwóch momentów, w których
// kwota może się ruszyć:
//   1. verify na kroku taryfy (oferta przeliczona przez GDS),
//   2. prebook (lock taryfy wrócił z inną kwotą niż zaakceptowana).
//
// Do 2026-08-29 punkt 2 nie istniał — cena z prebooka po prostu nadpisywała
// zaakceptowaną i użytkownik dowiadywał się o niej dopiero patrząc na przycisk
// „Zapłać". Ten sam modal w obu miejscach oznacza też, że użytkownik widzi
// znajomy ekran, a nie dwa różne komunikaty o tym samym.
//
// DOSTĘPNOŚĆ: `role="alertdialog"`, focus ląduje na przycisku odrzucenia (nie
// na akceptacji — domyślnym wyborem przy zmianie ceny nie może być „zgadzam
// się"), Escape = odrzucenie, tło nie zamyka przez przypadkowy dotyk.

import { useEffect, useRef } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { formatFlightPriceExact, priceChangeDirection, priceDelta } from "@/lib/flights/money";

interface Props {
  oldTotal: number;
  newTotal: number;
  currency: string;
  /** Skąd przyszła zmiana — zmienia jedno zdanie wyjaśnienia, nie cały modal. */
  source: "verify" | "prebook";
  onAccept: () => void;
  onReject: () => void;
  busy?: boolean;
}

export function FlightPriceChangeDialog({ oldTotal, newTotal, currency, source, onAccept, onReject, busy = false }: Props) {
  const rejectRef = useRef<HTMLButtonElement>(null);
  const direction = priceChangeDirection(oldTotal, newTotal);
  const delta = Math.abs(priceDelta(oldTotal, newTotal));

  useEffect(() => {
    rejectRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onReject();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onReject, busy]);

  const Icon = direction === "down" ? TrendingDown : TrendingUp;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="price-change-title"
        className="w-full rounded-t-lg bg-surface-raised p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lg sm:max-w-md sm:rounded-lg sm:pb-6"
      >
        <div
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
            direction === "down" ? "bg-brand-soft text-brand" : "bg-surface-sunken text-ink"
          }`}
        >
          <Icon aria-hidden className="h-5 w-5" strokeWidth={2} />
        </div>

        <h2 id="price-change-title" className="mt-3 text-lg font-bold text-ink">
          {direction === "down" ? "Cena lotu spadła" : "Cena lotu wzrosła"}
        </h2>

        <p className="mt-2 text-sm text-ink-muted">
          {source === "verify"
            ? "Przewoźnik przeliczył ofertę przy potwierdzaniu dostępności."
            : "Przy blokowaniu miejsc przewoźnik podał inną kwotę niż w podsumowaniu."}
        </p>

        <div className="mt-4 rounded-md border border-line bg-surface-sunken p-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-muted">Poprzednio</span>
            <span className="tabular-nums text-ink-muted line-through">
              {formatFlightPriceExact(oldTotal, currency)}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-ink">Nowa cena</span>
            <span className="text-xl font-bold tabular-nums text-accent">
              {formatFlightPriceExact(newTotal, currency)}
            </span>
          </div>
          <p className="mt-1.5 text-right text-xs text-ink-muted">
            {direction === "down" ? "taniej" : "drożej"} o {formatFlightPriceExact(delta, currency)}
          </p>
        </div>

        <p className="mt-3 text-xs text-ink-muted">
          Kontynuuj tylko, jeśli akceptujesz nową kwotę. Zapłacisz dokładnie tyle, ile widzisz powyżej.
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          <button
            ref={rejectRef}
            type="button"
            onClick={onReject}
            disabled={busy}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-md border border-line font-semibold text-ink transition hover:bg-surface-sunken active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm">Nie, wróć</span>
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-brand font-bold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm">
              {busy ? "Przygotowuję…" : `Akceptuję ${formatFlightPriceExact(newTotal, currency)}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
