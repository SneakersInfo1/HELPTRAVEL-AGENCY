// Server-safe filtering / sorting logic for /hotele/szukaj.
//
// Lives in its own module (no "use client" directive) because the parent
// page.tsx is a server component and was importing applyFiltersAndSort
// from filters-sidebar.tsx — which is "use client" — triggering Next 15's
// "Attempted to call client function from the server" error.
//
// Pure functions only. No React, no hooks, no DOM. Both the server page
// and the client FiltersSidebar consume from here.

// Mapa `hotelTypeId` (LiteAPI) → nasze kategorie filtra.
//
// Etap 6 przebudowy (2026-08-06): dostawca ZWRACA `hotelTypeId` na liście —
// komentarz „LiteAPI's list endpoint doesn't return propertyType" przy
// `inferPropertyType` był nieaktualny. Zgadywanie z nazwy trafiało tylko
// wtedy, gdy właściciel wpisał „Hostel"/„Apartament" w nazwę obiektu; hotel
// nazwany „Villa Rosa" lądował jako „hotel", a apartament „Sunrise 21"
// też jako „hotel". Teraz decyduje dana, a nazwa jest awaryjna.
//
// Pełny słownik 52 typów: `data/liteapi-reference.json` → `hotelTypes`.
const TYPE_ID_TO_CATEGORY: Record<number, string> = {
  201: "apartment",
  203: "hostel",
  204: "hotel",
  205: "hotel", // Motels — dla polskiego gościa to wciąż „hotel przy drodze"
  206: "hotel", // Resorts
  207: "apartment", // Aparthotels bywają pod tym id
  208: "guesthouse",
  216: "guesthouse", // Bed and breakfasts
};

/**
 * Typ obiektu do filtra: NAJPIERW dana od dostawcy, dopiero potem heurystyka.
 *
 * `hotelTypeId: 0` znaczy u dostawcy „Not Available" — wtedy heurystyka
 * z nazwy jest lepsza niż nic.
 */
export function propertyTypeOf(offer: { name: string; hotelTypeId?: number }): string {
  if (typeof offer.hotelTypeId === "number" && offer.hotelTypeId !== 0) {
    const mapped = TYPE_ID_TO_CATEGORY[offer.hotelTypeId];
    if (mapped) return mapped;
  }
  return inferPropertyType(offer.name);
}

// Heurystyka AWARYJNA — używana tylko, gdy dostawca nie poda `hotelTypeId`
// (albo poda 0 = „Not Available"). Apartamenty/hostele często mówią o sobie
// w nazwie. Domyślnie „hotel".
export function inferPropertyType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("aparthotel") || n.includes("apart-hotel")) return "aparthotel";
  if (n.includes("apartament") || n.includes("apartment") || n.includes("aparth")) return "apartment";
  if (n.includes("hostel")) return "hostel";
  if (n.includes("pensjonat") || n.includes("guesthouse") || n.includes("guest house")) return "guesthouse";
  return "hotel";
}

// Map LiteAPI raw boardName → our 5 board categories (matches the filter
// values). Keep in sync with the labels in FiltersSidebar.
export function classifyBoard(boardName: string | undefined): string {
  if (!boardName) return "room_only";
  const b = boardName.toLowerCase();
  if (b.includes("all inclusive") || b.includes("all-inclusive") || b.includes(" ai")) return "all_inclusive";
  if (b.includes("full board") || b.includes("fb")) return "full_board";
  if (b.includes("half board") || b.includes("hb")) return "half_board";
  if (b.includes("breakfast") || b.includes("śniadan")) return "breakfast";
  return "room_only";
}

export interface FilterableOffer {
  name: string;
  city: string;
  cheapestRate: {
    totalAmount: number;
    refundableTag?: string;
    cancellationDeadline?: string;
    boardName?: string;
  };
  stars?: number;
  rating?: number;
  /** Marka/sieć — filtr marki. */
  chain?: string;
  /** ID udogodnień z `/data/hotels` — jedyne źródło udogodnień na liście. */
  facilityIds?: number[];
  /** Typ obiektu od dostawcy; brak → heurystyka z nazwy. */
  hotelTypeId?: number;
}

export interface ApplyFiltersParams {
  minPrice?: number;
  maxPrice?: number;
  minStars?: number;
  minRating?: number;
  cancel?: string;
  sort?: string;
  q?: string;
  propertyType?: string[];
  board?: string[];
  /** Nazwy sieci hotelowych (dokładne, jak zwraca dostawca). */
  chains?: string[];
  /**
   * Wymagane udogodnienia jako grupy `facilityId`. Koniunkcja MIĘDZY grupami,
   * alternatywa WEWNĄTRZ grupy: „basen" to kilka różnych ID u dostawcy
   * (kryty/odkryty/podgrzewany), a gość chce po prostu basen.
   */
  facilityGroups?: number[][];
}

export function applyFiltersAndSort<T extends FilterableOffer>(
  offers: T[],
  params: ApplyFiltersParams,
): T[] {
  let filtered = [...offers];
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter((o) =>
      `${o.name} ${o.city} ${o.cheapestRate.boardName ?? ""}`.toLowerCase().includes(q),
    );
  }
  if (params.propertyType && params.propertyType.length > 0) {
    const allowed = new Set(params.propertyType);
    filtered = filtered.filter((o) => allowed.has(propertyTypeOf(o)));
  }
  if (params.chains && params.chains.length > 0) {
    const allowed = new Set(params.chains.map((c) => c.toLowerCase()));
    filtered = filtered.filter((o) => Boolean(o.chain) && allowed.has(o.chain!.toLowerCase()));
  }
  if (params.facilityGroups && params.facilityGroups.length > 0) {
    filtered = filtered.filter((o) => {
      // Hotel BEZ listy udogodnień nie może spełnić wymagania. Przepuszczanie
      // go „na wszelki wypadek" dałoby w wynikach obiekty bez basenu przy
      // aktywnym filtrze „basen" — czyli filtr, któremu nie można ufać.
      const has = new Set(o.facilityIds ?? []);
      if (has.size === 0) return false;
      return params.facilityGroups!.every((group) => group.some((id) => has.has(id)));
    });
  }
  if (params.board && params.board.length > 0) {
    const allowed = new Set(params.board);
    filtered = filtered.filter((o) => allowed.has(classifyBoard(o.cheapestRate.boardName)));
  }
  if (params.minPrice !== undefined)
    filtered = filtered.filter((o) => o.cheapestRate.totalAmount >= params.minPrice!);
  if (params.maxPrice !== undefined)
    filtered = filtered.filter((o) => o.cheapestRate.totalAmount <= params.maxPrice!);
  if (params.minStars !== undefined)
    filtered = filtered.filter((o) => (o.stars ?? 0) >= params.minStars!);
  if (params.minRating !== undefined)
    filtered = filtered.filter((o) => (o.rating ?? 0) >= params.minRating!);
  if (params.cancel === "free")
    filtered = filtered.filter(
      (o) => o.cheapestRate.refundableTag === "RFN" || Boolean(o.cheapestRate.cancellationDeadline),
    );

  switch (params.sort) {
    case "price_asc":
      filtered.sort((a, b) => a.cheapestRate.totalAmount - b.cheapestRate.totalAmount);
      break;
    case "price_desc":
      filtered.sort((a, b) => b.cheapestRate.totalAmount - a.cheapestRate.totalAmount);
      break;
    case "rating":
      filtered.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    default:
      filtered.sort((a, b) => {
        const score = (o: T) =>
          (o.rating ?? 7) * 100 - o.cheapestRate.totalAmount / 10 + (o.cheapestRate.refundableTag === "RFN" ? 50 : 0);
        return score(b) - score(a);
      });
  }
  return filtered;
}
