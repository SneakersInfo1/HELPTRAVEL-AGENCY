import { getAllDestinationProfiles } from "./destinations";
import type { DestinationProfile } from "./types";

// Handpicked 6 kierunkow dla homepage. Kolejnosc ma znaczenie — pierwsze widoczne
// nad fold-em na desktopie, ostatnie pod fold-em na mobile. Dobor pod polskiego
// odbiorcow (city break + plaza, wszystkie z dobra dostepnoscia z Polski).
export const FEATURED_DESTINATION_SLUGS = [
  "malaga-spain",
  "barcelona-spain",
  "lisbon-portugal",
  "rome-italy",
  "istanbul-turkey",
  "valencia-spain",
] as const;

export function getFeaturedDestinations(): DestinationProfile[] {
  const all = getAllDestinationProfiles();
  const bySlug = new Map(all.map((d) => [d.slug, d] as const));
  return FEATURED_DESTINATION_SLUGS
    .map((slug) => bySlug.get(slug))
    .filter((d): d is DestinationProfile => Boolean(d));
}
