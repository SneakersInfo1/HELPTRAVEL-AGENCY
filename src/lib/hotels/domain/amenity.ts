// Udogodnienia — deduplikacja POJĘCIOWA i typowane kategorie.
//
// Czego brakowało: `lib/liteapi/facilities.ts` deduplikuje po ZLOKALIZOWANEJ
// ETYKIECIE, co działa tylko wtedy, gdy słownik sprowadzi oba warianty do tego
// samego napisu. Tymczasem duplikaty pochodzą ze ŹRÓDŁA i są osobnymi
// rekordami:
//     { facilityId: 47,  name: "WiFi dostępne" }
//     { facilityId: 107, name: "Darmowe WiFi" }
// Dwa różne ID, dwa różne teksty, jedno pojęcie. Bez sprowadzenia do pojęcia
// gość widzi „Wi-Fi" dwa razy — dokładnie to, na co skarżył się właściciel.
//
// Ten moduł NIE zastępuje `facilities.ts` (używa go dzisiejsza strona hotelu).
// Jest warstwą domenową dla przebudowanego widoku.
//
// Ikony: nazwy z `lucide-react` (biblioteka jest już w projekcie), NIE emoji.
// Emoji w interfejsie to jedna z rzeczy, które brief każe usunąć — dziś siedzą
// w `GROUPS` w facilities.ts.

import type { Amenity, AmenityCategory, AmenityGroup } from "./types";

/**
 * Pojęcie = to, co gość rozumie jako JEDNĄ rzecz. Klucz deduplikacji.
 *
 * Dopasowanie po wzorcu, nie po `facilityId`, bo taksonomia ID dostawcy nie
 * jest udokumentowana, a te same pojęcia mają po kilka ID. Wzorce celowo
 * łapią ZARÓWNO angielski, JAK I polski — dostawca miesza języki w jednej
 * odpowiedzi nawet przy `language=pl`.
 */
interface ConceptRule {
  concept: string;
  label: string;
  category: AmenityCategory;
  /** Nazwa ikony z lucide-react. */
  icon: string;
  match: RegExp;
}

const CONCEPTS: ConceptRule[] = [
  { concept: "wifi", label: "Bezpłatne Wi-Fi", category: "internet", icon: "Wifi", match: /wi[-\s]?fi|internet|wifi/i },
  { concept: "parking", label: "Parking", category: "parking-transport", icon: "CircleParking", match: /parking|parkow/i },
  { concept: "airport-shuttle", label: "Transfer z lotniska", category: "parking-transport", icon: "PlaneTakeoff", match: /shuttle|airport transfer|transfer.*lotnisk|lotnisk.*transfer/i },
  { concept: "pool", label: "Basen", category: "pool-wellness", icon: "Waves", match: /\bpool\b|basen/i },
  { concept: "spa", label: "Spa i wellness", category: "pool-wellness", icon: "Flower2", match: /\bspa\b|wellness|sauna|jacuzzi/i },
  { concept: "gym", label: "Centrum fitness", category: "pool-wellness", icon: "Dumbbell", match: /gym|fitness|siłown/i },
  { concept: "restaurant", label: "Restauracja", category: "food-drink", icon: "UtensilsCrossed", match: /restaurant|restaurac/i },
  { concept: "bar", label: "Bar", category: "food-drink", icon: "Martini", match: /\bbar\b/i },
  { concept: "breakfast", label: "Śniadanie", category: "food-drink", icon: "Croissant", match: /breakfast|śniadan/i },
  { concept: "room-service", label: "Obsługa pokojowa", category: "services", icon: "ConciergeBell", match: /room service|obsługa pokojowa/i },
  { concept: "reception-24h", label: "Recepcja całodobowa", category: "services", icon: "Clock", match: /24[-\s]?hour front desk|24h|całodobow/i },
  { concept: "ac", label: "Klimatyzacja", category: "room", icon: "Snowflake", match: /air condition|klimatyzac/i },
  { concept: "heating", label: "Ogrzewanie", category: "room", icon: "Thermometer", match: /heating|ogrzewan/i },
  { concept: "tv", label: "Telewizor", category: "room", icon: "Tv", match: /\btv\b|telewiz/i },
  { concept: "kitchen", label: "Aneks kuchenny", category: "room", icon: "CookingPot", match: /kitchen|kuchni|kuchenn/i },
  { concept: "laundry", label: "Pralnia", category: "services", icon: "WashingMachine", match: /laundry|pralni|dry clean/i },
  { concept: "non-smoking", label: "Pokoje dla niepalących", category: "room", icon: "CigaretteOff", match: /non[-\s]?smoking|niepal/i },
  { concept: "family", label: "Pokoje rodzinne", category: "family", icon: "Users", match: /family room|pokoje rodzinne|rodzinn/i },
  { concept: "kids", label: "Udogodnienia dla dzieci", category: "family", icon: "Baby", match: /\bkids?\b|children|dzieci|playground/i },
  { concept: "pets", label: "Zwierzęta dozwolone", category: "pets", icon: "PawPrint", match: /pets? allowed|zwierz/i },
  { concept: "accessible", label: "Udogodnienia dla osób z niepełnosprawnościami", category: "accessibility", icon: "Accessibility", match: /wheelchair|disabled|accessib|niepełnospraw/i },
  { concept: "elevator", label: "Winda", category: "services", icon: "MoveVertical", match: /elevator|\blift\b|winda/i },
  { concept: "terrace", label: "Taras", category: "outdoor", icon: "TreePalm", match: /terrace|taras|balcony|balkon/i },
  { concept: "garden", label: "Ogród", category: "outdoor", icon: "Trees", match: /garden|ogród|ogrod/i },
  { concept: "beach", label: "Przy plaży", category: "outdoor", icon: "Umbrella", match: /beach|plaż/i },
  { concept: "safe", label: "Sejf", category: "room", icon: "Lock", match: /\bsafe\b|sejf/i },
  { concept: "business", label: "Sale konferencyjne", category: "services", icon: "Presentation", match: /meeting|conference|banquet|konferenc|bankiet/i },
];

/** Wyciąga tekst i `facilityId` z surowego wpisu (kształty dostawców różnią się). */
function readRaw(item: unknown): { text: string; facilityId: number | null } | null {
  if (typeof item === "string") {
    const t = item.trim();
    return t ? { text: t, facilityId: null } : null;
  }
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const id = typeof o.facilityId === "number" ? o.facilityId : null;
    for (const key of ["name", "facilityName", "title", "label"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return { text: v.trim(), facilityId: id };
    }
  }
  return null;
}

const CATEGORY_ORDER: AmenityCategory[] = [
  "internet",
  "parking-transport",
  "food-drink",
  "pool-wellness",
  "room",
  "services",
  "family",
  "outdoor",
  "accessibility",
  "pets",
  "other",
];

export const CATEGORY_LABELS: Record<AmenityCategory, string> = {
  internet: "Internet",
  "parking-transport": "Parking i transport",
  "food-drink": "Jedzenie i napoje",
  "pool-wellness": "Basen i wellness",
  room: "W pokojach",
  services: "Usługi i recepcja",
  family: "Dla rodzin",
  accessibility: "Dostępność",
  outdoor: "Na zewnątrz",
  pets: "Zwierzęta",
  other: "Pozostałe",
};

/** Ikona dla pojęcia; `null` dla wpisów nierozpoznanych (widok da neutralny check). */
export function iconForAmenity(amenity: Amenity): string | null {
  const rule = CONCEPTS.find((c) => c.label === amenity.label);
  return rule?.icon ?? null;
}

/**
 * Normalizuje surowe listy udogodnień do pojęć — bez duplikatów.
 *
 * Wpisy nierozpoznane NIE giną: trafiają do kategorii „Pozostałe" z oryginalną
 * treścią. Kasowanie realnej informacji o obiekcie byłoby gorsze niż nadmiar.
 */
export function normalizeAmenities(
  ...sources: (unknown[] | null | undefined)[]
): Amenity[] {
  return normalizeAmenitiesWith({}, ...sources);
}

/**
 * Wariant z wstrzykniętym słownikiem `facilityId → nazwa PL`.
 *
 * Po co osobna funkcja: słownik referencyjny LiteAPI waży ~37 kB i jest
 * potrzebny WYŁĄCZNIE na serwerze. Import wprost w tym module wciągnąłby go
 * do każdej paczki, która dotyka udogodnień. Wstrzyknięcie przez argument to
 * ten sam wzorzec, którego projekt używa dla zależności serwerowych
 * (`concierge/tool-deps.ts`).
 *
 * Zysk: **814 z 814 udogodnień ma polskie tłumaczenie od dostawcy**, więc
 * pozycje spoza naszych 27 pojęć przestają wyświetlać się po angielsku.
 */
export function normalizeAmenitiesWith(
  deps: { facilityLabel?: (facilityId: number | null) => string | null },
  ...sources: (unknown[] | null | undefined)[]
): Amenity[] {
  const byConcept = new Map<string, Amenity>();
  const unknown = new Map<string, Amenity>();

  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    for (const item of src) {
      const raw = readRaw(item);
      if (!raw) continue;

      // Nazwa urzędowa od dostawcy ma pierwszeństwo przed tekstem z rekordu
      // hotelu — ten bywa angielski nawet przy `language=pl`.
      const official = deps.facilityLabel?.(raw.facilityId) ?? null;
      if (official) raw.text = official;

      const rule = CONCEPTS.find((c) => c.match.test(raw.text));
      if (rule) {
        // Pierwsze wystąpienie wygrywa; zachowujemy `facilityId`, jeśli jest —
        // przyda się przy filtrach na liście (`facilityIds` z /data/hotels).
        if (!byConcept.has(rule.concept)) {
          byConcept.set(rule.concept, {
            facilityId: raw.facilityId,
            label: rule.label,
            category: rule.category,
          });
        }
        continue;
      }

      const key = raw.text.toLowerCase();
      if (!unknown.has(key)) {
        unknown.set(key, { facilityId: raw.facilityId, label: raw.text, category: "other" });
      }
    }
  }

  return [...byConcept.values(), ...unknown.values()];
}

/** Grupuje udogodnienia w kategorie w ustalonej kolejności. */
export function groupAmenities(amenities: Amenity[]): AmenityGroup[] {
  const buckets = new Map<AmenityCategory, Amenity[]>();
  for (const a of amenities) {
    const arr = buckets.get(a.category) ?? [];
    arr.push(a);
    buckets.set(a.category, arr);
  }
  const out: AmenityGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const items = buckets.get(category);
    if (items?.length) out.push({ category, items });
  }
  return out;
}

/**
 * Najważniejsze udogodnienia do widoku skróconego (brief §14.4).
 * Kolejność kategorii = kolejność ważności dla gościa.
 */
export function topAmenities(amenities: Amenity[], limit = 8): Amenity[] {
  const rank = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
  return [...amenities]
    .sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99))
    .slice(0, limit);
}
