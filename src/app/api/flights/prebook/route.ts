// POST /api/flights/prebook — proxy do LiteAPI POST /flights/prebooks
// (usePaymentSdk:true). Najbardziej krytyczny endpoint przed płatnością.
//
// KOLEJNOŚĆ (brief 1.2, RULE 6):
//   1. Walidacja (zod) + reguła: ważność dokumentu > ostatnia data podróży.
//   2. Zapis INTENCJI w Redis (bookingStatus:"intent") — PRZED wołaniem LiteAPI.
//   3. Wywołanie prebook.
//   4. Zapis prebookId + transactionId w Redis — NATYCHMIAST, ZANIM cokolwiek
//      wróci do frontu. secretKey idzie do frontu, ale NIGDY do storage.
//   5. Numery dokumentów pasażerów maskowane do ostatnich 3 znaków w storage.

import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/rate-limit";
import { getLiteApiWidgetEnv } from "@/lib/liteapi/widget-env";
import { notifyCritical } from "@/lib/alerting/notify";
import { prebookFlight, toFlightApiError } from "@/lib/flights/client";
import { FlightPrebookInputSchema } from "@/lib/flights/types";
import {
  FLIGHT_SESSION_TTL_SECONDS,
  FlightStoreUnavailableError,
  getFlightIdempotent,
  linkPrebookToSession,
  maskDocumentNumber,
  saveFlightSession,
  setFlightIdempotent,
  type FlightBookingRecord,
  type MaskedPassenger,
} from "@/lib/flights/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "booking-prebook");
  if (limited) return limited;

  const idemKey = request.headers.get("idempotency-key")?.trim() || null;
  if (idemKey) {
    const cached = await getFlightIdempotent(idemKey);
    if (cached) return NextResponse.json(cached.body, { status: cached.status });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = FlightPrebookInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  // Reguła 1.3: dokument ważny PO ostatniej dacie podróży.
  if (b.lastTravelDate) {
    const last = new Date(`${b.lastTravelDate}T00:00:00`);
    for (const [i, p] of b.passengers.entries()) {
      const exp = new Date(`${p.documentExpiry}T00:00:00`);
      if (exp <= last) {
        return NextResponse.json(
          {
            error: "invalid_body",
            issues: [{ path: ["passengers", i, "documentExpiry"], message: "Dokument musi być ważny po dacie podróży." }],
          },
          { status: 400 },
        );
      }
    }
  }

  const sessionId = randomUUID();
  const now = Date.now();

  // Pasażerowie do storage — numer dokumentu ZAMASKOWANY.
  const maskedPassengers: MaskedPassenger[] = b.passengers.map((p) => ({
    title: p.title,
    firstName: p.firstName,
    lastName: p.lastName,
    birthday: p.birthday,
    gender: p.gender,
    nationality: p.nationality,
    type: p.type,
    documentType: p.documentType,
    documentNumberMasked: maskDocumentNumber(p.documentNumber),
    documentExpiry: p.documentExpiry,
    documentIssueCountry: p.documentIssueCountry,
  }));

  // 2. Intencja PRZED wywołaniem LiteAPI. Fail-loud: bez storage nie ruszamy.
  const intent: FlightBookingRecord = {
    searchSessionId: sessionId,
    offerId: b.offerId,
    paymentStatus: "pending",
    bookingStatus: "intent",
    passengerData: maskedPassengers,
    contactData: { ...b.contact },
    createdAt: now,
    updatedAt: now,
  };
  try {
    await saveFlightSession(sessionId, intent);
  } catch (err) {
    if (err instanceof FlightStoreUnavailableError) {
      console.error(`[flights][prebook][CRITICAL] store unavailable — nie tworzę prebooka bez persystencji sid=${sessionId}`);
      return NextResponse.json(
        { error: "store_unavailable", message: "Chwilowy problem techniczny. Spróbuj ponownie za moment." },
        { status: 503 },
      );
    }
    throw err;
  }

  // 3. Prebook.
  try {
    const pre = await prebookFlight({ offerId: b.offerId, contact: b.contact, passengers: b.passengers });

    if (!pre.prebookId || !pre.transactionId || !pre.secretKey) {
      // Brak handli Payment SDK → nie udawaj sukcesu (płatność jeszcze nie ruszyła).
      return NextResponse.json(
        { error: "prebook_no_payment_session", message: "Nie udało się otworzyć sesji płatności. Spróbuj ponownie." },
        { status: 502 },
      );
    }

    // 4. Zapis prebookId + transactionId ZANIM cokolwiek wróci. secretKey NIE do storage.
    const rec: FlightBookingRecord = {
      ...intent,
      prebookId: pre.prebookId,
      transactionId: pre.transactionId,
      bookingStatus: "prebooked",
      price: pre.price,
      currency: pre.currency,
      verifiedOfferSnapshot: { total: pre.price, currency: pre.currency, verifiedAt: Date.now() },
      updatedAt: Date.now(),
    };
    try {
      await saveFlightSession(sessionId, rec);
      // Indeks prebookId → sesja (webhook flight.prebook/flight.book.* trafia po prebookId).
      await linkPrebookToSession(pre.prebookId, sessionId);
    } catch (saveErr) {
      // Prebook istnieje u LiteAPI, ale nie zapisaliśmy id. To jeszcze nie
      // płatność, ale i tak NIE WOLNO tego zgubić — alert + 503, bez secretKey.
      console.error(
        `[flights][prebook][CRITICAL] prebook OK ale saveSession FAILED sid=${sessionId} prebookId=${pre.prebookId} — ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
      );
      notifyCritical({
        source: "flights-prebook",
        title: "Flight prebook saved at LiteAPI but session persist FAILED",
        body: "Prebook utworzony u LiteAPI, ale nie zapisaliśmy prebookId/transactionId. Bez tego nie sfinalizujemy bookingu po płatności.",
        fields: { sessionId, prebookId: pre.prebookId },
      }).catch(() => {});
      return NextResponse.json(
        { error: "store_unavailable", message: "Chwilowy problem techniczny. Spróbuj ponownie za moment." },
        { status: 503 },
      );
    }

    const widgetEnv: "live" | "sandbox" =
      pre.sandbox === false ? "live" : pre.sandbox === true ? "sandbox" : getLiteApiWidgetEnv();

    const responseBody = {
      sessionId,
      secretKey: pre.secretKey, // tylko do frontu (widget); transactionId zostaje serwerowo
      widgetEnv,
      price: pre.price,
      currency: pre.currency,
      paymentTypes: pre.paymentTypes,
      expiresAt: new Date(now + FLIGHT_SESSION_TTL_SECONDS * 1000).toISOString(),
    };
    if (idemKey) await setFlightIdempotent(idemKey, 200, responseBody);
    return NextResponse.json(responseBody, { status: 200 });
  } catch (err) {
    const e = toFlightApiError(err, "prebook");
    console.warn(
      `[flights][prebook] ${e.code} sid=${sessionId} liteApiStatus=${e.liteApiStatus} liteApiCode=${e.liteApiCode}`,
    );
    return NextResponse.json(
      { error: e.code, message: e.message, debug: { liteApiStatus: e.liteApiStatus, liteApiCode: e.liteApiCode } },
      { status: e.httpStatus },
    );
  }
}
