// Phase 1 affiliate-links — only Aviasales flights survive.
// Hotels link points to internal /hotele (LiteAPI booking flow, Phase 2+).
// `attractions` and `cars` are deprecated outbound paths — kept on the type
// for backward compatibility but resolve to "" (empty) so consumers can detect
// "no link" and hide the CTA. Master spec section 2: those affiliate programs
// are PURGED.

import type { AffiliateLinks } from "./types";
import { buildAviasalesLink } from "./affiliate-config";

interface AffiliateContextInput {
  city: string;
  country: string;
  originCity?: string;
  originIata?: string;
  departureDate?: string;
  checkInDate?: string;
  checkOutDate?: string;
  passengers?: number;
  rooms?: number;
}

function buildInternalHotelHref(input: AffiliateContextInput): string {
  const params = new URLSearchParams();
  if (input.city) params.set("destination", input.city);
  if (input.country) params.set("country", input.country);
  if (input.checkInDate) params.set("checkin", input.checkInDate);
  if (input.checkOutDate) params.set("checkout", input.checkOutDate);
  if (input.passengers) params.set("travelers", String(input.passengers));
  if (input.rooms) params.set("rooms", String(input.rooms));
  return `/hotele/szukaj?${params.toString()}`;
}

export function buildAffiliateLinksWithContext(input: AffiliateContextInput): AffiliateLinks {
  const flights = buildAviasalesLink({
    origin: { iata: input.originIata, city: input.originCity },
    campaign: `dest_${input.city.toLowerCase().replace(/\s+/g, "_")}`,
  });
  return {
    flights,
    stays: buildInternalHotelHref(input),
    attractions: "",
    cars: "",
  };
}

export function buildAffiliateLinks(city: string, country: string): AffiliateLinks {
  return buildAffiliateLinksWithContext({ city, country });
}
