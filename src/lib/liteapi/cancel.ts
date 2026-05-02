// LiteAPI booking cancellation.

import { z } from "zod";
import { liteApiRequest } from "./client";
import { LiteApiCancellationSchema, type LiteApiCancellation } from "./types";

const ResponseSchema = z.object({ data: LiteApiCancellationSchema });

export async function cancelBooking(bookingId: string): Promise<LiteApiCancellation> {
  const res = await liteApiRequest({
    path: `/bookings/${encodeURIComponent(bookingId)}`,
    method: "DELETE",
    keyMode: "private",
    schema: ResponseSchema,
    timeoutMs: 60_000,
    retries: 1,
  });
  return res.data;
}
