"use client";

import { useSyncExternalStore } from "react";

// Tryb widoku wyników: lista albo mapa.
//
// DLACZEGO OSOBNY STORE, A NIE `useState` W `ResultsList`.
// Sidebar filtrów renderuje SERWER, w innej gałęzi drzewa niż lista wyników
// (`szukaj/page.tsx` → siatka [sidebar | wyniki]). Tryb widoku musi być znany
// obu stronom, bo w widoku mapy sidebar ma ZNIKNĄĆ — inaczej powstają trzy
// kolumny i karty hoteli są zgniatane.
//
// Zmierzone przed poprawką (1920 px, tryb mapy): sidebar 320 px + lista
// 762 px + mapa 626 px. Mapa dostawała 33% ekranu zamiast ~45%, a karta
// hotelu była węższa niż w widoku listy.
//
// Podnoszenie stanu do `page.tsx` odpada — to komponent serwerowy. Kontekst
// wymagałby opakowania całej strony klientem i utraty renderu serwerowego
// listy. Mały store zewnętrzny rozwiązuje to bez żadnej z tych strat.
//
// Stan celowo NIE trafia do URL: przełączenie widoku nie jest nowym
// wyszukiwaniem i nie powinno zaśmiecać historii ani linku, którym gość się
// dzieli.

export type ViewMode = "list" | "map";

let mode: ViewMode = "list";
const listeners = new Set<() => void>();

export function setViewMode(next: ViewMode): void {
  if (mode === next) return;
  mode = next;
  for (const l of listeners) l();
}

export function getViewMode(): ViewMode {
  return mode;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Serwer zawsze renderuje listę — to stan, w którym strona się otwiera. */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, getViewMode, () => "list" as const);
}

/**
 * Reset przy wejściu na świeże wyniki.
 *
 * Store żyje poza Reactem, więc przetrwałby nawigację klienta między
 * wyszukiwaniami: gość szukałby Rodos, przełączał na mapę, wracał do
 * wyszukiwarki i lądował od razu w mapie nowego kierunku, nie wiedząc czemu.
 */
export function resetViewMode(): void {
  setViewMode("list");
}
