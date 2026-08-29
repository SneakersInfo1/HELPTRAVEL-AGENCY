// Upstash-backed FLIGHT booking persistence (zadanie LiteAPI Flights, Faza 1.1).
//
// DECYZJA (Faza 0): rezerwacje lotów persystujemy w Upstash Redis — tak jak
// hotele (src/lib/booking/session.ts) — a NIE w Prisma. Prisma/Postgres w tym
// projekcie nie jest podłączona (DATABASE_URL = placeholder, in-memory
// fallback); jedyną realną, sprawdzoną w boju warstwą trwałą jest Redis.
//
// ERROR SEMANTICS (jak przy hotelach): zapisy na ŚCIEŻCE PŁATNOŚCI
// (saveFlightSession / saveFlightCompleted / saveFlightFailed) FAIL LOUD —
// NON-NEGOTIABLE RULE 6: nigdy po cichu nie gubimy sesji ani rekordu
// paid-but-unbooked. Idempotencja (API + webhook event_id) jest best-effort
// (blip Redisa nie może zablokować rezerwacji), ale przetworzenie tego samego
// webhooka dwa razy musi być bezpieczne.

import { Redis } from "@upstash/redis";

import type { PaymentEvidenceVerdict } from "./payment-evidence";
import type { FlightEmailState } from "./state";
import type { FlightItinerarySnapshot } from "./types";

const KEY_VERSION = "v1";
// 24h — Payment SDK + bankowe SCA potrafią trwać >30 min (patrz analogiczny
// komentarz w booking/session.ts). LiteAPI ma własny, krótszy rate-lock, więc
// realny górny limit i tak narzuca LiteAPI; to tylko nasze okno sesji.
export const FLIGHT_SESSION_TTL_SECONDS = 24 * 60 * 60;
const RECORD_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 dni
const IDEM_TTL_SECONDS = 300; // 5 min
const EVENT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dni — idempotencja webhooków
const ERRLOG_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dni

interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

let redis: RedisLike | null | undefined;
let injected: RedisLike | null | undefined;

export class FlightStoreUnavailableError extends Error {
  constructor() {
    super("flight booking store unavailable (Upstash env missing or unreachable)");
    this.name = "FlightStoreUnavailableError";
  }
}

function getRedis(): RedisLike {
  if (injected !== undefined) {
    if (injected === null) throw new FlightStoreUnavailableError();
    return injected;
  }
  if (redis === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = url && token ? (new Redis({ url, token }) as unknown as RedisLike) : null;
  }
  if (!redis) throw new FlightStoreUnavailableError();
  return redis;
}

// Test-only seam (mirrors booking/session.ts and the client.test env seam).
export function __setFlightRedisForTests(client: RedisLike | null): void {
  injected = client;
}
export function __resetFlightRedisForTests(): void {
  injected = undefined;
  redis = undefined;
}

// ── Typy domenowe ───────────────────────────────────────────────────────────

/**
 * `processing` (nowe 2026-08-29): wróciliśmy z widgetu płatności, ale nie mamy
 * jeszcze POZYTYWNEGO dowodu obciążenia. Poprzednio ten moment zapisywał od
 * razu `paid` — czyli twierdziliśmy o pieniądzach coś, czego nie sprawdziliśmy.
 * `paid` ustawiamy dopiero, gdy LiteAPI przyjmie booking na tę transakcję
 * (patrz `payment-evidence.ts`).
 */
export type FlightPaymentStatus = "pending" | "processing" | "paid" | "failed";
export type FlightBookingStatus =
  | "intent" // utworzyliśmy intencję przed prebookiem
  | "prebooked" // prebook OK, czekamy na płatność
  | "booking" // płatność OK, wołamy /flights/bookings
  | "confirmed"
  | "pending_confirmation"
  | "cancelled"
  | "failed"
  | "manual_review"; // płatność przeszła, booking nie — wymaga człowieka
export type FlightTicketingStatus = "pending" | "ticketed" | "unknown";

/** Migawka oferty po verify — cena/waluta/segmenty, do podsumowania i sporu. */
export interface VerifiedOfferSnapshot {
  total?: number;
  currency?: string;
  segments?: unknown;
  baggage?: unknown;
  verifiedAt: number;
}

export interface FlightContactData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  phoneCountryCode?: string;
}

/** Dane pasażera PO maskowaniu numeru dokumentu (do logów/alertów). */
export interface MaskedPassenger {
  title?: string;
  firstName: string;
  lastName: string;
  birthday: string;
  gender: string;
  nationality: string;
  type: string;
  documentType: string;
  documentNumberMasked: string;
  documentExpiry: string;
  documentIssueCountry: string;
}

/**
 * Pojedynczy, EWOLUUJĄCY rekord rezerwacji lotu — kluczowany sessionId.
 * Przechodzi: intent → prebooked → booking → confirmed/manual_review/…
 * Mapuje pola z briefu (1.1) na model Redis (zamiast tabeli Prisma).
 */
export interface FlightBookingRecord {
  searchSessionId: string;
  offerId: string;
  verifiedOfferSnapshot?: VerifiedOfferSnapshot;
  prebookId?: string;
  /** server-only — NIGDY nie wysyłamy do klienta. */
  transactionId?: string;
  /** secretKey CELOWO nie jest tu trzymany (idzie tylko do frontu, do widgetu). */
  paymentStatus: FlightPaymentStatus;
  bookingId?: string;
  bookingStatus: FlightBookingStatus;
  ticketingStatus?: FlightTicketingStatus;
  pnr?: string;
  eTicketNumbers?: string[];
  /** Pasażerowie — numer dokumentu ZAMASKOWANY (ostatnie 3 znaki). Pełny numer
   *  idzie tylko w body do LiteAPI, nigdy do storage/logów. */
  passengerData?: MaskedPassenger[];
  contactData?: FlightContactData;
  manualReviewReason?: string;
  /**
   * Strażnik anty-duplikat maila potwierdzającego (book route ↔ webhook).
   *
   * ZNACZENIE ZMIENIONE 2026-08-29: `true` oznacza teraz „Resend PRZYJĄŁ
   * wiadomość", a nie „zamierzamy wysłać". Do tej pory flaga leciała w górę
   * razem z decyzją o wysyłce, więc nieudany mail nigdy nie był ponowiony —
   * webhook widział `confirmationSent:true` i pomijał wysyłkę.
   */
  confirmationSent?: boolean;
  /** Stan wysyłki maila — rozdzielony od `bookingStatus` (mail nie cofa rezerwacji). */
  confirmationEmail?: FlightEmailState;
  /** Ile razy próbowaliśmy wysłać potwierdzenie (limit ponowień w webhooku). */
  confirmationAttempts?: number;
  /**
   * `pi_…` wyliczone z `secretKey` prebooka. IDENTYFIKATOR, nie sekret —
   * sam w sobie nie pozwala potwierdzić płatności, ale pozwala odrzucić adres
   * powrotu należący do innej transakcji. `secretKey` nadal NIE jest zapisywany.
   */
  paymentIntentId?: string;
  /** Co powiedział adres powrotu ze Stripe'a. Ślad audytowy przy sporze. */
  paymentEvidence?: {
    verdict: PaymentEvidenceVerdict;
    reason: string;
    redirectStatus?: string;
    returnedPaymentIntentId?: string;
    at: number;
  };
  /** Kwota locka z prebooka — TO jest kwota, którą obciąży karta. */
  price?: number;
  currency?: string;
  /**
   * Kwota, którą użytkownik zaakceptował na kroku poprzedzającym prebook.
   * Trzymana obok `price` NIE dla wyświetlania, tylko jako ślad audytowy:
   * przy sporze da się odtworzyć, co klient widział, a co zablokował dostawca.
   */
  acceptedTotal?: number;
  acceptedCurrency?: string;
  /**
   * Trasa + taryfa do maila i strony potwierdzenia. Dane PREZENTACYJNE od
   * klienta — nigdy nie wpływają na cenę ani na booking (patrz
   * `FlightItinerarySnapshotSchema`). Bez nich mail potwierdzający nie miał
   * czym wypełnić wymogów briefu §11 (trasa, daty, lotniska, taryfa, bagaż).
   */
  itinerary?: FlightItinerarySnapshot;
  /**
   * Trasa ODCZYTANA Z ODPOWIEDZI DOSTAWCY (prebook `booking.journey`, a po
   * rezerwacji `GET /flights/bookings/{id}`). Ma pierwszeństwo przed
   * `itinerary` wszędzie, gdzie pokazujemy klientowi, co kupił — mail i strona
   * potwierdzenia. `itinerary` zostaje jako zapasowe źródło, bo kształt
   * odpowiedzi dostawcy nie jest umową i potrafi przyjść niekompletny.
   */
  providerItinerary?: FlightItinerarySnapshot;
  /**
   * `true` = kwota i waluta locka zgadzają się z tym, co zaakceptował klient.
   *
   * Tylko taka sesja może przejść przez `finalizeFlightBooking`. Gdy bramka
   * nie przeszła, `secretKey` nigdy nie opuścił serwera, więc płatności nie
   * było — a mimo to sesja istnieje w Redis (prebook u dostawcy powstał).
   * Bez tej flagi wystarczyłoby wejść na `/loty/platnosc/return?sid=…` z
   * własnym, znanym sobie identyfikatorem, żeby oznaczyć taką sesję jako
   * opłaconą i wywołać booking, którego nikt nie opłacił.
   */
  priceGatePassed?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Lekki rekord potwierdzonej rezerwacji (szybki odczyt na stronie potw.). */
export interface FlightCompletedRecord {
  bookingId: string;
  sessionId: string;
  status: string;
  pnr?: string;
  eTicketNumbers?: string[];
  ticketingStatus?: FlightTicketingStatus;
  price?: number;
  currency?: string;
  createdAt: number;
}

/** Rekord awarii post-payment — paid-but-unbooked. MUSI przetrwać (RULE 6). */
export interface FlightFailedRecord {
  sessionId: string;
  prebookId?: string;
  transactionId?: string;
  bookingId?: string;
  errorCode: string;
  message: string;
  manualReviewReason?: string;
  createdAt: number;
}

/** Wpis błędu LiteAPI (request/response) — bez klucza API, bez pełnych numerów dokumentów. */
export interface FlightErrorLogRecord {
  id: string;
  stage: "search" | "verify" | "prebook" | "book" | "getBooking" | "webhook";
  sessionId?: string;
  httpStatus?: number;
  liteApiCode?: string | number;
  requestRedacted?: unknown;
  responseRedacted?: unknown;
  createdAt: number;
}

// ── Klucze ──────────────────────────────────────────────────────────────────

const sKey = (id: string) => `flight:${KEY_VERSION}:session:${id}`;
const cKey = (bookingId: string) => `flight:${KEY_VERSION}:completed:${bookingId}`;
const fKey = (sessionId: string) => `flight:${KEY_VERSION}:failed:${sessionId}`;
const iKey = (k: string) => `flight:${KEY_VERSION}:idem:${k}`;
const evKey = (eventId: string) => `flight:${KEY_VERSION}:event:${eventId}`;
const byBookingKey = (bookingId: string) => `flight:${KEY_VERSION}:bybooking:${bookingId}`;
const byPrebookKey = (prebookId: string) => `flight:${KEY_VERSION}:byprebook:${prebookId}`;
const errKey = (id: string) => `flight:${KEY_VERSION}:errlog:${id}`;

// ── Maskowanie numeru dokumentu ──────────────────────────────────────────────

/** Ostatnie `keep` znaków jawne, reszta gwiazdki. "AB1234567" → "******567". */
export function maskDocumentNumber(num: string | undefined | null, keep = 3): string {
  if (!num) return "";
  const s = String(num);
  if (s.length <= keep) return "*".repeat(s.length);
  return "*".repeat(s.length - keep) + s.slice(-keep);
}

// ── Sesja (rekord ewoluujący) ─────────────────────────────────────────────────

export function isFlightSessionExpired(rec: FlightBookingRecord, now = Date.now()): boolean {
  return now - rec.createdAt > FLIGHT_SESSION_TTL_SECONDS * 1000;
}

/** Zapis sesji. STRICT — rzuca, gdy store niedostępny (ścieżka płatności). */
export async function saveFlightSession(sessionId: string, rec: FlightBookingRecord): Promise<void> {
  await getRedis().set(sKey(sessionId), { ...rec, updatedAt: Date.now() }, { ex: FLIGHT_SESSION_TTL_SECONDS });
}
export async function getFlightSession(sessionId: string): Promise<FlightBookingRecord | null> {
  return (await getRedis().get<FlightBookingRecord>(sKey(sessionId))) ?? null;
}
export async function deleteFlightSession(sessionId: string): Promise<void> {
  try {
    await getRedis().del(sKey(sessionId));
  } catch {
    /* TTL i tak posprząta */
  }
}

/** Indeks bookingId → sessionId (webhook/GET booking trafia po bookingId). */
export async function linkBookingToSession(bookingId: string, sessionId: string): Promise<void> {
  await getRedis().set(byBookingKey(bookingId), sessionId, { ex: RECORD_TTL_SECONDS });
}
export async function getSessionIdByBooking(bookingId: string): Promise<string | null> {
  return (await getRedis().get<string>(byBookingKey(bookingId))) ?? null;
}

/** Indeks prebookId → sessionId (webhook flight.prebook/flight.book.* niesie prebookId). */
export async function linkPrebookToSession(prebookId: string, sessionId: string): Promise<void> {
  await getRedis().set(byPrebookKey(prebookId), sessionId, { ex: RECORD_TTL_SECONDS });
}
export async function getSessionIdByPrebook(prebookId: string): Promise<string | null> {
  return (await getRedis().get<string>(byPrebookKey(prebookId))) ?? null;
}

export async function saveFlightCompleted(rec: FlightCompletedRecord): Promise<void> {
  await getRedis().set(cKey(rec.bookingId), rec, { ex: RECORD_TTL_SECONDS });
}
export async function getFlightCompleted(bookingId: string): Promise<FlightCompletedRecord | null> {
  return (await getRedis().get<FlightCompletedRecord>(cKey(bookingId))) ?? null;
}

/** Rekord paid-but-unbooked. MUSI persystować — caller loguje [CRITICAL] przy throw. */
export async function saveFlightFailed(rec: FlightFailedRecord): Promise<void> {
  await getRedis().set(fKey(rec.sessionId), rec, { ex: RECORD_TTL_SECONDS });
}
export async function getFlightFailed(sessionId: string): Promise<FlightFailedRecord | null> {
  return (await getRedis().get<FlightFailedRecord>(fKey(sessionId))) ?? null;
}

// ── Idempotencja API (best-effort) ───────────────────────────────────────────

export interface IdempotentCached {
  status: number;
  body: unknown;
  /**
   * Odcisk ŻĄDANIA, które utworzyło ten wpis (hash oferty + maila + kwoty).
   *
   * DLACZEGO (audyt bezpieczeństwa 2026-08-29): odpowiedź prebooka niesie
   * `secretKey` — Stripe client secret. Cache był kluczowany WYŁĄCZNIE
   * nagłówkiem `Idempotency-Key` od klienta i odczytywany PRZED walidacją body,
   * więc kto trafił w cudzy klucz, dostawał cudzy `secretKey` i `sessionId`
   * wysyłając puste żądanie. Klucz jest zwykle `crypto.randomUUID()`, ale front
   * miał fallback `String(Date.now())` — czyli w przeglądarce bez
   * `crypto.randomUUID` (kontekst niezabezpieczony) klucz był znakiem czasu.
   *
   * Teraz wpis wydajemy tylko wtedy, gdy powtórzone żądanie DOTYCZY TEJ SAMEJ
   * rezerwacji. Zgadnięcie klucza przestaje wystarczać.
   */
  fingerprint?: string;
}
export async function getFlightIdempotent(key: string): Promise<IdempotentCached | null> {
  try {
    return (await getRedis().get<IdempotentCached>(iKey(key))) ?? null;
  } catch {
    return null; // best-effort — nigdy nie blokuj rezerwacji na idem-cache
  }
}
export async function setFlightIdempotent(key: string, status: number, body: unknown, fingerprint?: string): Promise<void> {
  try {
    await getRedis().set(iKey(key), { status, body, fingerprint }, { ex: IDEM_TTL_SECONDS });
  } catch {
    /* best-effort */
  }
}

// ── Idempotencja webhooków po event_id ───────────────────────────────────────

/**
 * Zwraca true, jeśli event_id JEST NOWY (zarezerwowany teraz). false = duplikat
 * (już przetworzony) → caller ignoruje i ACK-uje 200. Best-effort: gdy Redis
 * padnie, zwracamy true (lepiej przetworzyć ponownie niż zgubić — operacje
 * zmiany statusu i tak idempotentne przez GET jako źródło prawdy).
 */
export async function markWebhookEventProcessed(eventId: string): Promise<boolean> {
  try {
    const res = await getRedis().set(evKey(eventId), "1", { nx: true, ex: EVENT_TTL_SECONDS });
    return res !== null; // NX: null = już istniał → duplikat
  } catch {
    return true;
  }
}

// ── Log błędów LiteAPI ────────────────────────────────────────────────────────

export async function saveFlightErrorLog(rec: FlightErrorLogRecord): Promise<void> {
  try {
    await getRedis().set(errKey(rec.id), rec, { ex: ERRLOG_TTL_SECONDS });
  } catch {
    /* best-effort — log błędu nie może wywrócić ścieżki głównej */
  }
}
