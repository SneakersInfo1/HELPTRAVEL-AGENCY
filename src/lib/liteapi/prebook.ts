// LiteAPI prebook — locks the price and returns the User Payment SDK
// transaction handle (transactionId + secretKey).
//
// Master spec section 0 / Phase 0 review: we use `usePaymentSdk: true` so
// LiteAPI's payment partner becomes merchant of record. NO card data on
// helptravel.pl. The response carries transactionId + secretKey which the
// front-end User Payment SDK consumes.

import { liteApiRequest } from "./client";
import { LiteApiPrebookResponseSchema, type LiteApiPrebookResponse } from "./types";

export interface PrebookInput {
  rateId: string;
  // Optional client-side reference for idempotency / observability.
  clientReference?: string;
}

export async function prebook(input: PrebookInput): Promise<LiteApiPrebookResponse> {
  const body = {
    rateId: input.rateId,
    clientReference: input.clientReference,
    usePaymentSdk: true,
  };
  return liteApiRequest({
    path: "/rates/prebook",
    method: "POST",
    keyMode: "private",
    body,
    schema: LiteApiPrebookResponseSchema,
    timeoutMs: 60_000,
    retries: 1, // do NOT retry blindly — caller persists prebook record before this call
  });
}
