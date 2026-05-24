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
  // CRITICAL: `payment.method` MUST be the literal string "TRANSACTION_ID" when
  // paying via the User Payment SDK. Confirmed by LiteAPI support directly on
  // 2026-05-24 with a corrected example request. The full list of valid enum
  // values per LiteAPI's Booking API schema is:
  //   • "ACC_CREDIT_CARD"
  //   • "WALLET"
  //   • "CREDIT"
  //   • "TRANSACTION_ID"  ← THIS ONE when usePaymentSdk=true on prebook
  // History to prevent re-regression: an earlier commit changed this to
  // "TRANSACTION" based on a WebFetch summarization of LiteAPI's llms.txt that
  // had truncated "_ID" off the value. LiteAPI then returned HTTP 400 4000
  // "missing or not supported payment method". That commit was reverted in
  // f72d83b. Do NOT change this value again without a direct LiteAPI support
  // confirmation or a verified screenshot from their dashboard / OpenAPI spec.
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
      method: "TRANSACTION_ID",
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
