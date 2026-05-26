// Public re-exports for /lib/liteapi/*. Application code imports from
// "@/lib/liteapi" (this file) and never reaches inside the directory.

export * from "./errors";
export * from "./types";
export { liteApiRequest } from "./client";
export { fetchHotelsList, searchHotels, resolveCountryCode } from "./search";
export { getRates, type GetRatesInput } from "./rates";
export { getHotelDetail } from "./hotel";
// `autocompletePlaces` removed 2026-05-26 — was a TODO stub returning [] with
// zero production callers. Destination autocomplete lives in /api/destinations/
// suggest + lib/mvp/destination-suggestions instead.
export { prebook, type PrebookInput } from "./prebook";
export { book, type BookInput } from "./book";
export {
  prebookHotel,
  bookHotel,
  type PrebookHotelInput,
  type PrebookResult,
  type BookHotelInput,
  type BookResult,
} from "./booking";
export {
  BookingError,
  BookFailedAfterPaymentError,
  toBookingError,
  type BookingErrorCode,
} from "./booking-errors";
export { getPaymentSdkConfig, type UserPaymentSdkConfig, type ClientSdkInitInput } from "./payments";
export {
  verifyWebhookAuthToken,
  verifyWebhookSignature,
  parseWebhookEmbeddedJson,
  type VerifyWebhookInput,
} from "./webhook";
export { getBooking, listBookingsByClientReference } from "./retrieve";
export { cancelBooking } from "./cancel";
