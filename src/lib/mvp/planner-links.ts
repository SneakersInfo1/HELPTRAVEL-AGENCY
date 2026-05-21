// Buduje kanoniczny URL do wyszukiwarki hoteli. Nazwa funkcji zostaje dla
// kompatybilności starszych importów, ale publiczny produkt nie prowadzi już
// użytkownika do wycofanego `/planner`.

export interface PlannerLinkOptions {
  destination: string;
  country?: string;
  origin: string;
  startDate?: string;
  endDate?: string;
  nights?: number;
  travelers?: number;
  rooms?: number;
  budget?: number;
  q?: string;
}

function addDaysIso(startDate: string, days: number): string | null {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildPlannerLink(opts: PlannerLinkOptions): string {
  const params = new URLSearchParams();
  const trimmedDestination = opts.destination.trim();
  if (trimmedDestination.length > 0) {
    params.set("destination", trimmedDestination);
  }
  if (opts.country?.trim()) {
    params.set("country", opts.country.trim());
  }
  params.set("origin", opts.origin || "Warszawa");
  if (opts.startDate) {
    params.set("checkin", opts.startDate);
    const checkout = opts.endDate ?? addDaysIso(opts.startDate, opts.nights ?? 4);
    if (checkout) params.set("checkout", checkout);
  }
  params.set("adults", String(opts.travelers ?? 2));
  params.set("rooms", String(opts.rooms ?? 1));
  return `/hotele/szukaj?${params.toString()}`;
}
