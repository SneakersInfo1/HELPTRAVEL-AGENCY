// LiteAPI prebook — locks the price and returns the User Payment SDK
// transaction handle (transactionId + secretKey).
//
// Master spec section 0 / Phase 0 review: we use `usePaymentSdk: true` so
// LiteAPI's payment partner becomes merchant of record. NO card data on
// helptravel.pl. The response carries transactionId + secretKey which the
// front-end User Payment SDK consumes.

import { liteApiRequest } from "./client";
import { LiteApiError, LiteApiSoldOutError, isNoAvailabilityBody } from "./errors";
import { LiteApiPrebookResponseSchema, type LiteApiPrebookResponse } from "./types";

export interface PrebookInput {
  rateId: string;
  // Optional client-side reference for idempotency / observability.
  clientReference?: string;
}

export async function prebook(input: PrebookInput): Promise<LiteApiPrebookResponse> {
  // UWAGA — to NIE jest zwykła zmiana nazwy pola.
  //
  // Poprzednia wersja tego komentarza twierdziła, że `/hotels/rates` zwraca
  // `rateId`, a prebook chce „TĘ SAMĄ WARTOŚĆ pod nazwą `offerId`". To
  // nieprawda i kosztowało dwa odrzucone prebooki podczas audytu 2026-08-08:
  //
  //   • `rates[].rateId`        — identyfikuje TARYFĘ (zmierzone: 551 znaków)
  //   • `roomTypes[].offerId`   — to, czego chce prebook (zmierzone: 1084 znaki)
  //
  // Wysłanie `rateId` daje `4002 invalid offerId`. Parametr wejściowy nazywa
  // się tu historycznie `rateId`, ale WARTOŚĆ, którą trzeba podać, pochodzi
  // z `roomTypes[].offerId` — tak robi UI (`rooms-section.tsx:510` przez
  // `domain/room.ts:172`) i `scripts/booking-smoke.ts:44-50`.
  //
  // Konsekwencja warta zapamiętania: `offerId` żyje na poziomie roomType'u,
  // a rozbicie podatkowe na poziomie taryfy (`rates[].retailRate`).
  const body = {
    offerId: input.rateId,
    clientReference: input.clientReference,
    usePaymentSdk: true,
  };
  try {
    return await liteApiRequest({
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
  } catch (err) {
    // 2001 „no prebook availability" (HTTP 400 albo 409) = ta oferta właśnie
    // przestała być dostępna — nie awaria dostawcy. Bez tego 400 kończyło jako
    // LITEAPI_DOWN/503, a 409 jako „cena wygasła". Tylko tutaj, nie we wspólnym
    // mapperze — powód przy `isNoAvailabilityBody` w errors.ts.
    if (
      err instanceof LiteApiError &&
      (err.status === 400 || err.status === 409) &&
      isNoAvailabilityBody(err.body)
    ) {
      throw new LiteApiSoldOutError("No prebook availability (2001)", {
        status: err.status,
        body: err.body,
        cause: err,
      });
    }
    throw err;
  }
}
