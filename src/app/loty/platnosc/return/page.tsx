// /loty/platnosc/return — cel przekierowania z widgetu LiteAPI/Stripe po
// płatności (smuggle `sid`). Server: finalizuje rezerwację BEZPOŚREDNIO
// (finalizeFlightBooking, in-process — NIE przez HTTP self-fetch, który na
// preview trafiał na produkcję bez tras lotów; patrz finalize.ts), po czym:
//   • confirmed/pending → redirect na /loty/potwierdzenie/[bookingId]
//   • payment_processing (202) → płatność w toku (SCA/3DS, opóźniona metoda)
//   • payment_not_completed (402) → uczciwe „nie pobraliśmy środków"
//   • manual_review (202) → 1.4.5, ręczna weryfikacja
//   • błąd → komunikat + powrót do płatności
//
// PARAMETRY STRIPE'A. Do adresu powrotu Stripe dokleja `payment_intent`,
// `payment_intent_client_secret` i `redirect_status` (zmierzone na produkcji
// przy hotelach). Przekazujemy `payment_intent` + `redirect_status` do
// finalizacji: samo wejście na tę stronę NIE jest dowodem płatności, ale
// `redirect_status=failed` albo `payment_intent` z INNEJ transakcji jest
// dowodem PRZECIW niej i blokuje booking. Client secret świadomie nie idzie
// dalej — do niczego nam nie służy, a jest poświadczeniem.
//
// maxDuration 60s: book woła LiteAPI z retry — daj zapas nad domyślne 10s.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { finalizeFlightBooking } from "@/lib/flights/finalize";
import { FLIGHT_SHELL_NARROW } from "@/lib/flights/layout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Finalizacja rezerwacji lotu",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "pomoc@helptravel.pl";

export default async function FlightReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string; payment_intent?: string; redirect_status?: string }>;
}) {
  const { sid, payment_intent: paymentIntentId, redirect_status: redirectStatus } = await searchParams;

  if (!sid) {
    return (
      <Shell title="Brak identyfikatora sesji">
        <p className="text-sm text-ink-muted">Nie rozpoznaliśmy sesji płatności. Jeśli pieniądze zostały pobrane, napisz do nas: {SUPPORT_EMAIL}.</p>
      </Shell>
    );
  }

  let status = 0;
  let body: { bookingId?: string; bookingStatus?: string; error?: string; message?: string } = {};
  try {
    // Wywołanie BEZPOŚREDNIE (ta sama deployment) — bez self-fetchu na domenę
    // kanoniczną. Idempotentne: refresh strony nie zdubluje booka.
    const r = await finalizeFlightBooking(sid, { paymentIntentId, redirectStatus });
    status = r.status;
    body = r.body as typeof body;
  } catch {
    // Tu trafiamy tylko gdy store (Redis) padł na starcie — payment NIE został
    // jeszcze oznaczony jako paid, więc uczciwy komunikat + kontakt.
    return (
      <Shell title="Problem z finalizacją">
        <p className="text-sm text-ink-muted">Wystąpił problem techniczny. Jeśli płatność przeszła, skontaktujemy się z Tobą. Możesz też napisać: {SUPPORT_EMAIL}.</p>
      </Shell>
    );
  }

  // Sukces → przekieruj na potwierdzenie.
  if (status === 200 && body.bookingId && body.bookingStatus !== "manual_review") {
    redirect(`/loty/potwierdzenie/${encodeURIComponent(body.bookingId)}`);
  }

  // Płatność w toku (3DS/SCA, opóźniona metoda). NIE udajemy sukcesu i NIE
  // wysyłamy człowieka po raz drugi do formularza — drugie obciążenie byłoby
  // gorsze niż czekanie.
  if (body.error === "payment_processing") {
    return (
      <Shell title="Płatność w toku">
        <p className="text-sm text-ink">{body.message}</p>
        <p className="mt-2 text-xs text-ink-muted">
          Nie ponawiaj płatności — sprawdzimy status i odezwiemy się mailem. W razie pytań: {SUPPORT_EMAIL}.
        </p>
      </Shell>
    );
  }

  // Płatność NIE doszła do skutku — dowód przeciw obciążeniu (redirect_status
  // failed / cudzy payment_intent) albo odmowa walidacyjna dostawcy bez
  // potwierdzenia ze Stripe'a. Wcześniej ten sam przypadek mówił „płatność
  // została odnotowana", czyli obiecywał zwrot pieniędzy, których nie ma.
  if (status === 402 || body.error === "payment_not_completed") {
    return (
      <Shell title="Płatność nie została zakończona">
        <p className="text-sm text-ink">{body.message}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/loty/wyniki" className="inline-flex h-11 items-center rounded-md bg-brand px-4 font-semibold transition hover:opacity-90"><span className="text-sm text-white">Wybierz lot ponownie</span></Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex h-11 items-center rounded-md border border-line px-4 font-semibold transition hover:bg-surface-sunken"><span className="text-sm text-ink">Napisz do nas</span></a>
        </div>
      </Shell>
    );
  }

  // Manual review (booking failed) — 1.4.5. Treść przychodzi z finalizacji i
  // ROZRÓŻNIA „płatność potwierdzona" od „statusu płatności nie znamy".
  if (status === 202 || body.bookingStatus === "manual_review") {
    return (
      <Shell title="Rezerwacja w weryfikacji">
        <p className="text-sm text-ink">
          {body.message ||
            "Nie udało się dokończyć rezerwacji i sprawdzamy status Twojej płatności. Skontaktujemy się z Tobą jak najszybciej."}
        </p>
        <p className="mt-2 text-xs text-ink-muted">W razie pytań: {SUPPORT_EMAIL}.</p>
      </Shell>
    );
  }

  // Inny błąd.
  return (
    <Shell title="Nie udało się sfinalizować rezerwacji">
      <p className="text-sm text-ink">{body.message || "Spróbuj ponownie. Jeśli płatność została pobrana, napisz do nas."}</p>
      <div className="mt-4 flex gap-3">
        <Link href="/loty/platnosc" className="inline-flex h-11 items-center rounded-md bg-brand px-4 font-semibold transition hover:opacity-90"><span className="text-sm text-white">Wróć do płatności</span></Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex h-11 items-center rounded-md border border-line px-4 font-semibold transition hover:bg-surface-sunken"><span className="text-sm text-ink">Napisz do nas</span></a>
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className={`${FLIGHT_SHELL_NARROW} py-12`}>
      <div className="rounded-lg border border-line bg-surface-raised p-6">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </main>
  );
}
