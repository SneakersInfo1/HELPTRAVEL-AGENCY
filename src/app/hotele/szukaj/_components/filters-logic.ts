// Server-safe filtering / sorting logic for /hotele/szukaj.
//
// Lives in its own module (no "use client" directive) because the parent
// page.tsx is a server component and was importing applyFiltersAndSort
// from filters-sidebar.tsx — which is "use client" — triggering Next 15's
// "Attempted to call client function from the server" error.
//
// Pure functions only. No React, no hooks, no DOM. Both the server page
// and the client FiltersSidebar consume from here.

// Heuristic match — LiteAPI's list endpoint doesn't return propertyType, so
// we infer it from the hotel name. Apartments/hostels/aparthotels routinely
// say so in the name. Falls back to "hotel" when nothing matches.
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
    filtered = filtered.filter((o) => allowed.has(inferPropertyType(o.name)));
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
