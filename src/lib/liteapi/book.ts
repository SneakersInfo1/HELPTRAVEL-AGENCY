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
  const body = {
    holder: input.holder,
    payment: {
      method: "TRANSACTION_ID",
      transactionId: input.transactionId,
    },
    prebookId: input.prebookId,
    guests: input.guests,
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
