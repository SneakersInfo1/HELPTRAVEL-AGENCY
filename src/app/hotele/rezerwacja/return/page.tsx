// /hotele/rezerwacja/return — the redirect target the LiteAPI/Stripe widget
// sends the browser back to (Q1 confirmed: redirect-only, we smuggle `sid`).
// Server component: finalizes the booking by calling POST /api/booking/book
// with the sessionId, then renders confirmation OR a recovery message.
//
// Idempotency-Key = sid: a page reload / double redirect re-uses the cached
// book response (no second LiteAPI charge — Phase 2 idempotency layer).

import type { Metadata } from "next";
import Link from "next/link";

import { getSiteUrl } from "@/lib/mvp/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Potwierdzenie rezerwacji | HelpTravel",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "pomoc@helptravel.pl";

function Shell({
  tone,
  title,
  children,
}: {
  tone: "ok" | "warn" | "err";
  title: string;
  children: React.ReactNode;
}) {
  const ring =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-red-200 bg-red-50";
  return (
    <main className="min-h-screen bg-neutral-50">
      <section className="mx-auto max-w-2xl px-4 py-12">
        <div className={`rounded-2xl border bg-white p-8 ${ring.replace(/bg-\S+/, "")}`}>
          <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
          <div className="mt-3 space-y-3 text-sm text-neutral-700">{children}</div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/hotele"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Wróć do hoteli
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 px-5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Kontakt: {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function ReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string }>;
}) {
  const { sid } = await searchParams;
  if (!sid) {
    return (
      <Shell tone="err" title="Brak identyfikatora sesji">
        <p>
          Nie możemy powiązać tej płatności z rezerwacją. Jeśli pieniądze
          zostały pobrane, napisz do nas — pomożemy.
        </p>
      </Shell>
    );
  }

  let status = 0;
  let data: Record<string, unknown> = {};
  try {
    const res = await fetch(`${getSiteUrl()}/api/booking/book`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": sid },
      body: JSON.stringify({ sessionId: sid }),
      cache: "no-store",
    });
    status = res.status;
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return (
      <Shell tone="warn" title="Nie udało się potwierdzić rezerwacji">
        <p>
          Jeśli płatność przeszła, Twoja rezerwacja wymaga ręcznego
          potwierdzenia. Skontaktuj się z nami, podając ten identyfikator:
        </p>
        <p className="font-mono text-xs">{sid}</p>
      </Shell>
    );
  }

  if (status === 200) {
    const hotel = (data.hotelSummary as { name?: string; city?: string }) ?? {};
    return (
      <Shell tone="ok" title="Rezerwacja potwierdzona 🎉">
        <p>
          Dziękujemy! Twoja rezerwacja w <strong>{hotel.name ?? "wybranym hotelu"}</strong>
          {hotel.city ? `, ${hotel.city}` : ""} została potwierdzona.
        </p>
        {data.confirmationCode ? (
          <p>
            Kod potwierdzenia: <strong>{String(data.confirmationCode)}</strong>
          </p>
        ) : null}
        <p>
          Numer rezerwacji: <span className="font-mono text-xs">{String(data.bookingId)}</span>
        </p>
        <p className="text-neutral-500">
          Potwierdzenie nie jest wysyłane e-mailem na tym etapie — zachowaj ten
          numer. W razie pytań napisz do nas.
        </p>
      </Shell>
    );
  }

  if (status === 410) {
    return (
      <Shell tone="warn" title="Sesja rezerwacji wygasła">
        <p>
          Sesja wygasła, prosimy spróbować ponownie — wybierz ofertę i ponów
          rezerwację. Jeśli płatność została pobrana, skontaktuj się z nami z
          identyfikatorem poniżej.
        </p>
        <p className="font-mono text-xs">{sid}</p>
      </Shell>
    );
  }

  // 502 book_failed (paid but not booked) or any other non-success.
  const message =
    typeof data.message === "string"
      ? data.message
      : "Płatność mogła zostać zarejestrowana, ale rezerwacja wymaga ręcznego potwierdzenia.";
  const recoveryId = typeof data.recoveryId === "string" ? data.recoveryId : sid;
  return (
    <Shell tone="warn" title="Rezerwacja wymaga potwierdzenia">
      <p>{message}</p>
      <p>
        Identyfikator do kontaktu: <span className="font-mono text-xs">{recoveryId}</span>
      </p>
      <p className="text-neutral-500">
        Nie ponawiaj płatności — skontaktuj się z nami, a dokończymy rezerwację
        ręcznie.
      </p>
    </Shell>
  );
}
