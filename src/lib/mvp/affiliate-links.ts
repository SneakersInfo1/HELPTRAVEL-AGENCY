import type { AffiliateLinks } from "./types";
import { buildCjStayLinks } from "./cj-stays";

type AffiliateKind = keyof AffiliateLinks;

interface AffiliateTemplateInput {
  city: string;
  country: string;
  originCity?: string;
  departureDate?: string;
  checkInDate?: string;
  checkOutDate?: string;
  passengers?: number;
  rooms?: number;
}

const TEMPLATE_BY_KIND: Record<AffiliateKind, string | undefined> = {
  flights: process.env.AFFILIATE_FLIGHTS_TEMPLATE?.trim(),
  stays: process.env.AFFILIATE_STAYS_TEMPLATE?.trim(),
  attractions: process.env.AFFILIATE_ATTRACTIONS_TEMPLATE?.trim(),
  cars: process.env.AFFILIATE_CARS_TEMPLATE?.trim(),
};

function fallbackLink(kind: AffiliateKind, place: string): string {
  if (kind === "flights") {
    return `https://www.google.com/search?q=${encodeURIComponent(`loty z Polski do ${place}`)}`;
  }
  if (kind === "stays") {
    return `https://www.booking.com/searchresults.pl.html?ss=${encodeURIComponent(place)}`;
  }
  if (kind === "cars") {
    return `https://www.google.com/search?q=${encodeURIComponent(`wynajem samochodu ${place}`)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`${place} atrakcje`)}`;
}

function interpolateTemplate(template: string, input: AffiliateTemplateInput, kind: AffiliateKind): string {
  const city = input.city.trim();
  const country = input.country.trim();
  const originCity = input.originCity?.trim() || "Warszawa";
  const cityCountry = [city, country].filter(Boolean).join(" ").trim();
  const departureDate = input.departureDate?.trim() || "";
  const checkInDate = input.checkInDate?.trim() || departureDate;
  const checkOutDate = input.checkOutDate?.trim() || "";
  const passengers = String(input.passengers ?? 2);
  const rooms = String(input.rooms ?? 1);

  const replacements: Record<string, string> = {
    city,
    country,
    originCity,
    cityCountry,
    cityEncoded: encodeURIComponent(city),
    countryEncoded: encodeURIComponent(country),
    originEncoded: encodeURIComponent(originCity),
    cityCountryEncoded: encodeURIComponent(cityCountry),
    departureDate,
    departureDateEncoded: encodeURIComponent(departureDate),
    checkInDate,
    checkInDateEncoded: encodeURIComponent(checkInDate),
    checkOutDate,
    checkOutDateEncoded: encodeURIComponent(checkOutDate),
    passengers,
    rooms,
    flightsQuery: `loty z Polski do ${cityCountry}`,
    flightsQueryEncoded: encodeURIComponent(`loty z Polski do ${cityCountry}`),
    staysQuery: cityCountry,
    staysQueryEncoded: encodeURIComponent(cityCountry),
    attractionsQuery: `${cityCountry} atrakcje`,
    attractionsQueryEncoded: encodeURIComponent(`${cityCountry} atrakcje`),
    carsQuery: `${cityCountry} wynajem samochodu`,
    carsQueryEncoded: encodeURIComponent(`${cityCountry} wynajem samochodu`),
  };

  const fallback = fallbackLink(kind, cityCountry);
  const resolved = template.replaceAll(/\{([a-zA-Z0-9]+)\}/g, (_, key: string) => replacements[key] ?? "");
  if (!resolved.startsWith("https://")) return fallback;
  return resolved;
}

function buildAffiliateLink(kind: AffiliateKind, input: AffiliateTemplateInput): string {
  const place = [input.city, input.country].filter(Boolean).join(" ").trim();
  const template = TEMPLATE_BY_KIND[kind];
  if (!template) return fallbackLink(kind, place);
  return interpolateTemplate(template, input, kind);
}

export function buildAffiliateLinksWithContext(input: AffiliateTemplateInput): AffiliateLinks {
  const cjStayLinks = buildCjStayLinks(input.city, input.country, {
    checkIn: input.checkInDate,
    checkOut: input.checkOutDate,
    adults: input.passengers,
    rooms: input.rooms,
  });

  return {
    flights: buildAffiliateLink("flights", input),
    stays: cjStayLinks?.hotels ?? buildAffiliateLink("stays", input),
    attractions: buildAffiliateLink("attractions", input),
    cars: buildAffiliateLink("cars", input),
  };
}

export function buildAffiliateLinks(city: string, country: string): AffiliateLinks {
  return buildAffiliateLinksWithContext({ city, country });
}
