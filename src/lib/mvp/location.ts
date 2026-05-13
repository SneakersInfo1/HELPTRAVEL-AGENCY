const countryCodes: Record<string, string> = {
  spain: "ES",
  portugal: "PT",
  italy: "IT",
  greece: "GR",
  cyprus: "CY",
  malta: "MT",
  albania: "AL",
  turkey: "TR",
  morocco: "MA",
  hungary: "HU",
  czechia: "CZ",
  germany: "DE",
  netherlands: "NL",
  ireland: "IE",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
};

// City → primary IATA. Covers every city seeded in `destination-catalog.ts`
// plus common Polish exonyms ("lizbona", "mediolan") so URLs round-trip
// even when something Polish leaks in. The map is normalized-key only —
// callers should pass already-normalized strings or rely on
// `resolveAirportCode` to do the normalization for them.
//
// Each entry should match what Aviasales/Travelpayouts knows: where a city
// has multiple airports we use the metro/cluster code (LON/PAR/ROM/MIL/
// NYC/TYO) so a single API call returns flights to every airport. The
// fanout in `airport-groups.ts` knows how to expand these where finer
// control matters.
const airportCodesByKey: Record<string, string> = {
  // ---- Poland (canonical + Polish exonyms) ------------------------------
  warsaw: "WAW",
  warszawa: "WAW",
  krakow: "KRK",
  "krakow poland": "KRK",
  cracow: "KRK",
  gdansk: "GDN",
  wroclaw: "WRO",
  poznan: "POZ",
  katowice: "KTW",
  rzeszow: "RZE",
  lublin: "LUZ",
  lodz: "LCJ",
  szczecin: "SZZ",
  bydgoszcz: "BZG",

  // ---- Iberia -----------------------------------------------------------
  lisbon: "LIS",
  lisboa: "LIS",
  lizbona: "LIS",
  porto: "OPO",
  oporto: "OPO",
  faro: "FAO",
  funchal: "FNC",
  "ponta delgada": "PDL",
  coimbra: "OPO",
  braga: "OPO",
  madrid: "MAD",
  madryt: "MAD",
  barcelona: "BCN",
  valencia: "VLC",
  walencja: "VLC",
  seville: "SVQ",
  sewilla: "SVQ",
  malaga: "AGP",
  alicante: "ALC",
  palma: "PMI",
  "palma de mallorca": "PMI",
  "las palmas": "LPA",
  "ibiza town": "IBZ",
  ibiza: "IBZ",
  bilbao: "BIO",
  granada: "GRX",
  "san sebastian": "EAS",
  cordoba: "ODB",
  kordoba: "ODB",
  "santa cruz de tenerife": "TFS",
  tenerife: "TFS",
  teneryfa: "TFS",
  arrecife: "ACE",
  lanzarote: "ACE",
  fuerteventura: "FUE",

  // ---- Italy ------------------------------------------------------------
  rome: "ROM",
  roma: "ROM",
  rzym: "ROM",
  naples: "NAP",
  neapol: "NAP",
  milan: "MIL",
  milano: "MIL",
  mediolan: "MIL",
  venice: "VCE",
  venezia: "VCE",
  wenecja: "VCE",
  florence: "FLR",
  firenze: "FLR",
  florencja: "FLR",
  turin: "TRN",
  turyn: "TRN",
  bologna: "BLQ",
  bolonia: "BLQ",
  verona: "VRN",
  werona: "VRN",
  pisa: "PSA",
  piza: "PSA",
  genoa: "GOA",
  genua: "GOA",
  palermo: "PMO",
  catania: "CTA",
  katania: "CTA",
  bari: "BRI",
  cagliari: "CAG",
  olbia: "OLB",

  // ---- France -----------------------------------------------------------
  paris: "PAR",
  paryz: "PAR",
  nice: "NCE",
  nicea: "NCE",
  cannes: "NCE",
  marseille: "MRS",
  marsylia: "MRS",
  lyon: "LYS",
  bordeaux: "BOD",
  toulouse: "TLS",
  tuluza: "TLS",
  strasbourg: "SXB",
  strasburg: "SXB",
  nantes: "NTE",
  lille: "LIL",
  montpellier: "MPL",

  // ---- Greece + Cyprus + Malta ------------------------------------------
  athens: "ATH",
  ateny: "ATH",
  thessaloniki: "SKG",
  saloniki: "SKG",
  heraklion: "HER",
  chania: "CHQ",
  corfu: "CFU",
  korfu: "CFU",
  rhodes: "RHO",
  rodos: "RHO",
  fira: "JTR",
  santorini: "JTR",
  "mykonos town": "JMK",
  mykonos: "JMK",
  zakynthos: "ZTH",
  kos: "KGS",
  larnaca: "LCA",
  larnaka: "LCA",
  paphos: "PFO",
  pafos: "PFO",
  nicosia: "LCA",
  nikozja: "LCA",
  limassol: "LCA",
  valletta: "MLA",
  sliema: "MLA",
  "st julian s": "MLA",
  "st julians": "MLA",
  "saint julians": "MLA",

  // ---- Turkey -----------------------------------------------------------
  istanbul: "IST",
  stambul: "IST",
  antalya: "AYT",
  izmir: "ADB",
  bodrum: "BJV",
  ankara: "ESB",
  dalaman: "DLM",
  goreme: "NAV",
  trabzon: "TZX",

  // ---- North Africa -----------------------------------------------------
  marrakesh: "RAK",
  marrakech: "RAK",
  marrakesz: "RAK",
  agadir: "AGA",
  casablanca: "CMN",
  fez: "FEZ",
  tangier: "TNG",
  tanger: "TNG",
  rabat: "RBA",
  cairo: "CAI",
  kair: "CAI",
  hurghada: "HRG",
  "sharm el sheikh": "SSH",
  alexandria: "HBE",
  aleksandria: "HBE",
  luxor: "LXR",
  luksor: "LXR",
  tunis: "TUN",
  hammamet: "NBE",
  sousse: "NBE",
  susa: "NBE",
  djerba: "DJE",

  // ---- Balkans + Adriatic ----------------------------------------------
  tirana: "TIA",
  sarande: "TIA",
  vlore: "TIA",
  wlora: "TIA",
  split: "SPU",
  dubrovnik: "DBV",
  dubrownik: "DBV",
  zagreb: "ZAG",
  zagrzeb: "ZAG",
  zadar: "ZAD",
  pula: "PUY",
  rijeka: "RJK",
  kotor: "TIV",
  budva: "TIV",
  tivat: "TIV",
  podgorica: "TGD",
  ljubljana: "LJU",
  lublana: "LJU",
  bled: "LJU",
  piran: "LJU",
  belgrade: "BEG",
  belgrad: "BEG",
  sarajevo: "SJJ",
  sarajewo: "SJJ",
  skopje: "SKP",
  sofia: "SOF",
  bucharest: "OTP",
  bukareszt: "OTP",
  "cluj napoca": "CLJ",

  // ---- Central + Alpine Europe -----------------------------------------
  vienna: "VIE",
  wieden: "VIE",
  salzburg: "SZG",
  innsbruck: "INN",
  graz: "GRZ",
  zurich: "ZRH",
  zurych: "ZRH",
  geneva: "GVA",
  genewa: "GVA",
  lucerne: "ZRH",
  lucerna: "ZRH",
  basel: "BSL",
  bazylea: "BSL",

  // ---- DE / NL / BE ----------------------------------------------------
  berlin: "BER",
  munich: "MUC",
  monachium: "MUC",
  hamburg: "HAM",
  cologne: "CGN",
  kolonia: "CGN",
  frankfurt: "FRA",
  dusseldorf: "DUS",
  dresden: "DRS",
  drezno: "DRS",
  nuremberg: "NUE",
  norymberga: "NUE",
  amsterdam: "AMS",
  rotterdam: "RTM",
  "the hague": "RTM",
  haga: "RTM",
  utrecht: "AMS",
  eindhoven: "EIN",
  brussels: "BRU",
  bruksela: "BRU",
  bruges: "BRU",
  brugia: "BRU",
  antwerp: "ANR",
  antwerpia: "ANR",
  ghent: "BRU",
  gandawa: "BRU",

  // ---- British Isles ---------------------------------------------------
  london: "LON",
  londyn: "LON",
  edinburgh: "EDI",
  edynburg: "EDI",
  manchester: "MAN",
  liverpool: "LPL",
  glasgow: "GLA",
  birmingham: "BHX",
  bristol: "BRS",
  belfast: "BFS",
  dublin: "DUB",
  cork: "ORK",
  galway: "NOC",
  killarney: "KIR",

  // ---- Hungary + Czechia ----------------------------------------------
  budapest: "BUD",
  budapeszt: "BUD",
  debrecen: "DEB",
  debreczyn: "DEB",
  prague: "PRG",
  praga: "PRG",
  brno: "BRQ",

  // ---- Nordics + Baltics ----------------------------------------------
  copenhagen: "CPH",
  kopenhaga: "CPH",
  aarhus: "AAR",
  stockholm: "STO",
  sztokholm: "STO",
  gothenburg: "GOT",
  goteborg: "GOT",
  malmo: "MMX",
  oslo: "OSL",
  bergen: "BGO",
  helsinki: "HEL",
  reykjavik: "KEF",
  riga: "RIX",
  ryga: "RIX",
  vilnius: "VNO",
  wilno: "VNO",
  tallinn: "TLL",
  tallin: "TLL",
  kaunas: "KUN",
  kowno: "KUN",

  // ---- Middle East -----------------------------------------------------
  dubai: "DXB",
  dubaj: "DXB",
  "abu dhabi": "AUH",
  "abu zabi": "AUH",
  doha: "DOH",
  "ad dauha": "DOH",
  muscat: "MCT",
  maskat: "MCT",
  "tel aviv": "TLV",
  "tel awiw": "TLV",
  jerusalem: "TLV",
  jerozolima: "TLV",
  amman: "AMM",
  riyadh: "RUH",
  rijad: "RUH",

  // ---- Asia ------------------------------------------------------------
  bangkok: "BKK",
  phuket: "HKT",
  krabi: "KBV",
  "chiang mai": "CNX",
  "koh samui": "USM",
  singapore: "SIN",
  singapur: "SIN",
  "kuala lumpur": "KUL",
  penang: "PEN",
  denpasar: "DPS",
  bali: "DPS",
  jakarta: "CGK",
  dzakarta: "CGK",
  hanoi: "HAN",
  "ho chi minh city": "SGN",
  "ho chi minh": "SGN",
  "da nang": "DAD",
  tokyo: "TYO",
  tokio: "TYO",
  osaka: "KIX",
  kyoto: "KIX",
  kioto: "KIX",
  seoul: "ICN",
  seul: "ICN",
  busan: "PUS",
  "hong kong": "HKG",
  hongkong: "HKG",
  taipei: "TPE",
  tajpej: "TPE",
  colombo: "CMB",
  kolombo: "CMB",
  male: "MLE",
  malediwy: "MLE",
  goa: "GOI",
  delhi: "DEL",
  mumbai: "BOM",
  mumbaj: "BOM",
  beijing: "BJS",
  pekin: "BJS",
  shanghai: "PVG",
  szanghaj: "PVG",

  // ---- Americas --------------------------------------------------------
  "new york": "NYC",
  "nowy jork": "NYC",
  nyc: "NYC",
  "los angeles": "LAX",
  // NOTE: "la" alias removed — `resolveAirportCode` ends its fallback chain
  // with substring-includes, so a 2-char alias matched ANY city containing
  // "la" as a substring (Abbadia Lariana, San Lawrenz, Los Gigantes all
  // resolved to LAX in the C2 seed harvest). City code "LA" alone is
  // ambiguous; require the full name.
  "san francisco": "SFO",
  miami: "MIA",
  "las vegas": "LAS",
  vegas: "LAS",
  chicago: "ORD",
  boston: "BOS",
  washington: "WAS",
  waszyngton: "WAS",
  orlando: "MCO",
  seattle: "SEA",
  toronto: "YTO",
  vancouver: "YVR",
  montreal: "YMQ",
  cancun: "CUN",
  "mexico city": "MEX",
  meksyk: "MEX",
  "playa del carmen": "CUN",
  "punta cana": "PUJ",
  "san juan": "SJU",
  "rio de janeiro": "RIO",
  rio: "RIO",
  "sao paulo": "SAO",
  "buenos aires": "BUE",
  lima: "LIM",
  santiago: "SCL",
  "santiago de chile": "SCL",
  bogota: "BOG",

  // ---- Africa + Oceania -----------------------------------------------
  "cape town": "CPT",
  kapsztad: "CPT",
  johannesburg: "JNB",
  "stone town": "ZNZ",
  zanzibar: "ZNZ",
  nairobi: "NBO",
  "port louis": "MRU",
  mauritius: "MRU",
  sydney: "SYD",
  melbourne: "MEL",
  auckland: "AKL",
  queenstown: "ZQN",
};

export function normalizeLookup(value: string): string {
  return value
    .replace(/[ąĄ]/g, "a")
    .replace(/[ćĆ]/g, "c")
    .replace(/[ęĘ]/g, "e")
    .replace(/[łŁ]/g, "l")
    .replace(/[ńŃ]/g, "n")
    .replace(/[óÓ]/g, "o")
    .replace(/[śŚ]/g, "s")
    .replace(/[źŹżŻ]/g, "z")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveCountryCode(country?: string): string | undefined {
  if (!country) return undefined;
  const normalized = normalizeLookup(country);
  return countryCodes[normalized];
}

export function resolveAirportCode(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const normalized = normalizeLookup(trimmed);
  if (airportCodesByKey[normalized]) {
    return airportCodesByKey[normalized];
  }

  // Token-prefix matching is safe (each token is a whole city name like
  // "lisbon" or "los angeles"). We try the full normalized string against
  // the longest-possible multi-token aliases first by scanning the key set
  // for substring matches that BEGIN OR END the normalized input — that's
  // strict enough to avoid the historical `la` → LAX false-positive (where
  // any city containing "la" as a substring matched LA), but still resolves
  // "Lisbon, Portugal" → "lisbon" → LIS.
  const tokens = normalized.split(" ").filter(Boolean);
  for (const token of tokens) {
    if (airportCodesByKey[token]) {
      return airportCodesByKey[token];
    }
  }

  // Multi-token alias check: try every prefix of the normalized string
  // ("los angeles" matches the key "los angeles"; "los gigantes" does NOT).
  // This keeps the multi-word aliases ("new york", "ho chi minh city")
  // working without the dangerous substring-includes fallback.
  for (let i = tokens.length; i >= 2; i -= 1) {
    const prefix = tokens.slice(0, i).join(" ");
    if (airportCodesByKey[prefix]) return airportCodesByKey[prefix];
    const suffix = tokens.slice(-i).join(" ");
    if (airportCodesByKey[suffix]) return airportCodesByKey[suffix];
  }

  return undefined;
}

