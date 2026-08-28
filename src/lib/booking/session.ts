// Upstash-backed booking persistence.
//
// Reuses the lazy Redis-client construction pattern from
// src/lib/hotels/rate-cache.ts (decision #3 / BOOKING_AUDIT.md §7) — but the
// ERROR SEMANTICS deliberately differ: rate-cache is best-effort (fail-open,
// a miss just costs a live call). Booking persistence is on the PAYMENT path,
// so session/completed/failed write failures FAIL LOUD (NON-NEGOTIABLE RULE 6
// — never silently lose a session or a paid-but-unbooked recovery record).
// Idempotency cache is the one best-effort piece (a Redis blip there must not
// block a booking).

import { Redis } from "@upstash/redis";

import { BookingError } from "@/lib/liteapi";

const KEY_VERSION = "v1";
// 24h — was 1800s (30 min), which proved too short to survive Stripe SCA in EU.
// PSD2 strong-customer-authentication regularly takes >30 min when the bank's
// push lands late or the user task-switches; we hit a real-money loss on
// 2026-05-23 (sid 3124f752) because the Redis session expired between
// `/api/booking/prebook` and the return-page `/api/booking/book` call, so the
// charge was captured by Stripe but `/rates/book` never fired and LiteAPI
// eventually auto-refunded. 24h is generous enough to cover bank back-and-forth
// without holding stale rates indefinitely — LiteAPI's own rate-lock TTL is
// shorter (typically minutes), so the *useful* upper bound on completing a
// booking is bounded by LiteAPI regardless of our session window; this just
// removes our local TTL as the single point of failure.
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
const RECORD_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const IDEM_TTL_SECONDS = 300; // 5 min

interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

let redis: RedisLike | null | undefined;
let injected: RedisLike | null | undefined;

function storeDown(): BookingError {
  return new BookingError(
    "LITEAPI_DOWN",
    "booking store unavailable (Upstash env missing or unreachable)",
  );
}

function getRedis(): RedisLike {
  if (injected !== undefined) {
    if (injected === null) throw storeDown();
    return injected;
  }
  if (redis === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = url && token ? (new Redis({ url, token }) as unknown as RedisLike) : null;
  }
  if (!redis) throw storeDown();
  return redis;
}

// Test-only seam (mirrors the codebase convention, e.g. client.test env seam).
export function __setBookingRedisForTests(client: RedisLike | null): void {
  injected = client;
}
export function __resetBookingRedisForTests(): void {
  injected = undefined;
  redis = undefined;
}

export interface HotelSummary {
  name: string;
  city?: string;
}
export interface RateSummary {
  boardName?: string;
  price?: number;
  currency?: string;
  checkin: string;
  checkout: string;
}
export interface SessionRecord {
  prebookId: string;
  transactionId: string; // server-only — never sent to the client
  secretKey?: string; // sent to the client (Payment SDK widget)
  offerId: string;
  price?: number;
  currency?: string;
  hotelSummary: HotelSummary;
  rateSummary: RateSummary;
  // Phase 3: guest data is collected at the form step (before payment) and
  // stored here so the return page — which only carries `sid` — can finalize
  // /api/booking/book without re-collecting it. Optional for backward compat
  // (Phase 2 callers may still pass holder/guests in the book body).
  holder?: unknown;
  guests?: unknown;
  // Liczba POKOI oferty (occupancies w prebooku) — book normalizuje guests[]
  // do dokładnie jednego gościa głównego na pokój (incydent „invalid occupancy
  // number" 2026-07-10). Brak pola (stara sesja) = 1 pokój.
  rooms?: number;
  // Liczba OSÓB (dorośli+dzieci z wyszukiwania) — do e-maila/strony
  // potwierdzenia; guests.length to od fixu liczba pokoi, nie osób.
  pax?: number;
  createdAt: number; // epoch ms
}
export interface CompletedRecord {
  bookingId: string;
  confirmationCode?: string;
  status: string;
  hotelSummary: HotelSummary;
  rateSummary: RateSummary;
  price?: number;
  currency?: string;
  createdAt: number;
}
export interface FailedRecord {
  sessionId: string;
  // prebookId / transactionId / holder / guests are present when the failure
  // occurred mid-flow (post-payment book call threw) — i.e. the Redis session
  // was still alive. They are ABSENT in the session_expired-after-payment
  // recovery branch (Redis TTL fired before the return-page POST landed), where
  // the only client-side breadcrumb is the Stripe `paymentIntentId`. Support
  // recovery flow handles both shapes — manual operators reconcile via Stripe
  // and the LiteAPI dashboard.
  prebookId?: string;
  transactionId?: string;
  holder?: unknown;
  guests?: unknown;
  // Stripe PaymentIntent ID smuggled through the redirect's query string
  // (`?payment_intent=…`). Lets support look up the charge directly in Stripe
  // when the Redis session is no longer available to provide our internal IDs.
  paymentIntentId?: string;
  errorCode: string;
  message: string;
  createdAt: number;
}

const sKey = (id: string) => `booking:${KEY_VERSION}:session:${id}`;
const cKey = (id: string) => `booking:${KEY_VERSION}:completed:${id}`;
const fKey = (id: string) => `booking:${KEY_VERSION}:failed:${id}`;
const iKey = (k: string) => `booking:${KEY_VERSION}:idem:${k}`;
const sbKey = (id: string) => `booking:${KEY_VERSION}:session-booking:${id}`;

export function isSessionExpired(rec: SessionRecord, now = Date.now()): boolean {
  return now - rec.createdAt > SESSION_TTL_SECONDS * 1000;
}

export async function saveSession(sessionId: string, rec: SessionRecord): Promise<void> {
  await getRedis().set(sKey(sessionId), rec, { ex: SESSION_TTL_SECONDS });
}
export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  return (await getRedis().get<SessionRecord>(sKey(sessionId))) ?? null;
}
export async function deleteSession(sessionId: string): Promise<void> {
  // Non-fatal: a delete failure just leaves a row the TTL will reap anyway.
  try {
    await getRedis().del(sKey(sessionId));
  } catch {
    /* intentional: TTL guarantees cleanup */
  }
}
export async function saveCompleted(rec: CompletedRecord): Promise<void> {
  await getRedis().set(cKey(rec.bookingId), rec, { ex: RECORD_TTL_SECONDS });
}
export async function getCompleted(bookingId: string): Promise<CompletedRecord | null> {
  return (await getRedis().get<CompletedRecord>(cKey(bookingId))) ?? null;
}
export async function saveFailed(rec: FailedRecord): Promise<void> {
  // MUST persist. Caller re-logs [CRITICAL] if this throws — a paid-but-
  // unbooked recovery record is never lost silently.
  await getRedis().set(fKey(rec.sessionId), rec, { ex: RECORD_TTL_SECONDS });
}

// ── Durable session → booking pointer ───────────────────────────────────────
// INCYDENT 2026-08-28 (booking 9c-OQvmqJ, sid c9897a4a-…): after a SUCCESSFUL
// booking we `deleteSession(sid)`, and the `completed` record is keyed by
// bookingId — so NOTHING keyed by sessionId proved the booking had succeeded.
// The only thing hiding that was the 300s idempotency cache. The return page
// is `force-dynamic`, so any revisit of
// /hotele/rezerwacja/return?sid=…&payment_intent=… more than 5 minutes later
// re-ran finalization, found no session, saw the payment_intent, and fired a
// FALSE [CRITICAL] "Session expired after payment" — measured 30m38s after the
// real booking was persisted.
//
// This pointer is the durable, sessionId-keyed proof of success. It stores the
// exact 200 body we already returned, so a replay returns the identical
// confirmation for the full 90-day record lifetime instead of alerting.
export interface SessionBookingPointer {
  bookingId: string;
  /** The exact response body `finalizeAndRespond` returned for this session. */
  body: unknown;
  createdAt: number;
}

/**
 * Best-effort: a write failure must NEVER turn a confirmed, already-persisted
 * booking into a failure (RULE 6). We log loudly and rely on the LiteAPI
 * `clientReference` reconcile as the second net.
 */
export async function saveSessionBooking(
  sessionId: string,
  rec: SessionBookingPointer,
): Promise<void> {
  try {
    await getRedis().set(sbKey(sessionId), rec, { ex: RECORD_TTL_SECONDS });
  } catch (err) {
    console.error(
      `[booking][session-booking] persist FAILED sessionId=${sessionId} bookingId=${rec.bookingId} — a later return-page revisit may emit a false BOOK_FAILED_AFTER_PAYMENT (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

/** Best-effort read — a lookup failure must not block the booking path. */
export async function getSessionBooking(
  sessionId: string,
): Promise<SessionBookingPointer | null> {
  try {
    return (await getRedis().get<SessionBookingPointer>(sbKey(sessionId))) ?? null;
  } catch {
    return null;
  }
}

export interface IdempotentCached {
  status: number;
  body: unknown;
}
export async function getIdempotent(key: string): Promise<IdempotentCached | null> {
  try {
    return (await getRedis().get<IdempotentCached>(iKey(key))) ?? null;
  } catch {
    return null; // best-effort — never block a booking on the idem cache
  }
}
export async function setIdempotent(
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  try {
    await getRedis().set(iKey(key), { status, body }, { ex: IDEM_TTL_SECONDS });
  } catch {
    /* best-effort */
  }
}
