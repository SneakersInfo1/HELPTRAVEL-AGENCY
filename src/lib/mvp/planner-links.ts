// Buduje URL do /planner z query params kompatybilnymi z PlannerClient.
// Centralizuje logike uzywana w: MiniPlannerForm (homepage), DestinationTile (homepage),
// KierunkiHeroCta (strony kierunkowe), potencjalnie w [miesiac] i /kierunki list.
//
// Flag `mode=standard` + pole `destination` (lub `q`) triggeruje autoRunStandardSearch
// w PlannerClient (patrz src/app/planner/page.tsx).

export interface PlannerLinkOptions {
  destination: string;
  origin: string;
  startDate?: string;
  nights?: number;
  travelers?: number;
  budget?: number;
  q?: string;
}

export function buildPlannerLink(opts: PlannerLinkOptions): string {
  const params = new URLSearchParams({
    mode: "standard",
    origin: opts.origin,
    nights: String(opts.nights ?? 4),
    travelers: String(opts.travelers ?? 2),
  });
  const trimmedDestination = opts.destination.trim();
  if (trimmedDestination.length > 0) {
    params.set("destination", trimmedDestination);
  }
  if (opts.startDate) {
    params.set("startDate", opts.startDate);
  }
  if (typeof opts.budget === "number") {
    params.set("budget", String(opts.budget));
  }
  if (opts.q) {
    params.set("q", opts.q);
  }
  return `/planner?${params.toString()}`;
}
