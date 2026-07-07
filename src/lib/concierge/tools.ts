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
import type { DestinationPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import { missingFields, normalizeIntent } from "./budget";
import {
  rankTripCandidates,
  resolveThemeCities,
  type SeedDestinationLookup,
} from "./trip-search";
import type { ConciergeIntent, TripCandidate, TripOffer } from "./types";

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
          description: "Slug motywu podróży (np. rodzaj wyjazdu, którego szuka użytkownik). Użyj list_themes, jeśli nie masz pewności co do dostępnych wartości.",
        },
        budgetPln: {
          type: "number",
          description: "Budżet użytkownika w złotych (PLN).",
        },
        budgetKind: {
          type: "string",
          enum: ["per_person", "total_two"],
          description: "Jak interpretować budgetPln: 'per_person' — kwota na jedną osobę, 'total_two' — kwota łącznie za dwie osoby.",
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
        wantsFlight: {
          type: "boolean",
          description: "Czy użytkownik chce, żeby wyszukiwarka uwzględniła lot.",
        },
        wantsHotel: {
          type: "boolean",
          description: "Czy użytkownik chce, żeby wyszukiwarka uwzględniła hotel.",
        },
      },
      required: ["theme", "budgetPln", "budgetKind", "month", "adults", "wantsFlight", "wantsHotel"],
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
      "Pobiera konkretną, aktualną ofertę (najtańszy hotel + najtańszy lot) dla wybranego kierunku. " +
      "WAŻNE: cityEn, countryEn, checkin i checkout MUSZĄ pochodzić dosłownie (verbatim) z wcześniejszego " +
      "wyniku narzędzia search_trips dla tego samego kierunku — nigdy nie wolno ich zgadywać ani wpisywać " +
      "z pamięci. Jeśli nie masz świeżego wyniku search_trips dla tego kierunku, najpierw wywołaj search_trips.",
    parameters: {
      type: "object",
      properties: {
        cityEn: {
          type: "string",
          description: "Angielska nazwa miasta — dokładnie ta wartość co w wyniku search_trips (pole cityEn).",
        },
        countryEn: {
          type: "string",
          description: "Angielska nazwa kraju — dokładnie ta wartość co w wyniku search_trips (pole countryEn).",
        },
        checkin: {
          type: "string",
          format: "date",
          description: "Data zameldowania w formacie YYYY-MM-DD — dokładnie ta wartość co w wyniku search_trips (pole checkin).",
        },
        checkout: {
          type: "string",
          format: "date",
          description: "Data wymeldowania w formacie YYYY-MM-DD — dokładnie ta wartość co w wyniku search_trips (pole checkout).",
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
      },
      required: ["cityEn", "countryEn", "checkin", "checkout", "origin", "adults"],
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
  findCheapestHotel: (q: CheapestHotelQuery) => Promise<CheapestHotel | null>;
  findCheapestFlight: (q: CheapestFlightQuery) => Promise<CheapestFlight | null>;
  /** Zegar do liczenia świeżości snapshotu (testy podają stały). */
  now?: () => number;
}

export interface SearchTripsResult {
  candidates: TripCandidate[];
  /** Powód pustej listy — bot komunikuje go użytkownikowi wprost. */
  reason?: string;
}

/** Maksymalna liczba kandydatów zwracanych modelowi (karty w czacie). */
const MAX_TRIP_CANDIDATES = 5;

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
function readSearchTripsArgs(args: unknown): ConciergeIntent {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const budgetPln = asFiniteNumber(a.budgetPln);
  const month = asInt(a.month);
  const adults = asInt(a.adults);
  const children = asInt(a.children);
  return {
    theme: asTrimmedString(a.theme),
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
  checkin: string;
  checkout: string;
  originIata: string;
  adults: number;
  children: number;
}

/**
 * get_trip_offer: walidacja TWARDA (rzuca) — te argumenty mają pochodzić
 * verbatim z wcześniejszego wyniku search_trips, więc nonsens = błąd
 * programu/modelu, nie stan do maskowania.
 */
function parseGetTripOfferArgs(args: unknown): GetTripOfferArgs {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const cityEn = asTrimmedString(a.cityEn);
  const countryEn = asTrimmedString(a.countryEn);
  const checkin = asTrimmedString(a.checkin);
  const checkout = asTrimmedString(a.checkout);
  const origin = asTrimmedString(a.origin)?.toUpperCase();
  const adults = asInt(a.adults);
  const children = asInt(a.children) ?? 0;

  const problems: string[] = [];
  if (!cityEn) problems.push("cityEn");
  if (!countryEn) problems.push("countryEn");
  if (!checkin || !ISO_DATE_RE.test(checkin)) problems.push("checkin");
  if (!checkout || !ISO_DATE_RE.test(checkout) || (checkin && checkout <= checkin)) problems.push("checkout");
  if (!origin || !/^[A-Z]{3}$/.test(origin)) problems.push("origin");
  if (adults === undefined || adults < 1) problems.push("adults");
  if (children < 0) problems.push("children");
  if (problems.length > 0) {
    throw new Error(`get_trip_offer: nieprawidłowe argumenty: ${problems.join(", ")}`);
  }
  return {
    cityEn: cityEn!,
    countryEn: countryEn!,
    checkin: checkin!,
    checkout: checkout!,
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
function buildHotelHandoffUrl(hotelId: string, a: GetTripOfferArgs): string {
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
    const intent = normalizeIntent(readSearchTripsArgs(args));
    const missing = missingFields(intent);
    if (missing.length > 0) {
      return { candidates: [], reason: `Brak wymaganych pól: ${missing.join(", ")} — dopytaj użytkownika.` };
    }

    const cities = resolveThemeCities(intent.theme!, deps.resolveDest);
    if (cities.length === 0) {
      return { candidates: [], reason: `Nieznany motyw "${intent.theme}" — pobierz dostępne motywy przez list_themes.` };
    }

    const snapshot = await deps.readSnapshot();
    if (!snapshot) {
      return { candidates: [], reason: "Snapshot cen niedostępny — nie mamy w tej chwili świeżych cen, spróbuj później." };
    }

    const candidates = rankTripCandidates(
      cities,
      snapshot,
      { budgetPln: intent.budgetPln!, budgetKind: intent.budgetKind! },
      now(),
    ).slice(0, MAX_TRIP_CANDIDATES);

    if (candidates.length === 0) {
      return { candidates, reason: "Brak kierunków w tym budżecie/motywie — zaproponuj większy budżet lub inny motyw." };
    }
    return { candidates };
  }

  /**
   * get_trip_offer: żywa oferta (najtańszy hotel + najtańszy lot) przez deps.
   * Komponenty lecą RÓWNOLEGLE (Promise.allSettled) — awaria jednego NIE
   * zabija drugiego; brakujący komponent = null + partial:true. Rzuca tylko
   * na naprawdę nieprawidłowe argumenty.
   */
  async function executeGetTripOffer(args: unknown): Promise<TripOffer> {
    const a = parseGetTripOfferArgs(args);
    // Polska nazwa z seedu (przez wstrzyknięty lookup); brak rekordu → zostaje
    // EN (to etykieta, nie cena — wolno degradować, nie wolno zgadywać kwot).
    const cityPl = deps.resolveDest(a.cityEn, a.countryEn)?.city.pl ?? a.cityEn;

    const [hotelRes, flightRes] = await Promise.allSettled([
      deps.findCheapestHotel({
        cityEn: a.cityEn, countryEn: a.countryEn,
        checkin: a.checkin, checkout: a.checkout,
        adults: a.adults, children: a.children,
      }),
      deps.findCheapestFlight({
        originIata: a.originIata, cityEn: a.cityEn, countryEn: a.countryEn,
        depart: a.checkin, returnDate: a.checkout,
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
          url: buildHotelHandoffUrl(hotelData.hotelId, a),
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
            depart: a.checkin,
            ret: a.checkout,
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
      checkin: a.checkin,
      checkout: a.checkout,
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
