// Pochodzenie danych profilu kierunku (SEO Data Integrity, PR #1.5).
//
// Audyt Faza 2.2 (14.09.2026): 212 z 235 profili bierze temperaturę i czas lotu
// z jednej tablicy regionu (`regionalTemperatureProfiles`, `countryAccessHours`
// w destinations.ts), a strony SEO podawały te liczby tak samo jak 23 profile
// wpisane ręcznie — w tytułach, FAQ, JSON-LD i w decyzji index/noindex.
//
// Pochodzenie nadaje ścieżka budowy profilu, nigdy wartość liczby. Profil bez
// pola (fallback wyszukiwarki, planer, profile wirtualne) jest `unknown` dla
// każdego pola, więc nowy konstruktor profilu domyślnie niczego nie „udowadnia".

export type DataProvenance =
  /** Fakt ze sprawdzalnego źródła, z datą (np. świeży rekord dostawcy). */
  | "verified"
  /** Wpisane ręcznie w danych serwisu. */
  | "curated"
  /** Wyliczone wyłącznie z wartości verified/curated (opis pogody, szacunek z odległości, budżet ze wzoru). */
  | "derived"
  /** Wspólna wartość regionu podstawiona w miejsce danych kierunku. */
  | "regional_fallback"
  /** Brak znanego źródła albo domyślne założenie. */
  | "unknown";

export const PROVENANCED_FIELDS = ["temperature", "flightDuration", "price", "visa", "weather", "seasonality"] as const;

export type ProvenancedField = (typeof PROVENANCED_FIELDS)[number];

export type DestinationDataProvenance = Readonly<Record<ProvenancedField, DataProvenance>>;

export type FactGradeProvenance = Extract<DataProvenance, "verified" | "curated">;

/** 23 profile z `curatedDestinations`. */
export const CURATED_PROFILE_PROVENANCE: DestinationDataProvenance = Object.freeze({
  temperature: "curated",
  flightDuration: "curated",
  // Budżet to wzór (costIndex × czas lotu) z wartości ręcznych — szacunek, nie cena.
  price: "derived",
  // Ręczny przełącznik bez udokumentowanego źródła. Claim wizowy wymaga `verified`.
  visa: "curated",
  weather: "derived",
  seasonality: "derived",
});

/** 212 profili z `buildGeneratedDestinationProfile`. */
export const GENERATED_PROFILE_PROVENANCE: DestinationDataProvenance = Object.freeze({
  temperature: "regional_fallback",
  flightDuration: "regional_fallback",
  price: "regional_fallback",
  // „Bez wizy" wszędzie poza listą trzech krajów — założenie, a nie źródło.
  visa: "unknown",
  weather: "regional_fallback",
  seasonality: "regional_fallback",
});

export function provenanceOf(
  profile: { provenance?: DestinationDataProvenance },
  field: ProvenancedField,
): DataProvenance {
  return profile.provenance?.[field] ?? "unknown";
}

/**
 * Czy wartość wolno podać jako precyzyjny fakt: title, H1, FAQ, JSON-LD, OG
 * i treść. Wiza jest ostrzejsza (claim prawny) — patrz lib/seo/destination-facts.ts.
 */
export function isFactGrade(provenance: DataProvenance): provenance is FactGradeProvenance {
  return provenance === "verified" || provenance === "curated";
}

/** Pochodzenie wartości wyliczonej z innych: decyduje najsłabsze wejście. */
export function derivedProvenance(...inputs: DataProvenance[]): DataProvenance {
  if (inputs.length === 0 || inputs.includes("unknown")) return "unknown";
  if (inputs.includes("regional_fallback")) return "regional_fallback";
  return "derived";
}
