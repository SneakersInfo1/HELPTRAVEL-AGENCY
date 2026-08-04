// Kontrakt otwierania czatu spoza drzewa launchera.
//
// Redesign 2026-07 dał konsjerżowi trzy wejścia (zakładka w hero, kafel
// w kategoriach, dymek w rogu). Wszystkie otwierają JEDEN panel launchera,
// który żyje w layoucie globalnym — bez dwóch instancji rozmowy. Zamiast
// windowsowego kontekstu/providera przez pół aplikacji — jedno zdarzenie okna.

export const CONCIERGE_OPEN_EVENT = "helptravel:concierge-open";
export const CONCIERGE_STATE_EVENT = "helptravel:concierge-state";

export type ConciergeOpenSource = "category_tile" | "hero" | "launcher";

/** Otwiera panel konsjerża. No-op na serwerze. */
export function requestConciergeOpen(source: ConciergeOpenSource): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CONCIERGE_OPEN_EVENT, { detail: { source } }),
  );
}

/** Synchronizuje `aria-expanded` wejść spoza drzewa portalu. */
export function announceConciergeState(expanded: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CONCIERGE_STATE_EVENT, { detail: { expanded } }),
  );
}
