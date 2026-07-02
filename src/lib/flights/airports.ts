// Słownik lotnisk i grup lotnisk dla wyszukiwarki lotów (zadanie 1).
//
// Architektura jak na Booking: użytkownik widzi „Miasto — wszystkie lotniska"
// (AirportGroup) ORAZ pojedyncze lotniska (Airport). Słownik jest GENERYCZNY —
// dodanie kolejnego miasta to wpis danych, nie zmiana logiki.
//
// JAK „wszystkie lotniska" zamienia się na zapytanie (empirycznie sprawdzone
// na LiteAPI /flights/rates 2026-06-14):
//   • Miasta z KODEM METRA, który LiteAPI rozwija natywnie (LON→LHR/LGW/STN/…,
//     PAR→CDG/ORY, MIL→MXP/LIN/BGY, STO→ARN) → 1 zapytanie kodem metra.
//     W odpowiedzi i tak jest realny `originCode` każdego segmentu.
//   • Miasta BEZ kodu metra (Warszawa: WAW/WMI/RDO) → fan-out po lotniskach.
//     UWAGA: LiteAPI jedzie na GDS Travelport, który NIE MA treści LCC — lot z
//     Modlina (WMI) i Radomia (RDO) zwraca 0. Dlatego grupa ma `note` z uczciwą
//     informacją, a wynik „Warszawa — wszystkie lotniska" w praktyce = Chopin.
//     TODO: gdy pojawi się źródło LCC, fan-out automatycznie dołączy WMI/RDO.

export interface Airport {
  /** Kod IATA, np. „WAW". */
  code: string;
  /** Nazwa lotniska po polsku, np. „Lotnisko Chopina". */
  name: string;
  /** Miasto, np. „Warszawa". */
  city: string;
  /** Kraj po polsku, np. „Polska". */
  country: string;
  /** Synonimy do wyszukiwania (PL + EN + potoczne), foldowane przy matchu. */
  aliases: string[];
  lat?: number;
  lng?: number;
}

export interface AirportGroup {
  /** Stabilny identyfikator, np. „warsaw-all". */
  id: string;
  /** Etykieta widoczna w UI, np. „Warszawa — wszystkie lotniska". */
  label: string;
  /** Miasto wspólne dla grupy. */
  city: string;
  country: string;
  /** Kody lotnisk wchodzących w skład grupy (do wyświetlenia i fan-outu). */
  airportCodes: string[];
  /** Kod metra rozwijany natywnie przez LiteAPI (1 zapytanie). Brak → fan-out. */
  metroCode?: string;
  /** Synonimy miasta (PL + EN + kody). */
  aliases: string[];
  /** Uczciwa nota o ograniczeniach (np. brak treści LCC dla Modlina/Radomia). */
  note?: string;
}

/** Element listy podpowiedzi — grupa „wszystkie lotniska" albo pojedyncze lotnisko. */
export type AirportOption =
  | { kind: "group"; group: AirportGroup }
  | { kind: "airport"; airport: Airport };

/** Rozstrzygnięty wybór „Skąd" — kody do zapytania + etykiety + ewentualna nota. */
export interface OriginSelection {
  /** Kody do zapytania: [WAW] (1 lotnisko), [LON] (metro), [WAW,WMI,RDO] (fan-out). */
  codes: string[];
  /** Etykieta do nagłówka wyników (poziom miasta), np. „Warszawa (WAW)". */
  label: string;
  /** Etykieta do pola input (konkretne lotnisko), np. „Lotnisko Chopina (WAW)". */
  inputLabel: string;
  /** Czy to grupa „wszystkie lotniska" (do noty w wynikach). */
  isGroup: boolean;
  note?: string;
}

// ── Foldowanie tekstu (PL diakrytyki, ł→l, lowercase) ────────────────────────
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .trim();
}

// ── Dane: lotniska ────────────────────────────────────────────────────────────

export const AIRPORTS: readonly Airport[] = [
  // Polska
  { code: "WAW", name: "Lotnisko Chopina", city: "Warszawa", country: "Polska", aliases: ["warszawa", "warsaw", "waw", "chopin", "okecie", "lotnisko chopina", "warszawa chopin", "warsaw chopin"] },
  { code: "WMI", name: "Modlin", city: "Warszawa", country: "Polska", aliases: ["modlin", "warszawa modlin", "warsaw modlin", "wmi", "nowy dwor mazowiecki"] },
  { code: "RDO", name: "Radom-Sadków", city: "Radom", country: "Polska", aliases: ["radom", "warszawa radom", "warsaw radom", "radom sadkow", "rdo", "sadkow"] },
  { code: "KRK", name: "Kraków-Balice", city: "Kraków", country: "Polska", aliases: ["krakow", "cracow", "krk", "balice", "jana pawla ii"] },
  { code: "GDN", name: "Gdańsk im. Lecha Wałęsy", city: "Gdańsk", country: "Polska", aliases: ["gdansk", "danzig", "gdn", "rebiechowo", "walesa"] },
  { code: "WRO", name: "Wrocław-Strachowice", city: "Wrocław", country: "Polska", aliases: ["wroclaw", "breslau", "wro", "strachowice", "kopernik"] },
  { code: "KTW", name: "Katowice-Pyrzowice", city: "Katowice", country: "Polska", aliases: ["katowice", "ktw", "pyrzowice", "slask", "silesia"] },
  { code: "POZ", name: "Poznań-Ławica", city: "Poznań", country: "Polska", aliases: ["poznan", "poz", "lawica", "wieniawski"] },
  { code: "RZE", name: "Rzeszów-Jasionka", city: "Rzeszów", country: "Polska", aliases: ["rzeszow", "rze", "jasionka"] },
  { code: "LUZ", name: "Lublin", city: "Lublin", country: "Polska", aliases: ["lublin", "luz", "swidnik"] },
  { code: "SZZ", name: "Szczecin-Goleniów", city: "Szczecin", country: "Polska", aliases: ["szczecin", "szz", "goleniow", "stettin"] },
  { code: "BZG", name: "Bydgoszcz", city: "Bydgoszcz", country: "Polska", aliases: ["bydgoszcz", "bzg"] },
  { code: "LCJ", name: "Łódź-Lublinek", city: "Łódź", country: "Polska", aliases: ["lodz", "lcj", "lublinek"] },
  { code: "SZY", name: "Olsztyn-Mazury", city: "Olsztyn", country: "Polska", aliases: ["olsztyn", "mazury", "szymany", "szy", "olsztyn mazury"] },
  { code: "IEG", name: "Zielona Góra-Babimost", city: "Zielona Góra", country: "Polska", aliases: ["zielona gora", "babimost", "ieg"] },
  // Wielka Brytania / Irlandia (diaspora)
  { code: "LHR", name: "London Heathrow", city: "Londyn", country: "Wielka Brytania", aliases: ["heathrow", "lhr", "londyn heathrow", "london heathrow"] },
  { code: "LGW", name: "London Gatwick", city: "Londyn", country: "Wielka Brytania", aliases: ["gatwick", "lgw", "londyn gatwick", "london gatwick"] },
  { code: "STN", name: "London Stansted", city: "Londyn", country: "Wielka Brytania", aliases: ["stansted", "stn", "londyn stansted", "london stansted"] },
  { code: "LTN", name: "London Luton", city: "Londyn", country: "Wielka Brytania", aliases: ["luton", "ltn", "londyn luton", "london luton"] },
  { code: "LCY", name: "London City", city: "Londyn", country: "Wielka Brytania", aliases: ["london city", "lcy"] },
  { code: "SEN", name: "London Southend", city: "Londyn", country: "Wielka Brytania", aliases: ["southend", "sen", "londyn southend", "london southend"] },
  { code: "MAN", name: "Manchester", city: "Manchester", country: "Wielka Brytania", aliases: ["manchester", "man"] },
  { code: "EDI", name: "Edynburg", city: "Edynburg", country: "Wielka Brytania", aliases: ["edynburg", "edinburgh", "edi"] },
  { code: "DUB", name: "Dublin", city: "Dublin", country: "Irlandia", aliases: ["dublin", "dub"] },
  // Niemcy / Beneluks / Europa Środkowa
  { code: "BER", name: "Berlin Brandenburg", city: "Berlin", country: "Niemcy", aliases: ["berlin", "ber", "brandenburg", "schoenefeld"] },
  { code: "FRA", name: "Frankfurt", city: "Frankfurt", country: "Niemcy", aliases: ["frankfurt", "fra"] },
  { code: "MUC", name: "Monachium", city: "Monachium", country: "Niemcy", aliases: ["monachium", "munich", "muenchen", "muc"] },
  { code: "AMS", name: "Amsterdam-Schiphol", city: "Amsterdam", country: "Holandia", aliases: ["amsterdam", "ams", "schiphol"] },
  { code: "VIE", name: "Wiedeń", city: "Wiedeń", country: "Austria", aliases: ["wieden", "vienna", "wien", "vie"] },
  { code: "PRG", name: "Praga", city: "Praga", country: "Czechy", aliases: ["praga", "prague", "praha", "prg"] },
  // Skandynawia
  { code: "ARN", name: "Sztokholm-Arlanda", city: "Sztokholm", country: "Szwecja", aliases: ["sztokholm arlanda", "stockholm arlanda", "arlanda", "arn"] },
  { code: "NYO", name: "Sztokholm-Skavsta", city: "Sztokholm", country: "Szwecja", aliases: ["skavsta", "nyo", "sztokholm skavsta"] },
  { code: "CPH", name: "Kopenhaga", city: "Kopenhaga", country: "Dania", aliases: ["kopenhaga", "copenhagen", "cph"] },
  { code: "OSL", name: "Oslo-Gardermoen", city: "Oslo", country: "Norwegia", aliases: ["oslo", "osl", "gardermoen"] },
  // Francja / Włochy (metro)
  { code: "CDG", name: "Paryż-Charles de Gaulle", city: "Paryż", country: "Francja", aliases: ["paryz cdg", "charles de gaulle", "cdg", "roissy"] },
  { code: "ORY", name: "Paryż-Orly", city: "Paryż", country: "Francja", aliases: ["orly", "ory", "paryz orly"] },
  { code: "BVA", name: "Paryż-Beauvais", city: "Paryż", country: "Francja", aliases: ["beauvais", "bva", "paryz beauvais"] },
  { code: "MXP", name: "Mediolan-Malpensa", city: "Mediolan", country: "Włochy", aliases: ["malpensa", "mxp", "mediolan malpensa"] },
  { code: "LIN", name: "Mediolan-Linate", city: "Mediolan", country: "Włochy", aliases: ["linate", "lin", "mediolan linate"] },
  { code: "BGY", name: "Mediolan-Bergamo", city: "Mediolan", country: "Włochy", aliases: ["bergamo", "bgy", "orio al serio", "mediolan bergamo"] },

  // ── Kierunki wakacyjne (Morze Śródziemne / wyspy) ───────────────────────────
  // Najczęstsze cele polskiego turysty. Wszystkie ZWERYFIKOWANE na żywo
  // (LiteAPI /flights/rates z WAW, 2026-06-29: 49–129 ofert każdy). Bez tych
  // wpisów user wpisujący „Antalya"/„Rodos"/„Malaga" nie dostawał podpowiedzi.
  // Hiszpania + wyspy
  { code: "BCN", name: "Barcelona-El Prat", city: "Barcelona", country: "Hiszpania", aliases: ["barcelona", "bcn", "el prat", "barca"] },
  { code: "AGP", name: "Málaga-Costa del Sol", city: "Málaga", country: "Hiszpania", aliases: ["malaga", "agp", "costa del sol", "malaga costa del sol"] },
  { code: "ALC", name: "Alicante-Elche", city: "Alicante", country: "Hiszpania", aliases: ["alicante", "alc", "elche", "costa blanca"] },
  { code: "PMI", name: "Palma de Mallorca", city: "Palma de Mallorca", country: "Hiszpania", aliases: ["palma", "pmi", "majorka", "mallorca", "palma de mallorca", "palma mallorca"] },
  { code: "LPA", name: "Gran Canaria", city: "Las Palmas", country: "Hiszpania", aliases: ["gran canaria", "lpa", "las palmas", "wyspy kanaryjskie", "kanary"] },
  { code: "TFS", name: "Teneryfa-Południe", city: "Teneryfa", country: "Hiszpania", aliases: ["teneryfa", "tenerife", "tfs", "teneryfa poludnie", "tenerife south"] },
  { code: "VLC", name: "Walencja", city: "Walencja", country: "Hiszpania", aliases: ["walencja", "valencia", "vlc"] },
  { code: "MAD", name: "Madryt-Barajas", city: "Madryt", country: "Hiszpania", aliases: ["madryt", "madrid", "mad", "barajas"] },
  // Grecja + wyspy
  { code: "ATH", name: "Ateny", city: "Ateny", country: "Grecja", aliases: ["ateny", "athens", "ath"] },
  { code: "RHO", name: "Rodos", city: "Rodos", country: "Grecja", aliases: ["rodos", "rhodes", "rho"] },
  { code: "HER", name: "Heraklion (Kreta)", city: "Heraklion", country: "Grecja", aliases: ["heraklion", "kreta", "crete", "her", "heraklion kreta"] },
  { code: "CFU", name: "Korfu", city: "Korfu", country: "Grecja", aliases: ["korfu", "corfu", "cfu", "kerkyra"] },
  { code: "SKG", name: "Saloniki", city: "Saloniki", country: "Grecja", aliases: ["saloniki", "thessaloniki", "skg", "tesaloniki"] },
  { code: "KGS", name: "Kos", city: "Kos", country: "Grecja", aliases: ["kos", "kgs"] },
  // Turcja
  { code: "IST", name: "Stambuł", city: "Stambuł", country: "Turcja", aliases: ["stambul", "istanbul", "ist"] },
  { code: "AYT", name: "Antalya", city: "Antalya", country: "Turcja", aliases: ["antalya", "ayt"] },
  // Portugalia
  { code: "LIS", name: "Lizbona", city: "Lizbona", country: "Portugalia", aliases: ["lizbona", "lisbon", "lisboa", "lis"] },
  { code: "FAO", name: "Faro (Algarve)", city: "Faro", country: "Portugalia", aliases: ["faro", "algarve", "fao"] },
  { code: "OPO", name: "Porto", city: "Porto", country: "Portugalia", aliases: ["porto", "opo", "oporto"] },
  // Chorwacja
  { code: "SPU", name: "Split", city: "Split", country: "Chorwacja", aliases: ["split", "spu"] },
  { code: "DBV", name: "Dubrownik", city: "Dubrownik", country: "Chorwacja", aliases: ["dubrownik", "dubrovnik", "dbv"] },
  // Cypr / Malta / Bałkany
  { code: "LCA", name: "Larnaka", city: "Larnaka", country: "Cypr", aliases: ["larnaka", "larnaca", "lca", "cypr"] },
  { code: "MLA", name: "Malta", city: "Valletta", country: "Malta", aliases: ["malta", "mla", "valletta", "la valetta"] },
  { code: "BOJ", name: "Burgas", city: "Burgas", country: "Bułgaria", aliases: ["burgas", "boj"] },
  { code: "VAR", name: "Warna", city: "Warna", country: "Bułgaria", aliases: ["warna", "varna", "var"] },
  { code: "TIA", name: "Tirana", city: "Tirana", country: "Albania", aliases: ["tirana", "tia", "albania"] },
  // Włochy (cele wakacyjne) + Francja
  { code: "FCO", name: "Rzym-Fiumicino", city: "Rzym", country: "Włochy", aliases: ["rzym", "rome", "roma", "fco", "fiumicino"] },
  { code: "NAP", name: "Neapol", city: "Neapol", country: "Włochy", aliases: ["neapol", "naples", "napoli", "nap"] },
  { code: "CTA", name: "Katania (Sycylia)", city: "Katania", country: "Włochy", aliases: ["katania", "catania", "cta", "sycylia", "sicily"] },
  { code: "VCE", name: "Wenecja", city: "Wenecja", country: "Włochy", aliases: ["wenecja", "venice", "venezia", "vce"] },
  { code: "NCE", name: "Nicea (Lazurowe Wybrzeże)", city: "Nicea", country: "Francja", aliases: ["nicea", "nice", "nce", "lazurowe wybrzeze", "french riviera"] },

  // ── Poza Europą — główne huby interkontynentalne ────────────────────────────
  // Wylot także spoza Europy (diaspora, przesiadki, podróże dalekie). Kody to
  // realne IATA obsługiwane przez LiteAPI Flights (GDS). Bez grup „wszystkie
  // lotniska" — dodajemy pojedyncze lotniska (grupy wymagają weryfikacji kodu
  // metra, jak dla Londynu/Paryża).
  // Ameryka Północna
  { code: "JFK", name: "Nowy Jork-JFK", city: "Nowy Jork", country: "USA", aliases: ["nowy jork", "new york", "jfk", "nowy jork jfk", "kennedy"] },
  { code: "EWR", name: "Nowy Jork-Newark", city: "Nowy Jork", country: "USA", aliases: ["newark", "ewr", "nowy jork newark", "new york newark"] },
  { code: "LAX", name: "Los Angeles", city: "Los Angeles", country: "USA", aliases: ["los angeles", "lax"] },
  { code: "ORD", name: "Chicago-O'Hare", city: "Chicago", country: "USA", aliases: ["chicago", "ord", "ohare", "o'hare", "chicago ohare"] },
  { code: "MIA", name: "Miami", city: "Miami", country: "USA", aliases: ["miami", "mia"] },
  { code: "SFO", name: "San Francisco", city: "San Francisco", country: "USA", aliases: ["san francisco", "sfo"] },
  { code: "YYZ", name: "Toronto-Pearson", city: "Toronto", country: "Kanada", aliases: ["toronto", "yyz", "pearson"] },
  { code: "YVR", name: "Vancouver", city: "Vancouver", country: "Kanada", aliases: ["vancouver", "yvr"] },
  // Ameryka Łacińska / Karaiby
  { code: "CUN", name: "Cancún", city: "Cancún", country: "Meksyk", aliases: ["cancun", "cun", "meksyk"] },
  { code: "PUJ", name: "Punta Cana", city: "Punta Cana", country: "Dominikana", aliases: ["punta cana", "puj", "dominikana"] },
  { code: "GRU", name: "São Paulo-Guarulhos", city: "São Paulo", country: "Brazylia", aliases: ["sao paulo", "gru", "guarulhos"] },
  { code: "GIG", name: "Rio de Janeiro-Galeão", city: "Rio de Janeiro", country: "Brazylia", aliases: ["rio de janeiro", "gig", "galeao", "rio"] },
  { code: "EZE", name: "Buenos Aires-Ezeiza", city: "Buenos Aires", country: "Argentyna", aliases: ["buenos aires", "eze", "ezeiza"] },
  { code: "LIM", name: "Lima", city: "Lima", country: "Peru", aliases: ["lima", "lim"] },
  { code: "BOG", name: "Bogota", city: "Bogota", country: "Kolumbia", aliases: ["bogota", "bog", "kolumbia"] },
  // Bliski Wschód
  { code: "DXB", name: "Dubaj", city: "Dubaj", country: "Zjednoczone Emiraty Arabskie", aliases: ["dubaj", "dubai", "dxb", "emiraty"] },
  { code: "AUH", name: "Abu Zabi", city: "Abu Zabi", country: "Zjednoczone Emiraty Arabskie", aliases: ["abu zabi", "abu dhabi", "auh"] },
  { code: "DOH", name: "Doha", city: "Doha", country: "Katar", aliases: ["doha", "doh", "katar"] },
  { code: "TLV", name: "Tel Awiw", city: "Tel Awiw", country: "Izrael", aliases: ["tel awiw", "tel aviv", "tlv", "izrael"] },
  { code: "RUH", name: "Rijad", city: "Rijad", country: "Arabia Saudyjska", aliases: ["rijad", "riyadh", "ruh"] },
  // Azja
  { code: "BKK", name: "Bangkok-Suvarnabhumi", city: "Bangkok", country: "Tajlandia", aliases: ["bangkok", "bkk", "suvarnabhumi", "tajlandia"] },
  { code: "HKT", name: "Phuket", city: "Phuket", country: "Tajlandia", aliases: ["phuket", "hkt"] },
  { code: "SIN", name: "Singapur-Changi", city: "Singapur", country: "Singapur", aliases: ["singapur", "singapore", "sin", "changi"] },
  { code: "HKG", name: "Hongkong", city: "Hongkong", country: "Hongkong", aliases: ["hongkong", "hong kong", "hkg"] },
  { code: "NRT", name: "Tokio-Narita", city: "Tokio", country: "Japonia", aliases: ["tokio", "tokyo", "nrt", "narita"] },
  { code: "HND", name: "Tokio-Haneda", city: "Tokio", country: "Japonia", aliases: ["tokio haneda", "hnd", "haneda"] },
  { code: "ICN", name: "Seul-Incheon", city: "Seul", country: "Korea Południowa", aliases: ["seul", "seoul", "icn", "incheon"] },
  { code: "KUL", name: "Kuala Lumpur", city: "Kuala Lumpur", country: "Malezja", aliases: ["kuala lumpur", "kul", "malezja"] },
  { code: "DEL", name: "Delhi", city: "Delhi", country: "Indie", aliases: ["delhi", "new delhi", "del"] },
  { code: "BOM", name: "Mumbaj", city: "Mumbaj", country: "Indie", aliases: ["mumbaj", "mumbai", "bom", "bombaj"] },
  { code: "DPS", name: "Denpasar-Bali", city: "Bali", country: "Indonezja", aliases: ["bali", "denpasar", "dps", "indonezja"] },
  { code: "PEK", name: "Pekin", city: "Pekin", country: "Chiny", aliases: ["pekin", "beijing", "pek"] },
  { code: "PVG", name: "Szanghaj-Pudong", city: "Szanghaj", country: "Chiny", aliases: ["szanghaj", "shanghai", "pvg", "pudong"] },
  // Afryka
  { code: "CAI", name: "Kair", city: "Kair", country: "Egipt", aliases: ["kair", "cairo", "cai", "egipt"] },
  { code: "HRG", name: "Hurghada", city: "Hurghada", country: "Egipt", aliases: ["hurghada", "hrg"] },
  { code: "SSH", name: "Szarm el-Szejk", city: "Szarm el-Szejk", country: "Egipt", aliases: ["szarm el szejk", "sharm el sheikh", "ssh", "sharm"] },
  { code: "CMN", name: "Casablanca", city: "Casablanca", country: "Maroko", aliases: ["casablanca", "cmn", "maroko"] },
  { code: "RAK", name: "Marrakesz", city: "Marrakesz", country: "Maroko", aliases: ["marrakesz", "marrakesh", "rak"] },
  { code: "JNB", name: "Johannesburg", city: "Johannesburg", country: "RPA", aliases: ["johannesburg", "jnb", "rpa"] },
  { code: "CPT", name: "Kapsztad", city: "Kapsztad", country: "RPA", aliases: ["kapsztad", "cape town", "cpt"] },
  // Oceania
  { code: "SYD", name: "Sydney", city: "Sydney", country: "Australia", aliases: ["sydney", "syd", "australia"] },
  { code: "MEL", name: "Melbourne", city: "Melbourne", country: "Australia", aliases: ["melbourne", "mel"] },
  { code: "AKL", name: "Auckland", city: "Auckland", country: "Nowa Zelandia", aliases: ["auckland", "akl", "nowa zelandia"] },
] as const;

// ── Dane: grupy „wszystkie lotniska" ──────────────────────────────────────────
// Tylko miasta z >1 lotniskiem. metroCode ustawiony WYŁĄCZNIE dla kodów
// zweryfikowanych empirycznie (LiteAPI rozwija je natywnie). Reszta = fan-out.

export const AIRPORT_GROUPS: readonly AirportGroup[] = [
  {
    // „Nie wiem skąd / dowolne lotnisko w PL" — fan-out po największych
    // krajowych lotniskach. Brak kodu metra dla całego kraju → realny fan-out.
    // U dostawcy GDS (brak treści LCC) część lotnisk zwróci mało/zero — `note`
    // jest o tym uczciwy, a wynik = wszystkie loty, które realnie znajdziemy.
    id: "poland-all",
    label: "Polska — dowolne lotnisko",
    city: "Polska",
    country: "Polska",
    airportCodes: ["WAW", "KRK", "KTW", "GDN", "WRO", "POZ"],
    aliases: [
      "polska", "poland", "dowolne", "dowolne lotnisko", "dowolne lotnisko w polsce",
      "wszystkie lotniska w polsce", "cala polska", "skadkolwiek", "obojetnie", "niewazne",
    ],
    note: "Szukamy w największych polskich lotniskach (Warszawa, Kraków, Katowice, Gdańsk, Wrocław, Poznań). U naszego dostawcy część tanich linii bywa niedostępna — pokazujemy wszystkie loty, które realnie znajdziemy.",
  },
  {
    id: "warsaw-all",
    label: "Warszawa — wszystkie lotniska",
    city: "Warszawa",
    country: "Polska",
    airportCodes: ["WAW", "WMI", "RDO"],
    // Brak kodu metra w IATA dla Warszawy → fan-out. WMI/RDO bez treści w GDS.
    aliases: ["warszawa", "warsaw", "waw", "warszawa wszystkie", "wszystkie lotniska warszawa"],
    note: "Loty z Modlina (WMI) i Radomia (RDO) bywają niedostępne u naszego dostawcy — pokazujemy wszystkie loty, które realnie znajdziemy.",
  },
  {
    id: "london-all",
    label: "Londyn — wszystkie lotniska",
    city: "Londyn",
    country: "Wielka Brytania",
    airportCodes: ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"],
    metroCode: "LON", // zweryfikowane: LON → LHR/LGW/STN/LTN/LCY/SEN
    aliases: ["londyn", "london", "lon", "londyn wszystkie"],
  },
  {
    id: "paris-all",
    label: "Paryż — wszystkie lotniska",
    city: "Paryż",
    country: "Francja",
    airportCodes: ["CDG", "ORY", "BVA"],
    metroCode: "PAR", // zweryfikowane: PAR → ORY/CDG
    aliases: ["paryz", "paris", "par", "paryz wszystkie"],
  },
  {
    id: "milan-all",
    label: "Mediolan — wszystkie lotniska",
    city: "Mediolan",
    country: "Włochy",
    airportCodes: ["MXP", "LIN", "BGY"],
    metroCode: "MIL", // zweryfikowane: MIL → MXP/LIN/BGY
    aliases: ["mediolan", "milan", "milano", "mil", "mediolan wszystkie"],
  },
  {
    id: "stockholm-all",
    label: "Sztokholm — wszystkie lotniska",
    city: "Sztokholm",
    country: "Szwecja",
    airportCodes: ["ARN", "NYO"],
    metroCode: "STO", // zweryfikowane: STO → ARN
    aliases: ["sztokholm", "stockholm", "sto", "sztokholm wszystkie"],
  },
] as const;

// ── Wyszukiwanie / podpowiedzi ────────────────────────────────────────────────

const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

export function lookupAirport(code: string): Airport | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** Krótka etykieta lotniska do UI/nagłówka, np. „Warszawa (WAW)". */
export function airportLabel(code: string): string {
  const a = lookupAirport(code);
  return a ? `${a.city} (${a.code})` : code;
}

/** IATA głównego lotniska miasta po nazwie (PL/EN/aliasy, fold). Dopasowanie
 *  TYLKO exact (nie substring — „Pary" nie może trafić w Paryż). Miasto z
 *  wieloma lotniskami → pierwsze z datasetu (główne lotnisko jest pierwsze).
 *  Używane przez karty /wyjazdy do CTA „Sprawdź loty". Brak → null (bez CTA). */
export function iataForCity(city: string): string | null {
  const q = foldText(city);
  if (!q) return null;
  for (const a of AIRPORTS) {
    if (foldText(a.city) === q) return a.code;
  }
  for (const a of AIRPORTS) {
    if (a.aliases.some((al) => foldText(al) === q)) return a.code;
  }
  return null;
}

function groupMatches(g: AirportGroup, q: string): boolean {
  if (foldText(g.city).includes(q)) return true;
  return g.aliases.some((a) => foldText(a).includes(q));
}

function airportMatches(a: Airport, q: string): boolean {
  if (a.code.toLowerCase().startsWith(q)) return true;
  if (foldText(a.city).includes(q)) return true;
  if (foldText(a.name).includes(q)) return true;
  return a.aliases.some((al) => foldText(al).includes(q));
}

/**
 * Podpowiedzi jak na Booking: najpierw pasujące grupy „— wszystkie lotniska",
 * zaraz pod nimi lotniska tej grupy, potem pozostałe pasujące lotniska.
 * Pusty query → krótka lista popularnych (PL + grupa Warszawa + Londyn).
 */
export function searchAirports(query: string, limit = 8): AirportOption[] {
  const q = foldText(query);
  if (!q) {
    // Lista domyślna (bez wpisywania) — pokazuje REALNĄ szerokość oferty:
    // cała Polska + europejskie grupy „wszystkie lotniska" + popularne huby
    // świata. Lista jest przewijalna (combobox: max-h + overflow), a wpisanie
    // czegokolwiek znajdzie dowolne z >80 lotnisk.
    const opts: AirportOption[] = [];
    const seen = new Set<string>();
    const pushGroup = (id: string) => {
      const g = AIRPORT_GROUPS.find((x) => x.id === id);
      if (g) opts.push({ kind: "group", group: g });
    };
    const pushAirport = (code: string) => {
      const a = lookupAirport(code);
      if (a && !seen.has(a.code)) {
        opts.push({ kind: "airport", airport: a });
        seen.add(a.code);
      }
    };
    // „Polska — dowolne lotnisko" PIERWSZA (dla niezdecydowanych skąd lecą),
    // potem grupa Warszawa + wszystkie lotniska krajowe (WMI/RDO siedzą w grupie).
    pushGroup("poland-all");
    pushGroup("warsaw-all");
    for (const a of AIRPORTS) {
      if (a.country === "Polska" && a.code !== "WMI" && a.code !== "RDO") pushAirport(a.code);
    }
    // Europa: grupy „wszystkie lotniska".
    pushGroup("london-all");
    pushGroup("paris-all");
    pushGroup("milan-all");
    // Kierunki wakacyjne (Morze Śródziemne / wyspy) — najczęstsze cele
    // polskiego turysty, prowadzą przed odległymi hubami biznesowymi.
    for (const c of ["BCN", "AGP", "PMI", "AYT", "RHO", "HER", "FAO", "LIS", "SPU", "LCA", "HRG", "DXB"]) {
      pushAirport(c);
    }
    return opts.slice(0, limit);
  }

  const options: AirportOption[] = [];
  const usedCodes = new Set<string>();

  // 1) Grupy pasujące do miasta — grupa + jej lotniska (w kolejności).
  for (const g of AIRPORT_GROUPS) {
    if (!groupMatches(g, q)) continue;
    options.push({ kind: "group", group: g });
    for (const code of g.airportCodes) {
      const a = lookupAirport(code);
      if (a && !usedCodes.has(code)) {
        options.push({ kind: "airport", airport: a });
        usedCodes.add(code);
      }
    }
  }

  // 2) Pozostałe pasujące lotniska. Dokładne trafienie w kod (np. „wmi") na górę.
  const exactCode = AIRPORTS.filter((a) => a.code.toLowerCase() === q && !usedCodes.has(a.code));
  const fuzzy = AIRPORTS.filter((a) => airportMatches(a, q) && a.code.toLowerCase() !== q && !usedCodes.has(a.code));
  for (const a of [...exactCode, ...fuzzy]) {
    if (usedCodes.has(a.code)) continue;
    options.push({ kind: "airport", airport: a });
    usedCodes.add(a.code);
  }

  return options.slice(0, limit);
}

/** Pierwsza sensowna podpowiedź dla wpisanego-niewybranego tekstu (auto-confirm). */
export function bestAirportOption(query: string): AirportOption | null {
  const hits = searchAirports(query, 1);
  return hits[0] ?? null;
}

// ── Rozstrzyganie wyboru → kody do zapytania ──────────────────────────────────

export function resolveOriginFromOption(option: AirportOption): OriginSelection {
  if (option.kind === "group") {
    const g = option.group;
    // Kod metra → 1 zapytanie (LiteAPI rozwija natywnie). Brak → fan-out.
    const codes = g.metroCode ? [g.metroCode] : [...g.airportCodes];
    return { codes, label: g.label, inputLabel: g.label, isGroup: true, note: g.note };
  }
  const a = option.airport;
  return {
    codes: [a.code],
    label: `${a.city} (${a.code})`,
    inputLabel: `${a.name} (${a.code})`,
    isGroup: false,
  };
}

/** Nagłówek wyników z parametrów URL: etykieta z `originLabel` albo z kodów. */
export function originHeaderLabel(codes: string[], label?: string): string {
  if (label) return label;
  if (codes.length === 1) return airportLabel(codes[0]);
  // Wiele kodów bez etykiety — wspólne miasto jeśli istnieje.
  const cities = new Set(codes.map((c) => lookupAirport(c)?.city).filter(Boolean));
  if (cities.size === 1) return `${[...cities][0]} (${codes.join("/")})`;
  return codes.join("/");
}
