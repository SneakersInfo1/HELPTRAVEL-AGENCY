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
  };
  return liteApiRequest({
    path: "/hotels/rates",
    method: "POST",
    keyMode: "public",
    body,
    schema: LiteApiRatesResponseSchema,
  });
}
