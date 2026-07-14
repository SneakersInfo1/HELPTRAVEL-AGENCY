// Skeleton listy pakietów podczas live-searcha (loty + hotele ~3–4 s). Kształt
// lustrzany do PackageCard, żeby nie było skoku layoutu po dojściu danych.
// Reuse SearchProgressBanner (spójny „trwa wyszukiwanie" z hoteli/lotów).

import { SearchProgressBanner } from "@/components/search/search-progress-banner";

const PACKAGE_MESSAGES = [
  "Szukamy lotów w obie strony…",
  "Sprawdzamy hotele z bezpłatną anulacją…",
  "Składamy pakiety i liczymy cenę za osobę…",
  "Już prawie gotowe…",
];

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)] sm:flex-row">
      <div className="aspect-[4/3] w-full shrink-0 animate-pulse bg-neutral-200 sm:aspect-auto sm:w-64" />
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="h-5 w-2/3 animate-pulse rounded bg-neutral-200" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-200" />
        <div className="h-9 w-full animate-pulse rounded-xl bg-emerald-50" />
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <div className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
            <div className="h-7 w-28 animate-pulse rounded bg-emerald-100" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-lg bg-emerald-100" />
        </div>
      </div>
    </div>
  );
}

export function PackageSearchSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SearchProgressBanner title="Składamy Twój pakiet Lot + Hotel" messages={PACKAGE_MESSAGES} />
      {/* Lustro układu wyników: sidebar filtrów (lg) + kolumna kart. */}
      <div className="lg:flex lg:gap-6">
        <aside className="hidden lg:block lg:w-60 lg:shrink-0">
          <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <div className="h-4 w-16 animate-pulse rounded bg-neutral-200" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 w-full animate-pulse rounded-full bg-neutral-100" />
              ))}
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
