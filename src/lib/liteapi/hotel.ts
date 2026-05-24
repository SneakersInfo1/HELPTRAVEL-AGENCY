// LiteAPI hotel detail — used by /hotele/[hotelId] page (Phase 3) and the
// /hotele/rezerwacja booking page (display-only hotel name + city).

import { liteApiRequest } from "./client";
import { LiteApiHotelDetailSchema, type LiteApiHotelDetail } from "./types";
import { z } from "zod";

const ResponseSchema = z.object({ data: LiteApiHotelDetailSchema });

export async function getHotelDetail(hotelId: string): Promise<LiteApiHotelDetail> {
  const res = await liteApiRequest({
    path: "/data/hotel",
    method: "GET",
    keyMode: "public",
    schema: ResponseSchema,
    query: { hotelId },
    // Hotel name / address / amenities / photos are essentially static — they
    // change at the property level, not per-booking. Caching for 24h matches
    // fetchHotelsList (search.ts) and saves 500-900ms on every booking-page
    // load (the previous uncached call blocked the entire /hotele/rezerwacja
    // server render). Tag enables manual revalidation if needed.
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-hotel-detail", `hotel:${hotelId}`] },
  });
  return res.data;
}
