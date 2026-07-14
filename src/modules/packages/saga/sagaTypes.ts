// Typy sagi PackageBooking (§3.4 spec) — Faza 2, Krok 2.0.
// Zasada nadrzędna: pieniądze za lot ruszają DOPIERO po potwierdzeniu hotelu.
// Maszyna stanów jest CZYSTA (zero I/O) — efekty uboczne to deklaratywne
// komendy (SagaEffect) wykonywane przez orkiestrator po zapisie stanu.

/** Stany sagi — ścieżka szczęśliwa + stany kompensacyjne/terminalne. */
export type PackageSagaState =
  | "DRAFT"
  | "FLIGHT_HELD" // hold taryfy lotu (prebook ~15 min, bez płatności)
  | "HOTEL_PREBOOKED"
  | "HOTEL_PAID"
  | "HOTEL_BOOKED_AWAITING_FLIGHT" // start deadline'u! (min(TTL prebooka, 25 min))
  | "FLIGHT_PAID"
  | "FLIGHT_BOOKED"
  | "CONFIRMED" // terminal — sukces
  | "CANCELLED" // terminal — nic nie zaksięgowane, zero zwrotów
  | "COMPENSATING" // trwa cancel hotelu / refund
  | "REFUNDED" // terminal — kompensacja domknięta, klient ma zwrot
  | "NEEDS_MANUAL_ACTION"; // terminal — admin musi dokończyć (alert!)

/** Stany, z których nie ma już żadnego przejścia. */
export const TERMINAL_STATES: ReadonlySet<PackageSagaState> = new Set([
  "CONFIRMED",
  "CANCELLED",
  "REFUNDED",
  "NEEDS_MANUAL_ACTION",
]);

/** Zdarzenia wejściowe sagi (z checkoutu, webhooków, pollingu i crona). */
export type SagaEvent =
  | {
      type: "FLIGHT_PREBOOK_OK";
      flightPrebookId: string;
      txnFlight: string;
      /** TTL holdu z response (źródło prawdy, nie guidance). */
      prebookExpiresAt: string | null;
    }
  // Attach bagaży/miejsc: stary transactionId lotu jest MARTWY → podmiana + historia.
  | { type: "SERVICES_ATTACHED"; txnFlight: string }
  | { type: "HOTEL_PREBOOK_OK"; hotelPrebookId: string; txnHotel: string }
  | { type: "HOTEL_PAYMENT_OK" }
  | { type: "HOTEL_PAYMENT_FAILED"; reason: string } // retryable — hold lotu wygaśnie sam
  | { type: "HOTEL_BOOK_OK"; hotelBookingId: string; hotelBookedAt: string }
  | { type: "HOTEL_BOOK_FAILED"; reason: string } // po płatności → refund A
  | { type: "FLIGHT_PAYMENT_OK" }
  | { type: "FLIGHT_PAYMENT_FAILED"; reason: string } // retryable w oknie deadline'u
  | { type: "FLIGHT_BOOK_OK"; flightBookingId: string }
  | { type: "FLIGHT_BOOK_FAILED_PERMANENT"; reason: string } // po retry idempotentnym
  | { type: "FLIGHT_CONFIRMED" } // webhook flight.book.confirmed / polling
  | { type: "FLIGHT_EXPIRED"; reason?: string } // flight.book.expired / timeout ticketingu
  | { type: "DEADLINE_REACHED" } // cron: porzucenie między checkoutami
  | { type: "USER_ABANDONED" } // jawna rezygnacja PRZED pieniędzmi
  | { type: "COMPENSATION_DONE" }; // wszystkie zwroty potwierdzone

/** Efekty uboczne — wykonuje orkiestrator (at-least-once; sink idempotentny). */
export type SagaEffect =
  | { type: "SCHEDULE_DEADLINE"; at: string }
  | { type: "SEND_RESUME_EMAIL" } // „Hotel potwierdzony — dokończ rezerwację lotu"
  | { type: "CANCEL_HOTEL" } // darmowa anulacja — warunek pakietowy MVP
  | { type: "REFUND_HOTEL" }
  | { type: "REFUND_FLIGHT" }
  | { type: "SEND_REFUND_EMAIL" }
  | { type: "SEND_CONFIRMATION_EMAIL" } // dwa numery rezerwacji
  | { type: "ALERT_ADMIN"; reason: string } // NIGDY error 500 dla klienta
  | {
      type: "TRACK";
      event: "package_saga_failed" | "package_abandoned_between_checkouts" | "package_purchase";
    };

/** Wpis dziennika przejść (persistowany w stateLogJson). */
export interface SagaStateLogEntry {
  state: PackageSagaState;
  event: SagaEvent["type"];
  at: string;
}

/** Pola rekordu, które przejście może nadpisać (patch dla store'a). */
export interface SagaPatch {
  flightPrebookId?: string;
  flightBookingId?: string;
  hotelPrebookId?: string;
  hotelBookingId?: string;
  txnHotel?: string;
  txnFlight?: string;
  /** Pełna nowa historia transakcji lotu (append po stronie maszyny). */
  txnFlightHistory?: string[];
  prebookExpiresAt?: string | null;
  deadlineAt?: string;
  failureReason?: string;
}

/** Minimalny obraz rekordu sagi, którego maszyna potrzebuje do decyzji. */
export interface SagaSnapshot {
  state: PackageSagaState;
  txnFlightHistory: string[];
  prebookExpiresAt: string | null;
}

export type TransitionKind = "applied" | "ignored" | "invalid";

export interface TransitionResult {
  kind: TransitionKind;
  /** Stan po przejściu (dla ignored/invalid = stan wejściowy). */
  next: PackageSagaState;
  effects: SagaEffect[];
  patch: SagaPatch;
  /** Diagnostyka dla ignored/invalid (log, nigdy wyjątek). */
  reason?: string;
}
