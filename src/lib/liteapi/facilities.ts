// Normalise + localise + group a hotel's facility/amenity data for the detail
// page. LiteAPI returns this under several keys (`amenities`, `hotelFacilities`,
// `facilities`) with inconsistent shapes — plain strings for some suppliers,
// `{ name }` objects for others — so everything here is DEFENSIVE: anything it
// can't read is skipped, never thrown.
//
// Honesty rule: every item is REAL supplier data. We only (a) relabel a fixed
// set of known English phrases into accurate Polish, and (b) bucket items into
// readable categories. We never invent a facility a hotel doesn't have.

// Pull a display string out of one raw facility entry (string | { name } | …).
function facilityToString(item: unknown): string | null {
  if (typeof item === "string") return item.trim() || null;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    for (const key of ["name", "facilityName", "title", "label"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

// Merge any number of raw facility arrays into a single de-duplicated string
// list (case-insensitive dedupe, original casing preserved).
export function normalizeFacilities(...sources: (unknown[] | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    for (const raw of src) {
      const s = facilityToString(raw);
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

// Exact EN→PL translations for the most common LiteAPI facility phrases.
// Unknown strings (including ones already in Polish) fall through unchanged.
const PL_DICTIONARY: Record<string, string> = {
  "free wifi": "Bezpłatne WiFi",
  "free wi-fi": "Bezpłatne WiFi",
  wifi: "WiFi",
  "wi-fi": "WiFi",
  "internet access": "Dostęp do internetu",
  internet: "Internet",
  "free parking": "Bezpłatny parking",
  parking: "Parking",
  "private parking": "Parking prywatny",
  "valet parking": "Parking z obsługą",
  "airport shuttle": "Transport na lotnisko",
  "free airport shuttle": "Bezpłatny transport na lotnisko",
  "shuttle service": "Transport (shuttle)",
  "car rental": "Wynajem samochodów",
  "swimming pool": "Basen",
  pool: "Basen",
  "outdoor pool": "Basen zewnętrzny",
  "indoor pool": "Basen kryty",
  spa: "Spa",
  "spa and wellness centre": "Centrum spa i wellness",
  sauna: "Sauna",
  "hot tub": "Jacuzzi",
  jacuzzi: "Jacuzzi",
  "fitness centre": "Siłownia / fitness",
  "fitness center": "Siłownia / fitness",
  gym: "Siłownia",
  massage: "Masaż",
  restaurant: "Restauracja",
  bar: "Bar",
  "breakfast": "Śniadanie",
  "breakfast included": "Śniadanie w cenie",
  "room service": "Room service",
  "24-hour front desk": "Recepcja czynna całą dobę",
  "24-hour room service": "Room service całą dobę",
  "front desk": "Recepcja",
  "air conditioning": "Klimatyzacja",
  heating: "Ogrzewanie",
  elevator: "Winda",
  lift: "Winda",
  "non-smoking rooms": "Pokoje dla niepalących",
  "family rooms": "Pokoje rodzinne",
  "facilities for disabled guests": "Udogodnienia dla osób z niepełnosprawnością",
  "wheelchair accessible": "Dostęp dla wózków inwalidzkich",
  "pets allowed": "Akceptujemy zwierzęta",
  "laundry": "Pralnia",
  "dry cleaning": "Pralnia chemiczna",
  "luggage storage": "Przechowalnia bagażu",
  "currency exchange": "Kantor",
  "concierge service": "Konsjerż",
  "express check-in/check-out": "Ekspresowe zameldowanie/wymeldowanie",
  "terrace": "Taras",
  garden: "Ogród",
  "private beach area": "Prywatna plaża",
  "beachfront": "Przy plaży",
  "bicycle rental": "Wypożyczalnia rowerów",
  "tea/coffee maker": "Czajnik / ekspres do kawy",
  minibar: "Minibar",
  safe: "Sejf",
  "flat-screen tv": "Telewizor płaski",
  balcony: "Balkon",
  kitchenette: "Aneks kuchenny",
  kitchen: "Kuchnia",
};

export function localizeFacility(s: string): string {
  return PL_DICTIONARY[s.toLowerCase().trim()] ?? s;
}

export interface FacilityGroup {
  key: string;
  label: string;
  icon: string;
  items: string[];
}

// Keyword buckets — matched against the ORIGINAL (lowercased) string so both
// English supplier values and any already-Polish values land correctly. Order
// matters: first match wins.
const GROUPS: { key: string; label: string; icon: string; keywords: string[] }[] = [
  { key: "internet", label: "Internet", icon: "📶", keywords: ["wifi", "wi-fi", "internet"] },
  {
    key: "transport",
    label: "Parking i transport",
    icon: "🚗",
    keywords: ["parking", "shuttle", "airport", "transfer", "car ", "samoch", "lotnisk", "rower", "bicycle"],
  },
  {
    key: "food",
    label: "Jedzenie i napoje",
    icon: "🍽️",
    keywords: ["restaurant", "bar", "breakfast", "śniad", "kitchen", "kuchni", "coffee", "kaw", "dining", "meal", "minibar", "restaurac"],
  },
  {
    key: "wellness",
    label: "Basen i wellness",
    icon: "🧖",
    keywords: ["pool", "basen", "spa", "sauna", "jacuzzi", "hot tub", "fitness", "gym", "siłown", "massage", "masaż", "wellness"],
  },
  {
    key: "services",
    label: "Usługi i recepcja",
    icon: "🛎️",
    keywords: ["front desk", "recepcj", "24-hour", "całą dobę", "concierge", "konsjer", "laundry", "praln", "room service", "luggage", "bagaż", "currency", "kantor", "elevator", "lift", "winda", "housekeeping", "check-in"],
  },
  {
    key: "room",
    label: "Wyposażenie pokoi",
    icon: "🛏️",
    keywords: ["air condition", "klimatyz", "heating", "ogrzew", "tv", "telewiz", "safe", "sejf", "balcony", "balkon", "terrace", "taras", "non-smoking", "niepaląc"],
  },
  {
    key: "family",
    label: "Dla rodzin",
    icon: "👨‍👩‍👧",
    keywords: ["family", "rodzin", "kids", "child", "dziec", "babysitting", "playground", "crib", "łóżeczk"],
  },
  {
    key: "accessibility",
    label: "Dostępność",
    icon: "♿",
    keywords: ["wheelchair", "accessible", "disabled", "niepełnospraw", "wózk"],
  },
  {
    key: "outdoor",
    label: "Na zewnątrz i widoki",
    icon: "🌅",
    keywords: ["garden", "ogród", "beach", "plaż", "sea view", "widok", "sun terrace", "patio"],
  },
];

// Group a flat list of facility strings into labelled, icon-tagged buckets,
// localising each item to Polish. Items that match no bucket land in
// "Pozostałe udogodnienia". Empty buckets are dropped.
export function groupFacilities(facilities: string[]): FacilityGroup[] {
  const buckets = new Map<string, string[]>();
  const other: string[] = [];

  for (const raw of facilities) {
    const hay = raw.toLowerCase();
    const group = GROUPS.find((g) => g.keywords.some((k) => hay.includes(k)));
    const label = localizeFacility(raw);
    if (group) {
      const arr = buckets.get(group.key) ?? [];
      arr.push(label);
      buckets.set(group.key, arr);
    } else {
      other.push(label);
    }
  }

  const result: FacilityGroup[] = [];
  for (const g of GROUPS) {
    const items = buckets.get(g.key);
    if (items && items.length) {
      result.push({ key: g.key, label: g.label, icon: g.icon, items });
    }
  }
  if (other.length) {
    result.push({ key: "other", label: "Pozostałe udogodnienia", icon: "✓", items: other });
  }
  return result;
}

// Coerce LiteAPI's `hotelImportantInformation` (string | string[] | object …)
// into a clean plain-text string, or null when there's nothing usable.
export function coerceImportantInfo(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return t || null;
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((v) => (typeof v === "string" ? v : null))
      .filter((v): v is string => Boolean(v))
      .join(" ");
    const t = joined.replace(/\s+/g, " ").trim();
    return t || null;
  }
  return null;
}
