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
import { TrackView } from "@/components/analytics/track-view";
import { CheckoutSteps } from "../_components/checkout-steps";
import { ConfettiBurst } from "./_components/confetti-burst";

export const dynamic = "force-dynamic";
// Return page server-renders by awaiting /api/booking/book, which in turn
// awaits LiteAPI /rates/book — observed up to 9.777s. Without an explicit
// maxDuration, Vercel kills the function at the 10s default. Bump to 60s so
// the entire render chain (fetch → /api/booking/book → LiteAPI → render
// confirmation UI) always has headroom.
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Potwierdzenie rezerwacji | HelpTravel",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "pomoc@helptravel.pl";

// Display helpers — kept byte-for-byte consistent with the booking-confirmation
// email template (src/lib/email/templates/booking-confirmation.ts) so the dates,
// nights, guest count and amount shown on this page exactly match the email.
function formatPlDate(iso?: string): string | null {
  if (!iso) return null;
  // Anchor bare YYYY-MM-DD at noon UTC so Europe/Warsaw never rolls the day.
  const stamp = iso.length === 10 ? `${iso}T12:00:00Z` : iso;
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(d);
}

function nightsBetween(checkin?: string, checkout?: string): number | null {
  if (!checkin || !checkout) return null;
  const a = new Date(checkin.length === 10 ? `${checkin}T00:00:00Z` : checkin);
  const b = new Date(checkout.length === 10 ? `${checkout}T00:00:00Z` : checkout);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return days > 0 ? days : null;
}

function plNights(n: number): string {
  if (n === 1) return "1 noc";
  const d = n % 10;
  const dd = n % 100;
  if (dd >= 12 && dd <= 14) return `${n} nocy`;
  if (d >= 2 && d <= 4) return `${n} noce`;
  return `${n} nocy`;
}

function plGuests(n: number): string {
  if (n === 1) return "1 osoba";
  const d = n % 10;
  const dd = n % 100;
  if (dd >= 12 && dd <= 14) return `${n} osób`;
  if (d >= 2 && d <= 4) return `${n} osoby`;
  return `${n} osób`;
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

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
        {/* Confirmed success = step 3 of the checkout indicator (the same
            component the form and payment views render). Error/warn shells
            skip it — a failed flow isn't "completed". */}
        {tone === "ok" && <CheckoutSteps current={3} />}
        <div className={`rounded-2xl border bg-white p-8 ${ring.replace(/bg-\S+/, "")}`}>
          <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
          <div className="mt-3 space-y-3 text-sm text-neutral-700">{children}</div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Wróć na stronę główną
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
  // Stripe always appends `payment_intent`, `payment_intent_client_secret`, and
  // `redirect_status` to the returnUrl when the Payment Element completes — we
  // smuggle `sid` (booking sessionId) ourselves. We forward `payment_intent` to
  // /api/booking/book so the route can persist a recovery record if our Redis
  // session is already gone (24h TTL exhausted or Upstash flap mid-redirect).
  searchParams: Promise<{
    sid?: string;
    payment_intent?: string;
    redirect_status?: string;
  }>;
}) {
  const { sid, payment_intent: paymentIntentId } = await searchParams;
  if (!sid) {
    return (
      <Shell tone="err" title="Brak identyfikatora sesji">
        <p>
          Nie możemy powiązać tej płatności z rezerwacją. Jeśli pieniądze
          zostały pobrane, napisz do nas — pomożemy.
        </p>
        {paymentIntentId ? (
          <p className="font-mono text-xs">Stripe PaymentIntent: {paymentIntentId}</p>
        ) : null}
      </Shell>
    );
  }

  let status = 0;
  let data: Record<string, unknown> = {};
  try {
    const res = await fetch(`${getSiteUrl()}/api/booking/book`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": sid },
      body: JSON.stringify({
        sessionId: sid,
        ...(paymentIntentId ? { paymentIntentId } : {}),
      }),
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
    const rate =
      (data.rateSummary as { boardName?: string; checkin?: string; checkout?: string }) ?? {};
    const price = typeof data.price === "number" ? data.price : undefined;
    const currency = typeof data.currency === "string" ? data.currency : "PLN";
    const guestCount = typeof data.guestCount === "number" ? data.guestCount : undefined;
    // Honest signal from the book route: true ONLY when Resend actually
    // accepted the message. When RESEND_API_KEY is unset the send is skipped
    // and this stays false — we then never claim a mail was sent.
    const emailSent = data.emailSent === true;
    const emailTo = typeof data.emailTo === "string" ? data.emailTo : undefined;
    const bookingId = String(data.bookingId ?? "");
    const confirmationCode =
      typeof data.confirmationCode === "string" && data.confirmationCode
        ? data.confirmationCode
        : null;

    const checkinFmt = formatPlDate(rate.checkin);
    const checkoutFmt = formatPlDate(rate.checkout);
    const nights = nightsBetween(rate.checkin, rate.checkout);
    const moneyFmt = price && price > 0 ? fmtMoney(price, currency) : null;

    const rows: Array<{ label: string; value: string }> = [];
    if (hotel.name) {
      rows.push({ label: "Hotel", value: hotel.city ? `${hotel.name}, ${hotel.city}` : hotel.name });
    }
    if (checkinFmt) rows.push({ label: "Przyjazd", value: checkinFmt });
    if (checkoutFmt) rows.push({ label: "Wyjazd", value: checkoutFmt });
    if (nights) rows.push({ label: "Długość pobytu", value: plNights(nights) });
    if (guestCount) rows.push({ label: "Goście", value: plGuests(guestCount) });
    if (rate.boardName) rows.push({ label: "Pakiet", value: rate.boardName });

    return (
      <Shell tone="ok" title="Rezerwacja potwierdzona 🎉">
        <ConfettiBurst />
        {/* GA4 conversion — fires ONCE, ONLY in the confirmed-success branch
            (status 200). This is the key event to mark as a conversion in
            GA4. `value` is intentionally omitted for now: session.price units
            (major vs minor) aren't unambiguous here, and a wrong revenue
            number would corrupt GA4 reporting — the conversion still COUNTS
            without it. Add value once units are confirmed (then ROAS works
            for paid campaigns). Display/tracking only — does not touch the
            booking/payment flow (RULE 6). */}
        {bookingId ? (
          <TrackView event="booking_complete" params={{ booking_id: bookingId, currency }} />
        ) : null}

        <p>
          Dziękujemy! Twoja rezerwacja w{" "}
          <strong>{hotel.name ?? "wybranym hotelu"}</strong>
          {hotel.city ? `, ${hotel.city}` : ""} została potwierdzona.
        </p>

        {/* Honest email status — only claims a send when one actually happened. */}
        {emailSent ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
            <span aria-hidden className="mt-0.5 text-base leading-none">✉️</span>
            <p className="text-sm leading-relaxed">
              Potwierdzenie wysłaliśmy na adres{" "}
              <strong className="font-semibold break-all">{emailTo}</strong>. Jeśli nie widzisz
              wiadomości w ciągu kilku minut, sprawdź folder ze spamem lub ofertami.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <p className="text-sm leading-relaxed">
              Zachowaj numer rezerwacji poniżej — wystarczy przy meldowaniu i w kontakcie z nami.
              W razie pytań napisz na {SUPPORT_EMAIL}.
            </p>
          </div>
        )}

        {/* Booking details — concrete post-payment info so the page reads as a
            real confirmation, not just a code. */}
        {rows.length > 0 && (
          <dl className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex justify-between gap-4 border-b border-neutral-100 px-4 py-2.5 last:border-b-0"
              >
                <dt className="text-sm text-neutral-500">{r.label}</dt>
                <dd className="text-right text-sm font-semibold text-neutral-900">{r.value}</dd>
              </div>
            ))}
            {moneyFmt && (
              <div className="flex items-center justify-between gap-4 bg-emerald-50/70 px-4 py-3">
                <dt className="text-sm font-medium text-emerald-900">Kwota zapłacona</dt>
                <dd className="text-right text-base font-bold text-emerald-700">{moneyFmt}</dd>
              </div>
            )}
          </dl>
        )}

        {/* Reference numbers */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-neutral-100 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Numer rezerwacji
            </div>
            <div className="mt-0.5 break-all font-mono text-sm text-neutral-900">{bookingId}</div>
          </div>
          {confirmationCode && (
            <div className="rounded-lg bg-neutral-100 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Numer w hotelu
              </div>
              <div className="mt-0.5 break-all font-mono text-sm text-neutral-900">
                {confirmationCode}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-neutral-500">
          Hotel może poprosić o dokument tożsamości oraz kartę użytą do płatności. Standardowe
          zameldowanie to zwykle ok. 15:00, a wymeldowanie do 11:00.
        </p>
      </Shell>
    );
  }

  // A `recoveryId` in the response means the server has persisted a recovery
  // record and treats this as paid-but-unbooked — always show the recovery UI
  // regardless of status (410 with paymentIntentId AND 502 both carry this).
  if (typeof data.recoveryId === "string") {
    const message =
      typeof data.message === "string"
        ? data.message
        : "Płatność mogła zostać zarejestrowana, ale rezerwacja wymaga ręcznego potwierdzenia.";
    return (
      <Shell tone="warn" title="Rezerwacja wymaga potwierdzenia">
        <p>{message}</p>
        <p>
          Identyfikator do kontaktu: <span className="font-mono text-xs">{data.recoveryId}</span>
        </p>
        {paymentIntentId ? (
          <p className="text-xs text-neutral-500">
            Stripe PaymentIntent: <span className="font-mono">{paymentIntentId}</span>
          </p>
        ) : null}
        <p className="text-neutral-500">
          Nie ponawiaj płatności — skontaktuj się z nami, a dokończymy rezerwację
          ręcznie.
        </p>
      </Shell>
    );
  }

  if (status === 410) {
    // Benign session expiry — no payment evidence on the request. User hit this
    // page without a fresh Stripe redirect (refreshed an old tab, bookmark, etc.).
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

  // Any other non-success without a recoveryId — defensive fallback.
  const message =
    typeof data.message === "string"
      ? data.message
      : "Płatność mogła zostać zarejestrowana, ale rezerwacja wymaga ręcznego potwierdzenia.";
  return (
    <Shell tone="warn" title="Rezerwacja wymaga potwierdzenia">
      <p>{message}</p>
      <p>
        Identyfikator do kontaktu: <span className="font-mono text-xs">{sid}</span>
      </p>
      <p className="text-neutral-500">
        Nie ponawiaj płatności — skontaktuj się z nami, a dokończymy rezerwację
        ręcznie.
      </p>
    </Shell>
  );
}
