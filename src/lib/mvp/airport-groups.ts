// Sąsiedzkie lotniska dla wyszukiwania lotów. Gdy primary IATA nie ma ofert,
// próbujemy pobliskie/grupowe kody (np. Bergamo dla Mediolanu, KTW dla Warszawy).
//
// Kody "metro" (LON/ROM/MIL/PAR/NYC/TYO/STO/BJS) Aviasales rozpoznaje jako grupy,
// więc dla nich primary może być metro-kodem, a nie pojedynczym lotniskiem.

import { normalizeLookup, resolveAirportCode } from "./location";

interface AirportCandidate {
  iata: string;
  // Czy to faktyczna alternatywa (inne miasto/lotnisko niż wpisał user)?
  alternative: boolean;
  // Czytelne info dla UI/loga (np. "Kraków - 295 km od Warszawy").
  hint?: string;
}

const ORIGIN_GROUPS: Record<string, AirportCandidate[]> = {
  warsaw: [
    { iata: "WAW", alternative: false },
    { iata: "WMI", alternative: true, hint: "Warszawa Modlin" },
    { iata: "LCJ", alternative: true, hint: "Łódź (~135 km)" },
    { iata: "POZ", alternative: true, hint: "Poznań (~300 km)" },
    { iata: "GDN", alternative: true, hint: "Gdańsk (~330 km)" },
    { iata: "KTW", alternative: true, hint: "Katowice (~290 km)" },
    { iata: "KRK", alternative: true, hint: "Kraków (~295 km)" },
  ],
  krakow: [
    { iata: "KRK", alternative: false },
    { iata: "KTW", alternative: true, hint: "Katowice (~80 km)" },
    { iata: "RZE", alternative: true, hint: "Rzeszów (~165 km)" },
    { iata: "WAW", alternative: true, hint: "Warszawa (~295 km)" },
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
    { iata: "PRG", alternative: true, hint: "Praga (~270 km)" },
  ],
  poznan: [
    { iata: "POZ", alternative: false },
    { iata: "WRO", alternative: true, hint: "Wrocław (~170 km)" },
    { iata: "BER", alternative: true, hint: "Berlin (~280 km)" },
    { iata: "WAW", alternative: true, hint: "Warszawa (~300 km)" },
  ],
  gdansk: [
    { iata: "GDN", alternative: false },
    { iata: "BZG", alternative: true, hint: "Bydgoszcz (~165 km)" },
    { iata: "SZZ", alternative: true, hint: "Szczecin (~330 km)" },
    { iata: "WAW", alternative: true, hint: "Warszawa (~330 km)" },
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
  // Europa - polska diaspora.
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
    { iata: "PRG", alternative: true, hint: "Praga (~280 km)" },
  ],
  amsterdam: [
    { iata: "AMS", alternative: false },
    { iata: "EIN", alternative: true, hint: "Eindhoven (~125 km)" },
    { iata: "RTM", alternative: true, hint: "Rotterdam (~60 km)" },
    { iata: "BRU", alternative: true, hint: "Bruksela (~200 km)" },
  ],
  brussels: [
    { iata: "BRU", alternative: false },
    { iata: "CRL", alternative: true, hint: "Charleroi (~55 km)" },
    { iata: "AMS", alternative: true, hint: "Amsterdam (~200 km)" },
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
  reykjavik: [
    { iata: "KEF", alternative: false },
    { iata: "RKV", alternative: true, hint: "Reykjavik Domestic" },
  ],
};

const DESTINATION_GROUPS: Record<string, AirportCandidate[]> = {
  // Wielkie aglomeracje - kody metro zwracają oferty z wszystkich lotnisk.
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
  // Pojedyncze miasta z bliskimi alternatywami.
  barcelona: [
    { iata: "BCN", alternative: false },
    { iata: "GRO", alternative: true, hint: "Girona (~95 km)" },
    { iata: "REU", alternative: true, hint: "Reus (~100 km)" },
  ],
  madrid: [
    { iata: "MAD", alternative: false },
    { iata: "VLL", alternative: true, hint: "Valladolid (~200 km)" },
  ],
  valencia: [
    { iata: "VLC", alternative: false },
    { iata: "ALC", alternative: true, hint: "Alicante (~165 km)" },
    { iata: "BCN", alternative: true, hint: "Barcelona (~350 km)" },
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
  bilbao: [
    { iata: "BIO", alternative: false },
    { iata: "SDR", alternative: true, hint: "Santander (~95 km)" },
  ],
  palma: [
    { iata: "PMI", alternative: false },
    { iata: "IBZ", alternative: true, hint: "Ibiza (~135 km)" },
  ],
  ibiza: [
    { iata: "IBZ", alternative: false },
    { iata: "PMI", alternative: true, hint: "Palma (~135 km)" },
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
  cannes: [
    { iata: "NCE", alternative: false, hint: "Nicea (~30 km)" },
  ],
  athens: [
    { iata: "ATH", alternative: false },
  ],
  thessaloniki: [
    { iata: "SKG", alternative: false },
  ],
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
  hamburg: [
    { iata: "HAM", alternative: false },
    { iata: "HHN", alternative: true, hint: "Hahn (~600 km)" },
  ],
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
  // Wakacyjne kierunki z bliskimi sąsiadami.
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
  cairo: [
    { iata: "CAI", alternative: false },
  ],
  // Kanary i Madera - blisko, ale loty osobne.
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
  // Bałkany.
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
  // Daleko - tylko ważniejsze dublety.
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

function lookup(map: Record<string, AirportCandidate[]>, cityInput: string): AirportCandidate[] | undefined {
  const key = normalizeLookup(cityInput);
  if (!key) return undefined;
  if (map[key]) return map[key];

  // Spróbuj rozbić po pierwszym tokenie - np. "Lizbona, Portugalia" → "lizbona".
  const firstToken = key.split(" ")[0];
  if (firstToken && map[firstToken]) return map[firstToken];

  // Czasem polska nazwa może trafić - prosty fallback:
  const polishToEnglish: Record<string, string> = {
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
    wiedeń: "vienna",
    wieden: "vienna",
    praga: "prague",
    budapeszt: "budapest",
    monachium: "munich",
    kolonia: "cologne",
    drezno: "berlin",
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
    stambuł: "istanbul",
    marrakesz: "marrakesh",
    kair: "cairo",
    dubrownik: "dubrovnik",
    bruksela: "brussels",
    bukareszt: "bucharest",
    teneryfa: "santa cruz de tenerife",
    "las palmas": "las palmas",
    warszawa: "warsaw",
    kraków: "krakow",
    krakow: "krakow",
    gdańsk: "gdansk",
    gdansk: "gdansk",
    wrocław: "wroclaw",
    wroclaw: "wroclaw",
    poznań: "poznan",
    poznan: "poznan",
    "łódź": "lodz",
    lodz: "lodz",
    szczecin: "szczecin",
    rzeszów: "rzeszow",
    rzeszow: "rzeszow",
    lublin: "lublin",
  };
  const en = polishToEnglish[key] ?? polishToEnglish[firstToken];
  if (en && map[en]) return map[en];

  return undefined;
}

export function getOriginAirports(cityInput: string): AirportCandidate[] {
  const direct = lookup(ORIGIN_GROUPS, cityInput);
  if (direct && direct.length > 0) return direct;
  // Fallback: jedno lotnisko via resolveAirportCode.
  const iata = resolveAirportCode(cityInput);
  return iata ? [{ iata, alternative: false }] : [];
}

export function getDestinationAirports(cityInput: string): AirportCandidate[] {
  const direct = lookup(DESTINATION_GROUPS, cityInput);
  if (direct && direct.length > 0) return direct;
  const iata = resolveAirportCode(cityInput);
  return iata ? [{ iata, alternative: false }] : [];
}

export type { AirportCandidate };
