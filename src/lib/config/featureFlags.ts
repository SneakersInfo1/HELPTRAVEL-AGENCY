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

// ── LOTY ─────────────────────────────────────────────────────────────────────
//
// `FLIGHTS_FLOW_MODE` — hamulec bezpieczeństwa ścieżki lotów, funkcjonalny
// odpowiednik `BOOKING_FLOW_MODE` przy hotelach (ta sama konwencja nazw i ta
// sama wartość domyślna: WYŁĄCZONE, dopóki ktoś świadomie nie włączy).
//
// CO WYŁĄCZA (granica pieniędzy — start NOWYCH płatności i rezerwacji):
//   • `POST /api/flights/prebook` → 503, zanim powstanie lock taryfy i zanim
//     LiteAPI otworzy PaymentIntent,
//   • `payable` w `GET /api/flights/session/[id]` → `false`, więc widget
//     płatności nie zamontuje się dla sesji, która jeszcze nie zapłaciła,
//   • CTA na `/loty/wyniki` → uczciwy komunikat zamiast ścieżki w ślepy zaułek.
//
// CZEGO NIE WYŁĄCZA — I TO JEST TU NAJWAŻNIEJSZE:
//   • `POST /api/flights/book` i `finalizeFlightBooking` (strona powrotu),
//   • webhooka `flights-webhook`,
//   • `GET /api/flights/booking/[id]` i strony potwierdzenia,
//   • wyszukiwania (`/flights/rates`, `verify`) — nie ruszają pieniędzy.
//
// Powód: człowiek, który JUŻ ZAPŁACIŁ, ma pieniądze u dostawcy i żadnej
// rezerwacji. Odcięcie mu finalizacji zamieniłoby awarię w kradzież. Kill-switch
// ma zatrzymać NAPŁYW nowych transakcji, nigdy dokończenie już rozpoczętych.
//
// Włączenie: `FLIGHTS_FLOW_MODE=live` (Vercel → env → redeploy).
// Wyłączenie awaryjne: ustaw cokolwiek innego (albo usuń) → redeploy.

export type FlightsFlowMode = "disabled" | "live";

export function getFlightsFlowMode(): FlightsFlowMode {
  return process.env.FLIGHTS_FLOW_MODE?.trim().toLowerCase() === "live" ? "live" : "disabled";
}

export function isFlightsLive(): boolean {
  return getFlightsFlowMode() === "live";
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
