// Logika stanu dobieracza wyjazdu (sekcja C) — czysta, bez Reacta.
//
// DLACZEGO OSOBNY MODUŁ: w tym repo nie ma DOM-u w testach ani biblioteki
// renderującej (`node:test` + `tsx`, zero jsdom). Dołożenie ich to nowa
// zależność i nowy runner dla jednego komponentu. Zamiast tego stosujemy wzorzec,
// który repo ma już wypracowany przy `server-only`: logika żyje w czystej
// funkcji, komponent zostaje cienką powłoką nad nią.
//
// Testowane są tu rzeczy, które realnie potrafią się zepsuć po cichu:
//   • przełącznik — drugi klik w ten sam chip MUSI czyścić filtr, inaczej
//     użytkownik nie ma jak wrócić do pełnej puli bez przeładowania strony;
//   • co raportujemy do GA4 — odznaczenie NIE jest ukończeniem kroku, a policzone
//     jako ukończenie zawyżałoby lejek doboru;
//   • trzy stany podsumowania — a zwłaszcza ten pusty, który musi mieć WYJŚCIE;
//   • dokąd prowadzi CTA — nigdy do wyszukiwarki hoteli bez kierunku i dat.

import type { BudgetBandId, DealCard } from "./deal-card";
import { cheapestPrice } from "./deal-card";

export interface PickerState {
  budget: BudgetBandId | null;
  theme: string | null;
}

export const EMPTY_PICKER_STATE: PickerState = { budget: null, theme: null };

export interface PickerSelection {
  state: PickerState;
  /**
   * Wartość do zaraportowania jako ukończony krok — `null`, gdy użytkownik
   * ODZNACZYŁ wybór. Odznaczenie to cofnięcie, nie postęp.
   */
  reported: string | null;
}

/** Klik w chip budżetu. Ten sam chip drugi raz = wyczyszczenie filtru. */
export function toggleBudget(state: PickerState, id: BudgetBandId): PickerSelection {
  const next = state.budget === id ? null : id;
  return { state: { ...state, budget: next }, reported: next };
}

/** Klik w chip typu wyjazdu. Ten sam chip drugi raz = wyczyszczenie filtru. */
export function toggleTheme(state: PickerState, slug: string): PickerSelection {
  const next = state.theme === slug ? null : slug;
  return { state: { ...state, theme: next }, reported: next };
}

/** Czy użytkownik cokolwiek wybrał (odróżnia „nic nie wybrał" od „brak wyników"). */
export function hasChoice(state: PickerState): boolean {
  return state.budget !== null || state.theme !== null;
}

export type PickerSummary =
  /** Nic nie wybrano — zachęta, jeszcze nie wynik. */
  | { kind: "prompt" }
  /** Są dopasowania. `cheapestPln` null tylko dla pustej puli, co tu nie zajdzie. */
  | { kind: "results"; count: number; cheapestPln: number | null }
  /** Wybór bez pokrycia — komunikat MUSI proponować wyjście. */
  | { kind: "empty" };

/**
 * Stan podsumowania nad przyciskiem.
 *
 * `matching` musi być TĄ SAMĄ pulą, którą użytkownik zobaczy po kliknięciu —
 * licznik rozjechany z wynikiem jest gorszy niż brak licznika: raz przyłapany,
 * podważa każdą inną liczbę na stronie.
 */
export function pickerSummary(state: PickerState, matching: readonly DealCard[]): PickerSummary {
  if (matching.length > 0) {
    return { kind: "results", count: matching.length, cheapestPln: cheapestPrice(matching) };
  }
  return hasChoice(state) ? { kind: "empty" } : { kind: "prompt" };
}

/**
 * Dokąd prowadzi przycisk.
 *
 * ŚWIADOMIE nie budujemy tu URL-a wyszukiwarki hoteli: nie znamy kierunku ANI
 * dat, więc wyszukiwarka pokazałaby pusty formularz, a użytkownik straciłby
 * kontekst, który właśnie nam podał. Wybrany typ ma własną stronę z kierunkami;
 * bez typu idziemy do katalogu.
 */
export function pickerCtaHref(state: PickerState): string {
  return state.theme ? `/wyjazdy/${state.theme}` : "/kierunki";
}
