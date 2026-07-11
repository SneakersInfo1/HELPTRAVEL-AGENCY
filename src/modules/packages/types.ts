// Typy domenowe warstwy Pakiety Lot + Hotel.
// Architektura: PROMPT_PAKIETY_LOT_HOTEL.md §3. Decyzje: docs/PACKAGES_DECISIONS.md.
//
// Faza 0: locujemy tylko kształty, które są decyzjami architektonicznymi
// (stany sagi, parametry wyszukiwania, kształt oferty/wyceny). Implementacja
// usług i UI — Faza 1+ (za flagą NEXT_PUBLIC_FEATURE_PACKAGES).

/** Kwota wyświetleniowa w PLN (patrz decyzja §0 pkt 7 — „ceny w PLN", nie „obciążenie w PLN"). */
export interface PackageMoney {
  amount: number;
  currency: "PLN";
}

/** Parametry wejściowe wyszukiwania pakietu (hotel-first, §3.2). */
export interface PackageSearchParams {
  /** Lotnisko/lotniska wylotu (default: Warszawa — WAW/WMI). */
  origin: string;
  /** Identyfikator kierunku (spójny z hotel-search / destination-i18n). */
  destinationId: string;
  dateFrom: string; // ISO yyyy-mm-dd
  dateTo: string; // ISO yyyy-mm-dd
  /** Rozkład gości na pokoje (reuse konwencji hotelowej). */
  occupancies: { adults: number; children: number[] }[];
  cabinClass: "economy" | "premium_economy" | "business" | "first";
}

/** Skrót hotelu na karcie listingu (przez istniejący translation layer — nazwy NIE tłumaczone maszynowo). */
export interface PackageHotelSummary {
  hotelId: string;
  name: string;
  stars?: number;
  rating?: number;
  distanceFromCenterKm?: number;
  thumbnailUrl?: string;
  /** Warunek MVP: tylko rate z darmową anulacją (bezpiecznik kompensacji sagi). */
  freeCancellationUntil: string; // ISO
  hotelOfferId: string;
  nights: number;
}

/** Skrót lotu bazowego dla pakietu (jeden lot na listing; delty liczone client-side). */
export interface PackageFlightSummary {
  offerId: string;
  /** Ważność oferty z API (`expiration`) — źródło prawdy, nie sztywny TTL. */
  expiration?: string;
  direct: boolean;
  carrier?: string;
  outboundDepart?: string;
  inboundDepart?: string;
  baggageIncluded?: { cabin: boolean; checked: boolean };
}

/** Wycena pakietu (§2, §3.2) — zawsze per osoba + total; podatki płatne w hotelu wyodrębnione. */
export interface PackagePricing {
  pricePerPerson: PackageMoney; // ceil(total / adults)
  total: PackageMoney; // płatne teraz (hotel „płatne teraz" + lot)
  taxesAtHotel?: PackageMoney; // „+ Y zł podatków/opłat płatnych w hotelu"
  /** Rozbicie do koszyka (§4). */
  breakdown: { hotel: PackageMoney; flight: PackageMoney; ancillaries?: PackageMoney };
}

/** Oferta pakietowa = hotelRate + bestFlight (§3.2 pkt 3). */
export interface PackageOffer {
  hotel: PackageHotelSummary;
  flight: PackageFlightSummary;
  pricing: PackagePricing;
}

/** Wynik wyszukiwania — jeden lot bazowy + lista hoteli. */
export interface PackageSearchResult {
  params: PackageSearchParams;
  baseFlight: PackageFlightSummary;
  offers: PackageOffer[];
  /** Znacznik świeżości (dla „cena znaleziona {data}" na landingach/cache). */
  pricedAt: string; // ISO
}

/**
 * Stany sagi rezerwacji (§3.4). Serce Fazy 2 — tu tylko definicja typu, maszyna
 * stanów i persystencja (Postgres `PackageBooking`) powstają po rozstrzygnięciu
 * prawnym (pkt 1). Kolejność = ścieżka happy-path.
 */
export type PackageSagaState =
  | "DRAFT"
  | "FLIGHT_HELD"
  | "HOTEL_PREBOOKED"
  | "HOTEL_PAID"
  | "HOTEL_BOOKED_AWAITING_FLIGHT" // start deadline = min(TTL prebooka, 25 min)
  | "FLIGHT_PAID"
  | "FLIGHT_BOOKED"
  | "CONFIRMED"
  | "NEEDS_MANUAL_ACTION"; // fail po płatności lotu — alert admina, klient nigdy nie widzi 500

/** Stan wieloetapowego flow trzymany server-side w Redis (`pkg-session:{uuid}`, TTL 30 min, §3.3). */
export interface PackageSessionState {
  sessionId: string;
  params: PackageSearchParams;
  selectedHotelOfferId?: string;
  selectedFlightOfferId?: string;
  createdAt: string;
  updatedAt: string;
}
