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
import { defaultMonth, missingFields, normalizeIntent } from "./budget";
import { rankSnapshotCandidates } from "./snapshot-candidates";
import type { ConciergeSnapshot } from "@/lib/snapshot/types";
import { addDaysIso, travelToday } from "@/lib/time/travel-now";
import {
  isBookableStart,
  isWithinSaleHorizon,
  resolveMonthWithoutYear,
  SALE_HORIZON_DAYS,
} from "./travel-dates";
import { budgetFor, noopToolContext, type ToolContext } from "./tool-context";
import {
  matchesTheme,
  rankTripCandidates,
  resolveThemeCities,
  themePickKeysFor,
  vibeTagForTheme,
  type SeedDestinationLookup,
  type TripSearchCity,
} from "./trip-search";
import type { ComponentStatus, ConciergeIntent, OfferResultState, TripCandidate, TripOffer } from "./types";

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
          description:
            "Miesiąc planowanego wyjazdu jako liczba 1–12 (1 = styczeń, 12 = grudzień). " +
            "Polskie określenia pory roku przelicz SAM, nie pytaj o nie: wakacje/lato = 7, " +
            "ferie/zima = 2, majówka = 5, święta/sylwester = 12, wczesna jesień = 9, " +
            "po sezonie = 10. Pomiń pole tylko wtedy, gdy naprawdę nie ma żadnej wskazówki — " +
            "system założy wtedy najbliższy pełny miesiąc i poda go w wyniku.",
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
      // month POZA required: „w wakacje", „po sezonie", „na dlugi weekend" to
      // nie sa liczby, a wymuszanie ich kosztowalo cala runde dopytywania
      // (8 z 9 modeli w baterii pytalo „ktory miesiac?"). Brak miesiaca
      // wypelnia defaultMonth, a wynik mowi modelowi, co zalozono.
      required: ["adults", "wantsFlight", "wantsHotel"],
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
        wantsFlight: {
          type: "boolean",
          description:
            "Ustaw false TYLKO, gdy użytkownik jawnie chce ofertę BEZ lotu (sam hotel) — karta i cena obejmą wtedy tylko hotel.",
        },
        wantsHotel: {
          type: "boolean",
          description: "Ustaw false TYLKO, gdy użytkownik jawnie chce SAM lot (bez hotelu).",
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
  stars?: number | null;
  reviewCount?: number | null;
  address?: string | null;
  roomName?: string | null;
  boardName?: string | null;
  refundableTag?: string | null;
  cancellationDeadline?: string | null;
  freeCancellationDeadline?: string | null;
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
  /**
   * Ile czasu wolno poświęcić na ŻYWE wyszukanie lotu (ms). Liczy egzekutor
   * z terminu tury — to jedyny etap, który potrafi sam przekroczyć budżet
   * całej odpowiedzi (pomiar Preview 2026-09-06: p95 14,4 s, max 28,6 s).
   */
  budgetMs?: number;
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
  outboundDurationMinutes?: number | null;
  inboundDurationMinutes?: number | null;
  hasCarryOnBag?: boolean | null;
  hasCheckedBag?: boolean | null;
  /** IATA celu ROZWIĄZANE z realnych danych (seed/słownik) — do URL wyników. */
  destinationIata: string;
}

/** Całe I/O egzekutorów — wstrzykiwane (prod: buildProductionToolDeps z ./tool-deps). */
export interface ToolDeps {
  /** Prod: readPriceSnapshot z @/lib/prices/destination-price-snapshot. */
  readSnapshot: () => Promise<DestinationPriceSnapshot | null>;
  /**
   * Snapshot V2.2 (`csnap:v1`) — rekord na (kierunek × wylot × okno), więc
   * pozwala odpowiedzieć na KONKRETNY termin. Opcjonalny z rozmysłem: dopóki
   * pierwszy build się nie opublikuje (albo gdyby padł), narzędzie schodzi na
   * `dstprice:v1` i zachowuje się dokładnie jak w V2.1.
   */
  readConciergeSnapshot?: () => Promise<ConciergeSnapshot | null>;
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
  /** Galeria szczegółów; błąd albo timeout nigdy nie blokuje oferty. */
  fetchHotelPhotoUrls: (hotelId: string) => Promise<string[]>;
  /** Wyłącznie do deterministycznego testowania krótkiego budżetu galerii. */
  galleryTimeoutMs?: number;
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
  /**
   * GOTOWY zapas/os. względem budżetu użytkownika (próg − perPersonPln) —
   * liczy SYSTEM, model tylko cytuje (bateria konwersyjna: Haiku liczył
   * zapasy kandydatów sam i potrafił się mylić). null = brak budżetu.
   */
  zapasPln: number | null;
  /** Liczba nocy, dla ktorej policzono perPersonPln — bez niej model
   *  porownywal pobyty 4- i 7-nocne jako rownowazne „od X zl/os.". */
  nights: number | null;
  checkin: string | null;
  checkout: string | null;
  /**
   * Czy `checkin` wypada w MIESIĄCU, o który pytał użytkownik.
   * null = miesiąca nie da się porównać (brak dat albo brak miesiąca).
   *
   * Snapshot ma ceny wyłącznie na dwa wygrzane okna (pomiar produkcyjny
   * 2026-09-06: 33 kierunki na 19–23 października i 12 na 7–14 listopada),
   * więc pytanie „wakacje" prawie zawsze dostaje wycenę z innego miesiąca.
   * Prompt każe wtedy powiedzieć „orientacyjnie, dla terminu X" — ale model
   * musiał to WYWNIOSKOWAĆ z porównania dat. Teraz dostaje gotową flagę.
   */
  monthMatch: boolean | null;
  /**
   * Czy kierunek pasuje do motywu użytkownika (tagi kierunku z seedu).
   * null = motywu nie podano. Model dostaje to WPROST, żeby przy zapytaniu
   * „Grecja na plażę" umiał powiedzieć, który kierunek jest plażowy, a który
   * dorzucamy jako alternatywę mimo innego charakteru.
   */
  themeMatch: boolean | null;
  /**
   * EXACT = termin zgadza się z prośbą użytkownika (miesiąc i długość pobytu).
   * NEAREST = mamy tylko sąsiedni termin — model MA to powiedzieć, zamiast
   * podawać cenę innego terminu jako odpowiedź na pytanie. null = ścieżka bez
   * rekordów okien.
   */
  matchType: "EXACT" | "NEAREST" | null;
}

export interface SearchTripsResult {
  candidates: ModelTripCandidate[];
  /** Powód pustej listy — bot komunikuje go użytkownikowi wprost. */
  reason?: string;
  /** Instrukcja interpretacji dla modelu (dokleja się do wyniku). */
  note?: string;
}

/** Nazwy miesiecy po polsku (miejscownik) — do nazwania zalozenia w wyniku. */
const MONTH_PL: Record<number, string> = {
  1: "styczeń", 2: "luty", 3: "marzec", 4: "kwiecień", 5: "maj", 6: "czerwiec",
  7: "lipiec", 8: "sierpień", 9: "wrzesień", 10: "październik", 11: "listopad", 12: "grudzień",
};

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
const DEFAULT_GALLERY_TIMEOUT_MS = 900;

/**
 * Widełki czasu na ŻYWE wyszukanie lotu — jedyna zależność, która potrafi
 * sama zjeść całą turę.
 *
 * POMIAR (Preview, 39 przypadków × 2 przebiegi, 2026-09-06):
 *   liteapi.flight  p50 2365 · p75 6738 · p95 14398 · max 28603 ms
 *   liteapi.hotel   p50  195 · p75  275 · p95  3369 · max  3574 ms
 *   redis.snapshot  p50  200 (suma dwóch odczytów w turze)
 *
 * Górna granica 23 s to GLOBALNY budżet obu prób razem (patrz
 * ./flight-retry i stałe w tool-deps): pierwsza dostaje 15 s, druga tylko
 * resztę. Podniesiona z 20 s po pomiarze produkcyjnym, w którym twardy limit
 * 20 s bez ponowienia zamieniał 6 z 72 ofert VALID w PARTIAL. Dolna granica
 * 6 s: poniżej tego i tak nic sensownego nie zdąży wrócić, więc lepiej od
 * razu oddać ofertę częściową niż udawać, że szukamy.
 */
const FLIGHT_BUDGET_BOUNDS = { min: 6_000, max: 23_000 } as const;
const MAX_OFFER_PHOTOS = 12;

/** Miesiąc (1–12) z daty ISO albo null dla braku/nonsensu. */
function monthOfIso(iso: string | null): number | null {
  if (!iso || !ISO_DATE_RE.test(iso)) return null;
  const month = Number(iso.slice(5, 7));
  return month >= 1 && month <= 12 ? month : null;
}

function exactNightsBetween(checkin: string, checkout: string): number | null {
  const start = Date.parse(`${checkin}T00:00:00Z`);
  const end = Date.parse(`${checkout}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const nights = (end - start) / 86_400_000;
  return Number.isInteger(nights) && nights > 0 ? nights : null;
}

function normalizePhotoUrls(urls: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const raw of urls) {
    if (typeof raw !== "string" || unique.size >= MAX_OFFER_PHOTOS) break;
    const value = raw.trim();
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") unique.add(value);
    } catch {
      // Zły URL galerii wypada; nie może uszkodzić całej realnej oferty.
    }
  }
  return [...unique];
}

function resolveBeforeTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), Math.max(1, timeoutMs));
    promise.then((value) => finish(value), () => finish(fallback));
  });
}

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
function readSearchTripsArgs(args: unknown): ConciergeIntent & { country?: string; nights?: number } {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const budgetPln = asFiniteNumber(a.budgetPln);
  const month = asInt(a.month);
  const adults = asInt(a.adults);
  const children = asInt(a.children);
  // nights BYLO deklarowane w schemacie i wymuszane promptem („weekend = 3"),
  // ale egzekutor NIGDY go nie czytal — model wysylal dane donikad.
  const nightsRaw = asInt(a.nights);
  const nights = nightsRaw !== undefined && nightsRaw >= 1 ? Math.min(nightsRaw, 21) : undefined;
  return {
    theme: asTrimmedString(a.theme),
    country: asTrimmedString(a.country),
    nights,
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
  /** false = oferta bez lotu / bez hotelu (jawna prośba użytkownika). Oba false → traktujemy jak pełny pakiet. */
  wantsFlight: boolean;
  wantsHotel: boolean;
}

/** Minimalne wyprzedzenie oferty, ktora dobieramy sami (GDS ma pelna dostepnosc). */
const OFFER_LEAD_DAYS = 7;

interface MonthDates {
  checkin: string;
  checkout: string;
  /**
   * Termin jest poprawnie rozwiazany (najblizszy PRZYSZLY taki miesiac), ale
   * lezy dalej niz horyzont sprzedazy lotow — nie da sie go kupic.
   */
  beyondSaleHorizon: boolean;
}

/**
 * Konkretne daty dla miesiaca wskazanego przez uzytkownika: checkin 10. dnia
 * miesiaca (bezpiecznie w srodku, GDS ma pelna dostepnosc), co najmniej
 * OFFER_LEAD_DAYS w przyszlosc.
 *
 * ROK rozwiazuje `resolveMonthWithoutYear` (§8): zostajemy w biezacym roku,
 * dopoki w tym miesiacu miesci sie jeszcze termin, i dopiero potem skaczemy
 * na kolejny. Dzieki temu „lipiec" poproszony 10 lipca zostaje lipcem TEGO
 * roku (realny incydent — skok o rok wypychal oferte poza horyzont sprzedazy),
 * a „sierpien" poproszony 6 wrzesnia jest sierpniem NASTEPNEGO roku.
 *
 * Ten drugi przypadek jest formalnie poprawny, ale handlowo martwy: 338 dni
 * naprzod GDS nie ma jeszcze rozkladow, wiec karta wracala bez lotu i
 * wygladala na zepsuta. Dlatego funkcja nie tylko liczy daty, ale i MOWI,
 * ze wyszly poza horyzont — decyzje, co z tym zrobic, podejmuje egzekutor.
 *
 * Czysta funkcja od `todayIso` — deterministyczna w testach.
 */
function datesForMonth(month: number, nights: number, todayIso: string): MonthDates {
  const resolved = resolveMonthWithoutYear(month, todayIso, OFFER_LEAD_DAYS);
  const minStart = addDaysIso(todayIso, OFFER_LEAD_DAYS);
  // Nieznany miesiac nie powinien tu dojsc (parser tnie do 1-12), ale gdyby
  // dotarl, dajemy bezpieczny termin zamiast NaN-ow w datach.
  const checkin = resolved
    ? (() => {
        const tenth = `${resolved.year}-${String(month).padStart(2, "0")}-10`;
        return tenth < minStart ? minStart : tenth;
      })()
    : minStart;
  return {
    checkin,
    checkout: addDaysIso(checkin, nights),
    beyondSaleHorizon: !isWithinSaleHorizon(checkin, todayIso),
  };
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
  // Sam hotel / sam lot — jawne false od modelu; oba false to nonsens → pełny pakiet.
  let wantsFlight = a.wantsFlight !== false;
  let wantsHotel = a.wantsHotel !== false;
  if (!wantsFlight && !wantsHotel) {
    wantsFlight = true;
    wantsHotel = true;
  }

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
    wantsFlight,
    wantsHotel,
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
  /**
   * Snapshot cen odczytany RAZ na turę (§21). Trzymamy PROMISE w kontekście,
   * więc search_trips i auto-oferta dzielą JEDEN lot do Redisa zamiast robić
   * dwa round-tripy po tę samą wartość.
   */
  function readSnapshotOnce(ctx: ToolContext) {
    ctx.snapshot ??= ctx.trace.measure("redis.snapshot", () => deps.readSnapshot());
    return ctx.snapshot;
  }

  /** To samo dla snapshotu V2.2 — jeden lot do Redisa na całą turę. */
  function readConciergeSnapshotOnce(ctx: ToolContext) {
    if (!deps.readConciergeSnapshot) return Promise.resolve(null);
    ctx.conciergeSnapshot ??= ctx.trace.measure("redis.csnap", () => deps.readConciergeSnapshot!());
    return ctx.conciergeSnapshot;
  }

  async function executeSearchTrips(
    args: unknown,
    ctx: ToolContext = noopToolContext(),
  ): Promise<SearchTripsResult> {
    const trace = ctx.trace;
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

    // KRAJ = FILTR TWARDY, MOTYW = PREFERENCJA (§12). Wcześniej `country`
    // WYPIERAŁO `theme`: „ciepło, plaża, Grecja" stawało się samą Grecją, a
    // lista wracała w kolejności popularności seedu — więc na plażę wychodziły
    // Ateny. Teraz kraj tylko ZAWĘŻA pulę, a motyw porządkuje ją w rankingu.
    //
    // Pulę kraju bierzemy W CAŁOŚCI: wcześniejsze `.slice(0, 6)` stało PRZED
    // rankingiem, więc odcinało kierunki, których jedyną winą była pozycja
    // w seedzie. Pomiar na produkcyjnym snapshocie (2026-09-06): 12 z 46
    // wycenionych kierunków było w ten sposób NIEOSIĄGALNYCH — cała Grecja
    // wyspiarska (Rodos, Kos, Zakynthos), południe Włoch (Bari, Katania,
    // Palermo) i sześć hiszpańskich, w tym Teneryfa i Palma. Ranking jest
    // czysty (odczyty z mapy, zero I/O), więc pełna pula nic nie kosztuje.
    let cities: TripSearchCity[];
    if (country) {
      cities = deps.listDestinationsInCountry(country);
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
    // Klient nie podal miesiaca -> zakladamy najblizszy pelny i MOWIMY o tym
    // modelowi, zeby nazwal zalozenie zamiast pytac (zasada „TY prowadzisz").
    const assumedMonth = parsed.month === undefined ? defaultMonth(now()) : null;
    // Miesiąc, którego SZUKAMY w oknach: podany przez użytkownika albo założony.
    const searchMonth = parsed.month ?? assumedMonth ?? undefined;
    // Picki motywu liczymy TYLKO wtedy, gdy pula NIE pochodzi z tego motywu
    // (ścieżka „konkretny kraj"). Przy szukaniu po motywie pula JEST jego
    // pickami, więc zbiór byłby zbędną pracą.
    const pickKeysForRank = country ? themePickKeysFor(intent.theme, deps.resolveDest) : undefined;

    // ── Źródło kandydatów: NAJPIERW csnap:v1 (rekord na okno, więc umie
    // odpowiedzieć na konkretny miesiąc i długość pobytu), a gdy go nie ma —
    // dstprice:v1 dokładnie jak w V2.1. Fallback jest świadomy: pierwszy build
    // snapshotu musi się dopiero opublikować, a awaria nowej warstwy nie może
    // zabrać konsjerżowi cen, które już działały.
    const csnap = await readConciergeSnapshotOnce(ctx);
    const csnapRecords = csnap ? Object.values(csnap.records) : [];
    const stopRank = trace.start("rank", { cities: cities.length, source: csnapRecords.length > 0 ? "csnap" : "dstprice" });
    // NAJPIERW pełny ranking całej puli, DOPIERO POTEM przycięcie do listy
    // pokazywanej modelowi (§13).
    let ranked: TripCandidate[] = [];
    let snapshot: DestinationPriceSnapshot | null = null;
    if (csnapRecords.length > 0) {
      ranked = rankSnapshotCandidates(
        cities,
        csnapRecords,
        { budgetPln: perPersonCap, budgetKind: "per_person" },
        now(),
        {
          month: searchMonth,
          nights: parsed.nights,
          origin: intent.origin,
          themeSlug: intent.theme,
          themePickKeys: pickKeysForRank ?? themePickKeysFor(intent.theme, deps.resolveDest),
        },
      ).slice(0, MAX_TRIP_CANDIDATES);
    } else {
      snapshot = await readSnapshotOnce(ctx);
      ranked = snapshot
        ? rankTripCandidates(
            cities,
            snapshot,
            { budgetPln: perPersonCap, budgetKind: "per_person" },
            now(),
            {
              nights: parsed.nights,
              themeSlug: intent.theme,
              themePickKeys: pickKeysForRank,
            },
          ).slice(0, MAX_TRIP_CANDIDATES)
        : [];
    }
    stopRank({ ranked: ranked.length });

    if (ranked.length > 0) {
      // Kształt DLA MODELU: tylko cena pakietu/os. — bez cen jednostkowych,
      // których model nie umie poprawnie sumować (patrz ModelTripCandidate).
      // Miesiąc, o który REALNIE pytał użytkownik (albo założony domyślny) —
      // do porównania z oknem, z którego pochodzi cena.
      const wantedMonth = parsed.month ?? assumedMonth;
      const candidates: ModelTripCandidate[] = ranked.map((c) => ({
        cityEn: c.cityEn,
        countryEn: c.countryEn,
        cityPl: c.cityPl,
        perPersonPln: c.perPersonPln,
        zapasPln: noBudget ? null : perPersonCap - c.perPersonPln,
        nights: c.nights,
        checkin: c.checkin,
        checkout: c.checkout,
        themeMatch: c.themeMatch,
        monthMatch: monthOfIso(c.checkin) === null || wantedMonth === null
          ? null
          : monthOfIso(c.checkin) === wantedMonth,
        matchType: c.matchType ?? null,
      }));
      const themedFirst = candidates.some((c) => c.themeMatch === true);
      return {
        candidates,
        note:
          "perPersonPln to ORIENTACYJNA cena pakietu lot+hotel na osobę za `nights` nocy w oknie checkin–checkout. Pole matchType=\"NEAREST\" znaczy, że NIE mamy ceny na termin, o który pytał użytkownik, tylko na najbliższy inny — powiedz to jednym zdaniem. Pole monthMatch=false znaczy, że to INNY miesiąc niż ten, o który pytał użytkownik — powiedz to wtedy wprost jednym zdaniem („orientacyjnie, dla terminu X”) i dodaj, że dokładną cenę na JEGO termin pokazuje karta oferty. Nie sprawdzaj tego sam z dat: cytuj monthMatch. Kwotę podawaj jako „od X zł/os. za N nocy”, a zapas/os. bierz z GOTOWEGO pola zapasPln — nie licz go sam. Nie rozbijaj na lot/hotel i nie sumuj." +
          // KOLEJNOŚĆ musi być opisana zgodnie z prawdą: gdy motyw przestawił
          // listę, zdanie „posortowane od najtańszego" byłoby nieprawdą, a
          // model cytowałby najtańszą pozycję jako pierwszą wbrew wynikowi.
          (themedFirst
            ? " Lista zaczyna się od kierunków pasujących do motywu (themeMatch=true), a w każdej grupie idzie od najtańszego. Kierunek z themeMatch=false podawaj jako alternatywę i powiedz, że ma inny charakter."
            : " Lista jest posortowana od najtańszego.") +
          (noBudget
            ? " Użytkownik NIE podał budżetu. Przy prezentacji karty zapytaj krótko o budżet, żeby policzyć zapas."
            : "") +
          (assumedMonth !== null
            ? ` Użytkownik NIE podał miesiąca — przyjęto ${assumedMonth} (najbliższy pełny). Nazwij to założenie JEDNYM zdaniem („zakładam ${MONTH_PL[assumedMonth]}") i pytaj o termin dopiero po pokazaniu karty.`
            : ""),
      };
    }

    if (country) {
      // Seed zna kraj, ale snapshot nie ma świeżych pakietów w budżecie (kraj
      // spoza grzanych kierunków). NIE odmawiamy: zwracamy kierunki BEZ cen —
      // realną cenę na termin użytkownika pobierze auto-oferta (live LiteAPI).
      // Bez cen nie ma czym rankować, ale kolejność wciąż ma znaczenie:
      // najpierw kierunki pasujące do motywu, potem najpopularniejsze.
      // (Wcześniej wchodziły po prostu trzy pierwsze wpisy seedu.)
      const vibeTag = vibeTagForTheme(intent.theme);
      const pickKeys = themePickKeysFor(intent.theme, deps.resolveDest);
      const ordered = [...cities].sort((a, b) => {
        const themeDelta =
          Number(matchesTheme(b, vibeTag, pickKeys)) - Number(matchesTheme(a, vibeTag, pickKeys));
        if (themeDelta !== 0) return themeDelta;
        return (b.popularity ?? 0) - (a.popularity ?? 0);
      });
      const candidates: ModelTripCandidate[] = ordered.slice(0, 3).map((c) => ({
        cityEn: c.cityEn,
        countryEn: c.countryEn,
        cityPl: c.cityPl,
        perPersonPln: null,
        zapasPln: null,
        nights: null,
        checkin: null,
        checkout: null,
        themeMatch: intent.theme ? matchesTheme(c, vibeTag, pickKeys) : null,
        monthMatch: null,
        matchType: null,
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
  async function executeGetTripOffer(
    args: unknown,
    ctx: ToolContext = noopToolContext(),
  ): Promise<TripOffer> {
    const trace = ctx.trace;
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
    // Dzien odniesienia w strefie produktu (Europe/Warsaw), nie w UTC — przez
    // dwie godziny kazdej doby UTC pokazuje dzien wczesniej, wiec granica
    // „nie z przeszlosci" przepuszczalaby dzien, ktory w Polsce juz minal.
    const todayIso = travelToday(now());
    // Data od modelu musi byc SPRZEDAWALNA (≥ jutro), nie tylko „nie wczorajsza".
    let checkin = a.checkin && isBookableStart(a.checkin, todayIso) ? a.checkin : undefined;
    let checkout = checkin ? a.checkout : undefined;
    let dateNote: string | null = null;
    if (a.checkin && !checkin) {
      console.warn(
        `[concierge] get_trip_offer: data od modelu nie do sprzedania (checkin=${a.checkin}, dziś=${todayIso}) — dobieram daty systemowo`,
      );
    }
    if ((!checkin || !checkout) && a.month) {
      const derived = datesForMonth(a.month, a.nights ?? 7, todayIso);
      if (derived.beyondSaleHorizon) {
        // Miesiac rozwiazal sie poprawnie (najblizszy przyszly), ale lezy poza
        // horyzontem sprzedazy — lot na ten termin NIE ISTNIEJE jeszcze
        // w systemie dostawcy. Zamiast wystawiac karte bez lotu, bierzemy
        // termin, ktory da sie kupic, i KAZEMY to powiedziec wprost.
        console.info(
          `[concierge] get_trip_offer: ${MONTH_PL[a.month] ?? a.month} wypada ${derived.checkin} — poza horyzontem sprzedaży (${SALE_HORIZON_DAYS} dni); dobieram najbliższy dostępny termin`,
        );
        dateNote =
          `Termin, o który prosił użytkownik (${MONTH_PL[a.month] ?? "ten miesiąc"} ${derived.checkin.slice(0, 4)}), ` +
          "jest tak daleko, że linie lotnicze nie wystawiły jeszcze na niego rozkładów. " +
          "Karta pokazuje NAJBLIŻSZY dostępny termin — powiedz to jednym zdaniem i zaproponuj, " +
          "żeby wrócił po ofertę na tamten miesiąc bliżej terminu.";
      } else {
        checkin = derived.checkin;
        checkout = derived.checkout;
      }
    }
    if (!checkin || !checkout) {
      const snapshot = await readSnapshotOnce(ctx);
      const pkg = snapshot
        ? pickFreshPackage(
            snapshot,
            dest?.city.en ?? a.cityEn,
            dest?.country.en ?? a.countryEn,
            now(),
          )
        : null;
      // Okno ze snapshotu tez przechodzi bramke czasowa — snapshot jest
      // pisany merge'em, wiec teoretycznie moze przeniesc stare okno.
      if (pkg && isBookableStart(pkg.checkin, todayIso)) {
        checkin = pkg.checkin;
        checkout = pkg.checkout;
        // Użytkownik określił DŁUGOŚĆ pobytu (np. „weekend" = 3 noce), ale nie
        // termin: szanujemy jego noce, kotwicząc start na dacie pakietu.
        // (Bez tego snapshotowe okno — zawsze 7 nocy — nadpisywało nights;
        // realny defekt z baterii smoke: „weekend w Rzymie" dawał 7 nocy.)
        if (a.nights) {
          const s = new Date(`${pkg.checkin}T00:00:00Z`);
          checkout = new Date(s.getTime() + a.nights * 86_400_000).toISOString().slice(0, 10);
        }
      } else {
        // OSTATNIA LINIA OBRONY (z logów prod 2026-07-18): kierunek bez
        // pakietu w snapshocie kończył się TWARDYM błędem → stracona runda
        // LLM i rozmowa bez karty (model musiał „odzyskiwać" przez
        // search_trips). Zamiast rzucać dobieramy termin MECHANICZNIE:
        // +21 dni (pełna dostępność GDS, poza last-minute'owym szczytem cen),
        // noce z argumentów albo 7. Ceny na karcie i tak są LIVE.
        const fallbackNights = a.nights ?? 7;
        checkin = addDaysIso(todayIso, 21);
        checkout = addDaysIso(checkin, fallbackNights);
      }
    }

    // Sam hotel / sam lot: niechcianego komponentu w ogóle NIE pobieramy —
    // szybciej, taniej (zero zbędnych wywołań LiteAPI) i uczciwie: karta oraz
    // cena/os. obejmują dokładnie to, o co prosił użytkownik.
    const hotelPromise = a.wantsHotel
      ? trace.measure("liteapi.hotel", () =>
          deps.findCheapestHotel({
            cityEn: a.cityEn, countryEn: a.countryEn,
            checkin, checkout,
            adults: a.adults, children: a.children,
          }),
        )
      : Promise.resolve(null);
    const flightPromise = a.wantsFlight
      ? trace.measure("liteapi.flight", () =>
          deps.findCheapestFlight({
            originIata: a.originIata, cityEn: a.cityEn, countryEn: a.countryEn,
            depart: checkin, returnDate: checkout,
            adults: a.adults, children: a.children,
            // Ile czasu ZOSTAŁO w turze, przycięte do sensownego zakresu.
            budgetMs: budgetFor(ctx, FLIGHT_BUDGET_BOUNDS, now()),
          }),
        )
      : Promise.resolve(null);
    // Galeria startuje natychmiast po wybraniu hotelu, równolegle z lotem. Ma
    // własny krótki limit i nie zmienia globalnego budżetu tury orkiestratora.
    const galleryPromise = hotelPromise.then((hotelData) =>
      hotelData
        ? trace.measure("liteapi.gallery", () =>
            resolveBeforeTimeout(
              deps.fetchHotelPhotoUrls(hotelData.hotelId),
              deps.galleryTimeoutMs ?? DEFAULT_GALLERY_TIMEOUT_MS,
              [],
            ),
          )
        : [],
    );
    const [hotelRes, flightRes, galleryRes] = await Promise.allSettled([
      hotelPromise,
      flightPromise,
      galleryPromise,
    ]);
    if (hotelRes.status === "rejected") {
      console.warn("[concierge] komponent hotelowy oferty nieudany:", hotelRes.reason instanceof Error ? hotelRes.reason.message : hotelRes.reason);
    }
    if (flightRes.status === "rejected") {
      console.warn("[concierge] komponent lotniczy oferty nieudany:", flightRes.reason instanceof Error ? flightRes.reason.message : flightRes.reason);
    }
    const hotelData = hotelRes.status === "fulfilled" ? hotelRes.value : null;
    const flightData = flightRes.status === "fulfilled" ? flightRes.value : null;
    const galleryUrls = galleryRes.status === "fulfilled"
      ? normalizePhotoUrls(galleryRes.value)
      : [];
    const fallbackPhotoUrls = hotelData?.mainPhotoUrl
      ? normalizePhotoUrls([hotelData.mainPhotoUrl])
      : [];
    const photoUrls = galleryUrls.length > 0 ? galleryUrls : fallbackPhotoUrls;
    const nights = exactNightsBetween(checkin, checkout);

    const hotel: TripOffer["hotel"] = hotelData
      ? {
          hotelId: hotelData.hotelId,
          name: hotelData.name,
          // PELNE zlote: model cytuje surowa liczbe z wyniku, a karta ja
          // formatuje — bez zaokraglenia u zrodla na jednym ekranie widnialy
          // DWIE rozne kwoty za to samo („9546,59 zl" w tekscie obok
          // „9 547 zl" na karcie). W gore, zgodnie z zasada „nie zanizamy".
          totalPln: Math.ceil(hotelData.totalPln),
          perNightPln: nights ? Math.round(hotelData.totalPln / nights) : null,
          mainPhotoUrl: hotelData.mainPhotoUrl,
          photoUrls,
          rating: hotelData.rating,
          stars: hotelData.stars ?? null,
          reviewCount: hotelData.reviewCount ?? null,
          address: hotelData.address ?? null,
          roomName: hotelData.roomName ?? null,
          boardName: hotelData.boardName ?? null,
          refundableTag: hotelData.refundableTag ?? null,
          cancellationDeadline: hotelData.cancellationDeadline ?? null,
          freeCancellationDeadline: hotelData.freeCancellationDeadline ?? null,
          url: buildHotelHandoffUrl(hotelData.hotelId, {
            checkin, checkout,
            adults: a.adults, children: a.children,
          }),
        }
      : null;

    const flight: TripOffer["flight"] = flightData
      ? {
          totalPln: Math.ceil(flightData.totalPln),
          carrierName: flightData.carrierName,
          outboundDepartureTime: flightData.outboundDepartureTime,
          inboundDepartureTime: flightData.inboundDepartureTime,
          stops: flightData.stops,
          outboundDurationMinutes: flightData.outboundDurationMinutes ?? null,
          inboundDurationMinutes: flightData.inboundDurationMinutes ?? null,
          hasCarryOnBag: flightData.hasCarryOnBag === true ? true : null,
          hasCheckedBag: flightData.hasCheckedBag === true ? true : null,
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

    // Suma na osobę TYLKO gdy wszystkie CHCIANE komponenty realne (konwencja
    // jak computePackagePerPerson: hotel na głowy + lot już za wszystkich;
    // ceil — nie zaniżamy). Przy wantsFlight=false to uczciwa cena SAMEGO
    // hotelu/os. Brak chcianego komponentu → null + partial, bot mówi wprost.
    const totalPax = a.adults + a.children;
    const allWantedPresent =
      (!a.wantsHotel || hotel !== null) && (!a.wantsFlight || flight !== null);
    // STAN WYNIKU (§16). „Brak hotelu i brak lotu" NIE jest ofertą częściową —
    // to brak oferty. Rozróżnienie musi być tutaj, bo `partial:true` mówiło to
    // samo o „mam hotel bez lotu" i o „nie mam nic", a orkiestrator na tej
    // podstawie renderował użytkownikowi pustą kartę z samymi datami.
    const resultState: OfferResultState =
      hotel === null && flight === null ? "unavailable" : allWantedPresent ? "valid" : "partial";
    // Stan KAŻDEGO składnika z osobna — po ZAKOŃCZONYM wyszukiwaniu, więc
    // nigdy „w trakcie". Bez tego model musiał wnioskować z `hotel: null`
    // i potrafił obiecać użytkownikowi, że lot „zaraz się doczyta".
    const statusOf = (wanted: boolean, value: unknown): ComponentStatus =>
      !wanted ? "not_requested" : value !== null ? "confirmed" : "unavailable";
    const hotelStatus = statusOf(a.wantsHotel, hotel);
    const flightStatus = statusOf(a.wantsFlight, flight);
    const totalPln = allWantedPresent && (hotel || flight)
      ? Math.ceil((hotel?.totalPln ?? 0) + (flight?.totalPln ?? 0))
      : null;
    const totalPerPersonPln = totalPln !== null
      ? Math.ceil(totalPln / totalPax)
      : null;

    return {
      cityEn: a.cityEn,
      countryEn: a.countryEn,
      cityPl,
      checkin,
      checkout,
      nights,
      adults: a.adults,
      children: a.children,
      originIata: a.originIata,
      hotel,
      flight,
      totalPln,
      totalPerPersonPln,
      partial: !allWantedPresent,
      resultState,
      hotelStatus,
      flightStatus,
      wantsFlight: a.wantsFlight,
      wantsHotel: a.wantsHotel,
      dateNote,
    };
  }

  /** list_themes: realne slugi + etykiety z TRAVEL_MOODS (zero zgadywania nazw). */
  function executeListThemes(): { themes: Array<{ slug: string; label: string }> } {
    return { themes: TRAVEL_MOODS.map((m) => ({ slug: m.slug, label: m.label })) };
  }

  return { executeSearchTrips, executeGetTripOffer, executeListThemes };
}
