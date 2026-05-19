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

export const LiteApiBookingSchema = z.object({
  bookingId: z.string(),
  clientReference: z.string().optional(),
  supplierBookingId: z.string().optional(),
  status: z.enum(["CONFIRMED", "PENDING", "FAILED", "CANCELLED"]),
  hotelConfirmationCode: z.string().optional(),
  checkin: z.string(),
  checkout: z.string(),
  hotel: z.object({ hotelId: z.string(), name: z.string().optional() }).passthrough(),
  bookedRooms: z.array(z.unknown()).optional(),
  guests: z.array(LiteApiGuestSchema).optional(),
  holder: LiteApiHolderSchema.optional(),
  price: z.number().optional(),
  commission: z.number().optional(),
  currency: CurrencyCodeSchema.optional(),
  cancellationPolicies: LiteApiCancellationPolicySchema.optional(),
  createdAt: z.string().optional(),
});
export type LiteApiBooking = z.infer<typeof LiteApiBookingSchema>;

export const LiteApiBookResponseSchema = z.object({ data: LiteApiBookingSchema });
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
// Webhook payload

export const LiteApiWebhookEventSchema = z.object({
  type: z.enum([
    "payment_success",
    "payment_failed",
    "booking_confirmed",
    "booking_cancelled",
    "booking_modified",
  ]),
  timestamp: z.string(),
  data: z.unknown(), // refine per event type at handler boundary
});
export type LiteApiWebhookEvent = z.infer<typeof LiteApiWebhookEventSchema>;

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
