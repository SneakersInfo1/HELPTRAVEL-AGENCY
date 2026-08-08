"use client";

import { useSyncExternalStore } from "react";

/** Subskrypcja, która nigdy nie odpala — stan „już w przeglądarce" nie wraca. */
const noop = () => () => {};

/**
 * Czy komponent działa już po hydratacji.
 *
 * Po co: dane z `localStorage` (polubione) nie istnieją na serwerze. Bez tej
 * flagi pierwszy render klienta pokazuje stan pusty — gość z zapisanymi
 * hotelami widzi przez moment „nie masz jeszcze polubionych", co wygląda jak
 * utrata danych.
 *
 * Dlaczego NIE `useState(false) + useEffect(() => setState(true))`: w tym repo
 * włączona jest reguła `react-hooks/set-state-in-effect` i słusznie —
 * to dodatkowy, kaskadowy render. `useSyncExternalStore` z osobnym snapshotem
 * serwerowym daje dokładnie tę samą informację, jedną ścieżką i bez efektu.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
