// Narzędzia function-calling dla AI Concierge (OpenRouter / OpenAI
// Chat Completions "tools" format): SCHEMATY (TOOL_DEFS) + EGZEKUTORY
// (createToolExecutors, Task 2.2 — sekcja niżej).
//
// Opisy (description) są po polsku i celowo dyrektywne — sterują modelem
// przy doborze narzędzia i argumentów. Będą dostrajane podczas ewaluacji
// modelu (Faza 6) na podstawie realnych rozmów.
//
// UWAGA architektoniczna: ten plik NIE importuje statycznie żadnego modułu
// server-only (destinations-seed, liteapi) — całe I/O wchodzi przez
// wstrzykiwane ToolDeps (produkcyjne wiązanie: ./tool-deps.ts, używane
// wyłącznie w API route). Dzięki temu egzekutory testują się pod node:test
// z mockami, bez sieci.

import { buildResultsUrl } from "@/lib/flights/recovery";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import {
  pickFreshPackage,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";
import { missingFields, normalizeIntent } from "./budget";
import {
  rankTripCandidates,
  resolveThemeCities,
  type SeedDestinationLookup,
  type TripSearchCity,
} from "./trip-search";
import type { ConciergeIntent, TripOffer } from "./types";

/**
 * Wąski kształt narzędzia OpenAI/OpenRouter. Celowo `type` (nie `interface`):
 * aliasy obiektowe mają niejawną sygnaturę indeksu, więc `ToolDef[]` przechodzi
 * do `chatCompletion({ tools: Record<string, unknown>[] })` bez rzutowania.
 */
type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

/** Realne slugi motywów z TRAVEL_MOODS — nigdy nie zgadujemy/nie hardkodujemy wartości. */
const THEME_SLUGS = TRAVEL_MOODS.map((mood) => mood.slug);

// ---------------------------------------------------------------------------
// search_trips
// ---------------------------------------------------------------------------

const searchTripsTool: ToolDef = {
  type: "function",
  function: {
    name: "search_trips",
    description:
      "Szuka kierunków wyjazdu pasujących do motywu i budżetu użytkownika. " +
      "Zwraca TYLKO kierunki z realnymi, świeżymi cenami z naszej wyszukiwarki — " +
      "wyniki są jedynym źródłem cen, nigdy nie podawaj ceny spoza wyniku tego narzędzia. " +
      "Jeśli lista wyników jest pusta, oznacza to brak świeżej oferty w budżecie — " +
      "zaproponuj zwiększenie budżetu lub zmianę miesiąca, nie wymyślaj kierunku.",
    parameters: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          enum: THEME_SLUGS,
          description: "Slug motywu podróży (np. rodzaj wyjazdu, którego szuka użytkownik). Użyj list_themes, jeśli nie masz pewności co do dostępnych wartości. Możesz pominąć, gdy podajesz country.",
        },
        country: {
          type: "string",
          description:
            "Podaj, gdy użytkownik chce KONKRETNY kraj (po polsku lub angielsku, np. Grecja albo Greece) — wyszukiwanie obejmie kierunki w tym kraju zamiast motywu. Ceny na termin użytkownika pobierze system.",
        },
        budgetPln: {
          type: "number",
          description:
            "Budżet użytkownika w złotych (PLN). Pomiń TYLKO, gdy użytkownik unika podania kwoty («najtaniej», «nie wiem ile») — wyszukiwanie zwróci wtedy kierunki od najtańszego.",
        },
        budgetKind: {
          type: "string",
          enum: ["per_person", "total_two"],
          description:
            "Jak interpretować budgetPln: 'per_person' — kwota na jedną osobę, 'total_two' — kwota łącznie za WSZYSTKICH podróżnych (parę, rodzinę). Wymagane, gdy podajesz budgetPln.",
        },
        month: {
          type: "integer",
          minimum: 1,
          maximum: 12,
          description: "Miesiąc planowanego wyjazdu jako liczba 1–12 (1 = styczeń, 12 = grudzień).",
        },
        origin: {
          type: "string",
          description: "Kod IATA lotniska wylotu, np. 'WAW'. Jeśli użytkownik nie poda miasta wylotu, pomiń pole — domyślnie użyte zostanie WAW.",
        },
        adults: {
          type: "integer",
          minimum: 1,
          description: "Liczba dorosłych uczestników wyjazdu.",
        },
        children: {
          type: "integer",
          minimum: 0,
          description: "Liczba dzieci uczestniczących w wyjeździe. Pomiń, jeśli użytkownik nie wspomniał o dzieciach.",
        },
        nights: {
          type: "integer",
          minimum: 1,
          maximum: 21,
          description: "Liczba nocy, jeśli użytkownik ją podał (np. trzy noce; «weekend» = 3). Pomiń, gdy nie podał.",
        },
        wantsFlight: {
          type: "boolean",
          description: "Czy użytkownik chce, żeby wyszukiwarka uwzględniła lot.",
        },
        wantsHotel: {
          type: "boolean",
          description: "Czy użytkownik chce, żeby wyszukiwarka uwzględniła hotel.",
        },
      },
      // theme celowo POZA required: przy zapytaniu o konkretny kraj wystarczy
      // country (egzekutor wymaga theme ALBO country). budgetPln/budgetKind
      // POZA required: klient niekonkretny („najtaniej") ma dostać wyniki od
      // najtańszego zamiast kolejnej rundy dopytywania.
      required: ["month", "adults", "wantsFlight", "wantsHotel"],
    },
  },
};

// ---------------------------------------------------------------------------
// get_trip_offer
// ---------------------------------------------------------------------------

const getTripOfferTool: ToolDef = {
  type: "function",
  function: {
    name: "get_trip_offer",
    description:
      "Pobiera konkretną, aktualną ofertę (najtańszy hotel + najtańszy lot) dla wybranego kierunku i AUTOMATYCZNIE " +
      "pokazuje użytkownikowi kartę oferty z linkami «Zobacz hotel» / «Zobacz lot» — nie musisz (i nie możesz) " +
      "podawać linków samodzielnie. cityEn i countryEn podaj po angielsku (dokładnie jak w wyniku search_trips, " +
      "np. cityEn=\"Antalya\", countryEn=\"Turkey\"). Gdy użytkownik podał miesiąc/liczbę nocy — przekaż je w month/nights, " +
      "a system wyszuka PRAWDZIWE ceny na ten termin. Nigdy nie wpisuj dat ani cen z pamięci/tekstu rozmowy.",
    parameters: {
      type: "object",
      properties: {
        cityEn: {
          type: "string",
          description:
            "Angielska nazwa miasta — dokładnie ta wartość co w wyniku search_trips (pole cityEn). Gdy użytkownik chce WYSPĘ (Majorka, Kreta, Teneryfa, Gran Canaria, Madera), podaj nazwę wyspy wprost — system sam zamieni ją na główne miasto.",
        },
        countryEn: {
          type: "string",
          description: "Angielska nazwa kraju — dokładnie ta wartość co w wyniku search_trips (pole countryEn).",
        },
        month: {
          type: "integer",
          minimum: 1,
          maximum: 12,
          description:
            "OPCJONALNE. Miesiąc wyjazdu (1–12) wskazany przez użytkownika — system dobierze konkretne daty w tym miesiącu i wyszuka realne ceny.",
        },
        nights: {
          type: "integer",
          minimum: 1,
          maximum: 21,
          description: "OPCJONALNE. Liczba nocy, jeśli użytkownik ją podał (domyślnie 7).",
        },
        checkin: {
          type: "string",
          format: "date",
          description:
            "OPCJONALNE. Data zameldowania YYYY-MM-DD — podaj TYLKO jeśli masz ją z wyniku search_trips w TEJ turze. W przeciwnym razie POMIŃ (użyj month/nights albo niczego). NIGDY nie wpisuj dat z tekstu rozmowy.",
        },
        checkout: {
          type: "string",
          format: "date",
          description:
            "OPCJONALNE. Data wymeldowania YYYY-MM-DD — te same zasady co checkin.",
        },
        origin: {
          type: "string",
          description: "Kod IATA lotniska wylotu, np. 'WAW'.",
        },
        adults: {
          type: "integer",
          minimum: 1,
          description: "Liczba dorosłych uczestników wyjazdu.",
        },
        children: {
          type: "integer",
          minimum: 0,
          description: "Liczba dzieci uczestniczących w wyjeździe. Pomiń, jeśli nie dotyczy.",
        },
        budgetPln: {
          type: "number",
          description:
            "Budżet użytkownika w PLN — przekazuj ZAWSZE, gdy go znasz. System policzy zapas/przekroczenie budżetu (pole budgetFit w wyniku) — cytuj TĘ liczbę, nigdy nie licz jej samodzielnie.",
        },
        budgetKind: {
          type: "string",
          enum: ["per_person", "total_two"],
          description:
            "Jak interpretować budgetPln: 'per_person' — na osobę, 'total_two' — łącznie za WSZYSTKICH podróżnych.",
        },
      },
      required: ["cityEn", "countryEn", "origin", "adults"],
    },
  },
};

// ---------------------------------------------------------------------------
// list_themes
// ---------------------------------------------------------------------------

const listThemesTool: ToolDef = {
  type: "function",
  function: {
    name: "list_themes",
    description:
      "Zwraca listę dostępnych motywów podróży (slugów) obsługiwanych przez search_trips. " +
      "Użyj tego narzędzia, zanim zgadniesz slug motywu — nie wolno wymyślać ani zakładać nazw motywów.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

// ---------------------------------------------------------------------------
// Eksport
// ---------------------------------------------------------------------------

export const TOOL_DEFS: ToolDef[] = [searchTripsTool, getTripOfferTool, listThemesTool];

// ═══════════════════════════════════════════════════════════════════════════
// EGZEKUTORY (Task 2.2) — czysta orkiestracja nad wstrzykniętymi deps.
//
// TWARDA ZASADA UCZCIWOŚCI: egzekutor NIGDY nie zwraca ceny, której nie dostał
// z realnego źródła (snapshot crona albo żywy LiteAPI przez deps). Brak danych
// → jawny null / pusta lista z powodem — nigdy zgadywanie.
// ═══════════════════════════════════════════════════════════════════════════

/** Zapytanie o najtańszy hotel dla kierunku i dat (realny LiteAPI w prod). */
export interface CheapestHotelQuery {
  cityEn: string;
  countryEn: string;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
}

/** Najtańszy realny hotel — wszystkie pola z odpowiedzi LiteAPI. */
export interface CheapestHotel {
  hotelId: string;
  name: string;
  /** Cena za CAŁY pobyt (pokój dla wszystkich gości), PLN. */
  totalPln: number;
  mainPhotoUrl: string | null;
  /** Ocena gości (0–10) z metadanych, albo null gdy brak. */
  rating: number | null;
}

/** Zapytanie o najtańszy lot RT dla kierunku i dat (realny LiteAPI w prod). */
export interface CheapestFlightQuery {
  originIata: string;
  cityEn: string;
  countryEn: string;
  depart: string;
  returnDate: string;
  adults: number;
  children: number;
}

/** Najtańszy realny lot RT — wszystkie pola z odpowiedzi LiteAPI. */
export interface CheapestFlight {
  /** Total PLN za WSZYSTKICH pasażerów z zapytania (semantyka DisplayOffer.total). */
  totalPln: number;
  carrierName: string | null;
  outboundDepartureTime: string;
  inboundDepartureTime: string | null;
  /** Najgorsza (największa) liczba przesiadek spośród odcinków. */
  stops: number;
  /** IATA celu ROZWIĄZANE z realnych danych (seed/słownik) — do URL wyników. */
  destinationIata: string;
}

/** Całe I/O egzekutorów — wstrzykiwane (prod: buildProductionToolDeps z ./tool-deps). */
export interface ToolDeps {
  /** Prod: readPriceSnapshot z @/lib/prices/destination-price-snapshot. */
  readSnapshot: () => Promise<DestinationPriceSnapshot | null>;
  /** Prod: getDestinationByCityCountry z @/lib/mvp/destinations-seed (server-only!). */
  resolveDest: SeedDestinationLookup;
  /**
   * Kierunki seedu w danym kraju (nazwa PL/EN/kod, case-insensitive), w
   * kolejności popularności seedu. Prod: filtr listAllDestinations.
   * Potrzebne, gdy użytkownik chce KONKRETNY kraj („chcę Grecję") — motywy
   * tego nie obsłużą.
   */
  listDestinationsInCountry: (country: string) => TripSearchCity[];
  findCheapestHotel: (q: CheapestHotelQuery) => Promise<CheapestHotel | null>;
  findCheapestFlight: (q: CheapestFlightQuery) => Promise<CheapestFlight | null>;
  /** Zegar do liczenia świeżości snapshotu (testy podają stały). */
  now?: () => number;
}

/**
 * Kandydat w kształcie DLA MODELU — celowo BEZ cen jednostkowych
 * (hotel/noc, lot/os.): realna rozmowa na preview pokazała, że model
 * sumuje je błędnie po swojemu (np. „1948 zł" tam, gdzie wychodzi ~3541 zł).
 * Dostaje więc wyłącznie gotową cenę pakietu na osobę — jedyną liczbę,
 * którą ma cytować.
 */
export interface ModelTripCandidate {
  cityEn: string;
  countryEn: string;
  cityPl: string;
  /**
   * Orientacyjna cena pakietu lot+hotel NA OSOBĘ dla podanych dat.
   * null = snapshot nie ma ceny dla tego kierunku (np. zapytanie o konkretny
   * kraj spoza grzanych kierunków) — cenę zna dopiero karta oferty (live).
   */
  perPersonPln: number | null;
  checkin: string | null;
  checkout: string | null;
}

export interface SearchTripsResult {
  candidates: ModelTripCandidate[];
  /** Powód pustej listy — bot komunikuje go użytkownikowi wprost. */
  reason?: string;
  /** Instrukcja interpretacji dla modelu (dokleja się do wyniku). */
  note?: string;
}

/** Maksymalna liczba kandydatów zwracanych modelowi (karty w czacie). */
const MAX_TRIP_CANDIDATES = 5;

// ── Aliasy wysp/regionów → kanoniczne miasto seedu ───────────────────────────
// Realny incydent (preview): „A coś na Majorce do 5 tysięcy?" → model nie
// przetłumaczył wyspy na miasto-klucz seedu, poszedł w search_trips po kraju
// i użytkownik dostał kartę MADRYTU. Taniemu modelowi nie ufamy w tłumaczeniu
// nazw wysp — normalizujemy mechanicznie w egzekutorze. Klucz: lowercase
// wejście od modelu (PL/EN); wartość: kanoniczne nazwy EN zgodne z
// data/destinations.json (city.en/country.en — to także klucze snapshotu).
// Nazw już zgodnych z seedem (Rhodes/Rodos, Corfu/Korfu, Ibiza — seed
// dopasowuje city.en LUB city.pl) nie dublujemy tu bez potrzeby; mapa kryje
// wyłącznie nazwy, których seed NIE zna.
const CITY_ALIASES: Record<string, { cityEn: string; countryEn: string }> = {
  "majorka": { cityEn: "Palma", countryEn: "Spain" },
  "mallorca": { cityEn: "Palma", countryEn: "Spain" },
  "majorca": { cityEn: "Palma", countryEn: "Spain" },
  "palma de mallorca": { cityEn: "Palma", countryEn: "Spain" },
  "kreta": { cityEn: "Heraklion", countryEn: "Greece" },
  "crete": { cityEn: "Heraklion", countryEn: "Greece" },
  "gran canaria": { cityEn: "Las Palmas", countryEn: "Spain" },
  "tenerife": { cityEn: "Santa Cruz de Tenerife", countryEn: "Spain" },
  "teneryfa": { cityEn: "Santa Cruz de Tenerife", countryEn: "Spain" },
  "madera": { cityEn: "Funchal", countryEn: "Portugal" },
  "madeira": { cityEn: "Funchal", countryEn: "Portugal" },
};

// ── Parsowanie argumentów z modelu (JSON z tool-calla = nie ufamy niczemu) ──

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asTrimmedString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asInt(v: unknown): number | undefined {
  const n = asFiniteNumber(v);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/**
 * search_trips: luźne czytanie argumentów do ConciergeIntent — złe/brakujące
 * pola stają się undefined i łapie je missingFields (odpowiedź z reason,
 * BEZ rzucania — model ma dopytać użytkownika, nie dostać wyjątek).
 */
function readSearchTripsArgs(args: unknown): ConciergeIntent & { country?: string } {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const budgetPln = asFiniteNumber(a.budgetPln);
  const month = asInt(a.month);
  const adults = asInt(a.adults);
  const children = asInt(a.children);
  return {
    theme: asTrimmedString(a.theme),
    country: asTrimmedString(a.country),
    budgetPln: budgetPln !== undefined && budgetPln > 0 ? budgetPln : undefined,
    budgetKind: a.budgetKind === "per_person" || a.budgetKind === "total_two" ? a.budgetKind : undefined,
    month: month !== undefined && month >= 1 && month <= 12 ? month : undefined,
    origin: asTrimmedString(a.origin)?.toUpperCase(),
    adults: adults !== undefined && adults >= 1 ? adults : undefined,
    children: children !== undefined && children >= 0 ? children : undefined,
    wantsFlight: typeof a.wantsFlight === "boolean" ? a.wantsFlight : true,
    wantsHotel: typeof a.wantsHotel === "boolean" ? a.wantsHotel : true,
  };
}

interface GetTripOfferArgs {
  cityEn: string;
  countryEn: string;
  /** Brak/nieprawidłowe/przeszłe daty od modelu → undefined; egzekutor sam dobierze daty (month/nights albo snapshot). */
  checkin: string | undefined;
  checkout: string | undefined;
  /** Miesiąc wyjazdu wskazany przez użytkownika (1–12) — priorytet nad datami snapshotu. */
  month: number | undefined;
  /** Liczba nocy podana przez użytkownika (1–21). */
  nights: number | undefined;
  originIata: string;
  adults: number;
  children: number;
}

/**
 * Konkretne daty dla miesiąca wskazanego przez użytkownika: checkin 10. dnia
 * miesiąca (bezpiecznie w środku, GDS ma pełną dostępność), co najmniej 7 dni
 * w przyszłości. Gdy 10. dzień już minął, ale miesiąc użytkownika WCIĄŻ trwa
 * (realny incydent: 10 lipca użytkownik prosi o „lipiec" → skok na lipiec
 * NASTĘPNEGO roku = poza horyzontem sprzedaży lotów GDS → karta bez lotu),
 * bierzemy najbliższy możliwy termin w TYM miesiącu; dopiero gdy miesiąc się
 * kończy — kolejny rok. Czysta funkcja od `todayIso` — deterministyczna w testach.
 */
function datesForMonth(
  month: number,
  nights: number,
  todayIso: string,
): { checkin: string; checkout: string } {
  const today = new Date(`${todayIso}T00:00:00Z`);
  let checkinDate = new Date(Date.UTC(today.getUTCFullYear(), month - 1, 10));
  const minStart = new Date(today.getTime() + 7 * 86_400_000);
  if (checkinDate < minStart) {
    const minStartInUserMonth =
      minStart.getUTCFullYear() === today.getUTCFullYear() &&
      minStart.getUTCMonth() === month - 1;
    checkinDate = minStartInUserMonth
      ? minStart
      : new Date(Date.UTC(today.getUTCFullYear() + 1, month - 1, 10));
  }
  const checkoutDate = new Date(checkinDate.getTime() + nights * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { checkin: iso(checkinDate), checkout: iso(checkoutDate) };
}

/**
 * get_trip_offer: walidacja TWARDA (rzuca) dla pól identyfikujących
 * (miasto/kraj/wylot/pax). DATY są celowo miękkie: model potrafi odtworzyć
 * je z TEKSTU rozmowy (bez roku → zgaduje np. 2024, czyli przeszłość),
 * zamiast przepisać z wyniku search_trips. Dlatego daty nieobecne, w złym
 * formacie albo z przeszłości traktujemy jak NIEPODANE — egzekutor pobierze
 * świeże daty pakietu ze snapshotu (NASZE dane, nie LLM). Cała klasa
 * halucynacji dat znika architektonicznie.
 */
function parseGetTripOfferArgs(args: unknown): GetTripOfferArgs {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const cityEn = asTrimmedString(a.cityEn);
  const countryEn = asTrimmedString(a.countryEn);
  let checkin = asTrimmedString(a.checkin);
  let checkout = asTrimmedString(a.checkout);
  const origin = asTrimmedString(a.origin)?.toUpperCase();
  const adults = asInt(a.adults);
  const children = asInt(a.children) ?? 0;
  const monthRaw = asInt(a.month);
  const month = monthRaw !== undefined && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : undefined;
  const nightsRaw = asInt(a.nights);
  const nights =
    nightsRaw !== undefined && nightsRaw >= 1 ? Math.min(nightsRaw, 21) : undefined;

  const problems: string[] = [];
  if (!cityEn) problems.push("cityEn");
  if (!countryEn) problems.push("countryEn");
  if (!origin || !/^[A-Z]{3}$/.test(origin)) problems.push("origin");
  if (adults === undefined || adults < 1) problems.push("adults");
  if (children < 0) problems.push("children");
  if (problems.length > 0) {
    throw new Error(`get_trip_offer: nieprawidłowe argumenty: ${problems.join(", ")}`);
  }

  // Format/kolejność sprawdzamy tutaj (bez zegara — deterministycznie);
  // datę z PRZESZŁOŚCI odrzuca egzekutor przez wstrzyknięty `now()`.
  const datesInvalid =
    !checkin ||
    !checkout ||
    !ISO_DATE_RE.test(checkin) ||
    !ISO_DATE_RE.test(checkout) ||
    checkout <= checkin;
  if (datesInvalid) {
    checkin = undefined;
    checkout = undefined;
  }

  return {
    cityEn: cityEn!,
    countryEn: countryEn!,
    checkin,
    checkout,
    month,
    nights,
    originIata: origin!,
    adults: adults!,
    children,
  };
}

// ── Linki handoff (formaty skopiowane 1:1 z istniejących stron) ──────────────

/**
 * Kontrakt parametrów strony /hotele/[hotelId]: checkin, checkout, adults,
 * rooms — dokładnie jak buildInternalHotelHref (src/lib/mvp/liteapi.ts) i
 * karta wyników (result-card.tsx). Decyzja produktowa (mini-planner-form.tsx):
 * dzieci liczone jak dorośli downstream — `adults` niesie SUMĘ gości.
 */
function buildHotelHandoffUrl(
  hotelId: string,
  a: { checkin: string; checkout: string; adults: number; children: number },
): string {
  const params = new URLSearchParams({
    checkin: a.checkin,
    checkout: a.checkout,
    adults: String(a.adults + a.children),
    rooms: "1",
  });
  return `/hotele/${encodeURIComponent(hotelId)}?${params.toString()}`;
}

// ── Fabryka egzekutorów ──────────────────────────────────────────────────────

export function createToolExecutors(deps: ToolDeps) {
  const now = deps.now ?? Date.now;

  /**
   * search_trips: motyw+budżet → kandydaci ze SNAPSHOTU crona (dstprice:v1).
   * Każda kwota pochodzi 1:1 ze snapshotu (rankTripCandidates pomija kierunki
   * bez świeżego pakietu). Pusta lista zawsze niesie `reason` dla bota.
   */
  async function executeSearchTrips(args: unknown): Promise<SearchTripsResult> {
    const parsed = readSearchTripsArgs(args);
    const intent = normalizeIntent(parsed);
    const country = parsed.country;
    // Kraj zastępuje motyw jako źródło kierunków („chcę Grecję" — realny
    // incydent: motyw plaża nie miał świeżych greckich pakietów i bot
    // odmawiał, mimo że żywe ceny istnieją).
    // Budżet NIE blokuje wyszukiwania (stress-test niekonkretnego klienta:
    // „najtaniej jak się da" utykało w pętli dopytywania) — bez kwoty szukamy
    // bez limitu, a lista i tak jest posortowana od najtańszego. Kwota BEZ
    // interpretacji (budgetKind) nadal wymaga dopytania — to niejednoznaczne.
    const noBudget = intent.budgetPln === undefined || intent.budgetPln === null;
    const missing = missingFields(intent).filter(
      (f) => !(f === "theme" && country) && !(f === "budgetPln" && noBudget),
    );
    if (missing.length > 0) {
      return {
        candidates: [],
        reason: `Brak wymaganych pól: ${missing.join(", ")} — dopytaj użytkownika JEDNĄ krótką wiadomością pisaną zdaniem z przykładową odpowiedzią. Nigdy listą numerowaną.`,
      };
    }

    let cities: TripSearchCity[];
    if (country) {
      cities = deps.listDestinationsInCountry(country).slice(0, 6);
      if (cities.length === 0) {
        return {
          candidates: [],
          reason: `Nie znam kierunków w kraju „${country}” — upewnij się co do nazwy kraju albo zaproponuj motyw z list_themes.`,
        };
      }
    } else {
      cities = resolveThemeCities(intent.theme!, deps.resolveDest);
      if (cities.length === 0) {
        return { candidates: [], reason: `Nieznany motyw "${intent.theme}" — pobierz dostępne motywy przez list_themes.` };
      }
    }

    // Budżet „łącznie" dzielimy przez REALNĄ liczbę podróżnych, nie sztywno
    // przez 2 (realny incydent: rodzina 2+1 z 6000 zł łącznie dostała próg
    // 3000 zł/os. zamiast 2000 → bot ogłosił „mieści się" przy 6726 zł).
    // Przeliczenie na per_person robimy TUTAJ — rank dostaje gotowy próg.
    const paxCount = Math.max(1, (intent.adults ?? 2) + (intent.children ?? 0));
    const perPersonCap = noBudget
      ? Number.MAX_SAFE_INTEGER
      : intent.budgetKind === "total_two"
        ? Math.floor(intent.budgetPln! / paxCount)
        : intent.budgetPln!;
    const snapshot = await deps.readSnapshot();
    const ranked = snapshot
      ? rankTripCandidates(
          cities,
          snapshot,
          { budgetPln: perPersonCap, budgetKind: "per_person" },
          now(),
        ).slice(0, MAX_TRIP_CANDIDATES)
      : [];

    if (ranked.length > 0) {
      // Kształt DLA MODELU: tylko cena pakietu/os. — bez cen jednostkowych,
      // których model nie umie poprawnie sumować (patrz ModelTripCandidate).
      const candidates: ModelTripCandidate[] = ranked.map((c) => ({
        cityEn: c.cityEn,
        countryEn: c.countryEn,
        cityPl: c.cityPl,
        perPersonPln: c.perPersonPln,
        checkin: c.checkin,
        checkout: c.checkout,
      }));
      return {
        candidates,
        note:
          "perPersonPln to ORIENTACYJNA cena pakietu lot+hotel na osobę dla dat checkin–checkout (najbliższy dostępny termin). Cytuj ją jako „od X zł/os.”. Nie rozbijaj na lot/hotel i nie licz sum samodzielnie — dokładną, aktualną cenę (także na inny miesiąc) zwraca get_trip_offer." +
          (noBudget
            ? " Użytkownik NIE podał budżetu: kandydaci są posortowani od najtańszego. Przy prezentacji karty zapytaj krótko o budżet, żeby policzyć zapas."
            : ""),
      };
    }

    if (country) {
      // Seed zna kraj, ale snapshot nie ma świeżych pakietów w budżecie (kraj
      // spoza grzanych kierunków). NIE odmawiamy: zwracamy kierunki BEZ cen —
      // realną cenę na termin użytkownika pobierze auto-oferta (live LiteAPI).
      const candidates: ModelTripCandidate[] = cities.slice(0, 3).map((c) => ({
        cityEn: c.cityEn,
        countryEn: c.countryEn,
        cityPl: c.cityPl,
        perPersonPln: null,
        checkin: null,
        checkout: null,
      }));
      return {
        candidates,
        note:
          "Brak cen orientacyjnych dla tych kierunków (perPersonPln=null) — NIE podawaj ŻADNYCH kwot z pamięci. Realną, aktualną cenę pokazuje karta oferty (autoOffer) — cytuj wyłącznie ją. Alternatywy wymieniaj bez cen; jeśli cena z karty przekracza budżet użytkownika, powiedz to wprost i zaproponuj inny kierunek lub termin.",
      };
    }

    if (!snapshot) {
      return { candidates: [], reason: "Snapshot cen niedostępny — nie mamy w tej chwili świeżych cen, spróbuj później." };
    }
    return {
      candidates: [],
      reason: noBudget
        ? "Brak świeżych pakietów dla tego motywu — zaproponuj inny motyw lub miesiąc."
        : "Brak kierunków w tym budżecie/motywie — zaproponuj większy budżet lub inny motyw.",
    };
  }

  /**
   * get_trip_offer: żywa oferta (najtańszy hotel + najtańszy lot) przez deps.
   * Komponenty lecą RÓWNOLEGLE (Promise.allSettled) — awaria jednego NIE
   * zabija drugiego; brakujący komponent = null + partial:true. Rzuca tylko
   * na naprawdę nieprawidłowe argumenty.
   */
  async function executeGetTripOffer(args: unknown): Promise<TripOffer> {
    const a = parseGetTripOfferArgs(args);
    // Wyspa/region od modelu → kanoniczne miasto seedu PRZED jakimkolwiek
    // lookupem (snapshot, LiteAPI, IATA — wszystko downstream dostaje
    // znormalizowane nazwy).
    const alias = CITY_ALIASES[a.cityEn.trim().toLowerCase()];
    if (alias) {
      a.cityEn = alias.cityEn;
      a.countryEn = alias.countryEn;
    }
    // Rekord seedu: polska etykieta + KANONICZNE nazwy do klucza snapshotu
    // (pick „Palma de Mallorca" ≠ seed „Palma" — patrz resolveThemeCities).
    const dest = deps.resolveDest(a.cityEn, a.countryEn);
    const cityPl = dest?.city.pl ?? a.cityEn;

    // Daty — priorytet: (1) jawne przyszłe daty z wyniku search_trips,
    // (2) miesiąc/noce wskazane przez UŻYTKOWNIKA (live ceny na jego termin!),
    // (3) świeże daty pakietu ze snapshotu. Nigdy daty wymyślone przez LLM:
    // data z przeszłości (halucynacja roku z tekstu) jest odrzucana.
    // Porównanie przez wstrzyknięty now() — deterministyczne w testach.
    const todayIso = new Date(now()).toISOString().slice(0, 10);
    let checkin = a.checkin && a.checkin >= todayIso ? a.checkin : undefined;
    let checkout = checkin ? a.checkout : undefined;
    if (a.checkin && !checkin) {
      console.warn(
        `[concierge] get_trip_offer: data od modelu z przeszłości (checkin=${a.checkin}, dziś=${todayIso}) — dobieram daty systemowo`,
      );
    }
    if ((!checkin || !checkout) && a.month) {
      const derived = datesForMonth(a.month, a.nights ?? 7, todayIso);
      checkin = derived.checkin;
      checkout = derived.checkout;
    }
    if (!checkin || !checkout) {
      const snapshot = await deps.readSnapshot();
      const pkg = snapshot
        ? pickFreshPackage(
            snapshot,
            dest?.city.en ?? a.cityEn,
            dest?.country.en ?? a.countryEn,
            now(),
          )
        : null;
      if (!pkg) {
        throw new Error(
          "Brak świeżych dat pakietu dla tego kierunku — wywołaj search_trips i zaproponuj kierunki z jego wyniku.",
        );
      }
      checkin = pkg.checkin;
      checkout = pkg.checkout;
    }

    const [hotelRes, flightRes] = await Promise.allSettled([
      deps.findCheapestHotel({
        cityEn: a.cityEn, countryEn: a.countryEn,
        checkin, checkout,
        adults: a.adults, children: a.children,
      }),
      deps.findCheapestFlight({
        originIata: a.originIata, cityEn: a.cityEn, countryEn: a.countryEn,
        depart: checkin, returnDate: checkout,
        adults: a.adults, children: a.children,
      }),
    ]);
    if (hotelRes.status === "rejected") {
      console.warn("[concierge] komponent hotelowy oferty nieudany:", hotelRes.reason instanceof Error ? hotelRes.reason.message : hotelRes.reason);
    }
    if (flightRes.status === "rejected") {
      console.warn("[concierge] komponent lotniczy oferty nieudany:", flightRes.reason instanceof Error ? flightRes.reason.message : flightRes.reason);
    }
    const hotelData = hotelRes.status === "fulfilled" ? hotelRes.value : null;
    const flightData = flightRes.status === "fulfilled" ? flightRes.value : null;

    const hotel: TripOffer["hotel"] = hotelData
      ? {
          hotelId: hotelData.hotelId,
          name: hotelData.name,
          totalPln: hotelData.totalPln,
          mainPhotoUrl: hotelData.mainPhotoUrl,
          rating: hotelData.rating,
          url: buildHotelHandoffUrl(hotelData.hotelId, {
            checkin, checkout,
            adults: a.adults, children: a.children,
          }),
        }
      : null;

    const flight: TripOffer["flight"] = flightData
      ? {
          totalPln: flightData.totalPln,
          carrierName: flightData.carrierName,
          outboundDepartureTime: flightData.outboundDepartureTime,
          inboundDepartureTime: flightData.inboundDepartureTime,
          stops: flightData.stops,
          // Ten sam format co „Wróć do wyników" w lejku lotów i mini-planner:
          // /loty/wyniki?origin&destination&depart&return&adults&children.
          url: buildResultsUrl({
            origin: a.originIata,
            destination: flightData.destinationIata,
            depart: checkin,
            ret: checkout,
            adults: a.adults,
            children: a.children,
            infants: 0,
          }),
        }
      : null;

    // Suma na osobę TYLKO gdy oba komponenty realne (konwencja jak
    // computePackagePerPerson: hotel na głowy + lot już za wszystkich; ceil —
    // nie zaniżamy). Częściowa oferta → null, bot mówi o braku wprost.
    const totalPax = a.adults + a.children;
    const totalPerPersonPln =
      hotel && flight ? Math.ceil((hotel.totalPln + flight.totalPln) / totalPax) : null;

    return {
      cityEn: a.cityEn,
      countryEn: a.countryEn,
      cityPl,
      checkin,
      checkout,
      adults: a.adults,
      children: a.children,
      originIata: a.originIata,
      hotel,
      flight,
      totalPerPersonPln,
      partial: hotel === null || flight === null,
    };
  }

  /** list_themes: realne slugi + etykiety z TRAVEL_MOODS (zero zgadywania nazw). */
  function executeListThemes(): { themes: Array<{ slug: string; label: string }> } {
    return { themes: TRAVEL_MOODS.map((m) => ({ slug: m.slug, label: m.label })) };
  }

  return { executeSearchTrips, executeGetTripOffer, executeListThemes };
}
