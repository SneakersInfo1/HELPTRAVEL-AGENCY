// Linki kierunkowe — wyłącznie WEWNĘTRZNE (Faza 4: zewnętrzne programy
// lotnicze wycofane). `stays` → /hotele/szukaj (LiteAPI), `flights` →
// wewnętrzna wyszukiwarka lotów LiteAPI Flights (/?tab=loty — kontekst kierunku
// bez lotniska wylotu, więc ląduje na pasku lotów). `attractions`/`cars`
// pozostają puste (programy wycofane).

import type { AffiliateLinks } from "./types";

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
  return {
    // Wewnętrzna wyszukiwarka lotów (bez lotniska wylotu w kontekście kierunku
    // — pasek lotów na stronie głównej pozwala wybrać „Skąd").
    flights: "/?tab=loty",
    stays: buildInternalHotelHref(input),
    attractions: "",
    cars: "",
  };
}

export function buildAffiliateLinks(city: string, country: string): AffiliateLinks {
  return buildAffiliateLinksWithContext({ city, country });
}
