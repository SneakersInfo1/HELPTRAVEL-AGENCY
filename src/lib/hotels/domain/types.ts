// Model domenowy sekcji hotelowej — warstwa między surową odpowiedzią LiteAPI
// a komponentami. Zasada: komponent NIGDY nie dotyka `LiteApi*`.
//
// Po co: schematy `lib/liteapi/types.ts` opisują to, co przysyła dostawca —
// z jego nazewnictwem (snake_case obok camelCase), jego dwujęzycznością
// i jego pułapkami (`stars` vs `starRating`, podatek poza ceną, cena
// konkurenta w polu, które wygląda jak nasza cena bazowa). Przepuszczanie tego
// wprost do UI jest tym, przez co dzisiejsze karty kłamią o podatkach
// i gubią gwiazdki.
//
// Pieniądze: MINOR UNITS (bigint grosze) — konwersja przez `lib/money`.
// Kwoty w tym pliku są `bigint`, formatowanie należy do warstwy widoku.

/** Rodzaj wyżywienia — znormalizowany do skończonego zbioru. */
export type BoardCategory =
  | "room-only"
  | "breakfast"
  | "half-board"
  | "full-board"
  | "all-inclusive"
  | "unknown";

/** Pojedyncza pozycja podatku/opłaty z rozbiciem od dostawcy. */
export interface TaxOrFee {
  /** Surowy opis od dostawcy. UWAGA: bywa TEKSTEM z kwotą w obcej walucie. */
  description: string | null;
  /** Kwota w groszach — `null`, gdy dostawca podał wyłącznie opis tekstowy. */
  amountMinor: bigint | null;
  currency: string | null;
  /**
   * Czy pozycja jest JUŻ w cenie `totalMinor`.
   * `false` = gość dopłaci ją na miejscu. To rozróżnienie jest powodem, dla
   * którego cała ta warstwa powstała — patrz `PriceBreakdown.taxNotice`.
   */
  includedInTotal: boolean;
}

/**
 * Jak wolno opisać podatki przy cenie. Wyliczane z danych, NIGDY wpisane
 * na stałe — dotychczasowe bezwarunkowe „wł. podatków" było nieprawdą dla
 * ~52% taryf (209/400 w pomiarze).
 */
export type TaxNotice =
  /** Wszystkie znane pozycje są w cenie. */
  | { kind: "all-included" }
  /** Część opłat gość zapłaci w obiekcie; `amountMinor` = suma policzalnych. */
  | { kind: "extra-at-property"; amountMinor: bigint | null; currency: string | null }
  /** Dostawca nie podał rozbicia — NIE twierdzimy nic o podatkach. */
  | { kind: "unknown" };

export interface PriceBreakdown {
  /** Cena za CAŁY pobyt, tak jak podał dostawca. Nigdy nie mnożymy nocy. */
  totalMinor: bigint;
  currency: string;
  /** Pomocnicza, wyliczona: `total / nights`. `null` gdy nights <= 0. */
  perNightMinor: bigint | null;
  nights: number;
  taxes: TaxOrFee[];
  taxNotice: TaxNotice;
  /**
   * Cena odniesienia od dostawcy wraz ze ŹRÓDŁEM. Świadomie NIE nazywa się
   * `discount` ani `oldPrice`: `source` to zwykle "booking.com", czyli cena
   * KONKURENTA, a nie nasza cena historyczna. Decyzja D2: nie pokazujemy jej
   * w UI. Pole istnieje, żeby nikt nie musiał zgadywać, czym ono jest.
   */
  competitorReference: { amountMinor: bigint; currency: string; source: string | null } | null;
}

export interface CancellationInfo {
  /** `true` tylko gdy dostawca to potwierdza — brak danych ≠ darmowa anulacja. */
  free: boolean;
  /** Termin bezpłatnej anulacji (ISO-ish od dostawcy) albo `null`. */
  deadline: string | null;
}

export interface RoomPhoto {
  url: string;
  hdUrl: string | null;
  description: string | null;
  isMain: boolean;
}

export interface BedInfo {
  quantity: number | null;
  type: string | null;
  size: string | null;
}

/** Opis POKOJU (z /data/hotel), niezależny od ceny. */
export interface RoomProfile {
  id: string;
  name: string | null;
  description: string | null;
  sizeSquareMeters: number | null;
  maxOccupancy: number | null;
  maxAdults: number | null;
  maxChildren: number | null;
  beds: BedInfo[];
  amenities: string[];
  photos: RoomPhoto[];
}

/** Konkretna OFERTA (taryfa) — to jest to, co gość kupuje. */
export interface RateOffer {
  /** Identyfikator do checkoutu. Kontrakt zamrożony (07-decisions.md R12). */
  offerId: string;
  rateId: string;
  /** Nazwa taryfy od dostawcy (zwykle EN). */
  rawName: string | null;
  board: { category: BoardCategory; rawLabel: string | null };
  cancellation: CancellationInfo;
  price: PriceBreakdown;
  maxOccupancy: number | null;
  /**
   * Profil pokoju dopięty przez `mappedRoomId`. `null`, gdy dostawca nie
   * zwrócił powiązania — wtedy UI pokazuje neutralny placeholder i NIGDY
   * zdjęcia hotelu w roli zdjęcia pokoju (07-decisions.md R10).
   */
  room: RoomProfile | null;
}

export interface AmenityGroup {
  category: AmenityCategory;
  items: Amenity[];
}

export type AmenityCategory =
  | "internet"
  | "parking-transport"
  | "food-drink"
  | "pool-wellness"
  | "room"
  | "services"
  | "family"
  | "accessibility"
  | "outdoor"
  | "pets"
  | "other";

export interface Amenity {
  /** Stabilny `facilityId` dostawcy, gdy znany — klucz deduplikacji. */
  facilityId: number | null;
  /** Etykieta po polsku. */
  label: string;
  category: AmenityCategory;
}

/** Kategoria oceny z analizy sentymentu dostawcy (treść generowana przez AI). */
export interface ReviewCategory {
  /** Etykieta po polsku (nazwy źródłowe są angielskie i ze skończonego zbioru). */
  label: string;
  /** Skala 0–10, jak u dostawcy. */
  score: number;
  /** Zdanie od AI dostawcy — pokazywać WYŁĄCZNIE z adnotacją o źródle. */
  summary: string | null;
}

export interface NearbyPlace {
  name: string;
  category: string | null;
  distanceKm: number;
  importance: string | null;
}

export interface HotelPolicyFacts {
  checkinFrom: string | null;
  checkinUntil: string | null;
  checkoutUntil: string | null;
  petsAllowed: boolean | null;
  childrenAllowed: boolean | null;
  parking: string | null;
  /** Wolny tekst „ważne informacje" od dostawcy. */
  importantInfo: string | null;
}
