// Lotniska startowe oferowane w mini-plannerze na homepage.
// Kolejnosc = popularnosc dla polskiego odbiorcy (Warszawa default).
// Jesli kiedys dodajemy IATA do plannera, ten plik to naturalny punkt.
export interface OriginCity {
  city: string;
  iata: string;
}

export const POLISH_ORIGIN_CITIES: readonly OriginCity[] = [
  { city: "Warszawa", iata: "WAW" },
  { city: "Krakow", iata: "KRK" },
  { city: "Gdansk", iata: "GDN" },
  { city: "Wroclaw", iata: "WRO" },
  { city: "Katowice", iata: "KTW" },
  { city: "Poznan", iata: "POZ" },
] as const;

export const DEFAULT_ORIGIN_CITY = POLISH_ORIGIN_CITIES[0].city;
