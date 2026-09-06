// Klient LiteAPI Flights (Faza 1.2). Wszystkie wywołania idą przez wspólny
// liteApiRequest (retry/backoff, timeout, redakcja PII, mapowanie błędów).
//
// WSZYSTKIE endpointy flights są na api.liteapi.travel (zweryfikowane 2026-06-13),
// więc keyMode:"public" (→ apiBase + standardowy klucz prod). To NIE jest
// book.liteapi.travel — w przeciwieństwie do hoteli, gdzie prebook/book idą na
// host book.*. Klucz API żyje wyłącznie po stronie serwera (X-API-Key w
// liteApiRequest), nigdy we froncie.

import { liteApiRequest } from "@/lib/liteapi/client";
import { LiteApiError } from "@/lib/liteapi/errors";

import {
  NAME_TOO_SHORT_GENERIC,
  isDeterministicProviderValidation,
  isProviderNameTooShort,
} from "./name-policy";

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
export type FlightErrorReason = "NAME_TOO_SHORT" | "PROVIDER_REJECTED_INPUT";

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
      retryable: true,
      cause: err,
    });
  }
  return new FlightApiError("UNKNOWN", `Błąd na etapie ${stage}.`, { httpStatus: 500, retryable: true, cause: err });
}

// ── Wywołania ────────────────────────────────────────────────────────────────

/** POST /flights/rates — wyszukiwanie ofert. */
/**
 * Nadpisania budżetu czasu dla WYSZUKIWANIA lotów. Domyślne 30 s × 3 próby są
 * dobre dla lejka lotów (użytkownik czeka na jedynej treści strony), ale
 * zabójcze dla czatu, gdzie cała tura ma 50 s: jedno wyszukiwanie mogło samo
 * zjeść 90 s i wywalić route'a w 504. Wołający, który ma własny termin,
 * podaje go tutaj.
 */
export interface FlightSearchOptions {
  timeoutMs?: number;
  retries?: number;
}

export async function searchFlightRates(input: FlightSearchInput, opts: FlightSearchOptions = {}) {
  const body = {
    legs: input.legs.map((l) => ({ origin: l.origin, destination: l.destination, date: l.date, direction: l.direction })),
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    cabinClass: input.cabinClass,
    currency: input.currency,
    country: input.country,
  };
  return liteApiRequest({
    path: "/flights/rates",
    method: "POST",
    keyMode: "public",
    schema: FlightRatesResponseSchema,
    body,
    timeoutMs: opts.timeoutMs ?? 30_000,
    ...(opts.retries !== undefined ? { retries: opts.retries } : {}),
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
