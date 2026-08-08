"use client";

import type { PriceEntry } from "@/lib/hotels/price-store";

// Slot ceny dla karty, która JESZCZE nie ma stawki.
//
// Po przebudowie karty (2026-08-07) gotowa cena trafia wprost do `ResultCard`
// jako `cheapestRate` — razem z wyżywieniem, anulacją i przeceną, żeby te
// informacje stały przy nazwie hotelu, a nie w osobnym pudełku obok. Tutaj
// zostają WYŁĄCZNIE trzy stany, w których ceny nie ma:
//
//   • ładowanie   → szkielet o wymiarach docelowej ceny (zero CLS),
//   • błąd        → to NIE jest brak miejsc, więc tak właśnie piszemy,
//   • brak miejsc → potwierdzony przez dostawcę (`entry === null`).
//
// Rozróżnienie błędu od braku miejsc jest istotne: przy awarii batcha strona
// pisała „Brak dostępnych hoteli w tym terminie" dla hoteli, które były wolne.
export function PriceView({ entry }: { entry: Exclude<PriceEntry, object> | undefined }) {
  if (entry === undefined || entry === "loading") {
    return (
      <div className="animate-pulse motion-reduce:animate-none" aria-label="Sprawdzam cenę">
        <div className="h-3 w-16 rounded bg-neutral-200" />
        <div className="mt-1.5 h-6 w-28 rounded bg-neutral-200" />
        <div className="mt-1.5 h-2.5 w-36 rounded bg-neutral-100" />
      </div>
    );
  }

  if (entry === "error") {
    return (
      <div className="text-sm text-neutral-500">
        <div className="font-medium text-neutral-600">Nie udało się pobrać ceny</div>
        <div className="text-[11px]">Otwórz hotel — sprawdzimy dostępność na jego stronie.</div>
      </div>
    );
  }

  return (
    <div className="text-sm text-neutral-500">
      <div className="font-medium text-neutral-600">Brak miejsc w tym terminie</div>
      <div className="text-[11px]">Spróbuj zmienić daty lub zobacz pokoje.</div>
    </div>
  );
}
