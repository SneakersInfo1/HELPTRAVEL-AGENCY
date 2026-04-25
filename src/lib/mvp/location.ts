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

const airportCodesByKey: Record<string, string> = {
  warsaw: "WAW",
  warszawa: "WAW",
  krakow: "KRK",
  gdansk: "GDN",
  wróćlaw: "WRO",
  poznan: "POZ",
  katowice: "KTW",
  rzeszow: "RZE",
  lublin: "LUZ",
  lodz: "LCJ",
  szczecin: "SZZ",
  bydgoszcz: "BZG",
  lisbon: "LIS",
  lisboa: "LIS",
  barcelona: "BCN",
  valencia: "VLC",
  malaga: "AGP",
  rome: "FCO",
  roma: "FCO",
  naples: "NAP",
  athens: "ATH",
  larnaca: "LCA",
  valletta: "MLA",
  tirana: "TIA",
  istanbul: "IST",
  antalya: "AYT",
  marrakesh: "RAK",
  marrakech: "RAK",
  agadir: "AGA",
  budapest: "BUD",
  prague: "PRG",
  berlin: "BER",
  amsterdam: "AMS",
  dublin: "DUB",
  london: "LHR",
  "las palmas": "LPA",
  funchal: "FNC",
};

export function normalizeLookup(value: string): string {
  return value
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

  for (const token of normalized.split(" ")) {
    if (airportCodesByKey[token]) {
      return airportCodesByKey[token];
    }
  }

  const match = Object.entries(airportCodesByKey).find(([key]) => normalized.includes(key));
  return match?.[1];
}

