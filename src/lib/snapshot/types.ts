// Kształt snapshotu konsjerża (§43) — jednoznaczna semantyka, zero pól,
// których danych realnie nie znamy (§44).
//
// Snapshot NIE jest tym samym co `dstprice:v1`. Tamten jest indeksem cen
// „od X zł" dla homepage i /wyjazdy: JEDEN wpis na kierunek, minimum ze
// wszystkich okien. Ten jest indeksem DISCOVERY dla konsjerża: rekord na
// (kierunek × wylot × okno), więc da się odpowiedzieć na pytanie o konkretny
// miesiąc i konkretną długość pobytu zamiast oddawać to, co akurat wyszło
// najtaniej. Oba żyją obok siebie — homepage nie jest ruszany.

import type { DestinationTier } from "./tiers";

/**
 * Stan czasowy rekordu (§10) — DATA WYJAZDU. Rozdzielony od świeżości ceny,
 * bo to dwie różne rzeczy: oferta może być FUTURE i mieć starą cenę.
 */
export type RecordTravelState = "FUTURE" | "EXPIRED";

/**
 * Świeżość CENY (§10, §39). Osobna oś od stanu czasowego.
 *   FRESH             — cena z ostatniego cyklu, można ją podać jako aktualną.
 *   STALE_BUT_USABLE  — starsza, nadaje się do discovery („orientacyjnie"),
 *                       ale NIE wolno nazwać jej ceną aktualną.
 *   EXPIRED_PRICE     — za stara, nie używamy.
 */
export type PriceFreshness = "FRESH" | "STALE_BUT_USABLE" | "EXPIRED_PRICE";

export interface SnapshotRecord {
  /** Id kierunku z seedu — klucz łączący z resztą produktu. */
  destId: string;
  cityEn: string;
  cityPl: string;
  countryEn: string;
  countryPl: string;
  /** Lotnisko wylotu (IATA). */
  origin: string;
  /** Lotnisko docelowe (IATA) — to, dla którego pytaliśmy o lot. */
  destIata: string;
  checkin: string;
  checkout: string;
  month: number;
  year: number;
  nights: number;
  /** Najtańszy lot RT na osobę (PLN, floor). null = nie znaleziono. */
  flightPln: number | null;
  /** Najtańszy hotel za noc, pokój 2 os. (PLN, floor). null = nie znaleziono. */
  hotelPlnPerNight: number | null;
  /** Pakiet na osobę przy 2 os. (PLN, ceil). null gdy brak któregokolwiek składnika. */
  perPersonPln: number | null;
  currency: "PLN";
  tier: DestinationTier;
  /** Epoch ms wyliczenia CENY — od tego liczy się świeżość. */
  pricedAt: number;
  /**
   * true = rekord przeniesiony z poprzedniego snapshotu, bo w tym przebiegu
   * odświeżenie nie wyszło (§40). Cena jest realna, tylko starsza.
   */
  carriedForward: boolean;
}

/** Klucz rekordu — (kierunek × wylot × okno). */
export function snapshotRecordKey(destId: string, origin: string, checkin: string, nights: number): string {
  return `${destId}|${origin}|${checkin}|${nights}`;
}

export interface SnapshotCoverage {
  seedDestinations: number;
  /** Kierunki z JAKĄKOLWIEK ceną w snapshocie. */
  destinationsWithPrice: number;
  destinationCoveragePct: number;
  /** Kierunki z co najmniej jednym PRZYSZŁYM i używalnym rekordem — GŁÓWNY KPI (§47). */
  futureUsableDestinations: number;
  futureUsableCoveragePct: number;
  /** Pokrycie ważone tierami (§46) — czy snapshot jest użyteczny, a nie tylko duży. */
  weightedCoveragePct: number;
  tierACoveragePct: number;
  tierBCoveragePct: number;
  records: number;
  futureRecords: number;
  expiredRecords: number;
  fresh: number;
  staleButUsable: number;
  expiredPrice: number;
  monthsCovered: number;
  nightsCovered: number;
  originsCovered: number;
  countriesCovered: number;
}

export interface SnapshotMeta {
  version: number;
  runId: string;
  builtAt: number;
  /** Konfiguracja, z której powstał ten build — do porównań między wersjami. */
  windowConfig: { monthsAhead: number; nights: readonly number[]; labels: string[] };
  originConfig: { tierA: readonly string[]; tierB: readonly string[] };
  destinationTierConfig: { a: number; b: number; c: number };
  coverage: SnapshotCoverage;
  /** Segment rotacji, który ten przebieg odświeżył (§52). */
  segment: number;
  segmentCount: number;
}

export interface ConciergeSnapshot {
  meta: SnapshotMeta;
  records: Record<string, SnapshotRecord>;
}

/** Wersja formatu — bump przy zmianie kształtu rekordu. */
export const SNAPSHOT_VERSION = 1;
