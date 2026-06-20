// Normalise + localise + group a hotel's facility/amenity data for the detail
// page. LiteAPI returns this under several keys (`amenities`, `hotelFacilities`,
// `facilities`) with inconsistent shapes — plain strings for some suppliers,
// `{ name }` objects for others — so everything here is DEFENSIVE: anything it
// can't read is skipped, never thrown.
//
// Honesty rule: every item is REAL supplier data. We only (a) relabel a fixed
// set of known English phrases into accurate Polish, and (b) bucket items into
// readable categories. We never invent a facility a hotel doesn't have.

import { logUntranslated } from "./translations";

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

// Exact EN→PL translations for the LiteAPI/Cupid facility vocabulary. Keys are
// lowercased + trimmed. Unknown strings (including ones already in Polish) fall
// through unchanged via localizeFacility(). Covers the common ~95% so a Polish
// user almost never sees raw English. Translations are factual relabels only.
const PL_DICTIONARY: Record<string, string> = {
  // ── Internet ──────────────────────────────────────────────────────────
  "free wifi": "Bezpłatne WiFi",
  "free wi-fi": "Bezpłatne WiFi",
  wifi: "WiFi",
  "wi-fi": "WiFi",
  "wifi available in all areas": "WiFi w całym obiekcie",
  "wifi in public areas": "WiFi w częściach wspólnych",
  "free wifi in all rooms": "Bezpłatne WiFi we wszystkich pokojach",
  "internet access": "Dostęp do internetu",
  "dostęp do internetu": "Dostęp do internetu",
  internet: "Internet",
  "internet services": "Usługi internetowe",
  "high-speed internet": "Szybki internet",
  "free wired internet": "Bezpłatny internet przewodowy",
  "wired internet": "Internet przewodowy",
  // ── Parking i transport ──────────────────────────────────────────────
  parking: "Parking",
  "free parking": "Bezpłatny parking",
  "private parking": "Parking prywatny",
  "secured parking": "Parking strzeżony",
  "valet parking": "Parking z obsługą",
  "parking garage": "Parking w garażu",
  garage: "Garaż",
  "street parking": "Parking przy ulicy",
  "parking on site": "Parking na miejscu",
  "accessible parking": "Parking dla niepełnosprawnych",
  "electric vehicle charging station": "Stacja ładowania pojazdów elektrycznych",
  "electric bicycle charging station": "Stacja ładowania rowerów elektrycznych",
  "airport shuttle": "Transport na lotnisko",
  "free airport shuttle": "Bezpłatny transport na lotnisko",
  "airport shuttle (surcharge)": "Transport na lotnisko (dodatkowo płatny)",
  "shuttle service": "Transport (shuttle)",
  "shuttle service (surcharge)": "Transport shuttle (dodatkowo płatny)",
  "car rental": "Wynajem samochodów",
  "car hire": "Wynajem samochodów",
  "bicycle rental": "Wypożyczalnia rowerów",
  "bike rental": "Wypożyczalnia rowerów",
  "bicycle rental (surcharge)": "Wypożyczalnia rowerów (dodatkowo płatna)",
  // ── Jedzenie i napoje ────────────────────────────────────────────────
  restaurant: "Restauracja",
  "restaurant(s)": "Restauracja",
  "à la carte restaurant": "Restauracja à la carte",
  "buffet restaurant": "Restauracja w formie bufetu",
  bar: "Bar",
  "bar/lounge": "Bar / lounge",
  "snack bar": "Bar przekąskowy",
  "snack bar/deli": "Bar przekąskowy / delikatesy",
  "coffee shop on site": "Kawiarnia na miejscu",
  "coffee house on site": "Kawiarnia na miejscu",
  cafe: "Kawiarnia",
  café: "Kawiarnia",
  breakfast: "Śniadanie",
  "breakfast included": "Śniadanie w cenie",
  "breakfast in the room": "Śniadanie do pokoju",
  "breakfast options": "Opcje śniadaniowe",
  "buffet breakfast": "Śniadanie w formie bufetu",
  "continental breakfast": "Śniadanie kontynentalne",
  "packed lunches": "Lunch na wynos",
  "special diet menus (on request)": "Menu dietetyczne (na życzenie)",
  "special diet menus": "Menu dietetyczne",
  "kid meals": "Posiłki dla dzieci",
  "kids' meals": "Posiłki dla dzieci",
  "wine/champagne": "Wino / szampan",
  fruit: "Owoce",
  fruits: "Owoce",
  "vending machine (drinks)": "Automat z napojami",
  "vending machine (snacks)": "Automat z przekąskami",
  minibar: "Minibar",
  "tea/coffee maker": "Czajnik / ekspres do kawy",
  "tea/coffee maker in all rooms": "Czajnik / ekspres w każdym pokoju",
  kitchen: "Kuchnia",
  kitchenette: "Aneks kuchenny",
  "shared kitchen": "Wspólna kuchnia",
  // ── Basen i wellness ─────────────────────────────────────────────────
  "swimming pool": "Basen",
  pool: "Basen",
  "outdoor pool": "Basen zewnętrzny",
  "outdoor swimming pool": "Basen zewnętrzny",
  "indoor pool": "Basen kryty",
  "indoor swimming pool": "Basen kryty",
  "rooftop pool": "Basen na dachu",
  "infinity pool": "Basen infinity",
  "heated pool": "Basen podgrzewany",
  "plunge pool": "Basen zanurzeniowy",
  "exercise/lap pool": "Basen do pływania",
  "access to nearby indoor pool": "Dostęp do pobliskiego basenu krytego",
  "swimming nearby": "Pływanie w pobliżu",
  "pool sun loungers": "Leżaki przy basenie",
  "sun loungers": "Leżaki",
  "pool/beach towels": "Ręczniki przy basenie / na plażę",
  "pool bar": "Bar przy basenie",
  spa: "Spa",
  "spa and wellness centre": "Centrum spa i wellness",
  "spa and wellness center": "Centrum spa i wellness",
  "spa/wellness": "Spa / wellness",
  "spa facilities": "Strefa spa",
  "health or beauty spa nearby": "Spa zdrowotne lub kosmetyczne w pobliżu",
  "beauty services": "Usługi kosmetyczne",
  "hair salon": "Salon fryzjerski",
  sauna: "Sauna",
  "sauna parowa": "Sauna parowa",
  "steam room": "Łaźnia parowa",
  hammam: "Hammam",
  "turkish/steam bath": "Łaźnia turecka / parowa",
  "hot tub": "Jacuzzi",
  jacuzzi: "Jacuzzi",
  "hot tub/jacuzzi": "Jacuzzi",
  "fitness centre": "Siłownia / fitness",
  "fitness center": "Siłownia / fitness",
  "fitness facilities (surcharge)": "Siłownia / fitness (dodatkowo płatne)",
  "fitness/gym": "Siłownia",
  gym: "Siłownia",
  massage: "Masaż",
  "massage services": "Usługi masażu",
  "body treatments": "Zabiegi na ciało",
  "facial treatments": "Zabiegi na twarz",
  solarium: "Solarium",
  // ── Usługi i recepcja ────────────────────────────────────────────────
  "24-hour front desk": "Recepcja czynna całą dobę",
  "front desk": "Recepcja",
  "front desk (24 hour)": "Recepcja czynna całą dobę",
  "concierge service": "Konsjerż",
  concierge: "Konsjerż",
  "daily housekeeping": "Codzienne sprzątanie",
  housekeeping: "Sprzątanie",
  laundry: "Pralnia",
  "laundry service": "Usługa prania",
  "dry cleaning": "Pralnia chemiczna",
  "ironing service": "Usługa prasowania",
  "luggage storage": "Przechowalnia bagażu",
  "currency exchange": "Kantor",
  "atm/cash machine on site": "Bankomat na miejscu",
  "tour desk": "Punkt informacji turystycznej",
  "ticket service": "Sprzedaż biletów",
  "express check-in/check-out": "Ekspresowe zameldowanie / wymeldowanie",
  "contactless check-in/check-out": "Bezdotykowe zameldowanie / wymeldowanie",
  "private check-in/check-out": "Prywatne zameldowanie / wymeldowanie",
  "room service": "Room service",
  "24-hour room service": "Room service całą dobę",
  "wake-up service": "Budzenie na życzenie",
  elevator: "Winda",
  lift: "Winda",
  "lift / elevator": "Winda",
  "lift/elevator": "Winda",
  "meeting/banquet facilities": "Sale konferencyjne / bankietowe",
  "business centre": "Centrum biznesowe",
  "business center": "Centrum biznesowe",
  "fax/photocopying": "Faks / ksero",
  "multilingual staff": "Personel wielojęzyczny",
  "shops on site": "Sklepy na terenie obiektu",
  "gift shop": "Sklep z pamiątkami",
  "newspapers": "Prasa codzienna",
  "invoice provided": "Możliwość wystawienia faktury",
  // ── Bezpieczeństwo i higiena ─────────────────────────────────────────
  "24-hour security": "Ochrona całodobowa",
  security: "Ochrona",
  "cctv in common areas": "Monitoring w częściach wspólnych",
  "cctv outside property": "Monitoring na zewnątrz obiektu",
  "security alarm": "Alarm",
  "smoke alarms": "Czujniki dymu",
  "fire extinguishers": "Gaśnice",
  "key card access": "Dostęp na kartę",
  "key access": "Dostęp na klucz",
  "first aid kit available": "Apteczka pierwszej pomocy",
  "physical distancing in dining areas": "Zachowany dystans w strefach gastronomicznych",
  "screens / barriers between staff and guests for safety":
    "Ekrany / bariery między personelem a gośćmi",
  "hand sanitizer in guest accommodation and key areas":
    "Środki do dezynfekcji rąk w obiekcie",
  "staff follow all safety protocols as directed by local authorities":
    "Personel przestrzega lokalnych protokołów bezpieczeństwa",
  "guest accommodation is disinfected between stays":
    "Dezynfekcja pokoju między pobytami",
  "face masks for guests available": "Maseczki dla gości",
  // ── Wyposażenie pokoi ────────────────────────────────────────────────
  "air conditioning": "Klimatyzacja",
  heating: "Ogrzewanie",
  "flat-screen tv": "Telewizor płaski",
  tv: "Telewizor",
  television: "Telewizor",
  "cable channels": "Kanały kablowe",
  "satellite channels": "Kanały satelitarne",
  telephone: "Telefon",
  safe: "Sejf",
  "safety deposit box": "Sejf",
  balcony: "Balkon",
  terrace: "Taras",
  patio: "Patio",
  "soundproof rooms": "Dźwiękoszczelne pokoje",
  soundproofing: "Dźwiękoszczelność",
  "non-smoking rooms": "Pokoje dla niepalących",
  "non-smoking throughout": "Całkowity zakaz palenia",
  "designated smoking area": "Miejsce dla palących",
  "allergy-free room": "Pokój antyalergiczny",
  desk: "Biurko",
  "seating area": "Część wypoczynkowa",
  wardrobe: "Szafa",
  "private bathroom": "Łazienka prywatna",
  bathtub: "Wanna",
  shower: "Prysznic",
  "free toiletries": "Bezpłatne kosmetyki",
  "bulk dispenser for toiletries": "Dozowniki kosmetyków wielokrotnego użytku",
  hairdryer: "Suszarka do włosów",
  "hair dryer": "Suszarka do włosów",
  bathrobe: "Szlafrok",
  slippers: "Kapcie",
  iron: "Żelazko",
  "electric kettle": "Czajnik elektryczny",
  refrigerator: "Lodówka",
  fridge: "Lodówka",
  microwave: "Kuchenka mikrofalowa",
  "washing machine": "Pralka",
  "coffee machine": "Ekspres do kawy",
  // ── Dla rodzin ───────────────────────────────────────────────────────
  "family rooms": "Pokoje rodzinne",
  "kids' club": "Klub dla dzieci",
  childcare: "Opieka nad dziećmi",
  "babysitting/child services": "Opieka nad dziećmi",
  "children's playground": "Plac zabaw",
  "kids' pool": "Basen dla dzieci",
  "board games/puzzles": "Gry planszowe / puzzle",
  "baby safety gates": "Bramki zabezpieczające",
  "cribs available": "Łóżeczka dziecięce",
  // ── Dostępność ───────────────────────────────────────────────────────
  "facilities for disabled guests": "Udogodnienia dla osób z niepełnosprawnością",
  "wheelchair accessible": "Dostęp dla wózków inwalidzkich",
  "entire unit wheelchair accessible": "Cały obiekt dostępny dla wózków",
  "toilet with grab rails": "Toaleta z uchwytami",
  "upper floors accessible by elevator": "Wyższe piętra dostępne windą",
  // ── Na zewnątrz i widoki ─────────────────────────────────────────────
  garden: "Ogród",
  "rooftop garden": "Ogród na dachu",
  "sun terrace": "Taras słoneczny",
  beachfront: "Przy plaży",
  "private beach area": "Prywatna plaża",
  "bbq facilities": "Grill",
  "picnic area": "Miejsce na piknik",
  "outdoor furniture": "Meble ogrodowe",
  "sea view": "Widok na morze",
  "city view": "Widok na miasto",
  "mountain view": "Widok na góry",
  "garden view": "Widok na ogród",
  "pool view": "Widok na basen",
  "landmark view": "Widok na zabytki",
  // ── Ogólne / zasady ──────────────────────────────────────────────────
  "pets allowed": "Akceptujemy zwierzęta",
  "no pets allowed": "Zwierzęta niedozwolone",
  "smoke-free property": "Obiekt całkowicie dla niepalących",
  "adults only": "Tylko dla dorosłych",
  "private entrance": "Prywatne wejście",
};

// Zbiór wszystkich polskich WARTOŚCI słownika (lowercase). LiteAPI przez
// `language=pl` często zwraca facility już po polsku (np. „Klimatyzacja",
// „Basen", „Restauracja") — i wiele z nich nie ma polskich znaków, więc
// heurystyka „brak ąćę… ⇒ angielski" myliłaby je z miss. Jeśli string jest
// JUŻ jedną z naszych polskich etykiet, nie logujemy go jako nieprzetłumaczony.
const PL_VALUES = new Set(Object.values(PL_DICTIONARY).map((v) => v.toLowerCase()));

export function localizeFacility(s: string): string {
  const key = s.toLowerCase().trim();
  const hit = PL_DICTIONARY[key];
  if (hit) return hit;
  // Brak mapowania — pokaż oryginał, ale zaloguj (jeśli wygląda na angielski i
  // nie jest już jedną z naszych polskich etykiet), żeby właściciel mógł dobrać
  // brakujące tłumaczenie (FAZA 1/6).
  if (!PL_VALUES.has(key)) logUntranslated("facility", s);
  return s;
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
    keywords: ["parking", "shuttle", "airport", "transfer", "car ", "samoch", "lotnisk", "rower", "bicycle", "bike"],
  },
  {
    key: "food",
    label: "Jedzenie i napoje",
    icon: "🍽️",
    keywords: ["restaurant", "restaurac", "bar", "breakfast", "śniad", "kitchen", "kuchni", "coffee", "kaw", "dining", "meal", "posiłk", "minibar", "snack", "przekąsk", "wine", "wino", "deli", "vending", "automat", "owoc", "fruit"],
  },
  {
    key: "wellness",
    label: "Basen i wellness",
    icon: "🧖",
    keywords: ["pool", "basen", "spa", "sauna", "jacuzzi", "hot tub", "hammam", "łaźni", "fitness", "gym", "siłown", "massage", "masaż", "wellness", "leżak", "lounger", "solarium", "kosmet", "beauty", "fryzj"],
  },
  {
    key: "services",
    label: "Usługi i recepcja",
    icon: "🛎️",
    keywords: ["front desk", "recepcj", "24-hour", "całą dobę", "concierge", "konsjer", "laundry", "praln", "prasow", "ironing", "room service", "luggage", "bagaż", "currency", "kantor", "bankomat", "atm", "elevator", "lift", "winda", "housekeeping", "sprzątan", "check-in", "check-out", "zameldow", "wymeldow", "budzen", "wake-up", "business", "biznes", "konferenc", "faks", "ksero", "personel", "staff", "sklep", "shop", "prasa", "newspaper", "faktur"],
  },
  {
    key: "safety",
    label: "Bezpieczeństwo i higiena",
    icon: "🛡️",
    keywords: ["security", "ochron", "cctv", "monitor", "alarm", "smoke alarm", "czujnik", "extinguisher", "gaśnic", "first aid", "apteczk", "distancing", "dystans", "barrier", "barier", "sanitizer", "dezynfek", "protocol", "protokoł", "maseczk", "face mask", "key card", "key access", "dostęp na"],
  },
  {
    key: "room",
    label: "Wyposażenie pokoi",
    icon: "🛏️",
    keywords: ["air condition", "klimatyz", "heating", "ogrzew", "tv", "telewiz", "television", "cable", "kablow", "satellit", "satelit", "telephone", "telefon", "safe", "sejf", "balcony", "balkon", "terrace", "taras", "patio", "soundproof", "dźwiękosz", "non-smoking", "niepaląc", "palen", "wardrobe", "szafa", "bathroom", "łazienk", "bathtub", "wanna", "shower", "prysznic", "toiletries", "kosmetyk", "hairdry", "suszark", "bathrobe", "szlafrok", "slipper", "kapci", "iron", "żelazk", "kettle", "czajnik", "fridge", "refrigerat", "lodów", "microwave", "mikrofal", "washing machine", "pralk", "desk", "biurk", "seating", "wypoczynkow", "allergy", "antyalerg"],
  },
  {
    key: "family",
    label: "Dla rodzin",
    icon: "👨‍👩‍👧",
    keywords: ["family", "rodzin", "kids", "child", "dziec", "babysitting", "opieka nad", "playground", "plac zabaw", "crib", "łóżeczk", "board game", "gry "],
  },
  {
    key: "accessibility",
    label: "Dostępność",
    icon: "♿",
    keywords: ["wheelchair", "wózk", "accessible", "disabled", "niepełnospraw", "grab rail", "uchwyt"],
  },
  {
    key: "outdoor",
    label: "Na zewnątrz i widoki",
    icon: "🌅",
    keywords: ["garden", "ogród", "beach", "plaż", "sea view", "view", "widok", "sun terrace", "słoneczn", "patio", "bbq", "grill", "picnic", "piknik", "outdoor furniture", "meble ogrod"],
  },
];

// Group a flat list of facility strings into labelled, icon-tagged buckets,
// localising each item to Polish. Duplicate labels (e.g. an English + Polish
// variant of the same facility that both map to "Restauracja") are collapsed.
// Items that match no bucket land in "Pozostałe udogodnienia". Empty buckets
// are dropped.
export function groupFacilities(facilities: string[]): FacilityGroup[] {
  const buckets = new Map<string, string[]>();
  const other: string[] = [];
  const seenLabels = new Set<string>(); // global dedupe on the localised label

  for (const raw of facilities) {
    const label = localizeFacility(raw);
    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) continue;
    seenLabels.add(labelKey);

    const hay = raw.toLowerCase();
    const group = GROUPS.find((g) => g.keywords.some((k) => hay.includes(k)));
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
