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

// List bookings by clientReference. Confirmed by LiteAPI support 2026-05-24
// as the canonical recovery endpoint when a /rates/book call's response was
// dropped (e.g. Vercel function killed mid-flight at 10s default timeout while
// LiteAPI was still processing). `clientReference` is treated as an idempotency
// key on LiteAPI's side, so the same reference always maps to at most one
// booking (LiteAPI's words: "an optional client-defined reference ID acts as
// an idempotency key to prevent duplicate bookings").
const ListResponseSchema = z.object({
  data: z.array(LiteApiBookingSchema).default([]),
});

export async function listBookingsByClientReference(
  clientReference: string,
): Promise<LiteApiBooking[]> {
  const res = await liteApiRequest({
    path: "/bookings",
    method: "GET",
    keyMode: "private",
    schema: ListResponseSchema,
    query: { clientReference },
    // Cheap lookup — short timeout, no retries needed (we use this for
    // reconciliation; retries here would slow down the fast path).
    timeoutMs: 10_000,
    retries: 1,
  });
  return res.data;
}
