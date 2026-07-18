// Maszyna stanów sagi PackageBooking (§3.4) — CZYSTA FUNKCJA, zero I/O.
// DRAFT → FLIGHT_HELD → HOTEL_PREBOOKED → HOTEL_PAID
//       → HOTEL_BOOKED_AWAITING_FLIGHT → FLIGHT_PAID → FLIGHT_BOOKED → CONFIRMED
//
// Kompensacje (spec §3.4, dosłownie):
//  • fail płatności hotelu  → retry w miejscu; nic nie zaksięgowane, hold lotu
//    wygaśnie sam (zero zwrotów),
//  • fail booku hotelu PO płatności → refund A, koniec (lot nieopłacony,
//    hotelu NIE trzeba anulować — book się nie udał),
//  • porzucenie/deadline między checkoutami → cancel hotelu (darmowa anulacja
//    = warunek pakietowy) + refund A + e-mail + GA4 abandoned,
//  • permanent fail booku lotu PO płatności (lub flight.book.expired)
//    → refund B' + cancel hotelu + refund A + NEEDS_MANUAL_ACTION + alert.
//
// Duplikaty zdarzeń (webhook vs polling) → kind:"ignored" (no-op, bez błędu);
// przejścia spoza tabeli → kind:"invalid" (stan bez zmian, orkiestrator loguje).

import type {
  PackageSagaState,
  SagaEffect,
  SagaEvent,
  SagaPatch,
  SagaSnapshot,
  TransitionResult,
} from "./sagaTypes";
import { TERMINAL_STATES } from "./sagaTypes";

/** Okno na dokończenie lotu po booku hotelu: min(TTL prebooka lotu, 25 min). */
export const AWAITING_FLIGHT_MAX_MS = 25 * 60_000;

export function computeDeadline(hotelBookedAt: Date, prebookExpiresAt: Date | null): Date {
  const cap = hotelBookedAt.getTime() + AWAITING_FLIGHT_MAX_MS;
  if (prebookExpiresAt && prebookExpiresAt.getTime() < cap) return prebookExpiresAt;
  return new Date(cap);
}

function applied(next: PackageSagaState, effects: SagaEffect[] = [], patch: SagaPatch = {}): TransitionResult {
  return { kind: "applied", next, effects, patch };
}

function ignored(state: PackageSagaState, reason: string): TransitionResult {
  return { kind: "ignored", next: state, effects: [], patch: {}, reason };
}

function invalid(state: PackageSagaState, event: SagaEvent): TransitionResult {
  return {
    kind: "invalid",
    next: state,
    effects: [],
    patch: {},
    reason: `zdarzenie ${event.type} niedozwolone w stanie ${state}`,
  };
}

/** Kompensacja „jak fail w 8": po opłaconym locie — wszystko do zwrotu, admin przejmuje. */
function flightPermanentFailure(reason: string): TransitionResult {
  return applied(
    "NEEDS_MANUAL_ACTION",
    [
      { type: "REFUND_FLIGHT" },
      { type: "CANCEL_HOTEL" },
      { type: "REFUND_HOTEL" },
      { type: "ALERT_ADMIN", reason },
      { type: "TRACK", event: "package_saga_failed" },
    ],
    { failureReason: reason },
  );
}

/**
 * Jedno przejście sagi. Czyste: (snapshot, zdarzenie) → wynik z następnym
 * stanem, patchem pól i listą efektów. NIGDY nie rzuca dla nieoczekiwanych
 * zdarzeń — webhook i polling ścigają się z natury (spec: jeden serializowany
 * handler + optimistic lock robi resztę w orkiestratorze).
 */
export function transition(snapshot: SagaSnapshot, event: SagaEvent): TransitionResult {
  const { state } = snapshot;

  // Duplikaty w stanach terminalnych: cokolwiek przyjdzie po zamknięciu sagi
  // jest no-opem (cron/webhook może strzelić po fakcie).
  if (TERMINAL_STATES.has(state)) {
    return ignored(state, `saga zamknięta (${state})`);
  }

  switch (event.type) {
    case "FLIGHT_PREBOOK_OK": {
      if (state !== "DRAFT") return invalid(state, event);
      return applied("FLIGHT_HELD", [], {
        flightPrebookId: event.flightPrebookId,
        txnFlight: event.txnFlight,
        txnFlightHistory: [...snapshot.txnFlightHistory, event.txnFlight],
        prebookExpiresAt: event.prebookExpiresAt,
      });
    }

    case "SERVICES_ATTACHED": {
      // Zmiana bagaży możliwa do momentu OPŁACENIA lotu; każdy attach
      // unieważnia stary transactionId (payment element = remount z nowym).
      if (state !== "FLIGHT_HELD" && state !== "HOTEL_PREBOOKED" && state !== "HOTEL_BOOKED_AWAITING_FLIGHT") {
        return invalid(state, event);
      }
      return applied(state, [], {
        txnFlight: event.txnFlight,
        txnFlightHistory: [...snapshot.txnFlightHistory, event.txnFlight],
      });
    }

    case "HOTEL_PREBOOK_OK": {
      if (state !== "FLIGHT_HELD") return invalid(state, event);
      return applied("HOTEL_PREBOOKED", [], {
        hotelPrebookId: event.hotelPrebookId,
        txnHotel: event.txnHotel,
      });
    }

    case "HOTEL_PAYMENT_OK": {
      if (state === "HOTEL_PAID") return ignored(state, "płatność hotelu już zaksięgowana");
      if (state !== "HOTEL_PREBOOKED") return invalid(state, event);
      return applied("HOTEL_PAID");
    }

    case "HOTEL_PAYMENT_FAILED": {
      // Retryable: nic nie zaksięgowane, user może ponowić; hold lotu wygaśnie sam.
      if (state !== "HOTEL_PREBOOKED") return invalid(state, event);
      return applied("HOTEL_PREBOOKED", [], { failureReason: event.reason });
    }

    case "HOTEL_BOOK_OK": {
      if (state !== "HOTEL_PAID") return invalid(state, event);
      const deadline = computeDeadline(
        new Date(event.hotelBookedAt),
        snapshot.prebookExpiresAt ? new Date(snapshot.prebookExpiresAt) : null,
      );
      return applied(
        "HOTEL_BOOKED_AWAITING_FLIGHT",
        [
          { type: "SCHEDULE_DEADLINE", at: deadline.toISOString() },
          { type: "SEND_RESUME_EMAIL" }, // natychmiast po Checkout 1 (spec §4)
        ],
        { hotelBookingId: event.hotelBookingId, deadlineAt: deadline.toISOString() },
      );
    }

    case "HOTEL_BOOK_FAILED": {
      // Płatność A zaksięgowana, book NIE wszedł → refund A i koniec.
      // Hotelu nie anulujemy (nie istnieje), lot nieopłacony (hold wygaśnie).
      if (state !== "HOTEL_PAID") return invalid(state, event);
      return applied(
        "COMPENSATING",
        [
          { type: "REFUND_HOTEL" },
          { type: "SEND_REFUND_EMAIL" },
          { type: "TRACK", event: "package_saga_failed" },
        ],
        { failureReason: event.reason },
      );
    }

    case "FLIGHT_PAYMENT_OK": {
      if (state === "FLIGHT_PAID") return ignored(state, "płatność lotu już zaksięgowana");
      if (state !== "HOTEL_BOOKED_AWAITING_FLIGHT") return invalid(state, event);
      return applied("FLIGHT_PAID");
    }

    case "FLIGHT_PAYMENT_FAILED": {
      // Retryable w oknie deadline'u — po deadlinie cron przyśle DEADLINE_REACHED.
      if (state !== "HOTEL_BOOKED_AWAITING_FLIGHT") return invalid(state, event);
      return applied("HOTEL_BOOKED_AWAITING_FLIGHT", [], { failureReason: event.reason });
    }

    case "FLIGHT_BOOK_OK": {
      if (state !== "FLIGHT_PAID") return invalid(state, event);
      return applied("FLIGHT_BOOKED", [], { flightBookingId: event.flightBookingId });
    }

    case "FLIGHT_BOOK_FAILED_PERMANENT": {
      if (state !== "FLIGHT_PAID") return invalid(state, event);
      return flightPermanentFailure(event.reason);
    }

    case "FLIGHT_CONFIRMED": {
      if (state !== "FLIGHT_BOOKED") return invalid(state, event);
      return applied(
        "CONFIRMED",
        [{ type: "SEND_CONFIRMATION_EMAIL" }, { type: "TRACK", event: "package_purchase" }],
        {},
      );
    }

    case "FLIGHT_EXPIRED": {
      // flight.book.expired / timeout ticketingu — „jak fail w 8" (spec),
      // ale tylko gdy pieniądze za lot już ruszyły.
      if (state === "FLIGHT_PAID" || state === "FLIGHT_BOOKED") {
        return flightPermanentFailure(event.reason ?? "flight.book.expired");
      }
      return invalid(state, event);
    }

    case "DEADLINE_REACHED": {
      // Porzucenie między checkoutami. W KAŻDYM innym stanie deadline jest
      // nieaktualny (cron strzela po fakcie) → no-op, idempotentnie.
      if (state !== "HOTEL_BOOKED_AWAITING_FLIGHT") {
        return ignored(state, "deadline nieaktualny w tym stanie");
      }
      return applied(
        "COMPENSATING",
        [
          { type: "CANCEL_HOTEL" },
          { type: "REFUND_HOTEL" },
          { type: "SEND_REFUND_EMAIL" },
          { type: "TRACK", event: "package_abandoned_between_checkouts" },
        ],
        { failureReason: "porzucenie między checkoutami (deadline)" },
      );
    }

    case "FLIGHT_REHELD": {
      // Tylko w oknie oczekiwania na lot. deadlineAt ŚWIADOMIE bez zmian —
      // okno liczy się od booku hotelu i NIGDY nie jest przedłużane (nowy
      // prebook ma własny TTL, ale bezpiecznik kompensacji zostaje).
      if (state !== "HOTEL_BOOKED_AWAITING_FLIGHT") return invalid(state, event);
      return applied("HOTEL_BOOKED_AWAITING_FLIGHT", [], {
        flightPrebookId: event.flightPrebookId,
        txnFlight: event.txnFlight,
        txnFlightHistory: [...snapshot.txnFlightHistory, event.txnFlight],
        prebookExpiresAt: event.prebookExpiresAt,
      });
    }

    case "USER_CANCELLED_AWAITING": {
      // „Anuluj wszystko (pełny zwrot za hotel)" — kompensacja jak deadline.
      if (state !== "HOTEL_BOOKED_AWAITING_FLIGHT") return invalid(state, event);
      return applied(
        "COMPENSATING",
        [
          { type: "CANCEL_HOTEL" },
          { type: "REFUND_HOTEL" },
          { type: "SEND_REFUND_EMAIL" },
          { type: "TRACK", event: "package_abandoned_between_checkouts" },
        ],
        { failureReason: "rezygnacja klienta między checkoutami (pełny zwrot)" },
      );
    }

    case "USER_ABANDONED": {
      // Jawna rezygnacja PRZED jakimikolwiek pieniędzmi → zero zwrotów.
      if (state !== "DRAFT" && state !== "FLIGHT_HELD" && state !== "HOTEL_PREBOOKED") {
        return invalid(state, event);
      }
      return applied("CANCELLED");
    }

    case "COMPENSATION_DONE": {
      if (state !== "COMPENSATING") return invalid(state, event);
      return applied("REFUNDED");
    }
  }
}
