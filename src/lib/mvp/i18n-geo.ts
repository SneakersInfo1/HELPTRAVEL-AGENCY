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

// Polish exonyms for cities. Used at the UI boundary (autocomplete dropdown,
// search heading, breadcrumbs) so backend lookups can keep the canonical
// English city name as the cache/IATA key. Same lookup contract as
// COUNTRY_PL: exact key match, otherwise return input untouched.
//
// Coverage = every city seeded in destination-catalog.ts plus the curated
// destinations. Keys are canonical English forms ("Lisbon", "Krakow"); the
// helper also matches case-insensitive and Polish exonyms so already-PL
// inputs (e.g. "Lizbona", "Kraków") are stable.
export const CITY_PL: Record<string, string> = {
  // Iberia
  Lisbon: "Lizbona",
  Porto: "Porto",
  Funchal: "Funchal",
  Faro: "Faro",
  "Ponta Delgada": "Ponta Delgada",
  Coimbra: "Coimbra",
  Braga: "Braga",
  Madrid: "Madryt",
  Barcelona: "Barcelona",
  Valencia: "Walencja",
  Seville: "Sewilla",
  Malaga: "Malaga",
  Alicante: "Alicante",
  Bilbao: "Bilbao",
  Granada: "Granada",
  Cordoba: "Kordoba",
  "San Sebastian": "San Sebastián",
  Palma: "Palma de Mallorca",
  "Las Palmas": "Las Palmas",
  "Santa Cruz de Tenerife": "Teneryfa",
  Arrecife: "Lanzarote",
  "Ibiza Town": "Ibiza",
  // Italy
  Rome: "Rzym",
  Naples: "Neapol",
  Milan: "Mediolan",
  Venice: "Wenecja",
  Florence: "Florencja",
  Turin: "Turyn",
  Bologna: "Bolonia",
  Verona: "Werona",
  Pisa: "Piza",
  Genoa: "Genua",
  Palermo: "Palermo",
  Catania: "Katania",
  Bari: "Bari",
  Cagliari: "Cagliari",
  Olbia: "Olbia",
  // France
  Paris: "Paryż",
  Nice: "Nicea",
  Marseille: "Marsylia",
  Lyon: "Lyon",
  Bordeaux: "Bordeaux",
  Toulouse: "Tuluza",
  Strasbourg: "Strasburg",
  Nantes: "Nantes",
  Lille: "Lille",
  Cannes: "Cannes",
  Montpellier: "Montpellier",
  // Greece + Cyprus + Malta
  Athens: "Ateny",
  Thessaloniki: "Saloniki",
  Heraklion: "Heraklion",
  Chania: "Chania",
  Corfu: "Korfu",
  Rhodes: "Rodos",
  Fira: "Fira (Santorini)",
  "Mykonos Town": "Mykonos",
  Zakynthos: "Zakynthos",
  Kos: "Kos",
  Larnaca: "Larnaka",
  Paphos: "Pafos",
  Nicosia: "Nikozja",
  Limassol: "Limassol",
  Valletta: "Valletta",
  Sliema: "Sliema",
  "St Julian's": "St. Julian's",
  // Turkey
  Istanbul: "Stambuł",
  Antalya: "Antalya",
  Izmir: "Izmir",
  Bodrum: "Bodrum",
  Ankara: "Ankara",
  Dalaman: "Dalaman",
  Goreme: "Göreme",
  Trabzon: "Trabzon",
  // North Africa
  Marrakesh: "Marrakesz",
  Agadir: "Agadir",
  Casablanca: "Casablanca",
  Fez: "Fez",
  Tangier: "Tanger",
  Rabat: "Rabat",
  Cairo: "Kair",
  Hurghada: "Hurghada",
  "Sharm El Sheikh": "Szarm el-Szejk",
  Alexandria: "Aleksandria",
  Luxor: "Luksor",
  Tunis: "Tunis",
  Hammamet: "Hammamet",
  Sousse: "Susa",
  Djerba: "Dżerba",
  // Balkans
  Tirana: "Tirana",
  Sarande: "Sarandë",
  Vlore: "Wlora",
  Split: "Split",
  Dubrovnik: "Dubrownik",
  Zagreb: "Zagrzeb",
  Zadar: "Zadar",
  Pula: "Pula",
  Rijeka: "Rijeka",
  Kotor: "Kotor",
  Budva: "Budva",
  Tivat: "Tivat",
  Podgorica: "Podgorica",
  Ljubljana: "Lublana",
  Bled: "Bled",
  Piran: "Piran",
  Belgrade: "Belgrad",
  Sarajevo: "Sarajewo",
  Skopje: "Skopje",
  Sofia: "Sofia",
  Bucharest: "Bukareszt",
  "Cluj-Napoca": "Kluż-Napoka",
  // Alpine / Central Europe
  Vienna: "Wiedeń",
  Salzburg: "Salzburg",
  Innsbruck: "Innsbruck",
  Graz: "Graz",
  Zurich: "Zurych",
  Geneva: "Genewa",
  Lucerne: "Lucerna",
  Basel: "Bazylea",
  // DE / NL / BE
  Berlin: "Berlin",
  Munich: "Monachium",
  Hamburg: "Hamburg",
  Cologne: "Kolonia",
  Frankfurt: "Frankfurt",
  Dusseldorf: "Düsseldorf",
  Dresden: "Drezno",
  Nuremberg: "Norymberga",
  Amsterdam: "Amsterdam",
  Rotterdam: "Rotterdam",
  "The Hague": "Haga",
  Utrecht: "Utrecht",
  Eindhoven: "Eindhoven",
  Brussels: "Bruksela",
  Bruges: "Brugia",
  Antwerp: "Antwerpia",
  Ghent: "Gandawa",
  // British Isles
  London: "Londyn",
  Edinburgh: "Edynburg",
  Manchester: "Manchester",
  Liverpool: "Liverpool",
  Glasgow: "Glasgow",
  Birmingham: "Birmingham",
  Bristol: "Bristol",
  Belfast: "Belfast",
  Dublin: "Dublin",
  Cork: "Cork",
  Galway: "Galway",
  Killarney: "Killarney",
  // Czechia + Hungary + Slovakia
  Prague: "Praga",
  Brno: "Brno",
  Budapest: "Budapeszt",
  Debrecen: "Debreczyn",
  Bratislava: "Bratysława",
  // Poland (canonical Polish forms)
  Warsaw: "Warszawa",
  Krakow: "Kraków",
  Gdansk: "Gdańsk",
  Wroclaw: "Wrocław",
  Poznan: "Poznań",
  Katowice: "Katowice",
  Lodz: "Łódź",
  Rzeszow: "Rzeszów",
  // Nordics
  Copenhagen: "Kopenhaga",
  Aarhus: "Aarhus",
  Stockholm: "Sztokholm",
  Gothenburg: "Göteborg",
  Malmo: "Malmö",
  Oslo: "Oslo",
  Bergen: "Bergen",
  Helsinki: "Helsinki",
  Reykjavik: "Reykjavik",
  // Baltics
  Riga: "Ryga",
  Vilnius: "Wilno",
  Tallinn: "Tallin",
  Kaunas: "Kowno",
  // Middle East
  Dubai: "Dubaj",
  "Abu Dhabi": "Abu Zabi",
  Doha: "Ad-Dauha",
  Muscat: "Maskat",
  "Tel Aviv": "Tel Awiw",
  Jerusalem: "Jerozolima",
  Amman: "Amman",
  Riyadh: "Rijad",
  // Asia
  Bangkok: "Bangkok",
  Phuket: "Phuket",
  Krabi: "Krabi",
  "Chiang Mai": "Chiang Mai",
  "Koh Samui": "Koh Samui",
  Singapore: "Singapur",
  "Kuala Lumpur": "Kuala Lumpur",
  Penang: "Penang",
  Denpasar: "Denpasar (Bali)",
  Jakarta: "Dżakarta",
  Hanoi: "Hanoi",
  "Ho Chi Minh City": "Ho Chi Minh",
  "Da Nang": "Da Nang",
  Tokyo: "Tokio",
  Osaka: "Osaka",
  Kyoto: "Kioto",
  Seoul: "Seul",
  Busan: "Busan",
  "Hong Kong": "Hongkong",
  Taipei: "Tajpej",
  Colombo: "Kolombo",
  Male: "Male",
  Goa: "Goa",
  Delhi: "Delhi",
  Mumbai: "Mumbaj",
  Beijing: "Pekin",
  Shanghai: "Szanghaj",
  // Americas
  "New York": "Nowy Jork",
  "Los Angeles": "Los Angeles",
  "San Francisco": "San Francisco",
  Miami: "Miami",
  "Las Vegas": "Las Vegas",
  Chicago: "Chicago",
  Boston: "Boston",
  Washington: "Waszyngton",
  Orlando: "Orlando",
  Seattle: "Seattle",
  Toronto: "Toronto",
  Vancouver: "Vancouver",
  Montreal: "Montreal",
  Cancun: "Cancún",
  "Mexico City": "Meksyk",
  "Playa del Carmen": "Playa del Carmen",
  "Punta Cana": "Punta Cana",
  "San Juan": "San Juan",
  "Rio de Janeiro": "Rio de Janeiro",
  "Sao Paulo": "São Paulo",
  "Buenos Aires": "Buenos Aires",
  Lima: "Lima",
  Santiago: "Santiago de Chile",
  Bogota: "Bogota",
  // Africa + Oceania
  "Cape Town": "Kapsztad",
  Johannesburg: "Johannesburg",
  "Stone Town": "Stone Town (Zanzibar)",
  Nairobi: "Nairobi",
  "Port Louis": "Port Louis",
  Sydney: "Sydney",
  Melbourne: "Melbourne",
  Auckland: "Auckland",
  Queenstown: "Queenstown",
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

// Case-insensitive city lookup so already-Polish or differently-cased input
// is stable (e.g. backend returns "Krakow" today, may return "krakow" later).
// Empty/null input returns "" to match the country/region helpers.
const CITY_PL_LOOKUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(CITY_PL)) {
    map[key.toLowerCase()] = value;
  }
  return map;
})();

export function localizeCity(input: string | null | undefined): string {
  if (!input) return "";
  const t = input.trim();
  if (!t) return "";
  return CITY_PL[t] ?? CITY_PL_LOOKUP[t.toLowerCase()] ?? t;
}
