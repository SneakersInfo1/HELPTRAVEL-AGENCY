"use client";

// Które filtry mają sens dla BIEŻĄCEJ puli wyników.
//
// Po co osobny store: panel filtrów (`FiltersSidebar`) renderuje się w siatce
// PRZED sekcją wyników, a pula hoteli powstaje dopiero w komponencie
// strumieniowanym przez `<Suspense>`. Panel nie ma więc dostępu do puli
// w momencie renderu.
//
// Rozwiązanie jest tym samym wzorcem, którego projekt używa już dla cen
// (`price-store.ts`): lekki store w pamięci karty + `useSyncExternalStore`.
// Lista publikuje opcje, gdy pozna pulę; panel je subskrybuje.
//
// Dlaczego to ma znaczenie dla użytkownika: brief §9 zabrania pokazywania
// filtrów, których bieżące wyniki nie obsłużą. Filtr „Basen", który po
// kliknięciu daje zero wyników, jest gorszy niż jego brak — psuje zaufanie
// do wszystkich pozostałych filtrów.

import { availableChains, availableFacilityFilters, type FacilityFilter } from "./facility-filters";

export interface FilterOptions {
  facilities: { filter: FacilityFilter; count: number }[];
  chains: { name: string; count: number }[];
  /** Ile obiektów w puli w ogóle niosło `facilityIds` — do diagnostyki. */
  poolSize: number;
}

const EMPTY: FilterOptions = { facilities: [], chains: [], poolSize: 0 };

let current: FilterOptions = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeFilterOptions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFilterOptions(): FilterOptions {
  return current;
}

/** Snapshot serwerowy — SSR nie zna puli, więc renderuje panel bez tych filtrów. */
export function getServerFilterOptions(): FilterOptions {
  return EMPTY;
}

/**
 * Publikuje opcje wyliczone z puli. Wołane przez listę wyników.
 *
 * Idempotentne w praktyce: gdy nic się nie zmieniło, NIE emitujemy — inaczej
 * każdy re-render listy odpalałby re-render panelu filtrów.
 */
export function publishFilterOptions(offers: { facilityIds?: number[]; chain?: string }[]): void {
  const next: FilterOptions = {
    facilities: availableFacilityFilters(offers),
    chains: availableChains(offers),
    poolSize: offers.length,
  };

  const same =
    next.poolSize === current.poolSize &&
    next.facilities.length === current.facilities.length &&
    next.chains.length === current.chains.length &&
    next.facilities.every((f, i) => f.filter.key === current.facilities[i]?.filter.key && f.count === current.facilities[i]?.count) &&
    next.chains.every((c, i) => c.name === current.chains[i]?.name && c.count === current.chains[i]?.count);

  if (same) return;
  current = next;
  emit();
}

/** Czyszczenie przy zmianie kierunku — stare opcje nie mogą przeciekać. */
export function resetFilterOptions(): void {
  if (current === EMPTY) return;
  current = EMPTY;
  emit();
}
