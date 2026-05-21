// LiteAPI booking retrieval.

import { z } from "zod";
import { liteApiRequest } from "./client";
import { LiteApiBookingSchema, type LiteApiBooking } from "./types";

const ResponseSchema = z.object({ data: LiteApiBookingSchema });

export async function getBooking(bookingId: string): Promise<LiteApiBooking> {
  const res = await liteApiRequest({
    path: `/bookings/${encodeURIComponent(bookingId)}`,
    method: "GET",
    keyMode: "private",
    schema: ResponseSchema,
  });
  return res.data;
}
