// Nearby/group airport candidates for the Travelpayouts flight search.
//
// Why: a user searching Warsaw → Milan should still see hits when there's no
// WAW→MXP flight on the day — Aviasales has BGY (Bergamo, 50 km from
// Milan center) and LIN as well. Same for non-Warsaw origins: a Polish user
// stuck in Wrocław should see WRO→BCN first, then KTW/POZ→BCN as a fallback
// before the panel reports "brak ofert".
//
// Strategy: each city resolves to an ORDERED list of IATAs. Primary first
// (what the user actually picked or its city/metro code), then alternatives
// ranked roughly by geographic distance to the user's intent. For huge
// metros we lean on Aviasales' "metro codes" (LON, ROM, MIL, PAR, NYC, TYO,
// STO, MOW, BJS) — one query covers every airport in the cluster, which is
// usually a single API call instead of N.
//
// Falls back to a single-entry list via `resolveAirportCode` for any city
// not enumerated below, so behavior is never worse than before.

import { normalizeLookup, resolveAirportCode } from "./location";

export interface AirportCandidate {
  iata: string;
  /** false = the user's primary airport, true = nearby fallback. */
  alternative: boolean;
  /** Human hint shown next to the offer ("Bergamo (~50 km)"). */
  hint?: string;
}

// ---- ORIGIN side ----------------------------------------------------------
//
// Polish departures: Modlin is a true alternative for Warsaw, Katowice for
// both Kraków and Wrocław. Cross-country origins (Berlin from Poznań,
// Praga from Wrocław) deliberately stay off the list — too aggressive for
// "loty z Polski".
const ORIGIN_GROUPS: Record<string, AirportCandidate[]> = {
  warsaw: [
    { iata: "WAW", alternative: false },
    { iata: "WMI", alternative: true, hint: "Warszawa Modlin" },
    { iata: "LCJ", alternative: true, hint: "Łódź (~135 km)" },
    { iata: "KTW", alternative: true, hint: "Katowice (~290 km)" },
    { iata: "KRK", alternative: true, hint: "Kraków (~295 km)" },
  ],
  krakow: [
    { iata: "KRK", alternative: false },
    { iata: "KTW", alternative: true, hint: "Katowice (~80 km)" },
    { iata: "RZE", alternative: true, hint: "Rzeszów (~165 km)" },
  ],
  katowice: [
    { iata: "KTW", alternative: false },
    { iata: "KRK", alternative: true, hint: "Kraków (~80 km)" },
    { iata: "WRO", alternative: true, hint: "Wrocław (~190 km)" },
  ],
  wroclaw: [
    { iata: "WRO", alternative: false },
    { iata: "KTW", alternative: true, hint: "Katowice (~190 km)" },
    { iata: "POZ", alternative: true, hint: "Poznań (~170 km)" },
  ],
  poznan: [
    { iata: "POZ", alternative: false },
    { iata: "WRO", alternative: true, hint: "Wrocław (~170 km)" },
    { iata: "WAW", alternative: true, hint: "Warszawa (~300 km)" },
  ],
  gdansk: [
    { iata: "GDN", alternative: false },
    { iata: "BZG", alternative: true, hint: "Bydgoszcz (~165 km)" },
    { iata: "SZZ", alternative: true, hint: "Szczecin (~330 km)" },
  ],
  rzeszow: [
    { iata: "RZE", alternative: false },
    { iata: "KRK", alternative: true, hint: "Kraków (~165 km)" },
    { iata: "KTW", alternative: true, hint: "Katowice (~245 km)" },
  ],
  lublin: [
    { iata: "LUZ", alternative: false },
    { iata: "WAW", alternative: true, hint: "Warszawa (~165 km)" },
    { iata: "RZE", alternative: true, hint: "Rzeszów (~165 km)" },
  ],
  lodz: [
    { iata: "LCJ", alternative: false },
    { iata: "WAW", alternative: true, hint: "Warszawa (~135 km)" },
    { iata: "KTW", alternative: true, hint: "Katowice (~200 km)" },
  ],
  szczecin: [
    { iata: "SZZ", alternative: false },
    { iata: "BER", alternative: true, hint: "Berlin (~145 km)" },
    { iata: "POZ", alternative: true, hint: "Poznań (~235 km)" },
  ],
  // Diaspora origins — keep limited fallback so Polish-language users in
  // Western Europe still benefit (the dev briefs us their partners list
  // these).
  london: [
    { iata: "LON", alternative: false, hint: "Wszystkie lotniska Londynu" },
    { iata: "LHR", alternative: true },
    { iata: "LGW", alternative: true },
    { iata: "STN", alternative: true },
    { iata: "LTN", alternative: true },
  ],
  dublin: [
    { iata: "DUB", alternative: false },
    { iata: "BFS", alternative: true, hint: "Belfast (~165 km)" },
  ],
  berlin: [
    { iata: "BER", alternative: false },
    { iata: "POZ", alternative: true, hint: "Poznań (~280 km)" },
    { iata: "DRS", alternative: true, hint: "Drezno (~190 km)" },
  ],
  amsterdam: [
    { iata: "AMS", alternative: false },
    { iata: "EIN", alternative: true, hint: "Eindhoven (~125 km)" },
    { iata: "RTM", alternative: true, hint: "Rotterdam (~60 km)" },
  ],
  brussels: [
    { iata: "BRU", alternative: false },
    { iata: "CRL", alternative: true, hint: "Charleroi (~55 km)" },
  ],
  paris: [
    { iata: "PAR", alternative: false, hint: "Wszystkie lotniska Paryża" },
    { iata: "CDG", alternative: true },
    { iata: "ORY", alternative: true },
    { iata: "BVA", alternative: true, hint: "Beauvais" },
  ],
  rome: [
    { iata: "ROM", alternative: false, hint: "Wszystkie lotniska Rzymu" },
    { iata: "FCO", alternative: true },
    { iata: "CIA", alternative: true, hint: "Ciampino" },
  ],
  milan: [
    { iata: "MIL", alternative: false, hint: "Wszystkie lotniska Mediolanu" },
    { iata: "MXP", alternative: true },
    { iata: "LIN", alternative: true },
    { iata: "BGY", alternative: true, hint: "Bergamo (~50 km)" },
  ],
  stockholm: [
    { iata: "STO", alternative: false, hint: "Wszystkie lotniska Sztokholmu" },
    { iata: "ARN", alternative: true },
    { iata: "NYO", alternative: true, hint: "Skavsta" },
  ],
  oslo: [
    { iata: "OSL", alternative: false },
    { iata: "TRF", alternative: true, hint: "Sandefjord Torp" },
  ],
  copenhagen: [
    { iata: "CPH", alternative: false },
    { iata: "MMX", alternative: true, hint: "Malmö (~55 km)" },
  ],
  helsinki: [
    { iata: "HEL", alternative: false },
    { iata: "TLL", alternative: true, hint: "Tallinn (~85 km)" },
  ],
};

// ---- DESTINATION side -----------------------------------------------------
//
// Cluster-coded entries first (LON/ROM/MIL/PAR/NYC/TYO/STO/MOW/BJS) — these
// are Aviasales metro codes that fan out to every airport in the city group
// in a single API call. Then per-city nearby airports for places without a
// metro code (Bergamo ↔ Milan handled via MIL; Verona stands alone).
const DESTINATION_GROUPS: Record<string, AirportCandidate[]> = {
  london: [
    { iata: "LON", alternative: false, hint: "Wszystkie lotniska Londynu" },
    { iata: "LHR", alternative: true },
    { iata: "LGW", alternative: true },
    { iata: "STN", alternative: true },
    { iata: "LTN", alternative: true },
  ],
  paris: [
    { iata: "PAR", alternative: false, hint: "Wszystkie lotniska Paryża" },
    { iata: "CDG", alternative: true },
    { iata: "ORY", alternative: true },
    { iata: "BVA", alternative: true, hint: "Beauvais (~85 km)" },
  ],
  rome: [
    { iata: "ROM", alternative: false, hint: "Wszystkie lotniska Rzymu" },
    { iata: "FCO", alternative: true },
    { iata: "CIA", alternative: true, hint: "Ciampino" },
  ],
  milan: [
    { iata: "MIL", alternative: false, hint: "Wszystkie lotniska Mediolanu" },
    { iata: "MXP", alternative: true },
    { iata: "LIN", alternative: true },
    { iata: "BGY", alternative: true, hint: "Bergamo (~50 km)" },
    { iata: "VRN", alternative: true, hint: "Werona (~155 km)" },
  ],
  "new york": [
    { iata: "NYC", alternative: false, hint: "Wszystkie lotniska NYC" },
    { iata: "JFK", alternative: true },
    { iata: "EWR", alternative: true, hint: "Newark" },
    { iata: "LGA", alternative: true, hint: "LaGuardia" },
  ],
  tokyo: [
    { iata: "TYO", alternative: false, hint: "Wszystkie lotniska Tokio" },
    { iata: "NRT", alternative: true, hint: "Narita" },
    { iata: "HND", alternative: true, hint: "Haneda" },
  ],
  moscow: [
    { iata: "MOW", alternative: false, hint: "Wszystkie lotniska Moskwy" },
    { iata: "SVO", alternative: true },
    { iata: "DME", alternative: true },
    { iata: "VKO", alternative: true },
  ],
  beijing: [
    { iata: "BJS", alternative: false, hint: "Wszystkie lotniska Pekinu" },
    { iata: "PEK", alternative: true },
    { iata: "PKX", alternative: true, hint: "Daxing" },
  ],
  // Singles with nearby alternatives.
  barcelona: [
    { iata: "BCN", alternative: false },
    { iata: "GRO", alternative: true, hint: "Girona (~95 km)" },
    { iata: "REU", alternative: true, hint: "Reus (~100 km)" },
  ],
  valencia: [
    { iata: "VLC", alternative: false },
    { iata: "ALC", alternative: true, hint: "Alicante (~165 km)" },
  ],
  alicante: [
    { iata: "ALC", alternative: false },
    { iata: "MJV", alternative: true, hint: "Murcia (~75 km)" },
    { iata: "VLC", alternative: true, hint: "Walencja (~165 km)" },
  ],
  malaga: [
    { iata: "AGP", alternative: false },
    { iata: "GIB", alternative: true, hint: "Gibraltar (~130 km)" },
    { iata: "SVQ", alternative: true, hint: "Sewilla (~215 km)" },
  ],
  seville: [
    { iata: "SVQ", alternative: false },
    { iata: "AGP", alternative: true, hint: "Malaga (~215 km)" },
  ],
  palma: [
    { iata: "PMI", alternative: false },
    { iata: "IBZ", alternative: true, hint: "Ibiza (~135 km)" },
  ],
  "ibiza town": [
    { iata: "IBZ", alternative: false },
    { iata: "PMI", alternative: true, hint: "Palma (~135 km)" },
  ],
  lisbon: [
    { iata: "LIS", alternative: false },
    { iata: "OPO", alternative: true, hint: "Porto (~315 km)" },
  ],
  porto: [
    { iata: "OPO", alternative: false },
    { iata: "LIS", alternative: true, hint: "Lizbona (~315 km)" },
  ],
  naples: [
    { iata: "NAP", alternative: false },
    { iata: "ROM", alternative: true, hint: "Rzym (~225 km)" },
    { iata: "BRI", alternative: true, hint: "Bari (~260 km)" },
  ],
  venice: [
    { iata: "VCE", alternative: false },
    { iata: "TSF", alternative: true, hint: "Treviso (~30 km)" },
    { iata: "VRN", alternative: true, hint: "Werona (~120 km)" },
  ],
  florence: [
    { iata: "FLR", alternative: false },
    { iata: "PSA", alternative: true, hint: "Piza (~85 km)" },
    { iata: "BLQ", alternative: true, hint: "Bolonia (~115 km)" },
  ],
  pisa: [
    { iata: "PSA", alternative: false },
    { iata: "FLR", alternative: true, hint: "Florencja (~85 km)" },
  ],
  bologna: [
    { iata: "BLQ", alternative: false },
    { iata: "FLR", alternative: true, hint: "Florencja (~115 km)" },
    { iata: "VRN", alternative: true, hint: "Werona (~145 km)" },
  ],
  nice: [
    { iata: "NCE", alternative: false },
    { iata: "MRS", alternative: true, hint: "Marsylia (~200 km)" },
  ],
  marseille: [
    { iata: "MRS", alternative: false },
    { iata: "NCE", alternative: true, hint: "Nicea (~200 km)" },
    { iata: "MPL", alternative: true, hint: "Montpellier (~140 km)" },
  ],
  athens: [{ iata: "ATH", alternative: false }],
  thessaloniki: [{ iata: "SKG", alternative: false }],
  zurich: [
    { iata: "ZRH", alternative: false },
    { iata: "BSL", alternative: true, hint: "Bazylea (~85 km)" },
  ],
  geneva: [
    { iata: "GVA", alternative: false },
    { iata: "LYS", alternative: true, hint: "Lyon (~150 km)" },
  ],
  vienna: [
    { iata: "VIE", alternative: false },
    { iata: "BTS", alternative: true, hint: "Bratysława (~80 km)" },
    { iata: "BRQ", alternative: true, hint: "Brno (~140 km)" },
  ],
  prague: [
    { iata: "PRG", alternative: false },
    { iata: "BRQ", alternative: true, hint: "Brno (~210 km)" },
    { iata: "DRS", alternative: true, hint: "Drezno (~150 km)" },
  ],
  budapest: [
    { iata: "BUD", alternative: false },
    { iata: "BTS", alternative: true, hint: "Bratysława (~200 km)" },
  ],
  munich: [
    { iata: "MUC", alternative: false },
    { iata: "MMH", alternative: true, hint: "Memmingen (~115 km)" },
    { iata: "SZG", alternative: true, hint: "Salzburg (~145 km)" },
  ],
  berlin: [
    { iata: "BER", alternative: false },
    { iata: "DRS", alternative: true, hint: "Drezno (~190 km)" },
  ],
  hamburg: [{ iata: "HAM", alternative: false }],
  frankfurt: [
    { iata: "FRA", alternative: false },
    { iata: "HHN", alternative: true, hint: "Hahn (~110 km)" },
    { iata: "MUC", alternative: true, hint: "Monachium (~390 km)" },
  ],
  amsterdam: [
    { iata: "AMS", alternative: false },
    { iata: "EIN", alternative: true, hint: "Eindhoven (~125 km)" },
    { iata: "RTM", alternative: true, hint: "Rotterdam (~60 km)" },
  ],
  brussels: [
    { iata: "BRU", alternative: false },
    { iata: "CRL", alternative: true, hint: "Charleroi (~55 km)" },
  ],
  dublin: [
    { iata: "DUB", alternative: false },
    { iata: "BFS", alternative: true, hint: "Belfast (~165 km)" },
    { iata: "SNN", alternative: true, hint: "Shannon (~215 km)" },
  ],
  manchester: [
    { iata: "MAN", alternative: false },
    { iata: "LPL", alternative: true, hint: "Liverpool (~55 km)" },
  ],
  edinburgh: [
    { iata: "EDI", alternative: false },
    { iata: "GLA", alternative: true, hint: "Glasgow (~75 km)" },
  ],
  glasgow: [
    { iata: "GLA", alternative: false },
    { iata: "EDI", alternative: true, hint: "Edynburg (~75 km)" },
  ],
  istanbul: [
    { iata: "IST", alternative: false },
    { iata: "SAW", alternative: true, hint: "Sabiha Gökçen" },
  ],
  antalya: [
    { iata: "AYT", alternative: false },
    { iata: "GZP", alternative: true, hint: "Gazipaşa (~135 km)" },
  ],
  bodrum: [
    { iata: "BJV", alternative: false },
    { iata: "ADB", alternative: true, hint: "Izmir (~260 km)" },
  ],
  marrakesh: [
    { iata: "RAK", alternative: false },
    { iata: "AGA", alternative: true, hint: "Agadir (~250 km)" },
    { iata: "CMN", alternative: true, hint: "Casablanca (~245 km)" },
  ],
  cairo: [{ iata: "CAI", alternative: false }],
  // Canaries / Madeira archipelagos.
  "las palmas": [
    { iata: "LPA", alternative: false },
    { iata: "TFS", alternative: true, hint: "Teneryfa (~120 km)" },
    { iata: "FUE", alternative: true, hint: "Fuerteventura (~145 km)" },
  ],
  "santa cruz de tenerife": [
    { iata: "TFS", alternative: false },
    { iata: "LPA", alternative: true, hint: "Las Palmas (~120 km)" },
    { iata: "ACE", alternative: true, hint: "Lanzarote (~245 km)" },
  ],
  funchal: [
    { iata: "FNC", alternative: false },
    { iata: "PXO", alternative: true, hint: "Porto Santo (~50 km)" },
  ],
  // Adriatic.
  split: [
    { iata: "SPU", alternative: false },
    { iata: "ZAD", alternative: true, hint: "Zadar (~115 km)" },
    { iata: "DBV", alternative: true, hint: "Dubrownik (~225 km)" },
  ],
  dubrovnik: [
    { iata: "DBV", alternative: false },
    { iata: "TIV", alternative: true, hint: "Tivat (~80 km)" },
    { iata: "SPU", alternative: true, hint: "Split (~225 km)" },
  ],
  tirana: [
    { iata: "TIA", alternative: false },
    { iata: "OHD", alternative: true, hint: "Ohrid (~90 km)" },
  ],
  // Long-haul.
  bangkok: [
    { iata: "BKK", alternative: false },
    { iata: "DMK", alternative: true, hint: "Don Mueang" },
  ],
  phuket: [
    { iata: "HKT", alternative: false },
    { iata: "KBV", alternative: true, hint: "Krabi (~135 km)" },
  ],
  dubai: [
    { iata: "DXB", alternative: false },
    { iata: "DWC", alternative: true, hint: "Al Maktoum" },
    { iata: "AUH", alternative: true, hint: "Abu Zabi (~145 km)" },
  ],
};

// Polish exonyms → canonical English city key. We don't try to be exhaustive;
// the most-typed Polish names map back so users on /hotele/szukaj?destination=
// Lizbona still resolve to the Lisbon airport cluster. Anything not listed
// falls through to `resolveAirportCode` which already handles single-airport
// lookups.
const POLISH_TO_ENGLISH_CITY: Record<string, string> = {
  lizbona: "lisbon",
  mediolan: "milan",
  rzym: "rome",
  paryz: "paris",
  londyn: "london",
  neapol: "naples",
  wenecja: "venice",
  florencja: "florence",
  piza: "pisa",
  bolonia: "bologna",
  nicea: "nice",
  marsylia: "marseille",
  ateny: "athens",
  saloniki: "thessaloniki",
  zurych: "zurich",
  genewa: "geneva",
  wieden: "vienna",
  praga: "prague",
  budapeszt: "budapest",
  monachium: "munich",
  walencja: "valencia",
  sewilla: "seville",
  "nowy jork": "new york",
  tokio: "tokyo",
  pekin: "beijing",
  moskwa: "moscow",
  sztokholm: "stockholm",
  kopenhaga: "copenhagen",
  dubaj: "dubai",
  stambul: "istanbul",
  marrakesz: "marrakesh",
  kair: "cairo",
  dubrownik: "dubrovnik",
  bruksela: "brussels",
  teneryfa: "santa cruz de tenerife",
  warszawa: "warsaw",
  krakow: "krakow",
  gdansk: "gdansk",
  wroclaw: "wroclaw",
  poznan: "poznan",
  lodz: "lodz",
  rzeszow: "rzeszow",
};

function lookup(
  map: Record<string, AirportCandidate[]>,
  cityInput: string,
): AirportCandidate[] | undefined {
  const key = normalizeLookup(cityInput);
  if (!key) return undefined;
  if (map[key]) return map[key];

  // Comma-separated input ("Lisbon, Portugal") — try just the city part.
  const firstToken = key.split(" ")[0];
  if (firstToken && map[firstToken]) return map[firstToken];

  const englishKey = POLISH_TO_ENGLISH_CITY[key] ?? POLISH_TO_ENGLISH_CITY[firstToken];
  if (englishKey && map[englishKey]) return map[englishKey];

  return undefined;
}

export function getOriginAirports(cityInput: string): AirportCandidate[] {
  const direct = lookup(ORIGIN_GROUPS, cityInput);
  if (direct && direct.length > 0) return direct;
  const iata = resolveAirportCode(cityInput);
  return iata ? [{ iata, alternative: false }] : [];
}

export function getDestinationAirports(cityInput: string): AirportCandidate[] {
  const direct = lookup(DESTINATION_GROUPS, cityInput);
  if (direct && direct.length > 0) return direct;
  const iata = resolveAirportCode(cityInput);
  return iata ? [{ iata, alternative: false }] : [];
}
