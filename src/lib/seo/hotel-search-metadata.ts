import type { Metadata } from "next";

// Metadane /hotele/szukaj.
//
// Wyniki wyszukiwania nie są stronami do indeksu. Do 2026-09 adres był
// w robots.txt jako Disallow, a strona jednocześnie deklarowała `index, follow`
// i canonical z parametrami (audyt SEO Growth V1, pkt 44): trzy sprzeczne
// sygnały. Teraz zawsze noindex i bez canonicala — robots.txt zostaje bez zmian.

export interface HotelSearchMetadataInput {
  destination?: string;
  country?: string;
  region?: { namePl: string; countryPl: string } | null;
}

export function hotelSearchMetadata({ destination, country, region }: HotelSearchMetadataInput): Metadata {
  const robots = { index: false, follow: true };

  if (region) {
    return {
      title: `Hotele ${region.namePl}, ${region.countryPl} — ceny w PLN`,
      description: `Znajdź hotel na wyspie ${region.namePl}. Prawdziwe ceny w PLN, bezpłatna anulacja w wybranych ofertach, polskie wsparcie.`,
      robots,
    };
  }

  if (destination) {
    return {
      title: `Hotele ${destination}${country ? `, ${country}` : ""} — ceny w PLN`,
      description: `Znajdź hotel w ${destination}. Prawdziwe ceny w PLN, bezpłatna anulacja w wybranych ofertach, polskie wsparcie.`,
      robots,
    };
  }

  return {
    title: "Wyszukiwarka hoteli",
    description: "Wyszukaj hotel z prawdziwymi cenami w PLN.",
    robots,
  };
}
