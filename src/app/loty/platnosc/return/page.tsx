// /loty/platnosc/return — cel przekierowania z widgetu LiteAPI/Stripe po
// płatności (smuggle `sid`). Server: finalizuje rezerwację BEZPOŚREDNIO
// (finalizeFlightBooking, in-process — NIE przez HTTP self-fetch, który na
// preview trafiał na produkcję bez tras lotów; patrz finalize.ts), po czym:
//   • confirmed/pending → redirect na /loty/potwierdzenie/[bookingId]
//   • manual_review (202) → komunikat 1.4.5 (płatność OK, ręczna weryfikacja)
//   • błąd → komunikat + powrót do płatności
//
// maxDuration 60s: book woła LiteAPI z retry — daj zapas nad domyślne 10s.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { finalizeFlightBooking } from "@/lib/flights/finalize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Finalizacja rezerwacji lotu | HelpTravel",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "pomoc@helptravel.pl";

export default async function FlightReturnPage({ searchParams }: { searchParams: Promise<{ sid?: string }> }) {
  const { sid } = await searchParams;

  if (!sid) {
    return (
      <Shell title="Brak identyfikatora sesji">
        <p className="text-sm text-neutral-600">Nie rozpoznaliśmy sesji płatności. Jeśli pieniądze zostały pobrane, napisz do nas: {SUPPORT_EMAIL}.</p>
      </Shell>
    );
  }

  let status = 0;
  let body: { bookingId?: string; bookingStatus?: string; error?: string; message?: string } = {};
  try {
    // Wywołanie BEZPOŚREDNIE (ta sama deployment) — bez self-fetchu na domenę
    // kanoniczną. Idempotentne: refresh strony nie zdubluje booka.
    const r = await finalizeFlightBooking(sid);
    status = r.status;
    body = r.body as typeof body;
  } catch {
    // Tu trafiamy tylko gdy store (Redis) padł na starcie — payment NIE został
    // jeszcze oznaczony jako paid, więc uczciwy komunikat + kontakt.
    return (
      <Shell title="Problem z finalizacją">
        <p className="text-sm text-neutral-600">Wystąpił problem techniczny. Jeśli płatność przeszła, skontaktujemy się z Tobą. Możesz też napisać: {SUPPORT_EMAIL}.</p>
      </Shell>
    );
  }

  // Sukces → przekieruj na potwierdzenie.
  if (status === 200 && body.bookingId && body.bookingStatus !== "manual_review") {
    redirect(`/loty/potwierdzenie/${encodeURIComponent(body.bookingId)}`);
  }

  // Manual review (płatność OK, booking failed) — 1.4.5.
  if (status === 202 || body.bookingStatus === "manual_review") {
    return (
      <Shell title="Rezerwacja w weryfikacji">
        <p className="text-sm text-neutral-700">
          Płatność została odnotowana, ale rezerwacja wymaga ręcznej weryfikacji. Skontaktujemy się z Tobą jak najszybciej.
        </p>
        <p className="mt-2 text-xs text-neutral-500">W razie pytań: {SUPPORT_EMAIL}.</p>
      </Shell>
    );
  }

  // Inny błąd.
  return (
    <Shell title="Nie udało się sfinalizować rezerwacji">
      <p className="text-sm text-neutral-700">{body.message || "Spróbuj ponownie. Jeśli płatność została pobrana, napisz do nas."}</p>
      <div className="mt-4 flex gap-3">
        <Link href="/loty/platnosc" className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Wróć do płatności</Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Napisz do nas</a>
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </main>
  );
}
