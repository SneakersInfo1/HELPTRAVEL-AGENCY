// Dowód płatności — co WOLNO uznać za potwierdzone obciążenie karty.
//
// ── PROBLEM ──────────────────────────────────────────────────────────────────
//
// Do 2026-08-29 samo wejście na `/loty/platnosc/return?sid=…` uruchamiało
// finalizację: `finalizeFlightBooking` ustawiało `paymentStatus:"paid"` i szło
// bookować. Adres tej strony zna każdy, kto rozpoczął checkout — jest w jego
// własnym pasku adresu. Skutki wejścia bez zapłaty:
//
//   • rekord w Redis twierdzi „paid", choć nikt nie zapłacił,
//   • klient widzi „Płatność została odnotowana" — zdanie nieprawdziwe,
//   • alert `[CRITICAL] paid-but-unbooked` budzi człowieka bez powodu,
//   • prawdziwe awarie giną w szumie fałszywych.
//
// ── CZEGO NIE DA SIĘ ZROBIĆ ──────────────────────────────────────────────────
//
// Nie jesteśmy merchant of record. PaymentIntent tworzy LiteAPI (Nuitee Travel)
// w swoim koncie Stripe; my nie mamy `STRIPE_SECRET_KEY` i nigdy nie powinniśmy
// go mieć. `GET /v1/payment_intents/:id` wymaga klucza Stripe — publishable key
// widget pobiera z `payment-wrapper.liteapi.travel/config`, endpointu
// nieudokumentowanego. Wstawienie go na ŚCIEŻKĘ KRYTYCZNĄ oznaczałoby, że
// zmiana po ich stronie blokuje finalizację ludziom, którzy JUŻ ZAPŁACILI.
// To gorsza awaria niż ta, którą łatamy. Świadomie tego nie robimy.
//
// ── CO DA SIĘ ZROBIĆ (i co robimy) ───────────────────────────────────────────
//
// 1. `secretKey` z prebooka to Stripe client secret w formacie
//    `pi_<id>_secret_<losowe>` (potwierdzone w `liteapi/widget-env.ts`).
//    Zapisujemy z niego SAMO `pi_<id>` — identyfikator, nie sekret — i mamy
//    czym porównać to, co Stripe dokleja do adresu powrotu.
// 2. Stripe dokleja `payment_intent`, `payment_intent_client_secret` oraz
//    `redirect_status` (zmierzone na produkcji przy hotelach — patrz
//    `hotele/rezerwacja/return/page.tsx`). `redirect_status` jest sygnałem
//    NEGATYWNYM o pełnej wartości: „failed" znaczy, że pieniędzy nie ma.
// 3. Ostatecznym autorytetem pozostaje LiteAPI: `POST /flights/bookings` z
//    `payment.method:"TRANSACTION_ID"` przechodzi tylko dla realnie opłaconej
//    transakcji. Dowód pozytywny przychodzi więc DOPIERO z udanego bookingu —
//    i dlatego `paymentStatus:"paid"` ustawiamy po nim, a nie przed.
//
// Kierunek fail-safe jest przemyślany: BRAK parametrów nie blokuje niczego
// (inaczej zmiana w widgecie odcięłaby płacących klientów), ale parametry
// ŚWIADCZĄCE PRZECIW płatności blokują twardo.

/** Werdykt o dowodzie z adresu powrotu. */
export type PaymentEvidenceVerdict =
  /** Stripe potwierdził sukces i identyfikator zgadza się z naszym prebookiem. */
  | "consistent"
  /** Brak parametrów Stripe'a — nie wiemy nic; autorytetem zostaje LiteAPI. */
  | "unverified"
  /** Płatność jeszcze trwa (SCA/3DS, opóźniona metoda). NIE bookujemy. */
  | "processing"
  /** Dowód PRZECIW płatności. Nigdy nie oznaczamy jako opłacone. */
  | "rejected";

export interface PaymentEvidence {
  verdict: PaymentEvidenceVerdict;
  /** Maszynowy powód — trafia do logów, rekordu sesji i alertów. */
  reason:
    | "no_params"
    | "succeeded"
    | "redirect_failed"
    | "redirect_pending"
    | "payment_intent_mismatch"
    | "unknown_status";
  /** `payment_intent` z adresu powrotu (identyfikator, nie sekret). */
  returnedPaymentIntentId?: string;
  /** Surowy `redirect_status` — do audytu, gdy Stripe doda nową wartość. */
  redirectStatus?: string;
}

/**
 * Wyciąga `pi_<id>` ze Stripe'owego client secret (`pi_<id>_secret_<...>`).
 *
 * Zwraca `undefined` dla wszystkiego, co nie pasuje — łącznie z przyszłym
 * formatem LiteAPI, gdyby przestali oddawać client secret. Brak identyfikatora
 * degraduje nas do `unverified`, nie do błędu.
 */
export function paymentIntentIdFromSecret(secretKey: string | undefined | null): string | undefined {
  if (!secretKey || typeof secretKey !== "string") return undefined;
  const at = secretKey.indexOf("_secret_");
  if (at <= 0) return undefined;
  const id = secretKey.slice(0, at);
  return /^pi_[A-Za-z0-9]+$/.test(id) ? id : undefined;
}

/**
 * Normalizuje status z adresu powrotu.
 *
 * Przyjmuje DWA słowniki, bo w zależności od metody płatności do adresu trafia
 * albo `redirect_status` Stripe'a (`succeeded`/`failed`/`pending`), albo status
 * samego PaymentIntentu (`requires_payment_method`, `requires_action`,
 * `processing`, `succeeded`, `canceled`). Traktowanie ich osobno tylko po to,
 * żeby móc powiedzieć „to inny słownik", nie zmieniłoby ani jednej decyzji.
 */
function classifyStatus(raw: string): "ok" | "pending" | "bad" | "unknown" {
  switch (raw.trim().toLowerCase()) {
    case "succeeded":
      return "ok";
    case "pending":
    case "processing":
    case "requires_action":
    case "requires_confirmation":
    case "requires_capture":
      return "pending";
    case "failed":
    case "canceled":
    case "cancelled":
    case "requires_payment_method":
      return "bad";
    default:
      return "unknown";
  }
}

/**
 * Ocenia dowód z adresu powrotu przeciw temu, co wiemy o sesji.
 *
 * @param expectedPaymentIntentId `pi_…` wyliczone z `secretKey` w prebooku.
 * @param returnedPaymentIntentId `?payment_intent=` z adresu powrotu.
 * @param redirectStatus `?redirect_status=` z adresu powrotu.
 */
export function evaluatePaymentEvidence(input: {
  expectedPaymentIntentId?: string;
  returnedPaymentIntentId?: string;
  redirectStatus?: string;
}): PaymentEvidence {
  const returned = input.returnedPaymentIntentId?.trim() || undefined;
  const status = input.redirectStatus?.trim() || undefined;

  // Niedopasowanie identyfikatora sprawdzamy PIERWSZE i tylko wtedy, gdy mamy
  // obie strony porównania. To jedyny wariant, w którym adres powrotu należy do
  // INNEJ transakcji — czyli replay albo sklejenie dwóch sesji w jednej karcie.
  if (input.expectedPaymentIntentId && returned && returned !== input.expectedPaymentIntentId) {
    return { verdict: "rejected", reason: "payment_intent_mismatch", returnedPaymentIntentId: returned, redirectStatus: status };
  }

  if (!status && !returned) {
    return { verdict: "unverified", reason: "no_params" };
  }

  switch (status ? classifyStatus(status) : "unknown") {
    case "ok":
      return { verdict: "consistent", reason: "succeeded", returnedPaymentIntentId: returned, redirectStatus: status };
    case "pending":
      return { verdict: "processing", reason: "redirect_pending", returnedPaymentIntentId: returned, redirectStatus: status };
    case "bad":
      return { verdict: "rejected", reason: "redirect_failed", returnedPaymentIntentId: returned, redirectStatus: status };
    default:
      // Jest identyfikator, nie ma czytelnego statusu (albo Stripe dodał nową
      // wartość). Identyfikator sam w sobie nie dowodzi zapłaty — zostaje
      // `unverified`, czyli decyzję oddajemy LiteAPI.
      return {
        verdict: "unverified",
        reason: status ? "unknown_status" : "no_params",
        returnedPaymentIntentId: returned,
        redirectStatus: status,
      };
  }
}

// ── Klasyfikacja porażki bookingu ────────────────────────────────────────────

/**
 * Czy odmowa dostawcy oznacza BRAK PŁATNOŚCI, czy nierozstrzygnięty stan?
 *
 * To rozróżnienie decyduje o tym, co powiemy człowiekowi. Dotąd KAŻDA porażka
 * booka dawała komunikat „Płatność została odnotowana" i alert paid-but-unbooked
 * — także wtedy, gdy LiteAPI odrzuciło nas dlatego, że transakcja nigdy nie
 * została przechwycona. Obiecywanie zwrotu pieniędzy, których nikt nie pobrał,
 * jest gorsze niż brak komunikatu.
 *
 * Reguła: do „płatności nie było" zaliczamy WYŁĄCZNIE odmowy walidacyjne
 * dostawcy (4xx) przy braku pozytywnego dowodu ze Stripe'a. Wszystko inne —
 * sieć, 5xx, timeout — jest NIEROZSTRZYGNIĘTE, bo obciążenie mogło przejść,
 * a odpowiedź zginąć. Nierozstrzygnięte zawsze idzie do człowieka.
 */
export function isPaymentDisprovedByBookingFailure(input: {
  evidence: PaymentEvidenceVerdict;
  errorCode: string;
  liteApiStatus?: number;
}): boolean {
  if (input.evidence === "consistent") return false; // Stripe mówi „succeeded" — nie podważamy
  if (input.errorCode !== "VALIDATION") return false;
  const s = input.liteApiStatus ?? 0;
  return s >= 400 && s < 500;
}
