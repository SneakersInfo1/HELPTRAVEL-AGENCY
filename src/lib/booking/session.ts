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
export const SESSION_TTL_SECONDS = 1800; // decision #3 — LiteAPI returns no expiresAt (Q2)
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
  prebookId: string;
  transactionId: string;
  holder: unknown;
  guests: unknown;
  errorCode: string;
  message: string;
  createdAt: number;
}

const sKey = (id: string) => `booking:${KEY_VERSION}:session:${id}`;
const cKey = (id: string) => `booking:${KEY_VERSION}:completed:${id}`;
const fKey = (id: string) => `booking:${KEY_VERSION}:failed:${id}`;
const iKey = (k: string) => `booking:${KEY_VERSION}:idem:${k}`;

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
