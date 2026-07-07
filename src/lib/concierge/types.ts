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
