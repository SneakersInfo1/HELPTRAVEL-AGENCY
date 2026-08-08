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
  /**
   * Środek puli — do podglądu mapy nad filtrami (brief V3 §4).
   *
   * Panel filtrów renderuje się przed wynikami i nie zna kierunku, a jedynym
   * miejscem, które zna współrzędne wszystkich hoteli, jest lista. `null`
   * dopóki pula nie ma ani jednego obiektu ze współrzędnymi — wtedy podglądu
   * po prostu nie pokazujemy, zamiast rysować mapę Zatoki Gwinejskiej.
   */
  center: { lat: number; lng: number } | null;
}

const EMPTY: FilterOptions = { facilities: [], chains: [], poolSize: 0, center: null };

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
export function publishFilterOptions(
  offers: { facilityIds?: number[]; chain?: string; latitude?: number; longitude?: number }[],
): void {
  // Mediana, nie średnia. Kierunek potrafi mieć pojedynczy obiekt oddalony
  // o setki kilometrów (błąd w danych dostawcy albo hotel lotniskowy), a
  // średnia przesunęłaby przez niego środek podglądu w pustkę.
  const lats = offers.map((o) => o.latitude).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  const lngs = offers.map((o) => o.longitude).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  const center =
    lats.length && lngs.length
      ? { lat: lats[Math.floor(lats.length / 2)], lng: lngs[Math.floor(lngs.length / 2)] }
      : null;

  const next: FilterOptions = {
    facilities: availableFacilityFilters(offers),
    chains: availableChains(offers),
    poolSize: offers.length,
    center,
  };

  const same =
    next.poolSize === current.poolSize &&
    next.center?.lat === current.center?.lat &&
    next.center?.lng === current.center?.lng &&
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
