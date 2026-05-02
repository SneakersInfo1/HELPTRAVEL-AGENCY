// LiteAPI hotel detail — used by /hotele/[hotelId] page (Phase 3).

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
  });
  return res.data;
}
