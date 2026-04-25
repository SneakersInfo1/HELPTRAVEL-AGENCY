// Popularne kierunki + popularne trasy origin->destination dla SEO.
// Linki w stopce na kazdej stronie = lepszy "internal link graph" dla Google
// + dluzszy ogon zapytan (long-tail) typu "tani lot Krakow Malaga".

export interface PopularDestination {
  slug: string;
  city: string;
  country: string;
  // Anchor optymalizowany pod intent ("Tani lot do Malagi" >> "Malaga")
  anchor: string;
}

export interface PopularRoute {
  origin: string; // miasto wylotu
  destination: string; // miasto docelowe
  destinationSlug: string;
  // Pelny anchor SEO ("Tani lot Krakow -> Malaga")
  anchor: string;
}

export const POPULAR_DESTINATIONS_PL: PopularDestination[] = [
  { slug: "malaga-spain", city: "Malaga", country: "Hiszpania", anchor: "Tani wyjazd do Malagi" },
  { slug: "barcelona-spain", city: "Barcelona", country: "Hiszpania", anchor: "Tani wyjazd do Barcelony" },
  { slug: "rome-italy", city: "Rzym", country: "Wlochy", anchor: "Tani wyjazd do Rzymu" },
  { slug: "lisbon-portugal", city: "Lizbona", country: "Portugalia", anchor: "Tani wyjazd do Lizbony" },
  { slug: "athens-greece", city: "Ateny", country: "Grecja", anchor: "Tani wyjazd do Aten" },
  { slug: "valencia-spain", city: "Walencja", country: "Hiszpania", anchor: "Tani wyjazd do Walencji" },
  { slug: "istanbul-turkey", city: "Stambul", country: "Turcja", anchor: "Tani wyjazd do Stambulu" },
  { slug: "funchal-portugal", city: "Funchal", country: "Madera", anchor: "Tani wyjazd na Madere" },
];

export const POPULAR_DESTINATIONS_EN: PopularDestination[] = [
  { slug: "malaga-spain", city: "Malaga", country: "Spain", anchor: "Cheap trips to Malaga" },
  { slug: "barcelona-spain", city: "Barcelona", country: "Spain", anchor: "Cheap trips to Barcelona" },
  { slug: "rome-italy", city: "Rome", country: "Italy", anchor: "Cheap trips to Rome" },
  { slug: "lisbon-portugal", city: "Lisbon", country: "Portugal", anchor: "Cheap trips to Lisbon" },
  { slug: "athens-greece", city: "Athens", country: "Greece", anchor: "Cheap trips to Athens" },
  { slug: "valencia-spain", city: "Valencia", country: "Spain", anchor: "Cheap trips to Valencia" },
  { slug: "istanbul-turkey", city: "Istanbul", country: "Turkey", anchor: "Cheap trips to Istanbul" },
  { slug: "funchal-portugal", city: "Funchal", country: "Madeira", anchor: "Cheap trips to Madeira" },
];

// Trasy origin->destination - mocno szukane dlugie ogony
// (np. "tani lot Krakow Malaga", "lot Warszawa Barcelona")
export const POPULAR_ROUTES_PL: PopularRoute[] = [
  { origin: "Krakow", destination: "Malaga", destinationSlug: "malaga-spain", anchor: "Lot Krakow -> Malaga" },
  { origin: "Warszawa", destination: "Barcelona", destinationSlug: "barcelona-spain", anchor: "Lot Warszawa -> Barcelona" },
  { origin: "Gdansk", destination: "Rzym", destinationSlug: "rome-italy", anchor: "Lot Gdansk -> Rzym" },
  { origin: "Wroclaw", destination: "Lizbona", destinationSlug: "lisbon-portugal", anchor: "Lot Wroclaw -> Lizbona" },
  { origin: "Katowice", destination: "Ateny", destinationSlug: "athens-greece", anchor: "Lot Katowice -> Ateny" },
  { origin: "Poznan", destination: "Stambul", destinationSlug: "istanbul-turkey", anchor: "Lot Poznan -> Stambul" },
];

export const POPULAR_ROUTES_EN: PopularRoute[] = [
  { origin: "Krakow", destination: "Malaga", destinationSlug: "malaga-spain", anchor: "Krakow -> Malaga flight" },
  { origin: "Warsaw", destination: "Barcelona", destinationSlug: "barcelona-spain", anchor: "Warsaw -> Barcelona flight" },
  { origin: "Gdansk", destination: "Rome", destinationSlug: "rome-italy", anchor: "Gdansk -> Rome flight" },
  { origin: "Wroclaw", destination: "Lisbon", destinationSlug: "lisbon-portugal", anchor: "Wroclaw -> Lisbon flight" },
  { origin: "Katowice", destination: "Athens", destinationSlug: "athens-greece", anchor: "Katowice -> Athens flight" },
  { origin: "Poznan", destination: "Istanbul", destinationSlug: "istanbul-turkey", anchor: "Poznan -> Istanbul flight" },
];

export function buildRouteHref(route: PopularRoute): string {
  const params = new URLSearchParams({
    mode: "standard",
    origin: route.origin,
    destination: route.destination,
    nights: "4",
    travelers: "2",
  });
  return `/planner?${params.toString()}`;
}

export function buildDestinationHref(dest: PopularDestination): string {
  return `/kierunki/${dest.slug}`;
}
