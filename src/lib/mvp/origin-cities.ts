// Lotniska startowe oferowane w mini-plannerze na homepage.
// Podzielone na regiony: Polska (glowny target) + Europa (polska diaspora w UK/DE/NL/IE).
export interface OriginCity {
  city: string;
  iata: string;
  region: "PL" | "EU";
}

export const POLISH_ORIGIN_CITIES: readonly OriginCity[] = [
  { city: "Warszawa", iata: "WAW", region: "PL" },
  { city: "Krakow", iata: "KRK", region: "PL" },
  { city: "Gdansk", iata: "GDN", region: "PL" },
  { city: "Wroclaw", iata: "WRO", region: "PL" },
  { city: "Katowice", iata: "KTW", region: "PL" },
  { city: "Poznan", iata: "POZ", region: "PL" },
  { city: "Rzeszow", iata: "RZE", region: "PL" },
  { city: "Lublin", iata: "LUZ", region: "PL" },
] as const;

export const EUROPEAN_ORIGIN_CITIES: readonly OriginCity[] = [
  { city: "Londyn", iata: "LON", region: "EU" },
  { city: "Manchester", iata: "MAN", region: "EU" },
  { city: "Dublin", iata: "DUB", region: "EU" },
  { city: "Edynburg", iata: "EDI", region: "EU" },
  { city: "Berlin", iata: "BER", region: "EU" },
  { city: "Frankfurt", iata: "FRA", region: "EU" },
  { city: "Monachium", iata: "MUC", region: "EU" },
  { city: "Amsterdam", iata: "AMS", region: "EU" },
  { city: "Paryz", iata: "PAR", region: "EU" },
  { city: "Wieden", iata: "VIE", region: "EU" },
  { city: "Praga", iata: "PRG", region: "EU" },
  { city: "Kopenhaga", iata: "CPH", region: "EU" },
  { city: "Oslo", iata: "OSL", region: "EU" },
  { city: "Sztokholm", iata: "STO", region: "EU" },
] as const;

export const ALL_ORIGIN_CITIES: readonly OriginCity[] = [
  ...POLISH_ORIGIN_CITIES,
  ...EUROPEAN_ORIGIN_CITIES,
];

export const DEFAULT_ORIGIN_CITY = POLISH_ORIGIN_CITIES[0].city;
