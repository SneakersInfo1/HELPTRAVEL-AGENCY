export type BudgetKind = "per_person" | "total_two"; // na osobę | za dwoje
export interface ConciergeIntent {
  theme?: string;          // slug motywu z TRAVEL_MOODS (np. "plaza")
  budgetPln?: number;      // kwota
  budgetKind?: BudgetKind; // interpretacja kwoty
  month?: number;          // 1–12
  origin?: string;         // IATA wylotu (domyślnie "WAW")
  adults?: number;
  children?: number;
  wantsFlight: boolean;    // domyślnie true dla „lot + hotel"
  wantsHotel: boolean;
}
/** Czego jeszcze brakuje, by odpalić trip-search (do dopytania przez bota). */
export type MissingField = "theme" | "budgetPln" | "budgetKind" | "month" | "adults";

export interface TripCandidate {
  cityEn: string; countryEn: string; cityPl: string;
  perPersonPln: number;      // z pakietu snapshotu (lot RT + noce×hotel/2)
  checkin: string; checkout: string;
  hotelFromPlnPerNight: number | null;
  flightFromPln: number | null;
}

/**
 * Finalna oferta pakietu do karty w czacie (wynik get_trip_offer). Wszystkie
 * kwoty z REALNYCH źródeł (żywe LiteAPI przez wstrzyknięte deps) — nigdy nie
 * zgadujemy ani nie doszacowujemy. Brakujący komponent = null + partial:true
 * (bot mówi o tym wprost).
 */
export interface TripOffer {
  cityEn: string; countryEn: string; cityPl: string;
  checkin: string; checkout: string;
  adults: number; children: number;
  originIata: string;
  hotel: {
    hotelId: string;
    name: string;
    /** Cena za CAŁY pobyt (pokój dla wszystkich gości), PLN — najtańsza realna taryfa. */
    totalPln: number;
    mainPhotoUrl: string | null;
    /** Ocena gości z metadanych LiteAPI (skala 0–10) albo null, gdy brak. */
    rating: number | null;
    /** Link handoff do naszej strony hotelu (z datami/gośćmi). */
    url: string;
  } | null;
  flight: {
    /** Cena za WSZYSTKICH pasażerów z zapytania, PLN. Semantyka zweryfikowana:
     *  DisplayOffer.total z /flights/rates to suma za komplet pasażerów — tak
     *  wyświetlają ją wyniki lotów (flight-results.tsx: cena/os. = total/passengers,
     *  „X zł za N pasażerów"), a search dostaje adults+children z argumentów. */
    totalPln: number;
    carrierName: string | null;
    outboundDepartureTime: string;
    inboundDepartureTime: string | null;
    /** Liczba przesiadek — najgorszy (największy) z odcinków tam/powrót. */
    stops: number;
    /** Link handoff do naszych wyników lotów. */
    url: string;
  } | null;
  /** Suma na osobę: ceil((hotel.totalPln + flight.totalPln) / (adults+children)).
   *  Ta sama konwencja co computePackagePerPerson (hotel dzielony na głowy, lot
   *  już policzony za wszystkich), uogólniona na realną liczbę osób; ceil — nie
   *  zaniżamy. TYLKO gdy oba komponenty realne, inaczej null (nie zgadujemy). */
  totalPerPersonPln: number | null;
  /** true gdy którykolwiek komponent się nie udał (bot mówi o tym wprost). */
  partial: boolean;
}
