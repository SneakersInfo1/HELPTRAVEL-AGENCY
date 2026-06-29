// Odtwarzanie poprawnego URL wyników z kontekstu przepływu (flow-storage).
// CZYSTE, client-safe. Powód: po wygaśnięciu oferty „Wróć do wyników" robił
// router.push("/loty/wyniki") BEZ parametrów → strona wyników pokazywała
// „Brak poprawnych parametrów" → ślepy zaułek (user wypadał z lejka). Tu
// odbudowujemy origin/destination/daty/pasażerów z flow. `fresh` omija cache
// ofert (Faza A), żeby recovery zwrócił ŚWIEŻE oferty, nie tę samą wygasłą.

import type { FlightFlow } from "./flow-storage";

export type ResultsUrlContext = Pick<
  FlightFlow,
  "origin" | "destination" | "depart" | "ret" | "adults" | "children" | "infants"
>;

export function buildResultsUrl(flow: ResultsUrlContext, opts: { fresh?: boolean } = {}): string {
  const p = new URLSearchParams();
  p.set("origin", flow.origin);
  p.set("destination", flow.destination);
  p.set("depart", flow.depart);
  if (flow.ret) p.set("return", flow.ret);
  p.set("adults", String(flow.adults));
  if (flow.children > 0) p.set("children", String(flow.children));
  if (flow.infants > 0) p.set("infants", String(flow.infants));
  if (opts.fresh) p.set("fresh", "1");
  return `/loty/wyniki?${p.toString()}`;
}
