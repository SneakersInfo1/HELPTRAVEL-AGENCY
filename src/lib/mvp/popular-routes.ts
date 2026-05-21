// Popularne kierunki + popularne trasy origin->destination dla SEO.
// Linki w stopce na każdej stronie = lepszy "internal link graph" dla Google
// + dłuższy ogon zapytań (long-tail) typu "tani lot Kraków Malaga".

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
  destinationCountry: string;
  destinationSlug: string;
  // Pełny anchor SEO ("Tani lot Kraków -> Malaga")
  anchor: string;
}

export const POPULAR_DESTINATIONS_PL: PopularDestination[] = [
  { slug: "malaga-spain", city: "Malaga", country: "Hiszpania", anchor: "Tani wyjazd do Malagi" },
  { slug: "barcelona-spain", city: "Barcelona", country: "Hiszpania", anchor: "Tani wyjazd do Barcelony" },
  { slug: "rome-italy", city: "Rzym", country: "Włochy", anchor: "Tani wyjazd do Rzymu" },
  { slug: "lisbon-portugal", city: "Lizbona", country: "Portugalia", anchor: "Tani wyjazd do Lizbony" },
  { slug: "athens-greece", city: "Ateny", country: "Grecja", anchor: "Tani wyjazd do Aten" },
  { slug: "valencia-spain", city: "Walencja", country: "Hiszpania", anchor: "Tani wyjazd do Walencji" },
  { slug: "istanbul-turkey", city: "Stambuł", country: "Turcja", anchor: "Tani wyjazd do Stambułu" },
  { slug: "funchal-portugal", city: "Funchal", country: "Madera", anchor: "Tani wyjazd na Maderę" },
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

// Trasy origin->destination - mocno szukane długie ogony
// (np. "tani lot Kraków Malaga", "lot Warszawa Barcelona")
export const POPULAR_ROUTES_PL: PopularRoute[] = [
  { origin: "Kraków", destination: "Malaga", destinationCountry: "Spain", destinationSlug: "malaga-spain", anchor: "Lot Kraków -> Malaga" },
  { origin: "Warszawa", destination: "Barcelona", destinationCountry: "Spain", destinationSlug: "barcelona-spain", anchor: "Lot Warszawa -> Barcelona" },
  { origin: "Gdańsk", destination: "Rzym", destinationCountry: "Italy", destinationSlug: "rome-italy", anchor: "Lot Gdańsk -> Rzym" },
  { origin: "Wrocław", destination: "Lizbona", destinationCountry: "Portugal", destinationSlug: "lisbon-portugal", anchor: "Lot Wrocław -> Lizbona" },
  { origin: "Katowice", destination: "Ateny", destinationCountry: "Greece", destinationSlug: "athens-greece", anchor: "Lot Katowice -> Ateny" },
  { origin: "Poznań", destination: "Stambuł", destinationCountry: "Turkey", destinationSlug: "istanbul-turkey", anchor: "Lot Poznań -> Stambuł" },
];

export const POPULAR_ROUTES_EN: PopularRoute[] = [
  { origin: "Krakow", destination: "Malaga", destinationCountry: "Spain", destinationSlug: "malaga-spain", anchor: "Krakow -> Malaga flight" },
  { origin: "Warsaw", destination: "Barcelona", destinationCountry: "Spain", destinationSlug: "barcelona-spain", anchor: "Warsaw -> Barcelona flight" },
  { origin: "Gdansk", destination: "Rome", destinationCountry: "Italy", destinationSlug: "rome-italy", anchor: "Gdansk -> Rome flight" },
  { origin: "Wroclaw", destination: "Lisbon", destinationCountry: "Portugal", destinationSlug: "lisbon-portugal", anchor: "Wroclaw -> Lisbon flight" },
  { origin: "Katowice", destination: "Athens", destinationCountry: "Greece", destinationSlug: "athens-greece", anchor: "Katowice -> Athens flight" },
  { origin: "Poznan", destination: "Istanbul", destinationCountry: "Turkey", destinationSlug: "istanbul-turkey", anchor: "Poznan -> Istanbul flight" },
];

export function buildRouteHref(route: PopularRoute): string {
  const params = new URLSearchParams({
    origin: route.origin,
    destination: route.destination,
    country: route.destinationCountry,
    adults: "2",
    rooms: "1",
  });
  return `/hotele/szukaj?${params.toString()}`;
}

export function buildDestinationHref(dest: PopularDestination): string {
  return `/kierunki/${dest.slug}`;
}
