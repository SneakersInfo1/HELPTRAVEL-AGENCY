// LiteAPI rates — fetches priced rates for a list of hotelIds.

import { liteApiRequest } from "./client";
import { LiteApiRatesResponseSchema, type LiteApiRatesResponse } from "./types";

export interface GetRatesInput {
  hotelIds: string[];
  occupancies: Array<{ adults: number; children?: number[] }>;
  checkin: string; // yyyy-MM-dd
  checkout: string;
  currency: string; // "PLN"
  guestNationality?: string; // ISO-2, default "PL"
  limit?: number;
  // KRYTYCZNE dla wydajności listy: gdy potrzebujemy tylko NAJTAŃSZEJ ceny na
  // hotel (lista wyników), prosimy LiteAPI o jedną taryfę na hotel. Zmierzone
  // na żywo (prod, batch 50, Barcelona): pełna odpowiedź = ~25 MB / 6,8 s,
  // a `maxRatesPerHotel: 1` = ~0,15 MB / 3,8 s przy IDENTYCZNEJ najtańszej
  // cenie (14/15 co do grosza, nigdy drożej — reszta to wahanie cen między
  // callami). Bonus: 0,15 MB MIEŚCI się w 2 MB cap Next Data Cache, więc
  // drugi odwiedzający dostaje cache-hit (pełne 25 MB nigdy się nie cache'owało
  // → spam ostrzeżeń „items over 2MB can not be cached" w logach prod).
  // Strona SZCZEGÓŁÓW hotelu NIE ustawia tego — tam pokazujemy wszystkie pokoje.
  maxRatesPerHotel?: number;
}

export async function getRates(input: GetRatesInput): Promise<LiteApiRatesResponse> {
  const body = {
    hotelIds: input.hotelIds,
    occupancies: input.occupancies.map((o) => ({
      adults: o.adults,
      children: o.children ?? [],
    })),
    checkin: input.checkin,
    checkout: input.checkout,
    currency: input.currency,
    guestNationality: input.guestNationality ?? "PL",
    limit: input.limit ?? input.hotelIds.length,
    ...(input.maxRatesPerHotel ? { maxRatesPerHotel: input.maxRatesPerHotel } : {}),
  };
  return liteApiRequest({
    path: "/hotels/rates",
    method: "POST",
    keyMode: "public",
    body,
    schema: LiteApiRatesResponseSchema,
    // Sesja C2 — server-side Data Cache via Next's fetch patches.
    // Same (hotelIds, dates, occupancy) within 15 min → instant cache hit.
    // Rates change slowly; if they expire by booking time we fall through
    // to LiteApiRateExpiredError handling already in /prebook.
    nextCache: { revalidate: 900, tags: ["liteapi", "liteapi-rates"] },
  });
}
