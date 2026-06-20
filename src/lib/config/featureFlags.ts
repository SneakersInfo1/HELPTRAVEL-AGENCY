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

// FAZA 3 — boilerplate COVID/higiena (maseczki, dezynfekcja między pobytami,
// dystans fizyczny…) sprawia, że serwis wygląda jak skopiowany 4 lata temu.
// Domyślnie UKRYTE; ustaw HIDE_COVID_FACILITIES=false, żeby pokazać z powrotem.
export function hideCovidFacilities(): boolean {
  return process.env.HIDE_COVID_FACILITIES?.trim().toLowerCase() !== "false";
}

// FAZA 9 — sekcja prawdziwych opinii gości (LiteAPI /data/reviews). Domyślnie
// WYŁĄCZONA (opt-in), bo treści bywają obcojęzyczne i właściciel chce je
// najpierw obejrzeć. Włącz przez SHOW_REVIEWS=true (np. na Vercel).
export function showReviews(): boolean {
  return process.env.SHOW_REVIEWS?.trim().toLowerCase() === "true";
}
