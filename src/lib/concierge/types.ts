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
  /** Liczba nocy, dla ktorej policzono perPersonPln — bez tego lista miesza
   *  pobyty 4- i 7-nocne i sortuje je jak porownywalne. */
  nights: number;
  checkin: string; checkout: string;
  hotelFromPlnPerNight: number | null;
  flightFromPln: number | null;
  /** Czy kierunek pasuje do motywu użytkownika. null = motywu nie podano. */
  themeMatch: boolean | null;
  /** Czy `nights` odpowiada prośbie użytkownika. null = nocy nie podano. */
  nightsMatch: boolean | null;
  /** Popularność kierunku z seedu — WYŁĄCZNIE do rozstrzygania remisów. */
  popularity: number | null;
}

/**
 * Stan wyniku `get_trip_offer` (V2.1 §16). Rozróżnienie jest twarde, bo
 * „brak hotelu i brak lotu" nie jest ofertą częściową — to BRAK OFERTY, a
 * renderowanie takiej karty pokazywało użytkownikowi puste pudełko z datami
 * i dwoma komunikatami o niepowodzeniu, jakby coś znaleziono.
 *
 *   valid       — wszystkie CHCIANE składniki są realne
 *   partial     — część chcianych składników jest, część nie
 *   unavailable — nie ma ŻADNEGO chcianego składnika (karta się nie pokazuje)
 */
export type OfferResultState = "valid" | "partial" | "unavailable";

/**
 * Finalna oferta pakietu do karty w czacie (wynik get_trip_offer). Wszystkie
 * kwoty z REALNYCH źródeł (żywe LiteAPI przez wstrzyknięte deps) — nigdy nie
 * zgadujemy ani nie doszacowujemy. Brakujący komponent = null + partial:true
 * (bot mówi o tym wprost).
 */
export interface TripOffer {
  cityEn: string; countryEn: string; cityPl: string;
  checkin: string; checkout: string;
  /** Dokładna liczba nocy dla dat, dla których LiteAPI zwróciło stawkę. */
  nights?: number | null;
  adults: number; children: number;
  originIata: string;
  hotel: {
    hotelId: string;
    name: string;
    /** Cena za CAŁY pobyt (pokój dla wszystkich gości), PLN — najtańsza realna taryfa. */
    totalPln: number;
    /** Średnia z realnego totalu i dokładnej liczby nocy. */
    perNightPln?: number | null;
    mainPhotoUrl: string | null;
    /** Realne URL-e z `hotelImages`; pierwszy element jest kadrem startowym. */
    photoUrls?: string[];
    /** Ocena gości z metadanych LiteAPI (skala 0–10) albo null, gdy brak. */
    rating: number | null;
    stars?: number | null;
    reviewCount?: number | null;
    address?: string | null;
    /** Pola najtańszej realnej taryfy LiteAPI; brak = brak wiersza na karcie. */
    roomName?: string | null;
    boardName?: string | null;
    refundableTag?: string | null;
    cancellationDeadline?: string | null;
    freeCancellationDeadline?: string | null;
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
    outboundDurationMinutes?: number | null;
    inboundDurationMinutes?: number | null;
    /** `true` tylko wtedy, gdy odpowiedź LiteAPI jawnie potwierdziła bagaż. */
    hasCarryOnBag?: boolean | null;
    hasCheckedBag?: boolean | null;
    /** Link handoff do naszych wyników lotów. */
    url: string;
  } | null;
  /** Suma na osobę: ceil((hotel.totalPln + flight.totalPln) / (adults+children)).
   *  Ta sama konwencja co computePackagePerPerson (hotel dzielony na głowy, lot
   *  już policzony za wszystkich), uogólniona na realną liczbę osób; ceil — nie
   *  zaniżamy. TYLKO gdy wszystkie CHCIANE komponenty realne, inaczej null
   *  (przy wantsFlight=false to uczciwa cena SAMEGO hotelu na osobę). */
  totalPerPersonPln: number | null;
  /** Łączny realny koszt wszystkich chcianych i dostępnych komponentów. */
  totalPln?: number | null;
  /** true gdy CHCIANY komponent się nie udał (bot mówi o tym wprost).
   *  Zachowane dla zgodności (UI + zdarzenie GA4); pełniejszy stan niesie
   *  `resultState`, bo `partial:true` nie odróżniało „mam hotel bez lotu"
   *  od „nie mam nic". */
  partial: boolean;
  /** valid / partial / unavailable — patrz OfferResultState. */
  resultState: OfferResultState;
  /** false = użytkownik jawnie NIE chce lotu (sam hotel) — karta nie renderuje
   *  sekcji lotu ani boksu „nie udało się potwierdzić". Brak pola = true. */
  wantsFlight?: boolean;
  /** false = użytkownik jawnie NIE chce hotelu (sam lot) — analogicznie. */
  wantsHotel?: boolean;
}
