import { getAffiliateBrandLabel } from "./affiliate-brand";
import { buildAffiliateLinksWithContext } from "./affiliate-links";
import { buildCjStayLinks } from "./cj-stays";

export type PartnerNetwork = "CJ" | "Travelpayouts" | "CJ / Travelpayouts" | "Fallback";

export interface PartnerPlacementCardData {
  title: string;
  description: string;
  partnerLabels: string[];
  href: string;
  ctaLabel: string;
  note?: string;
  sourceLabel: PartnerNetwork;
}

function detectFallbackSource(href: string): PartnerNetwork {
  if (href.includes("google.com/search") || href.includes("booking.com/searchresults")) {
    return "Fallback";
  }
  return "Travelpayouts";
}

export function buildPartnerPlacementCards(input: {
  city: string;
  country: string;
  originCity?: string;
  departureDate?: string;
  checkInDate?: string;
  checkOutDate?: string;
  passengers?: number;
  rooms?: number;
  locale: "pl" | "en";
}): PartnerPlacementCardData[] {
  const affiliateLinks = buildAffiliateLinksWithContext(input);
  const cjStayLinks = buildCjStayLinks(input.city, input.country, {
    checkIn: input.checkInDate,
    checkOut: input.checkOutDate,
    adults: input.passengers,
    rooms: input.rooms,
  });

  const staysHref = cjStayLinks?.hotels ?? affiliateLinks.stays;
  const flightsHref = affiliateLinks.flights;
  const attractionsHref = affiliateLinks.attractions;
  const carsHref = affiliateLinks.cars;

  const staysLabel = getAffiliateBrandLabel(staysHref, "Hotels.com");
  const carsPrimaryLabel = getAffiliateBrandLabel(carsHref, input.locale === "en" ? "Transfer partner" : "Partner transferu");

  return [
    {
      title: input.locale === "en" ? "Stays" : "Noclegi",
      description:
        input.locale === "en"
          ? "Hotels.com, Expedia and Vrbo are the stay layer handled through CJ for the fastest first comparison."
          : "Hotels.com, Expedia i Vrbo idą przez CJ i dają najszybsze pierwsze porównanie, gdy wiesz już, dokąd lecisz.",
      partnerLabels: [staysLabel, "Expedia", "Vrbo"],
      href: staysHref,
      ctaLabel: input.locale === "en" ? "Open stays" : "Zobacz noclegi",
      note: input.locale === "en" ? "First step" : "Pierwszy krok",
      sourceLabel: staysHref.includes("booking.com") ? "Fallback" : "CJ",
    },
    {
      title: input.locale === "en" ? "Flights" : "Loty",
      description:
        input.locale === "en"
          ? "Aviasales and Kiwi.com run through Travelpayouts, while LOT Global stays visible as the CJ-backed airline route."
          : "Aviasales i Kiwi.com idą przez Travelpayouts, a LOT Global zostaje jako trasa wspierana przez CJ.",
      partnerLabels: ["Aviasales", "LOT Global", "Kiwi.com"],
      href: flightsHref,
      ctaLabel: input.locale === "en" ? "Open planner" : "Otwórz planner",
      note: input.locale === "en" ? "Route step" : "Krok trasy",
      sourceLabel: detectFallbackSource(flightsHref) === "Fallback" ? "Fallback" : "CJ / Travelpayouts",
    },
    {
      title: input.locale === "en" ? "Activities" : "Atrakcje",
      description:
        input.locale === "en"
          ? "Tiqets, Klook and WeGoTrip are handled through Travelpayouts when you want things to do on the ground."
          : "Tiqets, Klook i WeGoTrip idą przez Travelpayouts, gdy chcesz od razu dodać coś do zrobienia na miejscu.",
      partnerLabels: ["Tiqets", "Klook", "WeGoTrip"],
      href: attractionsHref,
      ctaLabel: input.locale === "en" ? "Browse ideas" : "Przeglądaj pomysły",
      note: input.locale === "en" ? "On the ground" : "Na miejscu",
      sourceLabel: detectFallbackSource(attractionsHref),
    },
    {
      title: input.locale === "en" ? "Transfers and cars" : "Transfery i auta",
      description:
        input.locale === "en"
          ? "Kiwitaxi, Localrent and GetRentacar are the Travelpayouts-backed helpers for airport transfer or local car hire."
          : "Kiwitaxi, Localrent i GetRentacar idą przez Travelpayouts, gdy kierunek wymaga auta albo dojazdu z lotniska.",
      partnerLabels: [carsPrimaryLabel, "Localrent", "GetRentacar"],
      href: carsHref,
      ctaLabel: input.locale === "en" ? "See how it works" : "Zobacz transfery",
      note: input.locale === "en" ? "Practical step" : "Praktyczny krok",
      sourceLabel: detectFallbackSource(carsHref),
    },
  ];
}
