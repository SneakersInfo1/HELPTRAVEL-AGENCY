// Maszyna stanów rezerwacji lotu — JAWNE przejścia zamiast domniemanych.
//
// ── PO CO ────────────────────────────────────────────────────────────────────
//
// Rekord sesji ma dwa niezależne pola statusu (`paymentStatus`,
// `bookingStatus`) i pięć miejsc, które je zapisują (prebook, finalize ×2,
// webhook ×4, GET booking). Nigdzie nie było zapisane, które pary są legalne —
// więc para „płatność nieopłacona + rezerwacja potwierdzona" była wyrażalna
// i nikt by jej nie zauważył. Ten moduł zamienia rozproszoną intencję w jedną
// tabelę, którą da się przetestować.
//
// ── CZEGO TU CELOWO NIE MA ───────────────────────────────────────────────────
//
// Nie zmieniamy nazw pól ani wartości w Redisie. Rekordy sesji żyją 24 h, a
// `completed:*` 90 dni — rename statusów unieważniłby rekordy w locie, w tym
// rekordy paid-but-unbooked, czyli dokładnie te, których nie wolno zgubić.
// Zamiast tego mapujemy istniejące pary na kanoniczne nazwy z briefu i
// pilnujemy PRZEJŚĆ. Jedyne nowe wartości to `paymentStatus:"processing"`
// (stan „wracamy z widgetu, jeszcze nie wiemy") i `confirmationEmail`.

import type { FlightBookingStatus, FlightPaymentStatus } from "./session";

/** Kanoniczne stany lejka (brief §3). Wyliczane z pary pól, nie zapisywane. */
export type FlightFlowState =
  | "PRICE_ACCEPTED" // intencja zapisana, prebooka jeszcze nie ma
  | "PAYMENT_CREATED" // prebook OK, bramka kwoty zdana, widget może ruszyć
  | "PAYMENT_BLOCKED" // prebook OK, ale bramka kwoty NIE zdana — brak secretKey
  | "PAYMENT_PROCESSING" // wróciliśmy z widgetu, dowód jeszcze nierozstrzygnięty
  | "PAYMENT_FAILED"
  | "BOOKING_STARTED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_PENDING" // dostawca potwierdzi później (pending_confirmation)
  | "BOOKING_UNCERTAIN" // zapłacone lub nierozstrzygnięte + brak rezerwacji → człowiek
  | "BOOKING_CANCELLED"
  | "BOOKING_FAILED";

/** Stan wysyłki maila potwierdzającego — NIEZALEŻNY od stanu rezerwacji. */
export type FlightEmailState = "EMAIL_PENDING" | "EMAIL_SENT" | "EMAIL_FAILED";

export interface FlightStatePair {
  paymentStatus: FlightPaymentStatus;
  bookingStatus: FlightBookingStatus;
  /** `false` = bramka kwoty nie przeszła; `undefined` = sesja sprzed bramki. */
  priceGatePassed?: boolean;
}

/** Wylicza kanoniczny stan z pary pól rekordu. */
export function flightFlowState(rec: FlightStatePair): FlightFlowState {
  switch (rec.bookingStatus) {
    case "intent":
      return "PRICE_ACCEPTED";
    case "prebooked":
      if (rec.paymentStatus === "failed") return "PAYMENT_FAILED";
      if (rec.paymentStatus === "processing") return "PAYMENT_PROCESSING";
      return rec.priceGatePassed === false ? "PAYMENT_BLOCKED" : "PAYMENT_CREATED";
    case "booking":
      return "BOOKING_STARTED";
    case "confirmed":
      return "BOOKING_CONFIRMED";
    case "pending_confirmation":
      return "BOOKING_PENDING";
    case "manual_review":
      return "BOOKING_UNCERTAIN";
    case "cancelled":
      return "BOOKING_CANCELLED";
    case "failed":
      return "BOOKING_FAILED";
  }
}

/**
 * Dozwolone przejścia. Wpis brakujący = przejście zabronione.
 *
 * Czytane jako „z X wolno przejść do…". Pętle własne pomijamy — zapis tego
 * samego stanu (idempotentny refresh, powtórzony webhook) jest zawsze legalny
 * i sprawdzany osobno.
 */
const ALLOWED: Record<FlightFlowState, readonly FlightFlowState[]> = {
  PRICE_ACCEPTED: ["PAYMENT_CREATED", "PAYMENT_BLOCKED", "BOOKING_FAILED"],
  PAYMENT_BLOCKED: ["BOOKING_FAILED"], // ślepa uliczka: bez secretKey nie ma płatności
  PAYMENT_CREATED: ["PAYMENT_PROCESSING", "PAYMENT_FAILED", "BOOKING_STARTED", "BOOKING_FAILED"],
  PAYMENT_PROCESSING: ["BOOKING_STARTED", "PAYMENT_FAILED", "BOOKING_UNCERTAIN"],
  // Nieudana próba nie pali prebooka: Stripe pozwala ponowić ten sam
  // PaymentIntent, a nasz `secretKey` dalej jest ważny. Blokada retry
  // zmuszałaby klienta do drugiego prebooka, czyli drugiego locka taryfy.
  PAYMENT_FAILED: ["PAYMENT_PROCESSING", "BOOKING_STARTED"],
  BOOKING_STARTED: ["BOOKING_CONFIRMED", "BOOKING_PENDING", "BOOKING_UNCERTAIN", "BOOKING_FAILED"],
  BOOKING_PENDING: ["BOOKING_CONFIRMED", "BOOKING_CANCELLED", "BOOKING_UNCERTAIN"],
  BOOKING_CONFIRMED: ["BOOKING_CANCELLED"], // 1.4.7: „failed" po confirmed jest ignorowane
  BOOKING_UNCERTAIN: ["BOOKING_CONFIRMED", "BOOKING_CANCELLED", "BOOKING_FAILED"],
  BOOKING_CANCELLED: [],
  BOOKING_FAILED: [],
};

/** `true`, gdy przejście jest dozwolone (albo jest to zapis tego samego stanu). */
export function canTransition(from: FlightFlowState, to: FlightFlowState): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

/**
 * TWARDY INWARIANT: „potwierdzone" wymaga „opłacone".
 *
 * Sprawdzany osobno od tabeli przejść, bo to jedyna reguła, której złamanie
 * oznacza wydanie biletu bez pieniędzy — i jedyna, którą chcemy widzieć
 * wprost, a nie wydedukowaną z grafu.
 */
function violatesPaidBeforeConfirmed(next: FlightStatePair): boolean {
  const s = flightFlowState(next);
  return (s === "BOOKING_CONFIRMED" || s === "BOOKING_PENDING") && next.paymentStatus !== "paid";
}

export interface TransitionCheck {
  ok: boolean;
  from: FlightFlowState;
  to: FlightFlowState;
  reason?: "not_allowed" | "confirmed_without_payment";
}

/** Pełne sprawdzenie przejścia: tabela + inwariant „paid przed confirmed". */
export function checkFlightTransition(prev: FlightStatePair, next: FlightStatePair): TransitionCheck {
  const from = flightFlowState(prev);
  const to = flightFlowState(next);
  if (violatesPaidBeforeConfirmed(next)) {
    return { ok: false, from, to, reason: "confirmed_without_payment" };
  }
  if (!canTransition(from, to)) {
    return { ok: false, from, to, reason: "not_allowed" };
  }
  return { ok: true, from, to };
}
