// Polish localization for country and region names. Sesja C1 FIX 3.
//
// Used by the autocomplete dropdown, sticky search bar, popular-destination
// chips, breadcrumbs, and metadata. The DestinationSuggestion / catalog
// records carry English country names (canonical ISO source); we localise
// at the UI boundary rather than duplicating Polish columns in the data.
//
// Lookup order in `localizeCountry(input)`:
//   1. ISO-2 code (e.g. "DE")
//   2. canonical English name (e.g. "Germany")
//   3. fallback: input unchanged
//
// `localizeRegion(input)` does the same for the broad regions our catalog
// uses ("Central Europe", "Nordics", etc.).

export const COUNTRY_PL: Record<string, string> = {
  // Western & Central Europe
  Germany: "Niemcy", DE: "Niemcy",
  France: "Francja", FR: "Francja",
  Netherlands: "Holandia", NL: "Holandia",
  Belgium: "Belgia", BE: "Belgia",
  Austria: "Austria", AT: "Austria",
  Switzerland: "Szwajcaria", CH: "Szwajcaria",
  Luxembourg: "Luksemburg", LU: "Luksemburg",
  Liechtenstein: "Liechtenstein", LI: "Liechtenstein",

  // Southern Europe
  Spain: "Hiszpania", ES: "Hiszpania",
  Portugal: "Portugalia", PT: "Portugalia",
  Italy: "Włochy", IT: "Włochy",
  Greece: "Grecja", GR: "Grecja",
  Malta: "Malta", MT: "Malta",
  Cyprus: "Cypr", CY: "Cypr",
  Croatia: "Chorwacja", HR: "Chorwacja",
  Slovenia: "Słowenia", SI: "Słowenia",
  Albania: "Albania", AL: "Albania",
  "Bosnia and Herzegovina": "Bośnia i Hercegowina", BA: "Bośnia i Hercegowina",
  Montenegro: "Czarnogóra", ME: "Czarnogóra",
  "North Macedonia": "Macedonia Północna", MK: "Macedonia Północna",
  Kosovo: "Kosowo", XK: "Kosowo",
  Serbia: "Serbia", RS: "Serbia",
  Andorra: "Andora", AD: "Andora",
  Monaco: "Monako", MC: "Monako",
  "San Marino": "San Marino", SM: "San Marino",
  "Vatican City": "Watykan", VA: "Watykan",

  // Central & Eastern Europe
  Poland: "Polska", PL: "Polska",
  Czech: "Czechy", Czechia: "Czechy", CZ: "Czechy",
  Slovakia: "Słowacja", SK: "Słowacja",
  Hungary: "Węgry", HU: "Węgry",
  Romania: "Rumunia", RO: "Rumunia",
  Bulgaria: "Bułgaria", BG: "Bułgaria",
  Moldova: "Mołdawia", MD: "Mołdawia",
  Ukraine: "Ukraina", UA: "Ukraina",
  Belarus: "Białoruś", BY: "Białoruś",
  Russia: "Rosja", RU: "Rosja",

  // Baltics & Nordics
  Estonia: "Estonia", EE: "Estonia",
  Latvia: "Łotwa", LV: "Łotwa",
  Lithuania: "Litwa", LT: "Litwa",
  Finland: "Finlandia", FI: "Finlandia",
  Sweden: "Szwecja", SE: "Szwecja",
  Norway: "Norwegia", NO: "Norwegia",
  Denmark: "Dania", DK: "Dania",
  Iceland: "Islandia", IS: "Islandia",
  "Faroe Islands": "Wyspy Owcze", FO: "Wyspy Owcze",

  // British Isles
  "United Kingdom": "Wielka Brytania", GB: "Wielka Brytania", UK: "Wielka Brytania",
  Ireland: "Irlandia", IE: "Irlandia",

  // Middle East & North Africa
  Turkey: "Turcja", TR: "Turcja",
  Israel: "Izrael", IL: "Izrael",
  Jordan: "Jordania", JO: "Jordania",
  "United Arab Emirates": "Zjednoczone Emiraty Arabskie", AE: "Zjednoczone Emiraty Arabskie", UAE: "Zjednoczone Emiraty Arabskie",
  "Saudi Arabia": "Arabia Saudyjska", SA: "Arabia Saudyjska",
  Qatar: "Katar", QA: "Katar",
  Bahrain: "Bahrajn", BH: "Bahrajn",
  Oman: "Oman", OM: "Oman",
  Kuwait: "Kuwejt", KW: "Kuwejt",
  Lebanon: "Liban", LB: "Liban",
  Egypt: "Egipt", EG: "Egipt",
  Morocco: "Maroko", MA: "Maroko",
  Tunisia: "Tunezja", TN: "Tunezja",
  Algeria: "Algieria", DZ: "Algieria",
  Libya: "Libia", LY: "Libia",

  // Sub-Saharan & East Africa (popular outbound)
  "South Africa": "Republika Południowej Afryki", ZA: "Republika Południowej Afryki",
  Kenya: "Kenia", KE: "Kenia",
  Tanzania: "Tanzania", TZ: "Tanzania",
  Mauritius: "Mauritius", MU: "Mauritius",
  Seychelles: "Seszele", SC: "Seszele",
  "Cape Verde": "Republika Zielonego Przylądka", CV: "Republika Zielonego Przylądka",

  // Asia
  Thailand: "Tajlandia", TH: "Tajlandia",
  Vietnam: "Wietnam", VN: "Wietnam",
  Indonesia: "Indonezja", ID: "Indonezja",
  Malaysia: "Malezja", MY: "Malezja",
  Singapore: "Singapur", SG: "Singapur",
  Philippines: "Filipiny", PH: "Filipiny",
  Cambodia: "Kambodża", KH: "Kambodża",
  Laos: "Laos", LA: "Laos",
  Myanmar: "Mjanma", MM: "Mjanma",
  India: "Indie", IN: "Indie",
  "Sri Lanka": "Sri Lanka", LK: "Sri Lanka",
  Maldives: "Malediwy", MV: "Malediwy",
  China: "Chiny", CN: "Chiny",
  Japan: "Japonia", JP: "Japonia",
  "South Korea": "Korea Południowa", KR: "Korea Południowa",
  Taiwan: "Tajwan", TW: "Tajwan",
  "Hong Kong": "Hongkong", HK: "Hongkong",
  Nepal: "Nepal", NP: "Nepal",

  // Americas
  "United States": "Stany Zjednoczone", "United States of America": "Stany Zjednoczone", US: "Stany Zjednoczone", USA: "Stany Zjednoczone",
  Canada: "Kanada", CA: "Kanada",
  Mexico: "Meksyk", MX: "Meksyk",
  "Costa Rica": "Kostaryka", CR: "Kostaryka",
  Cuba: "Kuba", CU: "Kuba",
  "Dominican Republic": "Dominikana", DO: "Dominikana",
  Jamaica: "Jamajka", JM: "Jamajka",
  Brazil: "Brazylia", BR: "Brazylia",
  Argentina: "Argentyna", AR: "Argentyna",
  Chile: "Chile", CL: "Chile",
  Peru: "Peru", PE: "Peru",
  Colombia: "Kolumbia", CO: "Kolumbia",
  Ecuador: "Ekwador", EC: "Ekwador",

  // Oceania
  Australia: "Australia", AU: "Australia",
  "New Zealand": "Nowa Zelandia", NZ: "Nowa Zelandia",
  Fiji: "Fidżi", FJ: "Fidżi",
};

export const REGION_PL: Record<string, string> = {
  "Western Europe": "Europa Zachodnia",
  "Central Europe": "Europa Środkowa",
  "Eastern Europe": "Europa Wschodnia",
  "Northern Europe": "Europa Północna",
  "Southern Europe": "Europa Południowa",
  "Southeast Europe": "Europa Południowo-Wschodnia",
  Nordics: "Skandynawia",
  Baltics: "Kraje bałtyckie",
  Balkans: "Bałkany",
  Mediterranean: "Basen Morza Śródziemnego",
  "Eastern Mediterranean": "Wschodnie Morze Śródziemne",
  "Iberian Peninsula": "Półwysep Iberyjski",
  "British Isles": "Wyspy Brytyjskie",
  "Middle East": "Bliski Wschód",
  "North Africa": "Afryka Północna",
  "East Africa": "Afryka Wschodnia",
  "West Africa": "Afryka Zachodnia",
  "Southern Africa": "Afryka Południowa",
  "Sub-Saharan Africa": "Afryka Subsaharyjska",
  "South Asia": "Azja Południowa",
  "East Asia": "Azja Wschodnia",
  "Southeast Asia": "Azja Południowo-Wschodnia",
  "Central Asia": "Azja Środkowa",
  "North America": "Ameryka Północna",
  "Central America": "Ameryka Środkowa",
  "South America": "Ameryka Południowa",
  Caribbean: "Karaiby",
  Oceania: "Oceania",
  "Indian Ocean": "Ocean Indyjski",
  "Atlantic Islands": "Wyspy Atlantyckie",
  Global: "Globalnie",
};

export function localizeCountry(input: string | null | undefined): string {
  if (!input) return "";
  const t = input.trim();
  return COUNTRY_PL[t] ?? COUNTRY_PL[t.toUpperCase()] ?? t;
}

export function localizeRegion(input: string | null | undefined): string {
  if (!input) return "";
  const t = input.trim();
  return REGION_PL[t] ?? t;
}
