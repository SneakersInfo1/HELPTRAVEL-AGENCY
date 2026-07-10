// POST /api/booking/prebook — locks a rate via LiteAPI, opens a Payment SDK
// session, persists a server-side booking session. Conventions copied from
// src/app/api/hotels/search/route.ts (runtime, zod, rate-limit-first, typed
// error discrimination). Route prefix is /api/booking/* per BOOKING_FLOW_PROMPT
// Phase 2 (documented minor deviation from the house /api/hotels/* prefix, Q6).

import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isBookingLive } from "@/lib/config/featureFlags";
import {
  BookingError,
  LiteApiError,
  LiteApiGuestSchema,
  LiteApiHolderSchema,
  prebookHotel,
} from "@/lib/liteapi";
import { getLiteApiWidgetEnv } from "@/lib/liteapi/widget-env";
import { normalizeGuestsForRooms } from "@/lib/booking/guests";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  SESSION_TTL_SECONDS,
  getIdempotent,
  saveSession,
  setIdempotent,
  type SessionRecord,
} from "@/lib/booking/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Mirror the book route's maxDuration. Prebook normally completes in
// ~700ms but we've seen LiteAPI tail-latency reach multi-second on heavy
// suppliers; 60s removes Vercel's 10s default as a possible cause of
// silent kills on the prebook path too.
export const maxDuration = 60;

const BodySchema = z.object({
  offerId: z.string().min(8),
  hotel: z.object({ name: z.string().min(1), city: z.string().optional() }),
  rate: z.object({
    boardName: z.string().optional(),
    price: z.number().optional(),
    currency: z.string().length(3).optional(),
    checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  // Phase 3: guest data captured here (pre-payment) and stored in the session
  // so the redirect return page can book with only `sid`. Optional for
  // backward compatibility with Phase 2 callers.
  holder: LiteApiHolderSchema.optional(),
  guests: z.array(LiteApiGuestSchema).min(1).optional(),
  // Liczba pokoi oferty (= liczba occupancies w prebooku LiteAPI) i liczba
  // osób. Opcjonalne dla starych klientów — brak = 1 pokój.
  rooms: z.number().int().min(1).max(9).optional(),
  pax: z.number().int().min(1).max(15).optional(),
});

export async function POST(request: NextRequest) {
  if (!isBookingLive()) {
    return NextResponse.json(
      { error: "booking_disabled", message: "Wkrótce dostępne" },
      { status: 503 },
    );
  }

  const limited = await enforceRateLimit(request, "booking-prebook");
  if (limited) return limited;

  const idemKey = request.headers.get("idempotency-key")?.trim() || null;
  if (idemKey) {
    const cached = await getIdempotent(idemKey);
    if (cached) return NextResponse.json(cached.body, { status: cached.status });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const sessionId = randomUUID();

  // GWARANCJA occupancy (incydent 2026-07-10): goście trafiają do sesji już
  // ZNORMALIZOWANI do jednego gościa głównego na pokój 1..rooms — nawet gdy
  // stary/zmanipulowany klient przysłał gościa per OSOBA (occupancy 2..N przy
  // jednym pokoju), do LiteAPI /rates/book nigdy nie wyjdzie nieistniejące
  // occupancy. Book-route normalizuje ponownie (sesje sprzed deploya).
  const roomsCount = b.rooms ?? 1;
  let guestsForSession = b.guests;
  if (b.holder) {
    const normalized = normalizeGuestsForRooms(b.guests, b.holder, roomsCount);
    if (normalized.changed) {
      console.warn(
        `[booking][prebook] guests znormalizowani do ${roomsCount} pokoi (wejście: ${b.guests?.length ?? 0} wpisów) — stary klient albo payload spoza formularza`,
      );
    }
    guestsForSession = normalized.guests;
  }

  try {
    const pre = await prebookHotel({ rateId: b.offerId, clientReference: sessionId });

    if (!pre.transactionId || !pre.secretKey) {
      // No Payment SDK handles → cannot proceed to card payment. Surface, do
      // not pretend success (no charge has happened at prebook).
      return NextResponse.json(
        {
          error: "prebook_no_payment_session",
          message: "Nie udało się otworzyć sesji płatności. Spróbuj ponownie.",
        },
        { status: 502 },
      );
    }

    const now = Date.now();
    const rec: SessionRecord = {
      prebookId: pre.prebookId,
      transactionId: pre.transactionId,
      secretKey: pre.secretKey,
      offerId: b.offerId,
      price: pre.price ?? b.rate.price,
      currency: pre.currency ?? b.rate.currency,
      hotelSummary: { name: b.hotel.name, city: b.hotel.city },
      rateSummary: {
        boardName: b.rate.boardName,
        price: pre.price ?? b.rate.price,
        currency: pre.currency ?? b.rate.currency,
        checkin: b.rate.checkin,
        checkout: b.rate.checkout,
      },
      holder: b.holder,
      guests: guestsForSession,
      rooms: roomsCount,
      pax: b.pax,
      createdAt: now,
    };
    await saveSession(sessionId, rec); // strict — throws if store unavailable

    // B6: the widget's `publicKey` env MUST match the env that created this
    // PaymentIntent, or Stripe 400s on /v1/elements. Prefer LiteAPI's own
    // per-prebook `sandbox` flag (authoritative — same response as secretKey);
    // fall back to the resolved key-mode heuristic when LiteAPI omits it.
    const widgetEnv: "live" | "sandbox" =
      pre.sandbox === false
        ? "live"
        : pre.sandbox === true
          ? "sandbox"
          : getLiteApiWidgetEnv();

    const responseBody = {
      sessionId,
      // secretKey IS returned (the widget needs it). transactionId is NOT —
      // it stays server-side and is read from the session at book time.
      secretKey: pre.secretKey,
      // Env flag for the LiteAPI Payment widget, bound to THIS prebook so the
      // Stripe publishable key and client secret can never be from different
      // modes (B6).
      widgetEnv,
      expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000).toISOString(),
      hotelSummary: rec.hotelSummary,
      rateSummary: rec.rateSummary,
    };
    if (idemKey) await setIdempotent(idemKey, 200, responseBody);
    return NextResponse.json(responseBody, { status: 200 });
  } catch (err) {
    if (err instanceof BookingError) {
      // Surface the underlying LiteAPI HTTP status + internal code in the
      // response so the operator can diagnose 503s straight from the browser
      // DevTools (Network → response body) — no Vercel log dive needed.
      // No secrets / no PII: just status code + our internal taxonomy label.
      const cause = err.cause;
      const debug =
        cause instanceof LiteApiError
          ? { liteApiStatus: cause.status, liteApiCode: cause.internalCode }
          : undefined;
      return NextResponse.json(
        {
          error: err.code,
          message: err.userMessagePl,
          ...(debug ? { debug } : {}),
        },
        { status: err.httpStatus },
      );
    }
    console.error(
      `[booking][prebook] unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json(
      { error: "prebook_failed", message: "Coś poszło nie tak. Spróbuj ponownie." },
      { status: 500 },
    );
  }
}
