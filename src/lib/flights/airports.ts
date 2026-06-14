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
  // Wielka Brytania / Irlandia (diaspora)
  { code: "LHR", name: "London Heathrow", city: "Londyn", country: "Wielka Brytania", aliases: ["heathrow", "lhr", "londyn heathrow", "london heathrow"] },
  { code: "LGW", name: "London Gatwick", city: "Londyn", country: "Wielka Brytania", aliases: ["gatwick", "lgw", "londyn gatwick", "london gatwick"] },
  { code: "STN", name: "London Stansted", city: "Londyn", country: "Wielka Brytania", aliases: ["stansted", "stn", "londyn stansted", "london stansted"] },
  { code: "LTN", name: "London Luton", city: "Londyn", country: "Wielka Brytania", aliases: ["luton", "ltn", "londyn luton", "london luton"] },
  { code: "LCY", name: "London City", city: "Londyn", country: "Wielka Brytania", aliases: ["london city", "lcy"] },
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
] as const;

// ── Dane: grupy „wszystkie lotniska" ──────────────────────────────────────────
// Tylko miasta z >1 lotniskiem. metroCode ustawiony WYŁĄCZNIE dla kodów
// zweryfikowanych empirycznie (LiteAPI rozwija je natywnie). Reszta = fan-out.

export const AIRPORT_GROUPS: readonly AirportGroup[] = [
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
    airportCodes: ["LHR", "LGW", "STN", "LTN", "LCY"],
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
    const warsaw = AIRPORT_GROUPS.find((g) => g.id === "warsaw-all");
    const london = AIRPORT_GROUPS.find((g) => g.id === "london-all");
    const popularCodes = ["WAW", "KRK", "GDN", "WRO", "KTW", "POZ"];
    const opts: AirportOption[] = [];
    if (warsaw) opts.push({ kind: "group", group: warsaw });
    for (const c of popularCodes) {
      const a = lookupAirport(c);
      if (a) opts.push({ kind: "airport", airport: a });
    }
    if (london) opts.push({ kind: "group", group: london });
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
