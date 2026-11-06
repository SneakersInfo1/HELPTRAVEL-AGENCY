// Klient LiteAPI Flights (Faza 1.2). Wszystkie wywołania idą przez wspólny
// liteApiRequest (retry/backoff, timeout, redakcja PII, mapowanie błędów).
//
// WSZYSTKIE endpointy flights są na api.liteapi.travel (zweryfikowane 2026-06-13),
// więc keyMode:"public" (→ apiBase + standardowy klucz prod). To NIE jest
// book.liteapi.travel — w przeciwieństwie do hoteli, gdzie prebook/book idą na
// host book.*. Klucz API żyje wyłącznie po stronie serwera (X-API-Key w
// liteApiRequest), nigdy we froncie.

import { liteApiRequest } from "@/lib/liteapi/client";
import { LiteApiError, LiteApiNetworkError, LiteApiTimeoutError, liteApiErrorFromResponse } from "@/lib/liteapi/errors";

import {
  NAME_TOO_SHORT_GENERIC,
  isDeterministicProviderValidation,
  isProviderNameTooShort,
} from "./name-policy";
import {
  ProviderSlotTimeoutError,
  acquireProviderSlot,
  providerSlotConfig,
  releaseProviderSlot,
  type ProviderSlot,
} from "./provider-slot";
import { activePause, pauseProvider, recordOutcome, reserveSearch } from "./search-governor";
import { isBackgroundFlightSearchEnabled, type FlightSearchSource } from "./search-policy";

import {
  FlightBookResponseSchema,
  FlightGetBookingResponseSchema,
  FlightPrebookResponseSchema,
  FlightRatesResponseSchema,
  FlightVerifyResponseSchema,
  type FlightContact,
  type FlightPassenger,
  type FlightSearchInput,
} from "./types";

// ── Błędy domenowe lotów ─────────────────────────────────────────────────────

export type FlightErrorCode =
  | "OFFER_UNAVAILABLE" // oferta wygasła / sold out — front wraca do wyników
  | "PRICE_CHANGED" // cena się zmieniła (obsługa w verify route)
  | "PROVIDER_ERROR" // błąd dostawcy/GDS
  | "VALIDATION" // walidacja danych wejściowych po stronie LiteAPI
  | "UNKNOWN";

/**
 * Dopowiedzenie do `code` — mówi, DLACZEGO dane odrzucono, gdy da się to
 * ustalić. `NAME_TOO_SHORT` uruchamia w route’cie wskazanie konkretnych pól
 * formularza; `PROVIDER_REJECTED_INPUT` to reszta deterministycznych odmów.
 */
export type FlightErrorReason =
  | "NAME_TOO_SHORT"
  | "PROVIDER_REJECTED_INPUT"
  | "PROVIDER_ACCESS_DENIED"
  | "BACKGROUND_DISABLED"
  /** Dostawca odpowiedział 429 (albo trwa pauza po nim) — bez zapytania, spróbuj później. */
  | "PROVIDER_THROTTLED"
  /** Dzienny budżet wyszukiwań wyczerpany (search-governor.ts). */
  | "SEARCH_BUDGET_EXHAUSTED"
  /** Slot bramki (provider-slot.ts) zajęty dłużej, niż wolno czekać — bez zapytania, spróbuj za chwilę. */
  | "PROVIDER_BUSY";

export class FlightApiError extends Error {
  readonly code: FlightErrorCode;
  readonly httpStatus: number;
  readonly liteApiStatus?: number;
  readonly liteApiCode?: string | number;
  readonly reason?: FlightErrorReason;
  /**
   * Surowy opis od dostawcy — WYŁĄCZNIE do dalszej obróbki po stronie serwera
   * (wskazanie pola, wpis do dziennika po sanityzacji). NIGDY nie wolno go
   * oddać klientowi: bywa po angielsku, niesie kod dostawcy i może echować to,
   * co wysłaliśmy.
   */
  readonly providerDescription?: string;
  /** Czy powtórzenie TEGO SAMEGO żądania ma jakiekolwiek szanse powodzenia. */
  readonly retryable: boolean;
  /** Ile czekać przed kolejną próbą (pauza po 429) — trasa oddaje to jako `Retry-After`. */
  readonly retryAfterMs?: number;
  constructor(
    code: FlightErrorCode,
    message: string,
    opts: {
      httpStatus?: number;
      liteApiStatus?: number;
      liteApiCode?: string | number;
      reason?: FlightErrorReason;
      providerDescription?: string;
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "FlightApiError";
    this.code = code;
    this.httpStatus = opts.httpStatus ?? 502;
    this.liteApiStatus = opts.liteApiStatus;
    this.liteApiCode = opts.liteApiCode;
    this.reason = opts.reason;
    this.providerDescription = opts.providerDescription;
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** Wyciąga numeryczny kod + opis dostawcy z body LiteAPI ({error:{code,description,message}}). */
function providerError(body: unknown): { code?: number; text: string; raw: string } {
  if (body && typeof body === "object") {
    const e = (body as { error?: { code?: unknown; description?: unknown; message?: unknown } }).error;
    if (e && typeof e === "object") {
      const code = typeof e.code === "number" ? e.code : Number(e.code);
      const raw = `${e.description ?? ""} ${e.message ?? ""}`.trim();
      return { code: Number.isFinite(code) ? code : undefined, text: raw.toLowerCase(), raw };
    }
  }
  return { text: "", raw: "" };
}

/** Mapuje surowy LiteApiError z klienta na taksonomię domenową lotów. */
export function toFlightApiError(err: unknown, stage: string): FlightApiError {
  if (err instanceof FlightApiError) return err;
  if (err instanceof LiteApiError) {
    const status = err.status ?? 0;
    const { code: provCode, text, raw } = providerError(err.body);
    const label = err.internalCode;

    // ODMOWA DOSTĘPU DO PRODUKTU, nie złe dane (incydent 2026-10-25: każde
    // wyszukiwanie → 403 `{code:40301, "Flights API for this account is
    // limited to sandbox API keys only"}`, ten sam klucz działa dla hoteli).
    // Dotąd wpadało w gałąź 4xx = VALIDATION:
    //   • przy wyszukiwaniu gość widział „Dane oferty lub pasażera zostały
    //     odrzucone" i radę zmiany dat, która nie mogła pomóc;
    //   • przy BOOKU (po płatności) VALIDATION + 4xx to dla
    //     `isPaymentDisprovedByBookingFailure` „płatności nie było" — a odmowa
    //     dostępu konta nie mówi NIC o tym, czy klient zapłacił. Jako
    //     PROVIDER_ERROR trafia do ścieżki nierozstrzygniętej: ręczna
    //     weryfikacja i alert, nigdy komunikat „płatność nie przeszła".
    if (status === 401 || status === 403 || provCode === 40301) {
      const beforeMoney = stage !== "book";
      return new FlightApiError(
        "PROVIDER_ERROR",
        stage === "search" || stage === "verify"
          ? "Wyszukiwarka lotów jest chwilowo niedostępna po stronie dostawcy. Pracujemy nad jej przywróceniem — spróbuj ponownie później."
          : stage === "prebook"
            ? "Rezerwacja lotów jest chwilowo niedostępna po stronie dostawcy. Nic nie zostało pobrane — spróbuj ponownie później."
            : "Dostawca lotów odmówił dostępu przy rezerwacji — wymaga ręcznej weryfikacji.",
        {
          httpStatus: beforeMoney ? 503 : 502,
          liteApiStatus: status,
          liteApiCode: provCode ?? label,
          reason: "PROVIDER_ACCESS_DENIED",
          providerDescription: raw,
          retryable: false,
          cause: err,
        },
      );
    }

    // WALIDACJA PRZEBRANA ZA AWARIĘ. Dostawca odrzuca za krótkie imię/nazwisko
    // przez HTTP 500 + `{error:{code:53099}}` — status sugeruje awarię serwera,
    // a to jest odmowa danych wejściowych, która przy tym samym payloadzie
    // powtórzy się zawsze. Wcześniej kończyło się to jako PROVIDER_ERROR/502 i
    // komunikatem „Spróbuj ponownie za chwilę” — radą, która nie mogła
    // zadziałać. Bramka stoi PRZED wszystkimi innymi, bo jest najbardziej
    // szczegółowa (i jako jedyna zmierzona na żywym kluczu).
    if (isDeterministicProviderValidation(err.body)) {
      const tooShort = isProviderNameTooShort(err.body);
      return new FlightApiError(
        "VALIDATION",
        tooShort
          ? NAME_TOO_SHORT_GENERIC
          : "Dane pasażera zostały odrzucone. Sprawdź imiona, nazwiska i dane dokumentu.",
        {
          httpStatus: 422,
          liteApiStatus: status,
          liteApiCode: provCode ?? label,
          reason: tooShort ? "NAME_TOO_SHORT" : "PROVIDER_REJECTED_INPUT",
          providerDescription: raw,
          retryable: false,
          cause: err,
        },
      );
    }
    // Sold out / wygasła oferta: kod 53010, etykieta SOLD_OUT/RATE_EXPIRED, albo tekst.
    // 52099 ("failed to verify flight offer" / "unable to process verify request"):
    // verify NIE potrafi potwierdzić TEJ oferty (wygasła albo GDS jej nie przeliczy).
    // To NIE jest błąd przejściowy — ten sam offerId zawsze da 500, więc traktujemy
    // jak niedostępną ofertę (UI: „wróć po świeże wyniki", ?fresh=1), a NIE jako
    // PROVIDER_ERROR z mylącym „spróbuj ponownie". Dopasowanie też po tekście,
    // gdyby kod numeryczny się zmienił. (Prod 2026-06-30.)
    if (
      provCode === 53010 ||
      provCode === 52099 ||
      label === "LITEAPI_SOLD_OUT" ||
      label === "LITEAPI_RATE_EXPIRED" ||
      /sold\s*out|unavailable|no longer available|failed to verify|unable to process verify/.test(text)
    ) {
      return new FlightApiError("OFFER_UNAVAILABLE", "Ta oferta lotu jest już niedostępna.", {
        httpStatus: 409,
        liteApiStatus: status,
        liteApiCode: provCode ?? label,
        providerDescription: raw,
        retryable: false,
        cause: err,
      });
    }
    // LIMIT KONTA (429) — nie walidacja. Dotąd wpadał w gałąź „4xx = złe dane”:
    // przy wyszukiwaniu gość widział „Dane oferty lub pasażera zostały odrzucone”,
    // a przy BOOKU (po płatności) VALIDATION + 4xx czytało się jako „płatności
    // nie było”. Pauzę wyszukiwań ustawia gubernator (search-governor.ts).
    if (status === 429) {
      const beforeMoney = stage !== "book";
      return new FlightApiError(
        "PROVIDER_ERROR",
        stage === "search" || stage === "verify"
          ? THROTTLED_MESSAGE_PL
          : stage === "prebook"
            ? "Rezerwacja lotów jest chwilowo niedostępna po stronie dostawcy. Nic nie zostało pobrane — spróbuj ponownie za chwilę."
            : "Dostawca lotów ograniczył zapytania przy rezerwacji — wymaga ręcznej weryfikacji.",
        {
          httpStatus: beforeMoney ? 503 : 502,
          liteApiStatus: status,
          liteApiCode: provCode ?? label,
          reason: "PROVIDER_THROTTLED",
          providerDescription: raw,
          retryAfterMs: err.retryAfterMs,
          retryable: false,
          cause: err,
        },
      );
    }
    // Walidacja danych: kod 43001, etykieta VALIDATION, albo 4xx (poza powyższym).
    if (provCode === 43001 || label === "LITEAPI_VALIDATION" || (status >= 400 && status < 500)) {
      return new FlightApiError("VALIDATION", "Dane oferty lub pasażera zostały odrzucone przez dostawcę.", {
        httpStatus: 422,
        liteApiStatus: status,
        liteApiCode: provCode ?? label,
        reason: "PROVIDER_REJECTED_INPUT",
        providerDescription: raw,
        retryable: false,
        cause: err,
      });
    }
    return new FlightApiError("PROVIDER_ERROR", "Dostawca lotów zwrócił błąd. Spróbuj ponownie za chwilę.", {
      httpStatus: 502,
      liteApiStatus: status,
      liteApiCode: provCode ?? label,
      providerDescription: raw,
      retryAfterMs: err.retryAfterMs,
      retryable: true,
      cause: err,
    });
  }
  return new FlightApiError("UNKNOWN", `Błąd na etapie ${stage}.`, { httpStatus: 500, retryable: true, cause: err });
}

// ── Wywołania ────────────────────────────────────────────────────────────────

/**
 * Opcje WYSZUKIWANIA lotów. Domyślne wartości są dobrane do lejka lotów
 * (użytkownik czeka na jedynej treści strony); czat ma twardy budżet tury
 * i podaje własny `timeoutMs` — jego czekanie na slot bramki jest z tego
 * budżetu ODLICZANE, żeby suma nigdy go nie przekroczyła.
 */
export interface FlightSearchOptions {
  /** Kto zleca wyszukiwanie (`search-policy.ts`) — obowiązkowe, żeby żaden wołający nie ominął polityki. */
  source: FlightSearchSource;
  /** Limit czasu zapytania u dostawcy (czat: także czekania na slot). */
  timeoutMs?: number;
  /** Ile najwyżej czekać na wolny slot bramki (`provider-slot.ts`). */
  maxWaitMs?: number;
  /** Slot bramki trzymany już przez wołającego (`search-offers.ts`) — nie bierzemy drugiego. */
  slot?: ProviderSlot;
}

const THROTTLED_MESSAGE_PL = "Wyszukiwarka lotów jest chwilowo przeciążona. Spróbuj ponownie za chwilę.";
const ACCESS_DENIED_MESSAGE_PL =
  "Wyszukiwarka lotów jest chwilowo niedostępna po stronie dostawcy. Pracujemy nad jej przywróceniem — spróbuj ponownie później.";
const BUSY_MESSAGE_PL = "Dostawca lotów ogranicza liczbę wyszukiwań. Spróbuj ponownie za chwilę.";

const DEFAULT_SEARCH_TIMEOUT_MS = 30_000;
const BUSY_RETRY_DEFAULT_MS = 5_000;
/**
 * Użytkownik: krótko, bo funkcja na nic nie czeka dłużej. Dłuższy odstęp odsiaduje
 * przeglądarka (`runOriginFanout`), która dostaje dokładny termin w `Retry-After`.
 */
const USER_MAX_WAIT_MS = 3_000;
/** Czat: najwyżej tyle czekania na slot, i nigdy tyle, żeby na samo zapytanie zostało mniej niż `CHAT_MIN_PROVIDER_MS`. */
const CHAT_MAX_WAIT_MS = 5_000;
const CHAT_MIN_PROVIDER_MS = 4_000;
/** Tło (gdy w ogóle włączone) nie zajmuje kolejki ludziom — krótko czeka i odpuszcza. */
const BACKGROUND_MAX_WAIT_MS = 2_000;
const MIN_PROVIDER_TIMEOUT_MS = 2_500;
/**
 * Timeout albo zerwane połączenie nie znaczą, że dostawca skończył: porzucone
 * zapytanie może jeszcze u niego pracować, a następne byłoby wtedy równoczesne.
 * Tyle najmniej trzymamy wtedy slot. Wartość robocza, nie pomiar; liczy się dopiero
 * przy odstępie krótszym niż domyślny.
 */
const UNCERTAIN_OUTCOME_HOLD_MS = 3_000;

function defaultMaxWaitMs(opts: FlightSearchOptions): number {
  if (opts.maxWaitMs !== undefined) return Math.max(0, opts.maxWaitMs);
  if (opts.source === "chat") {
    const budget = opts.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;
    return Math.max(0, Math.min(CHAT_MAX_WAIT_MS, budget - CHAT_MIN_PROVIDER_MS));
  }
  return opts.source === "background" ? BACKGROUND_MAX_WAIT_MS : USER_MAX_WAIT_MS;
}

/** Limit czasu zapytania: czat odlicza czekanie na slot ze swojego budżetu. */
export function attemptTimeoutMs(opts: FlightSearchOptions, waitedMs: number): number {
  const base = opts.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;
  return Math.max(MIN_PROVIDER_TIMEOUT_MS, opts.source === "chat" ? base - waitedMs : base);
}

/**
 * Polityka i pauza — PRZED czekaniem na slot i przed zapytaniem. Tło przy
 * wyłączonym przełączniku i każda pauza po odmowie dostawcy kończą się bez
 * kontaktu z dostawcą (i bez zajmowania kolejki).
 */
export async function assertFlightSearchAllowed(source: FlightSearchSource): Promise<void> {
  if (source === "background" && !isBackgroundFlightSearchEnabled()) {
    // Automatyczne wyszukiwania lotów są wyłączone (incydent 40301) — bez zapytania do dostawcy.
    throw new FlightApiError("PROVIDER_ERROR", "Automatyczne wyszukiwania lotów są wyłączone.", {
      httpStatus: 503,
      reason: "BACKGROUND_DISABLED",
      retryable: false,
    });
  }
  const pause = await activePause();
  if (pause) {
    const denied = pause.reason === "access_denied";
    throw new FlightApiError("PROVIDER_ERROR", denied ? ACCESS_DENIED_MESSAGE_PL : THROTTLED_MESSAGE_PL, {
      httpStatus: 503,
      reason: denied ? "PROVIDER_ACCESS_DENIED" : "PROVIDER_THROTTLED",
      retryAfterMs: Math.max(1_000, pause.untilMs - Date.now()),
      retryable: false,
    });
  }
}

/**
 * Zajmuje slot bramki na czas `fn`. Zajęty dłużej niż wolno czekać →
 * `PROVIDER_BUSY` (503 + Retry-After) BEZ zapytania do dostawcy.
 */
export async function withFlightProviderSlot<T>(
  opts: FlightSearchOptions,
  fn: (slot: ProviderSlot) => Promise<T>,
): Promise<T> {
  // Dzierżawa pokrywa zapytanie, zapis cache i odstęp: po awarii funkcji zwalnia
  // się sama, ale nie wcześniej, bo padła funkcja też wysłała zapytanie, które
  // dostawca policzy. Przy zwolnieniu skraca się do końca odstępu.
  const leaseMs = (opts.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS) + 10_000 + providerSlotConfig().minIntervalMs;
  let slot: ProviderSlot;
  try {
    slot = await acquireProviderSlot({ maxWaitMs: defaultMaxWaitMs(opts), leaseMs });
  } catch (err) {
    if (err instanceof ProviderSlotTimeoutError) {
      throw new FlightApiError("PROVIDER_ERROR", BUSY_MESSAGE_PL, {
        httpStatus: 503,
        reason: "PROVIDER_BUSY",
        retryAfterMs: Math.max(1_000, err.retryAfterMs ?? BUSY_RETRY_DEFAULT_MS),
        retryable: false,
      });
    }
    throw err;
  }
  // Ślad w logach: bez niego po wdrożeniu nie da się odróżnić kolejki od wolnego dostawcy.
  if (slot.contended) console.info(`[flights][slot] czekano ${slot.waitedMs} ms, zrodlo=${opts.source}`);
  try {
    return await fn(slot);
  } finally {
    await releaseProviderSlot(slot);
  }
}

/** POST /flights/rates — wyszukiwanie ofert (przez gubernator i bramkę slotów). */
export async function searchFlightRates(input: FlightSearchInput, opts: FlightSearchOptions) {
  const body = {
    legs: input.legs.map((l) => ({ origin: l.origin, destination: l.destination, date: l.date, direction: l.direction })),
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    cabinClass: input.cabinClass,
    currency: input.currency,
    country: input.country,
  };
  // Wołający ze slotem (`search-offers.ts`) sprawdził politykę przed kolejką.
  if (opts.slot) return requestUnderSlot(body, opts, opts.slot);
  await assertFlightSearchAllowed(opts.source);
  return withFlightProviderSlot(opts, (slot) => requestUnderSlot(body, opts, slot));
}

/** Odpowiedzi nie ma, więc nie wiadomo, czy dostawca nadal pracuje nad zapytaniem. */
function isUncertainOutcome(err: unknown): boolean {
  return err instanceof LiteApiTimeoutError || (err instanceof LiteApiNetworkError && err.status === undefined);
}

/**
 * Jedno zapytanie do dostawcy, bez ponawiania: drugie w tym samym oknie to przepis
 * na 429 i pauzę dla wszystkich (produkcja 2026-11-06). Ponawia człowiek przyciskiem
 * albo czat w budżecie tury, i jedno, i drugie przez bramkę z tym samym odstępem.
 */
async function requestUnderSlot(body: Record<string, unknown>, opts: FlightSearchOptions, slot: ProviderSlot) {
  // Zawsze, także bez czekania: pauza mogła zacząć się po pierwszym sprawdzeniu,
  // a opóźniony SET wygląda jak slot zajęty od ręki.
  await assertFlightSearchAllowed(opts.source);
  // Gubernator (search-governor.ts): dzienny budżet.
  const budget = await reserveSearch(opts.source);
  if (!budget.ok) {
    throw new FlightApiError("PROVIDER_ERROR", THROTTLED_MESSAGE_PL, {
      httpStatus: 503,
      reason: "SEARCH_BUDGET_EXHAUSTED",
      retryable: false,
    });
  }
  slot.lastProviderCallAt = Date.now();
  try {
    const res = await requestFlightRates(body, attemptTimeoutMs(opts, slot.waitedMs));
    void recordOutcome("ok");
    return res;
  } catch (err) {
    const status = err instanceof LiteApiError ? (err.status ?? 0) : 0;
    const providerWait = err instanceof LiteApiError ? err.retryAfterMs : undefined;
    if (isUncertainOutcome(err)) slot.holdAfterMs = UNCERTAIN_OUTCOME_HOLD_MS;
    // 429 albo 5xx z Retry-After: dostawca każe czekać, więc czekają wszyscy.
    if (status === 429 || (status >= 500 && providerWait !== undefined)) {
      const pause = await pauseProvider("throttled", providerWait);
      void recordOutcome("throttled");
      // W listopadowych 429 pauza była zawsze domyślna (60 s), czyli dostawca nie
      // podał Retry-After. Bez tego przeglądarka dostałaby aktywny przycisk
      // ponowienia w trakcie pauzy.
      throw liteApiErrorFromResponse(status, (err as LiteApiError).body, Math.max(1_000, pause.untilMs - Date.now()));
    }
    if (status === 401 || status === 403 || providerError((err as LiteApiError | undefined)?.body).code === 40301) {
      await pauseProvider("access_denied");
      void recordOutcome("denied");
    } else {
      void recordOutcome("error");
    }
    throw err;
  }
}

function requestFlightRates(body: Record<string, unknown>, timeoutMs: number) {
  return liteApiRequest({
    path: "/flights/rates",
    method: "POST",
    keyMode: "public",
    schema: FlightRatesResponseSchema,
    body,
    timeoutMs,
    // Bez ponowień: wewnętrzne ponowienia klienta (timeout bez przerwy, 429 po
    // 0,4 s) mnożyły ruch dokładnie wtedy, gdy dostawca już nie nadążał albo
    // ograniczał zapytania.
    retries: 1,
  });
}

/**
 * POST /flights/verify — potwierdzenie ceny/dostępności oferty.
 *
 * `retries: 1` (1 strzał, BEZ retry) — verify jest operacją NA KONKRETNEJ
 * ofercie: 5xx (np. 52099 „failed to verify") znaczy, że TA oferta nie da się
 * potwierdzić, a ponawianie tego samego offerId zawsze zwróci ten sam błąd.
 * Domyślne `retries:3` w liteApiRequest hamerowało LiteAPI 3× na każdą martwą
 * ofertę (prod 2026-06-30: burst 500) i kazało userowi czekać przez backoff
 * zanim zobaczył błąd. Recovery (świeże wyniki) i tak robi front przez ?fresh=1.
 */
export async function verifyFlightOffer(offerId: string) {
  return liteApiRequest({
    path: "/flights/verify",
    method: "POST",
    keyMode: "public",
    schema: FlightVerifyResponseSchema,
    body: { offerId },
    timeoutMs: 30_000,
    retries: 1,
  });
}

/** Buduje payload pasażera w kształcie LiteAPI (płaskie pola dokumentu). */
function toLiteApiPassenger(p: FlightPassenger) {
  return {
    title: p.title,
    firstName: p.firstName,
    lastName: p.lastName,
    birthday: p.birthday,
    gender: p.gender,
    nationality: p.nationality,
    type: p.type,
    documentType: p.documentType,
    documentNumber: p.documentNumber,
    documentExpiry: p.documentExpiry,
    documentIssueCountry: p.documentIssueCountry,
  };
}

/**
 * POST /flights/prebooks z usePaymentSdk:true. Zwraca prebookId/transactionId/
 * secretKey. Kształt body zweryfikowany empirycznie (Faza 0): contact z
 * phoneCountryCode, pasażerowie z płaskimi polami document* (małymi literami).
 */
export async function prebookFlight(args: { offerId: string; contact: FlightContact; passengers: FlightPassenger[] }) {
  const body = {
    offerId: args.offerId,
    usePaymentSdk: true,
    contact: {
      firstName: args.contact.firstName,
      lastName: args.contact.lastName,
      email: args.contact.email,
      phoneNumber: args.contact.phoneNumber,
      phoneCountryCode: args.contact.phoneCountryCode,
    },
    passengers: args.passengers.map(toLiteApiPassenger),
  };
  const res = await liteApiRequest({
    path: "/flights/prebooks",
    method: "POST",
    keyMode: "public",
    schema: FlightPrebookResponseSchema,
    body,
    timeoutMs: 60_000, // prebook bywa wolniejszy (lock taryfy u dostawcy)
    // Deterministyczna odmowa danych (53099) NIE jest ponawiana — ten sam
    // payload dostanie tę samą odpowiedź. Awarie przejściowe, timeouty i błędy
    // sieci zachowują domyślne trzy próby.
    noRetryWhen: isDeterministicProviderValidation,
  });
  const d = res.data[0];
  return {
    prebookId: d.prebookId,
    transactionId: d.transactionId,
    secretKey: d.secretKey,
    price: d.price,
    currency: d.currency,
    paymentTypes: d.paymentTypes,
    sandbox: d.sandbox,
    booking: d.booking,
  };
}

/**
 * POST /flights/bookings z payment.method:"TRANSACTION_ID". Wywoływane PO
 * udanej płatności. liteApiRequest sam retry'uje 3× na błędach sieci/5xx
 * (LiteAPI jest tu idempotentne — brief 1.2), a 4xx rzuca bez retry.
 */
export async function bookFlight(args: { prebookId: string; transactionId: string }) {
  const body = {
    prebookId: args.prebookId,
    payment: { method: "TRANSACTION_ID", transactionId: args.transactionId },
  };
  return liteApiRequest({
    path: "/flights/bookings",
    method: "POST",
    keyMode: "public",
    schema: FlightBookResponseSchema,
    body,
    timeoutMs: 60_000,
    retries: 3,
  });
}

/** GET /flights/bookings/{bookingId} — źródło prawdy o statusie (webhook = tylko trigger). */
export async function getFlightBooking(bookingId: string) {
  return liteApiRequest({
    path: `/flights/bookings/${encodeURIComponent(bookingId)}`,
    method: "GET",
    keyMode: "public",
    schema: FlightGetBookingResponseSchema,
    timeoutMs: 30_000,
  });
}

/** Wyciąga total/currency z odpowiedzi verify (do wykrycia zmiany ceny). */
export function extractVerifiedTotal(verify: Awaited<ReturnType<typeof verifyFlightOffer>>): {
  total?: number;
  currency?: string;
  baggage?: unknown;
  segments?: unknown;
} {
  const j = verify.data?.[0]?.journey;
  return {
    total: j?.pricing?.display?.total,
    currency: j?.pricing?.display?.currency,
    baggage: j?.baggage,
    segments: undefined, // verify nie zwraca segmentów; trzymamy je z rates
  };
}

/** Pierwszy bookingId z odpowiedzi book/getBooking (kształt zależny od dostawcy). */
export function extractBookingId(data: unknown): string | undefined {
  const node = Array.isArray((data as { data?: unknown })?.data)
    ? (data as { data: unknown[] }).data[0]
    : (data as { data?: unknown }).data ?? data;
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    const id = rec.bookingId ?? rec.id ?? rec.bookingID;
    if (typeof id === "string") return id;
  }
  return undefined;
}
