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

import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/rate-limit";
import { getLiteApiWidgetEnv } from "@/lib/liteapi/widget-env";
import { notifyCritical } from "@/lib/alerting/notify";
import { prebookFlight, toFlightApiError } from "@/lib/flights/client";
import { priceChanged } from "@/lib/flights/money";
import { paymentIntentIdFromSecret } from "@/lib/flights/payment-evidence";
import { extractProviderItinerary } from "@/lib/flights/provider-itinerary";
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

  // ── IDEMPOTENCJA — PO walidacji i związana z treścią żądania ──────────────
  //
  // Odpowiedź prebooka zawiera `secretKey` (Stripe client secret). Do
  // 2026-08-29 cache był odczytywany PRZED parsowaniem body i kluczowany samym
  // nagłówkiem od klienta, więc wystarczyło trafić w cudzy `Idempotency-Key`
  // (front miał fallback `String(Date.now())`), żeby PUSTYM żądaniem dostać
  // cudzy `secretKey` i `sessionId`. Teraz wpis wydajemy tylko żądaniu, które
  // dotyczy tej samej oferty, tego samego klienta i tej samej kwoty.
  const fingerprint = createHash("sha256")
    .update(`${b.offerId}|${b.contact.email.toLowerCase()}|${b.acceptedTotal}|${b.acceptedCurrency}`)
    .digest("hex")
    .slice(0, 32);
  if (idemKey) {
    const cached = await getFlightIdempotent(idemKey);
    if (cached && cached.fingerprint === fingerprint) {
      return NextResponse.json(cached.body, { status: cached.status });
    }
    if (cached) {
      console.warn(`[flights][prebook] Idempotency-Key trafiony, ale odcisk żądania NIE pasuje — traktuję jak nowe żądanie`);
    }
  }

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
    itinerary: b.itinerary,
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

    // 3b. BRAMKA KWOTY — bez niej nie ma sesji płatności.
    //
    // Prebook zwraca kwotę locka; to ona obciąży kartę (PaymentIntent jest
    // związany z `secretKey` po stronie LiteAPI, front nie ma na nią wpływu).
    // Ale ZGODA użytkownika dotyczyła kwoty z poprzedniego kroku. Jeśli te dwie
    // liczby się różnią, jedyne uczciwe zachowanie to NIE ODDAWAĆ `secretKey`
    // i odesłać frontowi obie kwoty do potwierdzenia.
    //
    // Brak ceny w odpowiedzi traktujemy tak samo twardo: skoro nie wiemy, ile
    // zejdzie z karty, nie wolno nam otworzyć płatności. (Kontrakt zmierzony
    // w Fazie 0 — `docs/liteapi-flights-sample-prebook.json` — zawsze niesie
    // `price` i `currency`, więc ich brak to sygnał awarii, nie wariant.)
    if (typeof pre.price !== "number" || !Number.isFinite(pre.price)) {
      console.error(`[flights][prebook][CRITICAL] prebook bez ceny sid=${sessionId} prebookId=${pre.prebookId}`);
      return NextResponse.json(
        { error: "prebook_no_price", message: "Nie udało się potwierdzić kwoty rezerwacji. Spróbuj ponownie." },
        { status: 502 },
      );
    }
    const lockedCurrency = (pre.currency ?? b.acceptedCurrency).toUpperCase();
    const currencyMismatch = lockedCurrency !== b.acceptedCurrency;
    const amountMismatch = priceChanged(pre.price, b.acceptedTotal);

    // 4. Zapis prebookId + transactionId ZANIM cokolwiek wróci. secretKey NIE do storage.
    //    Zapisujemy TAKŻE przy rozjeździe kwoty — prebook u dostawcy istnieje,
    //    więc rekord musi istnieć u nas (RULE 6: nigdy po cichu nie gubimy
    //    stanu, nawet gdy ścieżka kończy się błędem dla użytkownika).
    // `secretKey` to Stripe client secret `pi_<id>_secret_<...>` (patrz
    // liteapi/widget-env.ts). Zapisujemy z niego SAM identyfikator — nie sekret
    // — żeby strona powrotu miała z czym porównać `?payment_intent=`. Bez tego
    // adres powrotu jednej sesji działa na dowolnej innej.
    const paymentIntentId = paymentIntentIdFromSecret(pre.secretKey);
    if (!paymentIntentId) {
      console.warn(`[flights][prebook] secretKey bez rozpoznawalnego pi_… sid=${sessionId} — dowód płatności zdegradowany do „unverified”`);
    }

    const rec: FlightBookingRecord = {
      ...intent,
      prebookId: pre.prebookId,
      transactionId: pre.transactionId,
      paymentIntentId,
      bookingStatus: "prebooked",
      price: pre.price,
      currency: lockedCurrency,
      acceptedTotal: b.acceptedTotal,
      acceptedCurrency: b.acceptedCurrency,
      priceGatePassed: !amountMismatch && !currencyMismatch,
      verifiedOfferSnapshot: { total: pre.price, currency: lockedCurrency, verifiedAt: Date.now() },
      // Trasa OD DOSTAWCY, zapisana już tutaj: `booking` z prebooka niesie
      // własny `journey`, a to jedyne autorytatywne źródło trasy dostępne
      // ZANIM powstanie rezerwacja. `undefined`, gdy payload jej nie zawiera —
      // wtedy zostaje migawka od klienta, czyli dzisiejsze zachowanie.
      providerItinerary: extractProviderItinerary(pre.booking) ?? undefined,
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

    // Rozjazd kwoty/waluty → 409 BEZ `secretKey`. Front pokazuje modal z obiema
    // liczbami; po akceptacji wysyła prebook ponownie z `acceptedTotal` równym
    // nowej kwocie i dostaje świeżą sesję płatności. Ten prebook zostaje
    // porzucony (lock taryfy wygasa sam) — świadomy koszt: lepiej zmarnować
    // lock u dostawcy niż obciążyć kartę kwotą, której klient nie widział.
    if (currencyMismatch) {
      console.warn(
        `[flights][prebook] CURRENCY_MISMATCH sid=${sessionId} accepted=${b.acceptedCurrency} locked=${lockedCurrency}`,
      );
      return NextResponse.json(
        {
          error: "CURRENCY_MISMATCH",
          message: "Rezerwacja wróciła w innej walucie niż pokazana. Rozpocznij rezerwację od nowa.",
          acceptedCurrency: b.acceptedCurrency,
          lockedCurrency,
        },
        { status: 409 },
      );
    }
    if (amountMismatch) {
      console.warn(
        `[flights][prebook] PRICE_CHANGED sid=${sessionId} accepted=${b.acceptedTotal} locked=${pre.price}`,
      );
      return NextResponse.json(
        {
          error: "PRICE_CHANGED",
          message: "Cena lotu zmieniła się przy blokowaniu miejsc.",
          acceptedTotal: b.acceptedTotal,
          lockedTotal: pre.price,
          currency: lockedCurrency,
        },
        { status: 409 },
      );
    }

    const widgetEnv: "live" | "sandbox" =
      pre.sandbox === false ? "live" : pre.sandbox === true ? "sandbox" : getLiteApiWidgetEnv();

    const responseBody = {
      sessionId,
      secretKey: pre.secretKey, // tylko do frontu (widget); transactionId zostaje serwerowo
      widgetEnv,
      price: pre.price,
      currency: lockedCurrency,
      paymentTypes: pre.paymentTypes,
      expiresAt: new Date(now + FLIGHT_SESSION_TTL_SECONDS * 1000).toISOString(),
    };
    if (idemKey) await setFlightIdempotent(idemKey, 200, responseBody, fingerprint);
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
