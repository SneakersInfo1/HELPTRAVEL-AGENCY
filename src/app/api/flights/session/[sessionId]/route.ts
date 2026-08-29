// GET /api/flights/session/[sessionId] — AUTORYTATYWNA kwota do zapłaty.
//
// DLACZEGO ISTNIEJE:
// Strona `/loty/platnosc` brała kwotę „Do zapłaty" z `sessionStorage`
// (`flow.verifiedTotal`). Realnie pobierana kwota jest bezpieczna — PaymentIntent
// jest po stronie LiteAPI i wisi na `secretKey`, front nie ma na nią wpływu — ale
// LICZBA POKAZANA NAD PRZYCISKIEM „ZAPŁAĆ" pochodziła z magazynu, który klient
// może edytować i który potrafi się rozjechać z rzeczywistością (np. gdy patch
// z prebooka nie doszedł). Ostatnia rzecz, jaką użytkownik widzi przed
// obciążeniem karty, musi pochodzić z serwera.
//
// AUTORYZACJA: znajomość `sessionId` (UUID v4, 122 bity entropii) JEST
// capability — dokładnie jak przy `bookingId` na potwierdzeniu. Zwracamy
// WYŁĄCZNIE to, co potrzebne do pokazania kwoty i stanu. NIGDY `transactionId`,
// `prebookId`, `secretKey`, danych pasażerów ani numerów dokumentów.

import { NextResponse } from "next/server";

import { getFlightSession, isFlightSessionExpired } from "@/lib/flights/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;

  const session = await getFlightSession(sessionId).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (isFlightSessionExpired(session)) {
    return NextResponse.json({ error: "session_expired" }, { status: 410 });
  }

  return NextResponse.json(
    {
      sessionId,
      // Kwota locka z prebooka — ta i tylko ta obciąży kartę.
      amount: typeof session.price === "number" ? session.price : null,
      currency: session.currency ?? null,
      bookingStatus: session.bookingStatus,
      paymentStatus: session.paymentStatus,
      /**
       * Bramka kwoty przeszła — front może pokazać formularz płatności.
       *
       * `failed` przepuszczamy ŚWIADOMIE: nieudana próba (odrzucona karta,
       * porzucone 3DS) nie unieważnia prebooka, a Stripe pozwala ponowić ten
       * sam PaymentIntent. Blokada zmuszałaby klienta do drugiego prebooka.
       * `processing` jest natomiast TWARDO blokowane — mieć dwa równoległe
       * widgety na jedną transakcję to prosta droga do podwójnego obciążenia.
       */
      payable:
        session.bookingStatus === "prebooked" &&
        (session.paymentStatus === "pending" || session.paymentStatus === "failed") &&
        session.priceGatePassed !== false &&
        typeof session.price === "number",
      bookingId: session.bookingId ?? null,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
