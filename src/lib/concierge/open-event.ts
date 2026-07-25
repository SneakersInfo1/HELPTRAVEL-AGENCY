// Kontrakt otwierania czatu spoza drzewa launchera.
//
// Redesign 2026-07 dał konsjerżowi trzy wejścia (zakładka w hero, kafel
// w kategoriach, dymek w rogu). Zakładka renderuje czat u siebie, ale kafel
// musi otworzyć PANEL launchera, który żyje w layoucie globalnym. Zamiast
// windowsowego kontekstu/providera przez pół aplikacji — jedno zdarzenie okna.

export const CONCIERGE_OPEN_EVENT = "helptravel:concierge-open";

export type ConciergeOpenSource = "category_tile" | "launcher";

/** Otwiera panel konsjerża. No-op na serwerze. */
export function requestConciergeOpen(source: ConciergeOpenSource): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CONCIERGE_OPEN_EVENT, { detail: { source } }),
  );
}
