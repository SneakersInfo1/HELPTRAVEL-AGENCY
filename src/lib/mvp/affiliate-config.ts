// Phase 1 affiliate config — surviving programs only.
// Aviasales is the ONLY surviving Travelpayouts program for FLIGHTS.
// All other previously-listed Travelpayouts programs are PURGED per master
// spec section 2. Hotels are now handled internally via LiteAPI
// (`/lib/liteapi/*`) in Phase 2 — no third-party hotel-search affiliate brand
// is referenced anywhere in the application code.

export interface AffiliateConfig {
  travelpayoutsMarker: string | null; // marker for Aviasales (flights only)
  defaultOriginIata: string;
  defaultOriginCity: string;
}

export function getAffiliateConfig(): AffiliateConfig {
  return {
    travelpayoutsMarker: process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER?.trim() || null,
    defaultOriginIata: process.env.NEXT_PUBLIC_DEFAULT_ORIGIN_IATA?.trim() || "WAW",
    defaultOriginCity: process.env.NEXT_PUBLIC_DEFAULT_ORIGIN_CITY?.trim() || "Warszawa",
  };
}

export const AVIASALES_BASE = "https://www.aviasales.com" as const;

interface BuildLinkOptions {
  origin?: { city?: string; iata?: string };
  campaign?: string; // sub_id for TP attribution
}

// Aviasales link with marker. The only outbound affiliate link we generate.
export function buildAviasalesLink(opts: BuildLinkOptions = {}): string {
  const config = getAffiliateConfig();
  if (!config.travelpayoutsMarker) {
    return AVIASALES_BASE;
  }
  const url = new URL(AVIASALES_BASE);
  url.searchParams.set("marker", config.travelpayoutsMarker);
  if (opts.campaign) url.searchParams.set("sub_id", opts.campaign);
  url.searchParams.set("origin_iata", opts.origin?.iata ?? config.defaultOriginIata);
  return url.toString();
}
