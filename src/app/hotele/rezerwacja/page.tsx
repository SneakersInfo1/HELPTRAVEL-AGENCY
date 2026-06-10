// /hotele/rezerwacja — guest-data form + LiteAPI Payment SDK widget.
// Server component: resolves the booking flag + hotel name, then hands off to
// the client form. Entry is already gated on the rooms CTA; this re-checks the
// flag server-side as defense-in-depth (NON-NEGOTIABLE RULE 3 / Phase 3.1).

import type { Metadata } from "next";
import Link from "next/link";

import { isBookingLive } from "@/lib/config/featureFlags";
import { getHotelDetail } from "@/lib/liteapi";
import { getLiteApiWidgetEnv } from "@/lib/liteapi/widget-env";
import { getSiteUrl } from "@/lib/mvp/site";
import { TrackView } from "@/components/analytics/track-view";

import { ReservationForm } from "./_components/reservation-form";
import { WebviewHint } from "./_components/webview-hint";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rezerwacja | HelpTravel",
  robots: { index: false, follow: false },
};

interface SP {
  hotelId?: string;
  offerId?: string;
  checkin?: string;
  checkout?: string;
  adults?: string;
  rooms?: string;
  children?: string;
  price?: string;
  cur?: string;
  board?: string;
  cancel?: string;
  cancelUntil?: string;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50">
      <section className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
          <div className="mt-3 text-sm text-neutral-600">{children}</div>
          <Link
            href="/"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Wróć do wyszukiwania
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  if (!isBookingLive()) {
    return (
      <Panel title="Rezerwacja online — wkrótce dostępne">
        Pracujemy nad płatnościami online. W międzyczasie napisz do nas, a
        pomożemy dokończyć rezerwację.
      </Panel>
    );
  }

  const sp = await searchParams;
  const hotelId = sp.hotelId?.trim();
  const offerId = sp.offerId?.trim();
  const checkin = sp.checkin && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkin) ? sp.checkin : null;
  const checkout =
    sp.checkout && /^\d{4}-\d{2}-\d{2}$/.test(sp.checkout) ? sp.checkout : null;

  if (!hotelId || !offerId || !checkin || !checkout) {
    return (
      <Panel title="Brakuje danych oferty">
        Link rezerwacji jest niekompletny. Wybierz ofertę ponownie na stronie
        hotelu.
      </Panel>
    );
  }

  let hotelName = "Wybrany hotel";
  let hotelCity: string | undefined;
  let photoUrl: string | undefined;
  let stars: number | undefined;
  let rating: number | undefined;
  let reviewCount: number | undefined;
  try {
    const detail = await getHotelDetail(hotelId);
    if (detail) {
      hotelName = detail.name;
      hotelCity = detail.city;
      // Summary-card extras — same already-cached call, zero new requests.
      photoUrl = detail.main_photo ?? undefined;
      stars = detail.stars ?? undefined;
      rating = detail.rating ?? undefined;
      reviewCount = detail.reviewCount ?? undefined;
    }
  } catch {
    /* non-fatal — prebook uses offerId; name is display-only */
  }

  const price = sp.price ? Number(sp.price) : undefined;
  const currency = (sp.cur || "PLN").toUpperCase();
  const adults = sp.adults ? Math.max(1, Math.min(8, Number(sp.adults))) : 1;
  // Cancellation badge data (set by the hotel-page rate link; absent on old
  // links). Values are validated — anything unexpected renders no badge.
  const cancel = sp.cancel === "free" || sp.cancel === "nrf" ? sp.cancel : undefined;
  const cancelUntil =
    cancel === "free" && sp.cancelUntil && /^\d{4}-\d{2}-\d{2}/.test(sp.cancelUntil)
      ? sp.cancelUntil
      : undefined;

  // Deep link back to THIS hotel with the same stay parameters. Used by the
  // prebook-error recovery panel: when LiteAPI rejects the offer (price
  // changed / sold out / provider hiccup), retrying the same dead offerId is
  // futile — the productive path is re-picking a fresh rate on the hotel
  // page. Production logs 2026-06-09 show a user retrying the same offer
  // 4× into a 503 wall and bouncing; this gives that user a working exit.
  const backToHotelParams = new URLSearchParams({ checkin, checkout });
  if (sp.adults) backToHotelParams.set("adults", sp.adults);
  if (sp.rooms) backToHotelParams.set("rooms", sp.rooms);
  if (sp.children) backToHotelParams.set("children", sp.children);
  const backToHotelHref = `/hotele/${encodeURIComponent(hotelId)}?${backToHotelParams.toString()}`;

  // Per LiteAPI support (19 May 2026): the widget `publicKey` is an ENVIRONMENT
  // FLAG ("live" | "sandbox"), NOT our LiteAPI API public key. Passing the
  // prod_ key here made the widget POST it to .../config → HTTP 400.
  const publicKey = getLiteApiWidgetEnv();
  const returnBaseUrl = getSiteUrl();

  return (
    <main className="min-h-screen bg-neutral-50">
      {/*
        Preconnect to the Stripe + LiteAPI widget hosts BEFORE the
        Payment SDK script loads. Shaves ~100-200ms off widget mount by
        warming DNS + TCP + TLS for the hosts the widget will hit:
        payment-wrapper.liteapi.travel (widget JS + /config endpoint) and
        js.stripe.com (Stripe Elements bundle the widget imports). Plain
        <link> tags are CSP-safe (no script content).
      */}
      <link rel="preconnect" href="https://payment-wrapper.liteapi.travel" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://js.stripe.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://api.stripe.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://hooks.stripe.com" />
      {/* max-w-5xl: the redesigned checkout is two-column on lg (form +
          sticky summary card); heading + steps live in ReservationForm
          because the step number is client state (form ↔ payment).
          Top padding is deliberately tight (pt-3/pt-5) so the step
          indicator is in view immediately on load — owner report
          2026-06-11: with py-8 the progress bar landed below the fold
          edge on some screens. */}
      <section className="mx-auto max-w-5xl px-4 pb-10 pt-3 sm:pt-5">
        <TrackView
          event="checkout_view"
          params={{
            hotel_id: hotelId,
            price: Number.isFinite(price) ? (price as number) : undefined,
            currency,
          }}
        />
        <WebviewHint />
        <ReservationForm
          hotelId={hotelId}
          offerId={offerId}
          hotelName={hotelName}
          hotelCity={hotelCity}
          photoUrl={photoUrl}
          stars={stars}
          rating={rating}
          reviewCount={reviewCount}
          checkin={checkin}
          checkout={checkout}
          price={Number.isFinite(price) ? (price as number) : undefined}
          currency={currency}
          board={sp.board}
          adults={adults}
          publicKey={publicKey}
          returnBaseUrl={returnBaseUrl}
          backToHotelHref={backToHotelHref}
          cancel={cancel}
          cancelUntil={cancelUntil}
        />
      </section>
    </main>
  );
}
