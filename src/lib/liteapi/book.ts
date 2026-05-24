// LiteAPI book — finalizes a prebook into a confirmed booking, with the
// User Payment SDK transaction handle from the front-end.

import { liteApiRequest } from "./client";
import {
  LiteApiBookResponseSchema,
  type LiteApiBookResponse,
  type LiteApiGuest,
  type LiteApiHolder,
} from "./types";

export interface BookInput {
  prebookId: string;
  // From the User Payment SDK after successful charge:
  transactionId: string;
  // Idempotency — server-generated UUID persisted before call (master spec §16 #4).
  clientReference: string;
  guests: LiteApiGuest[];
  holder: LiteApiHolder;
}

export async function book(input: BookInput): Promise<LiteApiBookResponse> {
  // LiteAPI book contract (POST /rates/book):
  //   { prebookId, guests[], holder, payment{method,transactionId}, clientReference }
  // Internal field stays `guests` — matches LiteAPI's request key 1:1.
  //
  // CRITICAL: `payment.method` MUST be the literal string "TRANSACTION" (NOT
  // "TRANSACTION_ID") when paying via the User Payment SDK. Verified 2026-05-24
  // from LiteAPI's own llms.txt docs after this exact value caused two real-
  // card production failures (sids d9eaa09e and db11dc23):
  //   "TRANSACTION — Use when using Payment SDK (provide transactionId)"
  // The previous "TRANSACTION_ID" came from an unverified assumption in
  // BOOKING_AUDIT.md §3 and was never exercised against live /rates/book in
  // production prior to those two failures. LiteAPI rejects the wrong value
  // with HTTP 400 + error code 4002 "required request field is missing or
  // wrong input" within ~180ms (validation, no upstream call).
  // LiteAPI 4002 (confirmed live 2026-05-24): `guests[*].email` is REQUIRED on
  // /rates/book even though our internal `LiteApiGuestSchema` marks it
  // optional and the booking form only collects email at the holder level.
  // The full LiteAPI error was:
  //   "Key: 'BookRequest.Guests[0].Email' Error: Field validation for 'Email'
  //    failed on the 'required' tag"
  // Fill the gap at the boundary: any guest without their own email inherits
  // the holder's email. Holder.email is required by LiteApiHolderSchema so
  // the fallback always has a value. This is the right semantic — for the
  // common single-occupancy booking, guest = holder, and even for multi-
  // occupancy LiteAPI primarily uses the holder's email as the booking-wide
  // confirmation contact; per-guest emails are mostly for record-keeping.
  const guests = input.guests.map((g) => ({
    ...g,
    email: g.email ?? input.holder.email,
  }));
  const body = {
    holder: input.holder,
    payment: {
      method: "TRANSACTION",
      transactionId: input.transactionId,
    },
    prebookId: input.prebookId,
    guests,
    clientReference: input.clientReference,
  };
  return liteApiRequest({
    path: "/rates/book",
    method: "POST",
    keyMode: "private",
    body,
    schema: LiteApiBookResponseSchema,
    timeoutMs: 60_000,
    retries: 1,
  });
}
