// LiteAPI v3 types + Zod schemas for boundary validation.
// Reference: https://docs.liteapi.travel/docs/
//
// Money rule (master spec Section 16 #2): all amounts stored as MINOR UNITS
// (grosze for PLN, cents for EUR/USD). LiteAPI returns floats — convert at the
// boundary via `toMinor()` from src/lib/money.ts.

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Money + currency

export const CurrencyCodeSchema = z.string().length(3).toUpperCase();
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const PriceAmountSchema = z.object({
  amount: z.number().nonnegative(),
  currency: CurrencyCodeSchema,
});
export type PriceAmount = z.infer<typeof PriceAmountSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Search / hotels list (`GET /data/hotels`)

export const LiteApiHotelSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  address: z.string().optional(),
  zip: z.string().optional(),
  stars: z.number().nullish(),
  rating: z.number().nullish(),
  reviewCount: z.number().nullish(),
  main_photo: z.string().url().optional(),
  thumbnail: z.string().url().optional(),
});
export type LiteApiHotel = z.infer<typeof LiteApiHotelSchema>;

export const LiteApiHotelsListResponseSchema = z.object({
  data: z.array(LiteApiHotelSchema),
  total: z.number().optional(),
  hotelIds: z.array(z.string()).optional(),
});
export type LiteApiHotelsListResponse = z.infer<typeof LiteApiHotelsListResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Hotel detail (`GET /data/hotel`)

export const LiteApiHotelDetailSchema = LiteApiHotelSchema.extend({
  description: z.string().optional(),
  hotelDescription: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  hotelImages: z.array(z.object({ url: z.string().url(), urlHd: z.string().url().optional() })).optional(),
  policies: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
  checkinCheckoutTimes: z.object({ checkin: z.string().optional(), checkout: z.string().optional() }).optional(),
  facilities: z.array(z.unknown()).optional(),
});
export type LiteApiHotelDetail = z.infer<typeof LiteApiHotelDetailSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Rates (`POST /hotels/rates`)

export const LiteApiCancellationPolicySchema = z.object({
  refundableTag: z.enum(["RFN", "NRFN", "PRP"]).optional(),
  cancelPolicyInfos: z
    .array(
      z.object({
        cancelTime: z.string().optional(), // ISO datetime
        amount: z.number().optional(),
        currency: CurrencyCodeSchema.optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
});
export type LiteApiCancellationPolicy = z.infer<typeof LiteApiCancellationPolicySchema>;

export const LiteApiRateSchema = z.object({
  rateId: z.string(),
  occupancyNumber: z.number().optional(),
  name: z.string().optional(),
  maxOccupancy: z.number().optional(),
  adultCount: z.number().optional(),
  childCount: z.number().optional(),
  boardType: z.string().optional(),
  boardName: z.string().optional(),
  refundableTag: z.string().optional(),
  retailRate: z
    .object({
      total: z.array(PriceAmountSchema),
      suggestedSellingPrice: z.array(PriceAmountSchema).optional(),
    })
    .optional(),
  cancellationPolicies: LiteApiCancellationPolicySchema.optional(),
});
export type LiteApiRate = z.infer<typeof LiteApiRateSchema>;

export const LiteApiRoomTypeSchema = z.object({
  offerId: z.string(),
  supplier: z.string().optional(),
  rates: z.array(LiteApiRateSchema),
});
export type LiteApiRoomType = z.infer<typeof LiteApiRoomTypeSchema>;

export const LiteApiHotelRatesSchema = z.object({
  hotelId: z.string(),
  roomTypes: z.array(LiteApiRoomTypeSchema),
});
export type LiteApiHotelRates = z.infer<typeof LiteApiHotelRatesSchema>;

export const LiteApiRatesResponseSchema = z.object({
  data: z.array(LiteApiHotelRatesSchema),
});
export type LiteApiRatesResponse = z.infer<typeof LiteApiRatesResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Prebook (`POST /rates/prebook` with `usePaymentSdk: true`)

export const LiteApiPrebookResponseSchema = z.object({
  data: z.object({
    prebookId: z.string(),
    transactionId: z.string().optional(), // returned when usePaymentSdk=true
    secretKey: z.string().optional(), // returned when usePaymentSdk=true
    hotelId: z.string().optional(),
    rateId: z.string().optional(),
    price: z.number().optional(),
    currency: CurrencyCodeSchema.optional(),
    cancellationPolicies: LiteApiCancellationPolicySchema.optional(),
    expiresAt: z.string().optional(),
    // LiteAPI flags whether THIS prebook (and its Stripe PaymentIntent) is
    // sandbox/test mode. Authoritative env signal for the payment widget —
    // see B6. Location varies (data.* or top-level), capture both.
    sandbox: z.boolean().optional(),
  }),
  sandbox: z.boolean().optional(),
});
export type LiteApiPrebookResponse = z.infer<typeof LiteApiPrebookResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Book (`POST /rates/book`)

export const LiteApiGuestSchema = z.object({
  occupancyNumber: z.number(),
  firstName: z.string().min(1).max(40),
  lastName: z.string().min(1).max(40),
  email: z.string().email().optional(),
  remarks: z.string().max(200).optional(),
});
export type LiteApiGuest = z.infer<typeof LiteApiGuestSchema>;

export const LiteApiHolderSchema = z.object({
  firstName: z.string().min(1).max(40),
  lastName: z.string().min(1).max(40),
  email: z.string().email(),
  phone: z.string().min(4).max(32),
});
export type LiteApiHolder = z.infer<typeof LiteApiHolderSchema>;

// Principled schema for `POST /v3.0/rates/book` 200 response — based on the
// canonical version LiteAPI support provided 2026-05-24 after the real
// on-wire shape was diagnosed against our previous strict schema.
//
// Design rules confirmed with LiteAPI:
//  1. ONLY `data.bookingId` is a true invariant — that's the canonical handle.
//  2. `status` is a STRING (not an enum). Documented values across endpoints
//     include "CONFIRMED", "CANCELED", "CANCELLED_WITH_CHARGES". Treat as
//     opaque; route layer interprets business meaning.
//  3. `holder.phone` may come back as "" (empty) — DO NOT enforce min length
//     here, that constraint belongs in the INPUT schema (where the user types).
//  4. `hotel.parentHotelId` appears on the wire but is not in the OpenAPI —
//     allow unknown keys via `.passthrough()` at every nested level.
//  5. `sandbox` is sometimes boolean, sometimes 0|1 across endpoints.
//
// This shape rejects no real success response we've seen from LiteAPI and
// stays forward-compatible.
const LiteApiBookingHolderResponseSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    // Lenient by design — LiteAPI returns "" here even when the input was a
    // valid phone. We do NOT enforce `min(4)` on the response.
    phone: z.string().optional().nullable(),
  })
  .passthrough();

const LiteApiBookingHotelResponseSchema = z
  .object({
    hotelId: z.string().optional(),
    name: z.string().optional(),
    parentHotelId: z.string().optional(), // observed on-wire, undocumented
  })
  .passthrough();

const LiteApiBookedRoomResponseSchema = z
  .object({
    // LiteAPI uses both camelCase and snake_case across responses — accept both.
    occupancy_number: z.number().int().optional(),
    occupancyNumber: z.number().int().optional(),
    room_id: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    roomType: z
      .object({ roomTypeId: z.string().optional(), name: z.string().optional() })
      .passthrough()
      .optional(),
    rate: z
      .object({
        rateId: z.string().optional(),
        // sub-shapes differ across endpoints — accept anything.
        retailRate: z.unknown().optional(),
        cancellationPolicies: z.unknown().optional(),
        maxOccupancy: z.number().optional(),
        remarks: z.string().optional(),
      })
      .passthrough()
      .optional(),
    guests: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const LiteApiBookingSchema = z
  .object({
    bookingId: z.string(),

    clientReference: z.string().optional(),
    supplierBookingId: z.string().optional(),
    supplierBookingName: z.string().optional(),
    supplier: z.string().optional(),
    supplierId: z.number().int().optional(),

    status: z.string().optional(),
    hotelConfirmationCode: z.string().optional(),

    checkin: z.string().optional(),
    checkout: z.string().optional(),

    hotel: LiteApiBookingHotelResponseSchema.optional(),
    holder: LiteApiBookingHolderResponseSchema.optional(),

    bookedRooms: z.array(LiteApiBookedRoomResponseSchema).optional(),
    // Some endpoints also expose a flat `rooms` array — accept either.
    rooms: z.array(z.unknown()).optional(),

    paymentStatus: z.string().optional(),
    paymentTransactionId: z.string().optional(),
    prebookId: z.string().optional(),

    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    refundedAt: z.string().nullable().optional(),
    cancelledAt: z.string().nullable().optional(),
    amountRefunded: z.number().optional(),
    refundType: z.string().optional(),

    remarks: z.string().optional(),
    currency: z.string().optional(),
    price: z.number().optional(),
    commission: z.number().optional(),
    cancellationPolicies: z.unknown().optional(),
  })
  .passthrough();
export type LiteApiBooking = z.infer<typeof LiteApiBookingSchema>;

// Top-level envelope. LiteAPI sometimes adds `guestLevel`, `sandbox`, and
// other meta fields at the top level alongside `data`. Allow them through.
export const LiteApiBookResponseSchema = z
  .object({
    data: LiteApiBookingSchema,
    guestLevel: z.number().int().optional(),
    sandbox: z.boolean().or(z.number().int()).optional(),
  })
  .passthrough();
export type LiteApiBookResponse = z.infer<typeof LiteApiBookResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Cancellation

export const LiteApiCancellationSchema = z.object({
  bookingId: z.string(),
  status: z.enum(["CANCELLED", "PENDING", "FAILED"]),
  refundAmount: z.number().optional(),
  currency: CurrencyCodeSchema.optional(),
  cancelledAt: z.string().optional(),
});
export type LiteApiCancellation = z.infer<typeof LiteApiCancellationSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Webhook payload (canonical envelope confirmed by LiteAPI support 2026-05-24)
//
// Every event share the same envelope:
//   - event_id      unique delivery ID (use for dedupe / idempotency)
//   - event_name    e.g. "booking.book", "booking.refund", "booking.cancel"
//   - request       stringified JSON of the original request body
//   - response      stringified JSON of LiteAPI's response body
//   - sandbox       boolean — true for sandbox, false for production
//
// Auth: `Authorization` header with the shared token configured in the LiteAPI
// dashboard (Developer tools → Webhooks). NOT HMAC-SHA256 — our previous
// implementation assumed HMAC and would have rejected every real event.
export const LiteApiWebhookEventSchema = z
  .object({
    event_id: z.string(),
    event_name: z.string(),
    // request + response are STRINGIFIED JSON. Caller must JSON.parse() before
    // working with them. Kept as strings here to match the on-wire shape exactly.
    request: z.string().optional(),
    response: z.string().optional(),
    sandbox: z.boolean().or(z.number().int()).optional(),
  })
  .passthrough();
export type LiteApiWebhookEvent = z.infer<typeof LiteApiWebhookEventSchema>;

// Helper to parse the embedded stringified JSON safely. Returns null on parse
// failure (caller decides what to do with malformed sub-payloads).
export function parseWebhookEmbeddedJson<T = unknown>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Search input (our normalized search params, not LiteAPI's raw shape)

export interface NormalizedHotelSearchInput {
  destination: { city: string; country: string };
  checkin: string; // ISO yyyy-MM-dd
  checkout: string;
  occupancies: Array<{ adults: number; children?: number[] /* ages */ }>;
  currency: CurrencyCode;
  language: string; // ISO-2 (e.g. "pl")
  radiusKm?: number;
  lat?: number;
  lng?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Display-side normalized hotel offer (what UI consumes)

export interface NormalizedHotelOffer {
  hotelId: string;
  name: string;
  city: string;
  country?: string;
  address?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
  latitude?: number;
  longitude?: number;
  cheapestRate: {
    rateId: string;
    offerId: string;
    boardName?: string;
    refundableTag?: string;
    totalAmountMinor: bigint; // grosze
    currency: CurrencyCode;
    cancellationDeadline?: string;
  };
}
