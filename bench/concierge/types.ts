// Kontrakt harnessu ewaluacyjnego AI Concierge (master prompt §5, §6, §45).
//
// Ten plik jest ŹRÓDŁEM PRAWDY dla kształtu datasetu i wyniku oceny. Dataset
// (cases.ts) pisany jest pod ten interfejs; runner i sędzia go konsumują.

/** Kategorie z master promptu §5 (A–Q). */
export type EvalCategory =
  | "discovery"       // A
  | "budget"          // B
  | "family"          // C
  | "couple"          // D
  | "beach"           // E
  | "city_break"      // F
  | "flights"         // G
  | "hotels"          // H
  | "comparison"      // I
  | "follow_up"       // J
  | "ambiguous"       // K
  | "site_support"    // L
  | "bad_input"       // M
  | "multi_turn"      // N
  | "polish_natural"  // O
  | "adversarial"     // P
  | "tool_use";       // Q

export type ToolName = "search_trips" | "get_trip_offer" | "list_themes";

/**
 * Oczekiwania sprawdzane MECHANICZNIE (bez LLM) — master prompt §46:
 * „preferuj deterministic checks, LLM judge tylko dla relevance/naturalness".
 * Każde pole jest opcjonalne; sprawdzamy tylko to, co case faktycznie definiuje.
 */
export interface DeterministicExpectations {
  /** Te narzędzia MUSZĄ zostać wywołane w turze końcowej. */
  mustCallTool?: ToolName[];
  /** Te narzędzia NIE MOGĄ zostać wywołane (np. „za drogo" → nie search_trips). */
  mustNotCallTool?: ToolName[];
  /** Czy po turze użytkownik ma widzieć kartę oferty. */
  mustShowOffer?: boolean;
  /** Twardy limit długości odpowiedzi (zdania). §26 — dynamiczna długość. */
  maxSentences?: number;
  /** Bot ma przyznać, że nie ma danych na żywo (pogoda na konkretny dzień itp.). */
  mustAdmitNoLiveData?: boolean;
  /** Każda kwota w tekście musi pochodzić z wyniku narzędzia (§21). */
  forbidInventedPrice?: boolean;
  /** Maksymalna liczba znaków zapytania w odpowiedzi (§27 — max 1 dopytanie). */
  maxQuestions?: number;
  /** Odpowiedź musi zawierać którąś z tych fraz (case-insensitive). */
  mustContainAny?: string[];
  /** Odpowiedź NIE MOŻE zawierać żadnej z tych fraz (np. „BLIK" jako dostępny). */
  mustNotContain?: string[];
}

export interface EvalCase {
  /** Stabilny identyfikator, np. "A01". Używany w raportach i porównaniach. */
  id: string;
  category: EvalCategory;
  /** Kolejne wiadomości użytkownika. 1 element = tura pojedyncza. */
  turns: string[];
  expect: DeterministicExpectations;
  /** Wskazówka dla sędziego LLM: co konkretnie decyduje o dobrej odpowiedzi. */
  rubricNotes: string;
}
