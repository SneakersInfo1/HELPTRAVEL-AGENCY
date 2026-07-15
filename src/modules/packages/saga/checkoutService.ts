// Serwis checkoutu pakietowego (Krok 2.1) — KAŻDY krok = wywołanie klienta
// LiteAPI + zdarzenie sagi przez applySagaEvent (jedyna droga zmiany stanu).
//
// Sekwencja §3.4: verify → prebook lotu (HOLD, bez płatności) → prebook hotelu
// → [Checkout 1: płatność A w SDK] → book hotelu → [Checkout 2: płatność B']
// → book lotu → potwierdzenie webhookiem/pollingiem.
//
// GRANICA PIENIĘDZY: płatności potwierdza klient w Payment SDK (przeglądarka);
// ten serwis wykonuje book DOPIERO po zgłoszonym sukcesie płatności. Prebooki
// to hold bez obciążenia. Testy realną kartą = wyłącznie za zgodą właściciela.
//
// Porty (Deps) są WĄSKIE i własne — adaptery na prawdziwe klienty
// (verifyFlightOffer/prebookFlight/prebookHotel/bookHotel/bookFlight) dopina
// warstwa route'ów; dzięki temu serwis testuje się bez sieci.

import { applySagaEvent, newPackageBookingRecord } from "./orchestrator";
import type { ApplySagaEventResult, EffectSink, PackageBookingRecord, SagaStore } from "./orchestrator";

export interface CheckoutStore extends SagaStore {
  create(rec: PackageBookingRecord): Promise<void>;
}

export interface FlightHoldResult {
  prebookId: string;
  transactionId: string;
  secretKey: string;
  /** TTL holdu z response (źródło prawdy); brak = null. */
  expiresAt: string | null;
}

export interface HotelPrebookResult {
  prebookId: string;
  transactionId: string;
  secretKey: string;
  /** Realna kwota/waluta PaymentIntentu z prebooka (do widgetu — zero dryfu). */
  price?: number;
  currency?: string;
}

export interface CheckoutDeps {
  store: CheckoutStore;
  effects: EffectSink;
  /** verify oferty lotu — TTL ~5 min; zmiana ceny wraca do UI (jawny banner). */
  verifyFlight(offerId: string): Promise<{ priceChanged: boolean; total?: number }>;
  prebookFlight(args: { offerId: string }): Promise<FlightHoldResult>;
  prebookHotel(args: { rateId: string; clientReference: string }): Promise<HotelPrebookResult>;
  bookHotel(args: { prebookId: string; transactionId: string; clientReference: string }): Promise<{ bookingId: string }>;
  /** Book lotu — idempotentny po prebookId (retry z backoffem w kliencie). */
  bookFlight(args: { prebookId: string; transactionId: string }): Promise<{ bookingId: string }>;
  newId(): string;
  now(): Date;
}

export interface StartCheckoutInput {
  contactEmail: string;
  amountHotelMinor: number;
  amountFlightMinor: number;
  /** Serializowalny kontekst oferty (do maili/confirmation) — zapis w offerJson robi route. */
}

function fail(step: string, r: ApplySagaEventResult): Error {
  return new Error(`checkout ${step}: saga odmówiła przejścia (${r.kind}${r.reason ? `: ${r.reason}` : ""})`);
}

/** Krok 0: świeża saga DRAFT. Zwraca id (dalej trzymane w sesji checkoutu). */
export async function startPackageCheckout(deps: CheckoutDeps, input: StartCheckoutInput): Promise<string> {
  const rec = newPackageBookingRecord(deps.newId());
  rec.contactEmail = input.contactEmail;
  await deps.store.create(rec);
  return rec.id;
}

/**
 * Krok 1: verify + HOLD lotu (bez płatności). Zmiana ceny NIE robi prebooka —
 * wraca do UI (jawny banner z deltą, decyzja usera), zero cichych zmian kwot.
 */
export async function holdFlight(
  deps: CheckoutDeps,
  sagaId: string,
  input: { offerId: string },
): Promise<{ priceChanged: true; total?: number } | ({ priceChanged: false } & FlightHoldResult)> {
  const verify = await deps.verifyFlight(input.offerId);
  if (verify.priceChanged) return { priceChanged: true, total: verify.total };

  const hold = await deps.prebookFlight({ offerId: input.offerId });
  const r = await applySagaEvent(deps, sagaId, {
    type: "FLIGHT_PREBOOK_OK",
    flightPrebookId: hold.prebookId,
    txnFlight: hold.transactionId,
    prebookExpiresAt: hold.expiresAt,
  });
  if (r.kind !== "applied") throw fail("holdFlight", r);
  return { priceChanged: false, ...hold };
}

/** Krok 2: prebook hotelu → PaymentIntent A (secretKey do Checkout 1). */
export async function prebookHotelStep(
  deps: CheckoutDeps,
  sagaId: string,
  input: { rateId: string },
): Promise<HotelPrebookResult> {
  const pre = await deps.prebookHotel({ rateId: input.rateId, clientReference: sagaId });
  const r = await applySagaEvent(deps, sagaId, {
    type: "HOTEL_PREBOOK_OK",
    hotelPrebookId: pre.prebookId,
    txnHotel: pre.transactionId,
  });
  if (r.kind !== "applied") throw fail("prebookHotel", r);
  return pre;
}

/**
 * Checkout 1 domknięty: płatność A potwierdzona w SDK → book hotelu.
 * Sukces = HOTEL_BOOKED_AWAITING_FLIGHT (start deadline'u + e-mail wznawiający,
 * efekty z maszyny). Fail booku = kompensacja (refund A) — NIGDY wyjątek do UI:
 * klient dostaje uczciwy status, nie error 500.
 */
export async function confirmHotelPaidAndBook(
  deps: CheckoutDeps,
  sagaId: string,
): Promise<{ ok: true; hotelBookingId: string } | { ok: false; compensated: true }> {
  const paid = await applySagaEvent(deps, sagaId, { type: "HOTEL_PAYMENT_OK" });
  if (paid.kind !== "applied" && paid.kind !== "ignored") throw fail("hotelPaid", paid);

  const rec = await deps.store.load(sagaId);
  if (!rec?.hotelPrebookId || !rec.txnHotel) throw new Error(`saga ${sagaId}: brak prebooka/txn hotelu`);

  try {
    const booked = await deps.bookHotel({
      prebookId: rec.hotelPrebookId,
      transactionId: rec.txnHotel,
      clientReference: sagaId,
    });
    const r = await applySagaEvent(deps, sagaId, {
      type: "HOTEL_BOOK_OK",
      hotelBookingId: booked.bookingId,
      hotelBookedAt: deps.now().toISOString(),
    });
    if (r.kind !== "applied") throw fail("hotelBooked", r);
    return { ok: true, hotelBookingId: booked.bookingId };
  } catch (err) {
    // Płatność weszła, book nie — maszyna robi kompensację (refund A + e-mail).
    const reason = err instanceof Error ? err.message : String(err);
    await applySagaEvent(deps, sagaId, { type: "HOTEL_BOOK_FAILED", reason });
    return { ok: false, compensated: true };
  }
}

/** Zgłoszenie nieudanej płatności z SDK (retryable — saga zostaje w miejscu). */
export async function reportPaymentFailure(
  deps: CheckoutDeps,
  sagaId: string,
  which: "hotel" | "flight",
  reason: string,
): Promise<void> {
  await applySagaEvent(
    deps,
    sagaId,
    which === "hotel" ? { type: "HOTEL_PAYMENT_FAILED", reason } : { type: "FLIGHT_PAYMENT_FAILED", reason },
  );
}

/**
 * Checkout 2 domknięty: płatność B' potwierdzona → book lotu (idempotentny po
 * prebookId). Permanent fail = pełna kompensacja + NEEDS_MANUAL_ACTION (alert);
 * klient widzi „Finalizujemy rezerwację…", nie błąd.
 */
export async function confirmFlightPaidAndBook(
  deps: CheckoutDeps,
  sagaId: string,
): Promise<{ ok: true; flightBookingId: string } | { ok: false; manual: true }> {
  const paid = await applySagaEvent(deps, sagaId, { type: "FLIGHT_PAYMENT_OK" });
  if (paid.kind !== "applied" && paid.kind !== "ignored") throw fail("flightPaid", paid);

  const rec = await deps.store.load(sagaId);
  if (!rec?.flightPrebookId || !rec.txnFlight) throw new Error(`saga ${sagaId}: brak prebooka/txn lotu`);

  try {
    const booked = await deps.bookFlight({ prebookId: rec.flightPrebookId, transactionId: rec.txnFlight });
    const r = await applySagaEvent(deps, sagaId, { type: "FLIGHT_BOOK_OK", flightBookingId: booked.bookingId });
    if (r.kind !== "applied") throw fail("flightBooked", r);
    return { ok: true, flightBookingId: booked.bookingId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await applySagaEvent(deps, sagaId, { type: "FLIGHT_BOOK_FAILED_PERMANENT", reason });
    return { ok: false, manual: true };
  }
}
