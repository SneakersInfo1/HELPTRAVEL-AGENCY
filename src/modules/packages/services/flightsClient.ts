// flightsClient (pakiety) — CIENKI re-export istniejącego, produkcyjnego klienta
// LiteAPI Flights. Warstwa pakietów NIE duplikuje kontraktu API — dziedziczy go
// 1:1 z `src/lib/flights` (rates/verify/prebook/book, mapowanie błędów, ancillaries).
// Ten plik istnieje wyłącznie po to, by moduł packages miał własną, stabilną
// granicę importu (gdyby kiedyś trzeba było opakować/rozszerzyć wywołania lotów).
//
// Kontrakt: docs/LITEAPI_FLIGHTS_CONTRACT.md. Decyzje: docs/PACKAGES_DECISIONS.md.

export {
  searchFlightRates,
  verifyFlightOffer,
  prebookFlight,
  bookFlight,
  getFlightBooking,
  extractVerifiedTotal,
  extractBookingId,
  toFlightApiError,
  FlightApiError,
} from "@/lib/flights/client";

export {
  mapServicesAttachable,
  selectedAncillariesTotal,
  type FlightAncillary,
  type FlightAncillaryGroup,
  type SelectedAncillary,
  type AncillaryCategory,
} from "@/lib/flights/ancillaries";

export type {
  FlightSearchInput,
  FlightContact,
  FlightPassenger,
} from "@/lib/flights/types";
