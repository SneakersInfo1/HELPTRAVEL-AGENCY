"use client";

import { useSyncExternalStore } from "react";

/**
 * Czy zapytanie medialne jest spełnione — bezpiecznie przy renderze serwerowym.
 *
 * Po co, skoro jest Tailwind: klasy `lg:hidden` / `hidden lg:block` renderują
 * OBA warianty i tylko jeden pokazują. Dla treści to nic nie kosztuje, ale dla
 * mapy oznaczałoby DWIE instancje MapLibre naraz — dwa canvasy, dwa komplety
 * pobranych kafelków i podwójne zużycie pamięci, z czego jeden zestaw jest
 * niewidoczny. Zdarzyło się dokładnie to (2026-08-07): ukryta mapa mobilna
 * miała canvas 0×0 i ładowała kafelki w tle na desktopie.
 *
 * `useSyncExternalStore` zamiast `useState` + `useEffect`: brak dodatkowego
 * renderu, brak `set-state-in-effect` (reguła włączona w tym repo) i poprawne
 * zachowanie przy hydratacji — serwer dostaje `false`, więc pierwszy render
 * jest deterministyczny.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    // Serwer nie zna szerokości okna. `false` = wariant mobilny, czyli ten
    // tańszy — a klient i tak poprawi to przy pierwszym sprawdzeniu.
    () => false,
  );
}
