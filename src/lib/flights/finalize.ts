// Finalizacja rezerwacji lotu PO płatności — WSPÓLNA logika dla
// POST /api/flights/book ORAZ strony powrotu /loty/platnosc/return.
//
// DLACZEGO TU, A NIE TYLKO W ROUTE (bug 2026-06-14):
// Strona powrotu robiła HTTP self-fetch `${getSiteUrl()}/api/flights/book`.
// `getSiteUrl()` zwraca KANONICZNĄ domenę (NEXT_PUBLIC_SITE_URL = helptravel.pl)
// na KAŻDYM środowisku — więc na PREVIEW fetch trafiał na PRODUKCJĘ, która nie
// ma jeszcze tras lotów → 404 → book NIGDY się nie wykonał mimo pobranej
// płatności. Rozwiązanie: strona powrotu woła tę funkcję BEZPOŚREDNIO
// (in-process, ta sama deployment) — zero self-fetchu.
//
// ── ZMIANA 2026-08-29: WEJŚCIE NA STRONĘ POWROTU TO NIE DOWÓD PŁATNOŚCI ──────
//
// Poprzednia wersja zaczynała od `saveFlightSession({paymentStatus:"paid"})` na
// podstawie samego wywołania. Adres powrotu zna każdy, kto rozpoczął checkout.
// Teraz:
//   1. `evidence` z adresu powrotu może finalizację ZABLOKOWAĆ (patrz
//      `payment-evidence.ts`) — nie może jej natomiast samodzielnie autoryzować.
//   2. Przed bookiem zapisujemy `paymentStatus:"processing"`, nie `"paid"`.
//      Ślad „byliśmy tu i szliśmy bookować" zostaje (RULE 6), ale nie twierdzimy
//      niczego o pieniądzach.
//   3. `"paid"` zapisujemy DOPIERO, gdy LiteAPI przyjmie booking na tę
//      transakcję — to jedyny pozytywny dowód, jaki jako niebędący merchant of
//      record możemy dostać.
//   4. Porażka booka jest KLASYFIKOWANA: odmowa walidacyjna dostawcy bez
//      dowodu zapłaty → uczciwe „płatność nie doszła do skutku". Wszystko
//      pozostałe (5xx, sieć, timeout) → nierozstrzygnięte → człowiek.

import { notifyCritical } from "@/lib/alerting/notify";
import {
  flightConfirmationInputFromSession,
  sendFlightConfirmation,
  sendFlightManualReviewAlert,
} from "@/lib/email/send-flight-alerts";
import { bookFlight, extractBookingId, toFlightApiError } from "@/lib/flights/client";
import { readFlightBookingFacts } from "@/lib/flights/booking-facts";
import {
  evaluatePaymentEvidence,
  isPaymentDisprovedByBookingFailure,
  type PaymentEvidence,
} from "@/lib/flights/payment-evidence";
import { extractProviderItinerary } from "@/lib/flights/provider-itinerary";
import {
  getFlightSession,
  linkBookingToSession,
  saveFlightCompleted,
  saveFlightFailed,
  saveFlightSession,
  type FlightBookingRecord,
  type FlightBookingStatus,
  type FlightTicketingStatus,
} from "@/lib/flights/session";
import { checkFlightTransition } from "@/lib/flights/state";

export interface FinalizeResult {
  status: number;
  body: Record<string, unknown>;
}

/** Sygnały ze Stripe'owego adresu powrotu (`?payment_intent=…&redirect_status=…`). */
export interface FinalizeReturnParams {
  paymentIntentId?: string;
  redirectStatus?: string;
}

/**
 * Fakty o rezerwacji — jeden wspólny czytnik (`booking-facts.ts`).
 *
 * Poprzednia wersja czytała `status`/`pnr`/`eTicketNumbers` wprost z `data[0]`.
 * Zmierzony payload produkcyjny trzyma je poziom głębiej, w `data[0].booking`,
 * więc `status` wychodził `undefined` i `mapBookingStatus` domyślnie zwracało
 * „confirmed" — także dla rezerwacji, której dostawca nie potwierdził.
 */
function readBookingFacts(data: unknown): {
  bookingId?: string;
  status?: string;
  pnr?: string;
  eTicketNumbers?: string[];
  ticketingStatus: FlightTicketingStatus;
} {
  const facts = readFlightBookingFacts(data);
  return { ...facts, bookingId: facts.bookingId ?? extractBookingId(data) };
}

function mapBookingStatus(raw?: string): FlightBookingStatus {
  const s = (raw || "").toLowerCase();
  if (/confirm/.test(s)) return "confirmed";
  if (/pending/.test(s)) return "pending_confirmation";
  if (/cancel/.test(s)) return "cancelled";
  if (/fail|error/.test(s)) return "failed";
  return "confirmed"; // book 2xx bez statusu → traktujemy jak confirmed (GET zweryfikuje)
}

/**
 * Zapis z kontrolą przejścia. Nielegalne przejście LOGUJEMY i przerywamy —
 * cicha akceptacja „confirmed bez paid" byłaby dokładnie tym błędem, którego
 * ta maszyna stanów pilnuje.
 */
async function saveChecked(
  sessionId: string,
  prev: FlightBookingRecord,
  next: FlightBookingRecord,
): Promise<void> {
  const check = checkFlightTransition(prev, next);
  if (!check.ok) {
    console.error(
      `[flights][state][CRITICAL] odrzucone przejście ${check.from} → ${check.to} (${check.reason}) sid=${sessionId}`,
    );
    throw new Error(`illegal_flight_transition:${check.from}->${check.to}`);
  }
  await saveFlightSession(sessionId, next);
}

/** Maksymalna liczba prób wysyłki potwierdzenia (finalizacja + webhook + retry). */
export const MAX_CONFIRMATION_ATTEMPTS = 3;

/**
 * Wysyła potwierdzenie i zwraca, CZY REALNIE POSZŁO.
 *
 * `confirmationSent` ustawiamy z tego wyniku, a nie z zamiaru — inaczej pierwsza
 * nieudana wysyłka na zawsze zamyka drogę ponowieniu przez webhook.
 * Idempotencja: `confirmationSent===true` blokuje kolejne próby, a licznik
 * `confirmationAttempts` ogranicza pętlę retry, żeby seria webhooków nie
 * zamieniła się w serię maili do klienta.
 */
export async function sendConfirmationOnce(
  sessionId: string,
  session: FlightBookingRecord,
  extra: { bookingId: string; pnr?: string; eTicketNumbers?: string[]; ticketingPending: boolean },
): Promise<{ attempted: boolean; sent: boolean; record: FlightBookingRecord }> {
  const attempts = session.confirmationAttempts ?? 0;
  if (session.confirmationSent === true || !session.contactData?.email || attempts >= MAX_CONFIRMATION_ATTEMPTS) {
    return { attempted: false, sent: session.confirmationSent === true, record: session };
  }
  const mail = flightConfirmationInputFromSession(session, extra);
  if (!mail) return { attempted: false, sent: false, record: session };

  const result = await sendFlightConfirmation(mail);
  const record: FlightBookingRecord = {
    ...session,
    confirmationSent: result.sent,
    confirmationEmail: result.sent ? "EMAIL_SENT" : "EMAIL_FAILED",
    confirmationAttempts: attempts + 1,
    updatedAt: Date.now(),
  };
  // Zapis stanu maila NIE przechodzi przez `saveChecked`: to pole poboczne,
  // które nie rusza pary payment/booking, a jego zapis nie może wywrócić
  // potwierdzonej rezerwacji. Awarię zapisu logujemy i idziemy dalej.
  await saveFlightSession(sessionId, record).catch((err) => {
    console.error(
      `[flights][email] zapis stanu maila FAILED sid=${sessionId} sent=${result.sent} — ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  if (!result.sent) {
    console.warn(`[flights][email] potwierdzenie NIEWYSŁANE sid=${sessionId} powód=${result.reason ?? "?"}`);
  }
  return { attempted: true, sent: result.sent, record };
}

/**
 * Finalizuje rezerwację po płatności. Idempotentne: confirmed → zwraca istniejący
 * wynik; book z payment.method:"TRANSACTION_ID" referuje JUŻ pobraną transakcję
 * (bez ponownego obciążenia). Może rzucić tylko gdy store (Redis) niedostępny na
 * starcie (getFlightSession) — caller (route/return) łapie to i pokazuje uczciwy
 * komunikat.
 */
export async function finalizeFlightBooking(
  sessionId: string,
  ret: FinalizeReturnParams = {},
): Promise<FinalizeResult> {
  const session = await getFlightSession(sessionId);
  if (!session) {
    return { status: 404, body: { error: "session_not_found", message: "Sesja rezerwacji wygasła." } };
  }
  if (session.bookingStatus === "confirmed" && session.bookingId) {
    return { status: 200, body: { bookingId: session.bookingId, bookingStatus: "confirmed", alreadyBooked: true } };
  }
  if (!session.prebookId || !session.transactionId) {
    return { status: 409, body: { error: "session_incomplete", message: "Brak danych prebooka — rozpocznij rezerwację od nowa." } };
  }
  // Bramka kwoty (2026-08-29). Sesja, w której cena locka rozjechała się z ceną
  // zaakceptowaną przez klienta, NIGDY nie dostała `secretKey`, więc nie mogła
  // zostać opłacona. `undefined` przepuszczamy: to sesje sprzed wprowadzenia flagi.
  if (session.priceGatePassed === false) {
    console.warn(`[flights][finalize] odmowa: bramka kwoty nie przeszła sid=${sessionId}`);
    return {
      status: 409,
      body: {
        error: "price_not_confirmed",
        message: "Cena tej rezerwacji nie została potwierdzona. Rozpocznij rezerwację od nowa.",
      },
    };
  }

  // ── Dowód z adresu powrotu ────────────────────────────────────────────────
  const evidence: PaymentEvidence = evaluatePaymentEvidence({
    expectedPaymentIntentId: session.paymentIntentId,
    returnedPaymentIntentId: ret.paymentIntentId,
    redirectStatus: ret.redirectStatus,
  });
  const evidenceRecord = {
    verdict: evidence.verdict,
    reason: evidence.reason,
    ...(evidence.redirectStatus ? { redirectStatus: evidence.redirectStatus } : {}),
    ...(evidence.returnedPaymentIntentId ? { returnedPaymentIntentId: evidence.returnedPaymentIntentId } : {}),
    at: Date.now(),
  };

  // Sesja, która wyszła już poza `prebooked` (booking w toku, manual_review,
  // pending), NIE MOŻE zostać cofnięta przez adres powrotu. Klient ma w
  // historii przeglądarki adresy z WCZEŚNIEJSZYCH prób — wejście na stary
  // adres z `redirect_status=failed` po udanej płatności zamieniłoby
  // „sprawdzamy Twoją rezerwację" na „nie pobraliśmy środków". Dowód z adresu
  // powrotu ma prawo zablokować START, nie przepisać przeszłości.
  const przedPlatnoscia = session.bookingStatus === "prebooked" || session.bookingStatus === "intent";

  if (evidence.verdict === "rejected") {
    console.warn(
      `[flights][finalize] odmowa: dowód przeciw płatności sid=${sessionId} powód=${evidence.reason} stan=${session.bookingStatus}`,
    );
    await saveFlightSession(sessionId, {
      ...session,
      ...(przedPlatnoscia ? { paymentStatus: "failed" as const } : {}),
      paymentEvidence: evidenceRecord,
      updatedAt: Date.now(),
    }).catch(() => {});
    if (!przedPlatnoscia) {
      // Rezerwacja już gdzieś jest w toku — nie mówimy klientowi, że nic nie
      // pobraliśmy, bo tego nie wiemy.
      return {
        status: 202,
        body: {
          error: "manual_review",
          bookingStatus: session.bookingStatus,
          message:
            "Sprawdzamy status Twojej płatności i rezerwacji. Skontaktujemy się z Tobą jak najszybciej — nie ponawiaj płatności.",
        },
      };
    }
    return {
      status: 402,
      body: {
        error: "payment_not_completed",
        paymentStatus: "failed",
        reason: evidence.reason,
        message:
          evidence.reason === "payment_intent_mismatch"
            ? "Ta płatność nie pasuje do rezerwacji. Rozpocznij rezerwację od nowa."
            : "Płatność nie została zakończona. Nie pobraliśmy żadnych środków — możesz spróbować ponownie.",
      },
    };
  }

  if (evidence.verdict === "processing") {
    console.log(`[flights][finalize] wstrzymane: płatność w toku sid=${sessionId} status=${evidence.redirectStatus}`);
    // `processing` na rekordzie ma skutek uboczny, o który nam chodzi:
    // `GET /api/flights/session/[id]` przestaje raportować `payable`, więc
    // klient nie zamontuje widgetu drugi raz w trakcie trwającego 3DS i nie
    // zapłaci dwa razy za ten sam lot.
    await saveFlightSession(sessionId, {
      ...session,
      ...(przedPlatnoscia ? { paymentStatus: "processing" as const } : {}),
      paymentEvidence: evidenceRecord,
      updatedAt: Date.now(),
    }).catch(() => {});
    return {
      status: 202,
      body: {
        error: "payment_processing",
        paymentStatus: "processing",
        message:
          "Twoja płatność jest jeszcze przetwarzana przez bank. Nie zamykaj tej strony — potwierdzenie wyślemy mailem, gdy tylko dostaniemy odpowiedź.",
      },
    };
  }

  // Dowód niepodważający: `consistent` (Stripe potwierdził) albo `unverified`
  // (brak parametrów). W obu wypadkach rozstrzyga LiteAPI — przyjmie booking
  // wyłącznie dla realnie opłaconej transakcji.
  const processing: FlightBookingRecord = {
    ...session,
    paymentStatus: "processing",
    bookingStatus: "booking",
    paymentEvidence: evidenceRecord,
    updatedAt: Date.now(),
  };
  await saveChecked(sessionId, session, processing);

  try {
    const res = await bookFlight({ prebookId: session.prebookId, transactionId: session.transactionId });
    const facts = readBookingFacts(res);
    const bookingStatus = mapBookingStatus(facts.status);
    const bookingId = facts.bookingId ?? session.prebookId;

    // Trasa od dostawcy — z odpowiedzi bookingu, a gdy jej tam nie ma, ta
    // zapisana przy prebooku. Migawka klienta zostaje wyłącznie jako zapas.
    const providerItinerary = extractProviderItinerary(res) ?? session.providerItinerary;

    const booked: FlightBookingRecord = {
      ...processing,
      // Dopiero TERAZ wiemy, że transakcja była opłacona: LiteAPI odmawia
      // bookingu na nieprzechwyconą transakcję.
      paymentStatus: "paid",
      bookingStatus,
      bookingId,
      pnr: facts.pnr,
      eTicketNumbers: facts.eTicketNumbers,
      ticketingStatus: facts.ticketingStatus,
      providerItinerary: providerItinerary ?? processing.providerItinerary,
      confirmationEmail: session.confirmationSent ? session.confirmationEmail : "EMAIL_PENDING",
      updatedAt: Date.now(),
    };
    await saveChecked(sessionId, processing, booked);
    await linkBookingToSession(bookingId, sessionId);

    if (bookingStatus === "confirmed" || bookingStatus === "pending_confirmation") {
      await saveFlightCompleted({
        bookingId,
        sessionId,
        status: facts.status ?? bookingStatus,
        pnr: facts.pnr,
        eTicketNumbers: facts.eTicketNumbers,
        ticketingStatus: facts.ticketingStatus,
        price: session.price,
        currency: session.currency,
        createdAt: Date.now(),
      });
    }

    // Mail AWAITED — w środowisku bezserwerowym „fire and forget" po zwróceniu
    // odpowiedzi bywa zamrożone razem z funkcją, a wtedy `confirmationSent`
    // opisywałby wysyłkę, która nigdy się nie wydarzyła. Wysyłka ma własny
    // timeout 5 s i nigdy nie rzuca, więc nie może zablokować finalizacji.
    let emailSent = false;
    if (bookingStatus === "confirmed") {
      const mailRes = await sendConfirmationOnce(sessionId, booked, {
        bookingId,
        pnr: facts.pnr,
        eTicketNumbers: facts.eTicketNumbers,
        ticketingPending: facts.ticketingStatus !== "ticketed",
      });
      emailSent = mailRes.sent;
    }

    return {
      status: 200,
      body: {
        bookingId,
        bookingStatus,
        paymentStatus: "paid",
        ticketingStatus: facts.ticketingStatus,
        pnr: facts.pnr,
        emailSent,
      },
    };
  } catch (err) {
    const e = toFlightApiError(err, "book");
    const paymentDisproved = isPaymentDisprovedByBookingFailure({
      evidence: evidence.verdict,
      errorCode: e.code,
      liteApiStatus: e.liteApiStatus,
    });
    const reason = `book failed: ${e.code} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode} evidence=${evidence.verdict}/${evidence.reason}`;

    // ── Wariant 1: dostawca odrzucił transakcję, a Stripe niczego nie potwierdził.
    // Pieniędzy najprawdopodobniej nie ma. Fałszywe „płatność odnotowana" i
    // fałszywy alert paid-but-unbooked są tu SZKODLIWE: obiecują klientowi
    // zwrot nieistniejącego obciążenia i zużywają czyjąś uwagę.
    if (paymentDisproved) {
      console.warn(`[flights][book] odrzucone przez dostawcę, brak dowodu płatności sid=${sessionId} — ${reason}`);
      await saveFlightSession(sessionId, {
        ...processing,
        paymentStatus: "failed",
        bookingStatus: "failed",
        manualReviewReason: reason,
        updatedAt: Date.now(),
      }).catch(() => {});
      return {
        status: 402,
        body: {
          error: "payment_not_completed",
          bookingStatus: "failed",
          paymentStatus: "failed",
          message:
            "Nie udało się dokończyć rezerwacji, a płatność nie została potwierdzona. Jeśli bank pokazuje obciążenie, napisz do nas — sprawdzimy to od ręki.",
        },
      };
    }

    // ── Wariant 2: NIEROZSTRZYGNIĘTE (5xx, timeout, sieć — albo Stripe
    // potwierdził sukces). Obciążenie mogło przejść, a odpowiedź zginąć.
    // Zawsze do człowieka. (1.4.5)
    console.error(`[flights][book][CRITICAL] sid=${sessionId} prebookId=${session.prebookId} — ${reason}`);
    try {
      await saveFlightSession(sessionId, {
        ...processing,
        // `paid` TYLKO gdy Stripe potwierdził sukces; inaczej zostaje
        // `processing` — nierozstrzygnięte, i tak wymaga człowieka.
        paymentStatus: evidence.verdict === "consistent" ? "paid" : "processing",
        bookingStatus: "manual_review",
        manualReviewReason: reason,
        updatedAt: Date.now(),
      });
      await saveFlightFailed({
        sessionId,
        prebookId: session.prebookId,
        transactionId: session.transactionId,
        errorCode: e.code,
        message: e.message,
        manualReviewReason: reason,
        createdAt: Date.now(),
      });
    } catch (persistErr) {
      console.error(
        `[flights][book][CRITICAL] manual_review persist FAILED sid=${sessionId} — ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`,
      );
    }

    notifyCritical({
      source: "flights-book",
      title:
        evidence.verdict === "consistent"
          ? "Flight payment CONFIRMED but booking FAILED — manual review"
          : "Flight booking FAILED, payment status UNRESOLVED — manual review",
      body:
        evidence.verdict === "consistent"
          ? "Stripe potwierdził płatność, ale /flights/bookings nie powiodło się po retry. Zwrot albo ręczna rezerwacja."
          : "Booking nie powiódł się, a statusu płatności nie dało się rozstrzygnąć. Sprawdź transakcję w panelu LiteAPI PRZED kontaktem z klientem.",
      fields: { sessionId, prebookId: session.prebookId, contactEmail: session.contactData?.email, evidence: `${evidence.verdict}/${evidence.reason}`, reason },
    }).catch(() => {});
    sendFlightManualReviewAlert({
      sessionId,
      prebookId: session.prebookId,
      reason,
      contact: session.contactData,
      paymentEvidence: `${evidence.verdict}/${evidence.reason}`,
    }).catch(() => {});

    return {
      status: 202,
      body: {
        error: "manual_review",
        bookingStatus: "manual_review",
        paymentStatus: evidence.verdict === "consistent" ? "paid" : "processing",
        message:
          evidence.verdict === "consistent"
            ? "Płatność została potwierdzona, ale rezerwacja wymaga ręcznej weryfikacji. Skontaktujemy się z Tobą jak najszybciej."
            : "Nie udało się dokończyć rezerwacji i sprawdzamy status Twojej płatności. Skontaktujemy się z Tobą jak najszybciej — nie ponawiaj płatności.",
      },
    };
  }
}
