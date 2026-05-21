// Central feature flags.
//
// First flag: BOOKING_FLOW_MODE gates the entire hotel booking / payment flow.
// Default "disabled" — the reservation path renders a friendly "Wkrótce
// dostępne" state instead of calling LiteAPI booking endpoints. Flip to "live"
// only after Phase 4 end-to-end verification (real card, real refund).
//
// No prior feature-flag infrastructure existed in this repo (see
// BOOKING_AUDIT.md §6); this is the single, intentional home for flags.

export type BookingFlowMode = "disabled" | "live";

export function getBookingFlowMode(): BookingFlowMode {
  return process.env.BOOKING_FLOW_MODE?.trim().toLowerCase() === "live" ? "live" : "disabled";
}

export function isBookingLive(): boolean {
  return getBookingFlowMode() === "live";
}
