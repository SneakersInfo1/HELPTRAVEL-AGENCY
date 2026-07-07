// Definicje narzędzi function-calling dla AI Concierge (OpenRouter / OpenAI
// Chat Completions "tools" format). WYŁĄCZNIE schematy — bez egzekutorów,
// bez Zod, bez I/O. Egzekutory (walidacja argumentów + wywołanie
// trip-search/oferty) trafią do tego samego pliku w kolejnym zadaniu (Task 2.2).
//
// Opisy (description) są po polsku i celowo dyrektywne — sterują modelem
// przy doborze narzędzia i argumentów. Będą dostrajane podczas ewaluacji
// modelu (Faza 6) na podstawie realnych rozmów.

import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

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
