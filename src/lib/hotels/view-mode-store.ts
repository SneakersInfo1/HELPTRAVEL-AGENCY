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
 * Ostatnie wyszukiwanie, dla którego zsynchronizowaliśmy tryb widoku.
 *
 * Musi żyć W TYM SAMYM MIEJSCU co `mode` — czyli w module, nie w oknie
 * komponentu. Poprzednia wersja pilnowała tego `useRef`-em w `ResultsList`,
 * a ref powstaje od nowa przy KAŻDYM montowaniu. Skutek: powrót z hotelu na
 * listing wyglądał dla kodu jak nowe wyszukiwanie i kasował tryb mapy —
 * gość wchodził w hotel z mapy, wracał i lądował na liście.
 */
let ostatniaSygnatura: string | null = null;

/**
 * Dopasowuje tryb widoku do BIEŻĄCEGO wyszukiwania.
 *
 * Resetuje do listy tylko wtedy, gdy wyszukiwanie faktycznie się zmieniło —
 * inaczej gość szukałby Rodos, przełączał na mapę, wracał do wyszukiwarki
 * i lądował od razu w mapie nowego kierunku, nie wiedząc czemu.
 *
 * WOŁAĆ Z EFEKTU, NIGDY Z CIAŁA RENDERU. Ta funkcja mutuje store i budzi
 * subskrybentów `useSyncExternalStore` — m.in. `ResultsLayout`, czyli
 * RODZICA `ResultsList`. Zrobione w trakcie renderu znaczy aktualizację
 * innego komponentu w fazie renderu i ryzyko rozjazdu: rodzic zdążył się
 * wyrenderować w trybie mapy, dziecko już w trybie listy.
 */
export function syncViewModeToSearch(sygnatura: string): void {
  if (ostatniaSygnatura === sygnatura) return;
  ostatniaSygnatura = sygnatura;
  setViewMode("list");
}

/** Wyłącznie dla testów — store żyje w module i przeciekałby między przypadkami. */
export function __resetViewModeStoreForTests(): void {
  ostatniaSygnatura = null;
  mode = "list";
}
