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
  // LiteAPI naming drift: getRates returns `rateId`, but POST /rates/prebook
  // requires the same value under the field name `offerId`. We keep the
  // internal name (`rateId`) consistent and rename only at the boundary.
  const body = {
    offerId: input.rateId,
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
    // One free retry for transient failures only (5xx / 408 / 425 / network /
    // timeout — see RETRYABLE_STATUS in client.ts). Deterministic errors
    // (401/403/409/410/422/429) are NOT retried — they would fail again.
    // LiteAPI prebook is idempotent within the rate TTL with the same
    // clientReference, so a duplicate attempt is safe; we only ever persist
    // the successful response.
    retries: 2,
  });
}
