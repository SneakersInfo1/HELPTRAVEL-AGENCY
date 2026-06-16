"use client";

// Ekran ładowania wyników lotów. Wcześniej: 3 szare paski → „strona padła".
// Teraz: banner aktywnego wyszukiwania (SearchProgressBanner) + szkielety,
// które WYGLĄDAJĄ jak prawdziwe karty oferty (dwa wiersze rejsów + blok ceny
// po prawej) oraz szkielet panelu filtrów, żeby kolumna 260px nie była pusta.

import { SearchProgressBanner } from "@/components/search/search-progress-banner";

const FLIGHT_MESSAGES = [
  "Przeszukujemy linie lotnicze…",
  "Porównujemy ceny i połączenia…",
  "Sprawdzamy dostępność miejsc…",
  "Wybieramy najlepsze oferty…",
];

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-100 ${className}`} />;
}

function LegRowSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-neutral-100" />
      <div className="flex flex-1 items-center gap-3">
        <div className="text-right">
          <Bar className="h-4 w-12" />
          <Bar className="mt-1 h-2.5 w-8" />
        </div>
        <div className="flex-1">
          <Bar className="mx-auto h-2.5 w-14" />
          <div className="my-2 h-px bg-neutral-200" />
          <Bar className="mx-auto h-2.5 w-16" />
        </div>
        <div>
          <Bar className="h-4 w-12" />
          <Bar className="mt-1 h-2.5 w-8" />
        </div>
      </div>
    </div>
  );
}

function OfferCardSkeleton() {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <LegRowSkeleton />
          <LegRowSkeleton />
          <div className="flex gap-2">
            <Bar className="h-4 w-20" />
            <Bar className="h-4 w-16" />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 border-t border-neutral-100 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <Bar className="h-6 w-24" />
          <Bar className="h-2.5 w-28" />
          <div className="mt-1 h-10 w-24 animate-pulse rounded-lg bg-emerald-100" />
        </div>
      </div>
    </article>
  );
}

/** Szkielet panelu filtrów (desktop) — żeby lewa kolumna nie była pusta. */
export function FlightFiltersSkeleton() {
  return (
    <div className="sticky top-6 rounded-2xl border border-neutral-200 bg-white p-4">
      <Bar className="h-4 w-24" />
      <div className="mt-4 space-y-5">
        {[0, 1, 2].map((g) => (
          <div key={g}>
            <Bar className="h-3 w-20" />
            <div className="mt-2 space-y-2">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-pulse rounded bg-neutral-100" />
                  <Bar className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlightResultsSkeleton({ originLabel, destination }: { originLabel: string; destination: string }) {
  return (
    <div className="space-y-3">
      <SearchProgressBanner
        title={`Szukamy najlepszych lotów ${originLabel} → ${destination}…`}
        messages={FLIGHT_MESSAGES}
      />
      {[0, 1, 2, 3].map((i) => (
        <OfferCardSkeleton key={i} />
      ))}
    </div>
  );
}
